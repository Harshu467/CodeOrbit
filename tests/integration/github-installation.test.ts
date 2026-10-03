import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { closePool, getPool } from '../../packages/persistence/src/index.js';
import { parseWorkspaceId } from '../../packages/domain/src/ids.js';

const enabled = Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)('GitHub installation callback', () => {
  const pool = getPool();
  const workspaceId = `github-test-${crypto.randomUUID()}`;
  const originalSecret = process.env.SESSION_SECRET;
  const originalSlug = process.env.GITHUB_APP_SLUG;

  beforeAll(async () => {
    process.env.SESSION_SECRET = 'integration-test-secret-that-is-long-enough';
    process.env.GITHUB_APP_SLUG = 'codeorbit-test';
    await pool.query('INSERT INTO workspaces (id, name) VALUES ($1, $2)', [
      workspaceId,
      'GitHub installation integration test',
    ]);
    await pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, 'integration-user', 'owner')`,
      [workspaceId],
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
    if (originalSlug === undefined) delete process.env.GITHUB_APP_SLUG;
    else process.env.GITHUB_APP_SLUG = originalSlug;
    await closePool();
  });

  it('binds a validated installation to the signed-in workspace without returning a token', async () => {
    const provider = {
      listAuthorizedRepositories: async () => [],
      getAuthorizedRepository: async () => {
        throw new Error('not used');
      },
    };
    const app = createApp({
      githubProvider: provider,
      repositoryService: {
        connect: async () => {
          throw new Error('not used');
        },
        list: async () => [],
        get: async () => {
          throw new Error('not used');
        },
      },
      authenticateRequest: async (request) => {
        request.principal = {
          userId: 'integration-user',
          workspaceId: parseWorkspaceId(workspaceId),
          roles: ['owner'],
        };
      },
    });

    const start = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/github/install',
    });
    const signedState = new URL(start.headers.location!).searchParams.get('state');
    expect(signedState).toBeTruthy();
    const callback = await app.inject({
      method: 'GET',
      url: `/api/v1/integrations/github/installations/callback?installation_id=4281&setup_action=install&state=${encodeURIComponent(signedState!)}`,
    });
    const listed = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/github/repositories',
    });
    const saved = await pool.query(
      `SELECT 1 FROM source_connections
       WHERE workspace_id = $1 AND provider_key = 'github'
         AND external_connection_id = '4281'`,
      [workspaceId],
    );
    await app.close();

    expect(start.statusCode).toBe(302);
    expect(callback.statusCode).toBe(303);
    expect(callback.body).not.toMatch(/token|secret/i);
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual({ items: [] });
    expect(saved.rowCount).toBe(1);
  });
});
