import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AnalysisSummaryService } from '../../apps/api/src/services/analysis-summary-service.js';
import { closePool, getPool } from '../../packages/persistence/src/index.js';

const enabled = Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)('analysis summary persistence', () => {
  const workspaceId = `summary-test-${crypto.randomUUID()}`;
  const userId = `summary-user-${crypto.randomUUID()}`;
  const repositoryId = crypto.randomUUID();
  const connectionId = crypto.randomUUID();
  const bindingId = crypto.randomUUID();
  const runIds = Array.from({ length: 5 }, () => crypto.randomUUID());
  let pool: ReturnType<typeof getPool>;
  let service: AnalysisSummaryService;

  beforeAll(async () => {
    pool = getPool();
    service = new AnalysisSummaryService(pool);
    await pool.query('INSERT INTO workspaces (id, name) VALUES ($1, $2)', [
      workspaceId,
      'Summary test',
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
       VALUES ($1, $2, 'Summary test repository', $3)`,
      [repositoryId, workspaceId, userId],
    );
    await pool.query(
      `INSERT INTO source_bindings
         (id, workspace_id, repository_id, connection_id, provider_key,
          external_repository_id, canonical_source_uri)
       VALUES ($1, $2, $3, $4, 'github', $5, 'https://github.com/test/summary')`,
      [bindingId, workspaceId, repositoryId, connectionId, `repo-${crypto.randomUUID()}`],
    );
    const scenarios = [
      { status: 'completed', failureStage: null, attempts: 0 },
      { status: 'partial', failureStage: null, attempts: 0 },
      { status: 'failed', failureStage: 'symbol_extraction', attempts: 0 },
      { status: 'failed', failureStage: 'parsing', attempts: 5 },
      { status: 'failed', failureStage: null, attempts: 0 },
    ] as const;
    for (const [index, scenario] of scenarios.entries()) {
      const runId = runIds[index]!;
      await pool.query(
        `INSERT INTO analysis_runs
           (id, workspace_id, repository_id, source_binding_id, status, completed_at,
            snapshot_revision, analyzer_version, configuration_hash, attempt_count, created_by)
         VALUES ($1, $2, $3, $4, $5, now(), 'revision', 'test', 'config', $6, $7)`,
        [runId, workspaceId, repositoryId, bindingId, scenario.status, scenario.attempts, userId],
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
        const stageFailed = name === scenario.failureStage;
        const stageAttempts = stageFailed ? scenario.attempts || 1 : 0;
        await pool.query(
          `INSERT INTO analysis_stages
             (workspace_id, run_id, name, status, attempt_count, completed_at)
           VALUES ($1, $2, $3, $4, $5, CASE WHEN $4 IN ('failed', 'completed') THEN now() ELSE NULL END)`,
          [
            workspaceId,
            runId,
            name,
            stageFailed ? 'failed' : scenario.failureStage ? 'queued' : 'completed',
            stageAttempts,
          ],
        );
        if (stageFailed && scenario.attempts > 0) {
          for (let attempt = 1; attempt <= scenario.attempts; attempt += 1) {
            await pool.query(
              `INSERT INTO analysis_attempts
                 (id, workspace_id, run_id, stage_name, attempt_number, status, completed_at,
                  error_code, error_summary)
               VALUES ($1, $2, $3, $4, $5, 'failed', now(), 'temporary_failure',
                       'The worker attempt was exhausted.')`,
              [crypto.randomUUID(), workspaceId, runId, name, attempt],
            );
          }
        }
      }
      if (index === 0) {
        await pool.query(
          `INSERT INTO analysis_files
             (id, workspace_id, run_id, path, file_kind, size_bytes, status)
           VALUES ($1, $2, $3, 'src/index.ts', 'source', 0, 'parsed')`,
          [crypto.randomUUID(), workspaceId, runId],
        );
      }
      if (index === 1) {
        await pool.query(
          `INSERT INTO analysis_issues
             (id, workspace_id, run_id, stage_name, severity, code, message, scope)
           VALUES ($1, $2, $3, 'parsing', 'warning', 'syntax_error',
                   'The parser found invalid syntax.', 'repository')`,
          [crypto.randomUUID(), workspaceId, runId],
        );
      }
    }
  });

  afterAll(async () => {
    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
    await closePool();
  });

  it('returns accurate completed, partial, and failed summaries including empty results', async () => {
    const completed = await service.get(workspaceId, runIds[0]!);
    const partial = await service.get(workspaceId, runIds[1]!);
    const requiredStageFailure = await service.get(workspaceId, runIds[2]!);
    const retryExhaustion = await service.get(workspaceId, runIds[3]!);
    const failedEmpty = await service.get(workspaceId, runIds[4]!);
    expect(completed).toMatchObject({
      status: 'completed',
      counts: { files: 1 },
      issues: [],
    });
    expect(partial).toMatchObject({
      status: 'partial',
      issues: [expect.objectContaining({ code: 'syntax_error', stage: 'parsing' })],
    });
    expect(requiredStageFailure.status).toBe('failed');
    expect(retryExhaustion.status).toBe('failed');
    expect(failedEmpty).toMatchObject({
      status: 'failed',
      counts: { files: 0, symbols: 0, relationships: 0 },
    });
    const exhausted = await pool.query<{ attempt_count: number; attempts: string[] }>(
      `SELECT s.attempt_count,
              array_agg(a.status ORDER BY a.attempt_number) AS attempts
       FROM analysis_stages s
       JOIN analysis_attempts a ON a.workspace_id = s.workspace_id
         AND a.run_id = s.run_id AND a.stage_name = s.name
       WHERE s.workspace_id = $1 AND s.run_id = $2 AND s.name = 'parsing'
       GROUP BY s.attempt_count`,
      [workspaceId, runIds[3]],
    );
    expect(exhausted.rows[0]).toEqual({
      attempt_count: 5,
      attempts: ['failed', 'failed', 'failed', 'failed', 'failed'],
    });
  });
});
