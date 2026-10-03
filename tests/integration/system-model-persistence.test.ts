import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, getPool, persistSystemModel } from '../../packages/persistence/src/index.js';

const enabled = Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)('system model persistence', () => {
  const workspaceId = `model-test-${crypto.randomUUID()}`;
  const userId = `model-user-${crypto.randomUUID()}`;
  const repositoryId = crypto.randomUUID();
  const connectionId = crypto.randomUUID();
  const bindingId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  let pool: ReturnType<typeof getPool>;

  beforeAll(async () => {
    pool = getPool();
    await pool.query('INSERT INTO workspaces (id, name) VALUES ($1, $2)', [
      workspaceId,
      'Model test',
    ]);
    await pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [workspaceId, userId],
    );
    await pool.query(
      `INSERT INTO source_connections (id, workspace_id, provider_key, external_connection_id)
       VALUES ($1, $2, 'github', $3)`,
      [connectionId, workspaceId, `installation-${crypto.randomUUID()}`],
    );
    await pool.query(
      `INSERT INTO repositories (id, workspace_id, display_name, created_by)
       VALUES ($1, $2, 'Model test repository', $3)`,
      [repositoryId, workspaceId, userId],
    );
    await pool.query(
      `INSERT INTO source_bindings
         (id, workspace_id, repository_id, connection_id, provider_key,
          external_repository_id, canonical_source_uri)
       VALUES ($1, $2, $3, $4, 'github', $5, 'https://github.com/test/model')`,
      [bindingId, workspaceId, repositoryId, connectionId, `repo-${crypto.randomUUID()}`],
    );
    await pool.query(
      `INSERT INTO analysis_runs
         (id, workspace_id, repository_id, source_binding_id, status,
          snapshot_revision, analyzer_version, configuration_hash, created_by)
       VALUES ($1, $2, $3, $4, 'queued', 'immutable-revision', 'test', 'config', $5)`,
      [runId, workspaceId, repositoryId, bindingId, userId],
    );
    for (const name of [
      'acquisition',
      'file_discovery',
      'language_detection',
      'parsing',
      'symbol_extraction',
      'relationship_extraction',
      'persistence',
    ]) {
      await pool.query(
        `INSERT INTO analysis_stages (workspace_id, run_id, name) VALUES ($1, $2, $3)`,
        [workspaceId, runId, name],
      );
    }
  });

  afterAll(async () => {
    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
    await closePool();
  });

  it('persists same-name symbols in run scope and enforces file and excerpt limits', async () => {
    await persistSystemModel(pool, workspaceId, runId, {
      directories: [
        { path: '.', disposition: 'included' },
        { path: 'src', disposition: 'included' },
      ],
      projects: [
        {
          path: '.',
          name: 'fixture',
          discoveryBasis: 'manifest',
          status: 'complete',
        },
      ],
      files: [
        {
          path: 'src/index.ts',
          sizeBytes: 20,
          fileKind: 'source',
          status: 'parsed',
          language: 'typescript',
        },
      ],
      evidence: [
        {
          key: 'symbol-evidence',
          filePath: 'src/index.ts',
          revision: 'immutable-revision',
          span: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 10 },
          excerpt: 'Bearer test-token',
          factKind: 'symbol',
        },
      ],
      symbols: [
        {
          key: 'same-1',
          filePath: 'src/index.ts',
          name: 'same',
          kind: 'function',
          span: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 10 },
        },
        {
          key: 'same-2',
          filePath: 'src/index.ts',
          name: 'same',
          kind: 'function',
          span: { startLine: 2, startColumn: 1, endLine: 2, endColumn: 10 },
        },
      ],
      apis: [],
      tests: [],
      dependencies: [],
      relationships: [],
      issues: [
        {
          severity: 'warning',
          code: 'parser_warning',
          message: 'access_token=secretvalue',
          scope: 'file',
          filePath: 'src/index.ts',
        },
      ],
    });

    const symbols = await pool.query(
      `SELECT count(*) FROM analysis_symbols WHERE workspace_id = $1 AND run_id = $2 AND name = 'same'`,
      [workspaceId, runId],
    );
    expect(Number(symbols.rows[0]?.count)).toBe(2);
    const evidence = await pool.query<{ excerpt: string }>(
      `SELECT excerpt FROM analysis_source_evidence WHERE workspace_id = $1 AND run_id = $2`,
      [workspaceId, runId],
    );
    expect(evidence.rows[0]?.excerpt).toBe('[REDACTED]');
    const issues = await pool.query<{ message: string }>(
      `SELECT message FROM analysis_issues WHERE workspace_id = $1 AND run_id = $2`,
      [workspaceId, runId],
    );
    expect(issues.rows[0]?.message).toBe('[REDACTED]');
    const file = await pool.query<{ id: string }>(
      `SELECT id FROM analysis_files WHERE workspace_id = $1 AND run_id = $2 AND path = 'src/index.ts'`,
      [workspaceId, runId],
    );
    await expect(
      pool.query(
        `INSERT INTO analysis_files
           (id, workspace_id, run_id, path, file_kind, size_bytes, status)
         VALUES ($1, $2, $3, 'src/index.ts', 'source', 0, 'parsed')`,
        [crypto.randomUUID(), workspaceId, runId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      pool.query(
        `INSERT INTO analysis_source_evidence
           (id, workspace_id, run_id, file_id, revision, excerpt, fact_kind)
         VALUES ($1, $2, $3, $4, 'immutable-revision', $5, 'test')`,
        [crypto.randomUUID(), workspaceId, runId, file.rows[0]?.id, 'x'.repeat(501)],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
