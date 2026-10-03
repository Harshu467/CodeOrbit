import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../../packages/persistence/src/index.js';
import { RepositoryService } from '../../apps/api/src/services/repository-service.js';

const enabled = Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)('repository registration persistence', () => {
  const pool = getPool();
  const workspaceId = `test-${crypto.randomUUID()}`;
  const connectionId = crypto.randomUUID();

  beforeAll(async () => {
    await pool.query(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2)',
      [workspaceId, 'Repository registration integration test'],
    );
    await pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, 'integration-user', 'owner')`,
      [workspaceId],
    );
    await pool.query(
      `INSERT INTO source_connections
         (id, workspace_id, provider_key, external_connection_id)
       VALUES ($1, $2, 'github', 'test-installation')`,
      [connectionId, workspaceId],
    );
    await expect(
      pool.query(
        `INSERT INTO source_connections
           (id, workspace_id, provider_key, external_connection_id)
         VALUES ($1, $2, 'github', 'test-installation')`,
        [crypto.randomUUID(), workspaceId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
    await closePool();
  });

  it('persists provider-neutral repositories and enforces source-binding uniqueness without credentials', async () => {
    const service = new RepositoryService(
      {
        getAuthorizedRepository: async () => ({
          providerRepositoryId: '123',
          fullName: 'example/project',
          uri: 'https://github.com/example/project',
          private: true,
        }),
      },
      pool,
    );
    const connected = await service.connect(
      workspaceId,
      'integration-user',
      'https://github.com/example/project',
    );
    expect(connected.id).toBeTruthy();
    expect(connected.displayName).toBe('example/project');

    await expect(
      pool.query(
        `INSERT INTO source_bindings
           (id, workspace_id, repository_id, connection_id, provider_key,
            external_repository_id, canonical_source_uri)
         VALUES ($1, $2, $3, $4, 'github', '123', 'https://github.com/example/project')`,
        [crypto.randomUUID(), workspaceId, connected.id, connectionId],
      ),
    ).rejects.toMatchObject({ code: '23505' });

    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name IN ('repositories', 'source_connections', 'source_bindings')
         AND column_name ~* '(token|secret|private_key)'`,
    );
    expect(columns.rows).toEqual([]);
    expect(await service.list(workspaceId)).toHaveLength(1);
    await expect(service.get(`another-${workspaceId}`, connected.id)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
