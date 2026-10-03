import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { parseWorkspaceId } from '../../packages/domain/src/ids.js';

const previousSlug = process.env.GITHUB_APP_SLUG;
const previousSecret = process.env.SESSION_SECRET;

afterEach(() => {
  if (previousSlug === undefined) delete process.env.GITHUB_APP_SLUG;
  else process.env.GITHUB_APP_SLUG = previousSlug;
  if (previousSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = previousSecret;
});

describe('GitHub installation API contract', () => {
  it('starts installation with a signed, expiring state and rejects unsigned callbacks', async () => {
    process.env.GITHUB_APP_SLUG = 'codeorbit-test';
    process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
    const app = createApp({
      repositoryService: {
        connect: async () => {
          throw new Error('not used');
        },
        list: async () => [],
        get: async () => {
          throw new Error('not used');
        },
      },
      analysisRunService: {
        start: async () => {
          throw new Error('not used');
        },
        get: async () => {
          throw new Error('not used');
        },
      },
      authenticateRequest: async (request) => {
        request.principal = {
          userId: 'test-user',
          workspaceId: parseWorkspaceId('test-workspace'),
          roles: ['owner'],
        };
      },
    });

    const started = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/github/install',
    });
    const callback = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/github/installations/callback?installation_id=42',
    });
    await app.close();

    expect(started.statusCode).toBe(302);
    const location = new URL(started.headers.location!);
    expect(location.hostname).toBe('github.com');
    expect(location.pathname).toBe('/apps/codeorbit-test/installations/new');
    expect(location.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(callback.statusCode).toBe(401);
  });
});
