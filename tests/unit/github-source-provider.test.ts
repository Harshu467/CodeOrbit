import { describe, expect, it, vi } from 'vitest';
import { GitHubSourceProvider } from '../../packages/source-providers/github/src/github-source-provider.js';
import { ProviderError } from '../../packages/domain/src/errors.js';

describe('GitHub source provider', () => {
  it('lists only repositories authorized by the requested installation', async () => {
    let receivedInstallationId = '';
    const clientFactory = vi.fn(async (installationId: string) => {
      receivedInstallationId = installationId;
      return {
        listRepositories: async () => {
        return [
          {
            id: 123,
            full_name: 'example/project',
            html_url: 'https://github.com/example/project',
            private: true,
          },
          ];
        },
      };
    });
    const provider = new GitHubSourceProvider(clientFactory);

    await expect(provider.listAuthorizedRepositories('42')).resolves.toEqual([
      {
        providerRepositoryId: '123',
        fullName: 'example/project',
        uri: 'https://github.com/example/project',
        private: true,
      },
    ]);
    expect(receivedInstallationId).toBe('42');
    expect(clientFactory).toHaveBeenCalled();
  });

  it('rejects a repository outside the selected installation and does not return credentials', async () => {
    const clientFactory = vi.fn(async () => ({
      listRepositories: async () => [],
    }));
    const provider = new GitHubSourceProvider(clientFactory);

    await expect(
      provider.getAuthorizedRepository('42', 'https://github.com/other/project'),
    ).rejects.toMatchObject<Partial<ProviderError>>({
      code: 'source_not_authorized',
      statusCode: 403,
    });
    expect(JSON.stringify(clientFactory.mock.results)).not.toMatch(/token|secret/i);
  });

  it('maps installation permission failures to sanitized provider errors', async () => {
    const provider = new GitHubSourceProvider(async () => {
      throw Object.assign(new Error('sensitive GitHub response'), { status: 403 });
    });

    await expect(provider.listAuthorizedRepositories('42')).rejects.toMatchObject({
      code: 'provider_access_denied',
      statusCode: 403,
      message: 'The GitHub installation cannot access this repository.',
    });
  });
});
