import { describe, expect, it } from 'vitest';
import { GitHubSourceProvider } from '../../packages/source-providers/github/src/github-source-provider.js';

describe('GitHub revision pinning', () => {
  it('keeps retries on the resolved commit after a branch advances', async () => {
    let branchHead = 'a'.repeat(40);
    let requestedSnapshot = '';
    const rootPath = `/tmp/codeorbit-revision-test-${crypto.randomUUID()}`;
    const provider = new GitHubSourceProvider(async (_installationId, repositoryNames) => ({
      listRepositories: async () => [{
        id: 123,
        full_name: 'example/project',
        html_url: 'https://github.com/example/project',
        private: true,
      }],
      getDefaultBranch: async () => 'main',
      getCommit: async (_owner: string, _repo: string, reference: string) => ({
        sha: reference === 'main' ? branchHead : reference,
      }),
      acquireSnapshot: async (_owner: string, _repo: string, revision: string) => {
        expect(repositoryNames).toEqual(['example/project']);
        requestedSnapshot = revision;
        return { rootPath, cleanup: async () => undefined };
      },
    }));

    const resolved = await provider.resolveRevision('42', '123', 'main');
    branchHead = 'b'.repeat(40);
    const snapshot = await provider.acquireSnapshot('42', '123', resolved);

    expect(resolved.snapshotRevision).toBe('a'.repeat(40));
    expect(snapshot.revision.snapshotRevision).toBe('a'.repeat(40));
    expect(requestedSnapshot).toBe('a'.repeat(40));
  });
});
