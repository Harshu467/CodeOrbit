import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { extract as extractTar } from 'tar';
import { ProviderError } from '@codeorbit/domain';
import type { ProviderRepository } from '@codeorbit/source-provider-contracts';
import type { RepositorySnapshot, ResolvedRevision } from '@codeorbit/source-provider-contracts';

interface GitHubRepositoryRecord {
  readonly id: number;
  readonly full_name: string;
  readonly html_url: string;
  readonly private: boolean;
}

export interface GitHubInstallationClient {
  listRepositories(): Promise<readonly GitHubRepositoryRecord[]>;
  getDefaultBranch(owner: string, repository: string): Promise<string>;
  getCommit(owner: string, repository: string, reference: string): Promise<{ readonly sha: string }>;
  acquireSnapshot(
    owner: string,
    repository: string,
    revision: string,
  ): Promise<{ readonly rootPath: string; readonly cleanup: () => Promise<void> }>;
}

export type GitHubInstallationClientFactory = (
  installationId: string,
  repositoryNames?: readonly string[],
) => Promise<GitHubInstallationClient>;

function normalizeGitHubError(error: unknown): ProviderError {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number(error.status)
      : undefined;
  const retryable = status === undefined || status === 429 || status >= 500;
  return new ProviderError(
    status === 401 || status === 403 ? 'provider_access_denied' : 'provider_request_failed',
    status === 401 || status === 403
      ? 'The GitHub installation cannot access this repository.'
      : 'The GitHub source request failed.',
    status === 401 || status === 403 ? 403 : 502,
    retryable,
  );
}

function normalizeRepositoryUri(uri: string): string {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new ProviderError('invalid_source', 'The repository source is invalid.');
  }
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'github.com' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    segments.length !== 2
  ) {
    throw new ProviderError('invalid_source', 'The repository source is invalid.');
  }
  const repository = segments[1]!.replace(/\.git$/i, '');
  return `https://github.com/${segments[0]}/${repository}`.toLocaleLowerCase('en-US');
}

async function createOctokitInstallationClient(
  installationId: string,
  repositoryNames?: readonly string[],
): Promise<GitHubInstallationClient> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey || !/^\d+$/.test(installationId)) {
    throw new ProviderError('provider_not_configured', 'The GitHub source provider is unavailable.');
  }
  try {
    const auth = createAppAuth({ appId, privateKey });
    const credentials = await auth({
      type: 'installation',
      installationId,
      ...(repositoryNames ? { repositoryNames: [...repositoryNames] } : {}),
      permissions: { contents: 'read', metadata: 'read' },
    });
    const octokit = new Octokit({ auth: credentials.token });
    return {
      async listRepositories() {
        const repositories = await octokit.paginate(
          octokit.rest.apps.listReposAccessibleToInstallation,
          { per_page: 100 },
        );
        return repositories.map((repository) => ({
          id: repository.id,
          full_name: repository.full_name,
          html_url: repository.html_url,
          private: repository.private,
        }));
      },
      async getCommit(owner, repository, reference) {
        const result = await octokit.rest.repos.getCommit({
          owner,
          repo: repository,
          ref: reference,
        });
        return { sha: result.data.sha };
      },
      async getDefaultBranch(owner, repository) {
        const result = await octokit.rest.repos.get({ owner, repo: repository });
        return result.data.default_branch;
      },
      async acquireSnapshot(owner, repository, revision) {
        const archiveResponse = await fetch(
          `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/tarball/${encodeURIComponent(revision)}`,
          {
            headers: {
              accept: 'application/vnd.github+json',
              authorization: `Bearer ${credentials.token}`,
              'x-github-api-version': '2022-11-28',
            },
            redirect: 'manual',
          },
        );
        const archiveLocation = archiveResponse.headers.get('location');
        if (
          archiveResponse.status !== 302 ||
          !archiveLocation ||
          new URL(archiveLocation).protocol !== 'https:' ||
          new URL(archiveLocation).hostname !== 'codeload.github.com'
        ) {
          throw Object.assign(new Error('GitHub archive acquisition failed.'), {
            status: archiveResponse.status,
          });
        }
        const response = await fetch(archiveLocation);
        if (!response.ok || !response.body) {
          throw Object.assign(new Error('Snapshot archive download failed.'), { status: response.status });
        }
        const directory = await mkdtemp(join(tmpdir(), 'codeorbit-snapshot-'));
        const archivePath = join(directory, 'snapshot.tar.gz');
        try {
          const archiveSize = Number(response.headers.get('content-length') ?? 0);
          const maximumSize = Number(process.env.MAX_SNAPSHOT_ARCHIVE_BYTES ?? 1_073_741_824);
          if (!Number.isSafeInteger(maximumSize) || maximumSize < 1) {
            throw new ProviderError(
              'invalid_configuration',
              'Snapshot acquisition is unavailable due to invalid size configuration.',
              503,
            );
          }
          if (archiveSize > maximumSize) {
            throw new ProviderError(
              'snapshot_too_large',
              'The repository snapshot exceeds the configured acquisition limit.',
              413,
            );
          }
          let bytesRead = 0;
          const limiter = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              bytesRead += chunk.length;
              if (bytesRead > maximumSize) {
                callback(
                  new ProviderError(
                    'snapshot_too_large',
                    'The repository snapshot exceeds the configured acquisition limit.',
                    413,
                  ),
                );
                return;
              }
              callback(null, chunk);
            },
          });
          const reader = response.body.getReader();
          const chunks = async function* (): AsyncGenerator<Buffer> {
            try {
              while (true) {
                const chunk = await reader.read();
                if (chunk.done) return;
                yield Buffer.from(chunk.value);
              }
            } finally {
              reader.releaseLock();
            }
          };
          await pipeline(
            Readable.from(chunks()),
            limiter,
            createWriteStream(archivePath, { flags: 'wx' }),
          );
          await extractTar({ cwd: directory, file: archivePath, strip: 1 });
          await unlink(archivePath);
          return {
            rootPath: directory,
            cleanup: () => rm(directory, { recursive: true, force: true }),
          };
        } catch (error) {
          await rm(directory, { recursive: true, force: true });
          throw error;
        }
      },
    };
  } catch (error) {
    throw normalizeGitHubError(error);
  }
}

export class GitHubSourceProvider {
  readonly key = 'github';

  constructor(
    private readonly createInstallationClient: GitHubInstallationClientFactory =
      createOctokitInstallationClient,
  ) {}

  async listAuthorizedRepositories(connectionId: string): Promise<readonly ProviderRepository[]> {
    try {
      const client = await this.createInstallationClient(connectionId);
      const repositories = await client.listRepositories();
      return repositories.map((repository) => ({
        providerRepositoryId: String(repository.id),
        fullName: repository.full_name,
        uri: `https://github.com/${repository.full_name}`,
        private: repository.private,
      }));
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw normalizeGitHubError(error);
    }
  }

  async getAuthorizedRepository(
    connectionId: string,
    uri: string,
  ): Promise<ProviderRepository> {
    const canonicalUri = normalizeRepositoryUri(uri);
    const repositories = await this.listAuthorizedRepositories(connectionId);
    const repository = repositories.find(
      (candidate) => normalizeRepositoryUri(candidate.uri) === canonicalUri,
    );
    if (!repository) {
      throw new ProviderError(
        'source_not_authorized',
        'The repository is not available to the selected GitHub installation.',
        403,
      );
    }
    try {
      await this.createInstallationClient(connectionId, [repository.fullName]);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw normalizeGitHubError(error);
    }
    return repository;
  }

  async resolveRevision(
    connectionId: string,
    providerRepositoryId: string,
    requestedRevision?: string,
  ): Promise<ResolvedRevision> {
    const { repository, client } = await this.getScopedClient(connectionId, providerRepositoryId);
    const { owner, name } = splitRepositoryName(repository.fullName);
    try {
      const reference = requestedRevision?.trim() || (await client.getDefaultBranch(owner, name));
      const commit = await client.getCommit(owner, name, reference);
      return {
        requestedRevision: requestedRevision?.trim() || null,
        snapshotRevision: commit.sha,
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw normalizeGitHubError(error);
    }
  }

  async acquireSnapshot(
    connectionId: string,
    providerRepositoryId: string,
    revision: ResolvedRevision,
  ): Promise<RepositorySnapshot> {
    const { repository, client } = await this.getScopedClient(connectionId, providerRepositoryId);
    const { owner, name } = splitRepositoryName(repository.fullName);
    try {
      const snapshot = await client.acquireSnapshot(owner, name, revision.snapshotRevision);
      return { ...snapshot, revision };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw normalizeGitHubError(error);
    }
  }

  private async getScopedClient(
    connectionId: string,
    providerRepositoryId: string,
  ): Promise<{ repository: ProviderRepository; client: GitHubInstallationClient }> {
    const repositories = await this.listAuthorizedRepositories(connectionId);
    const repository = repositories.find(
      (candidate) => candidate.providerRepositoryId === providerRepositoryId,
    );
    if (!repository) {
      throw new ProviderError(
        'source_not_authorized',
        'The repository is not available to the selected GitHub installation.',
        403,
      );
    }
    const client = await this.createInstallationClient(connectionId, [repository.fullName]);
    return { repository, client };
  }
}

function splitRepositoryName(fullName: string): { owner: string; name: string } {
  const [owner, name, extra] = fullName.split('/');
  if (!owner || !name || extra) {
    throw new ProviderError('invalid_source', 'The repository source is invalid.');
  }
  return { owner, name };
}
