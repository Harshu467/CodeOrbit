import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  claimNextJob,
  closePool,
  completeWorkerStage,
  getPool,
  isJobLeaseCurrent,
  recordWorkerFailure,
  renewJobLease,
  startWorkerStage,
} from '../../packages/persistence/src/index.js';
import { AnalysisRunService } from '../../apps/api/src/services/analysis-run-service.js';

const enabled = Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)('analysis run concurrency and leases', () => {
  let pool: ReturnType<typeof getPool>;
  const workspaceId = `run-test-${crypto.randomUUID()}`;
  const userId = 'run-integration-user';
  const repositoryId = crypto.randomUUID();
  const connectionId = crypto.randomUUID();
  const sourceBindingId = crypto.randomUUID();
  const runIds = [crypto.randomUUID(), crypto.randomUUID()];

  beforeAll(async () => {
    pool = getPool();
    await pool.query('INSERT INTO workspaces (id, name) VALUES ($1, $2)', [
      workspaceId,
      'Run test',
    ]);
    await pool.query(
      'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)',
      [workspaceId, userId, 'owner'],
    );
    await pool.query(
      `INSERT INTO source_connections (id, workspace_id, provider_key, external_connection_id)
       VALUES ($1, $2, 'github', 'run-test-installation')`,
      [connectionId, workspaceId],
    );
    await pool.query(
      `INSERT INTO repositories (id, workspace_id, display_name, created_by)
       VALUES ($1, $2, 'Run test repository', $3)`,
      [repositoryId, workspaceId, userId],
    );
    await pool.query(
      `INSERT INTO source_bindings
         (id, workspace_id, repository_id, connection_id, provider_key,
          external_repository_id, canonical_source_uri)
       VALUES ($1, $2, $3, $4, 'github', 'run-test-repository', 'https://github.com/test/repo')`,
      [sourceBindingId, workspaceId, repositoryId, connectionId],
    );
    for (const [index, id] of runIds.entries()) {
      await pool.query(
        `INSERT INTO analysis_runs
           (id, workspace_id, repository_id, source_binding_id, status,
            snapshot_revision, analyzer_version, configuration_hash, created_by)
         VALUES ($1, $2, $3, $4, 'queued', $5, 'test', 'test-config', $6)`,
        [id, workspaceId, repositoryId, sourceBindingId, `commit-${index}`, userId],
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
          `INSERT INTO analysis_stages (workspace_id, run_id, name, status)
           VALUES ($1, $2, $3, 'queued')`,
          [workspaceId, id, name],
        );
      }
    }
  });

  afterAll(async () => {
    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
    await closePool();
  });

  it('claims different queued work concurrently and fences stale lease generations', async () => {
    const [firstClient, secondClient] = await Promise.all([pool.connect(), pool.connect()]);
    try {
      const [first, second] = await Promise.all([
        claimNextJob(firstClient),
        claimNextJob(secondClient),
      ]);
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(first?.runId).not.toBe(second?.runId);

      const stale = first!;
      const staleAttempt = await startWorkerStage(
        firstClient,
        stale,
        'acquisition',
        crypto.randomUUID(),
      );
      expect(staleAttempt).toBe(1);
      expect(await isJobLeaseCurrent(firstClient, stale.runId, stale.leaseGeneration)).toBe(true);
      await pool.query(
        `UPDATE analysis_runs SET lease_expires_at = now() - interval '1 second' WHERE id = $1`,
        [stale.runId],
      );
      const reclaimed = await claimNextJob(firstClient);
      expect(reclaimed?.runId).toBe(stale.runId);
      expect(reclaimed?.leaseGeneration).toBe(stale.leaseGeneration + 1);
      expect(await isJobLeaseCurrent(firstClient, stale.runId, stale.leaseGeneration)).toBe(false);
      expect(await renewJobLease(firstClient, stale.runId, stale.leaseGeneration)).toBe(false);
      expect(await completeWorkerStage(firstClient, stale, 'acquisition', staleAttempt!)).toBe(
        false,
      );
      expect(
        await recordWorkerFailure(
          firstClient,
          stale,
          { retry: false, delayMs: 0 },
          'stale_failure',
          'acquisition',
          staleAttempt!,
        ),
      ).toBe(false);
      const currentAttempt = await startWorkerStage(
        firstClient,
        reclaimed!,
        'acquisition',
        crypto.randomUUID(),
      );
      expect(currentAttempt).toBe(2);
      expect(
        await recordWorkerFailure(
          firstClient,
          reclaimed!,
          { retry: true, delayMs: 2_000 },
          'temporary_failure',
          'acquisition',
          currentAttempt!,
        ),
      ).toBe(true);
      const retryState = await pool.query<{
        status: string;
        attempt_count: number;
        completed_at: Date | null;
        stage_status: string;
        stage_error_code: string | null;
        attempt_statuses: string[];
      }>(
        `SELECT r.status, r.attempt_count, r.completed_at,
                s.status AS stage_status, s.error_code AS stage_error_code,
                array_agg(a.status ORDER BY a.attempt_number) AS attempt_statuses
         FROM analysis_runs r
         JOIN analysis_stages s ON s.run_id = r.id AND s.name = 'acquisition'
         JOIN analysis_attempts a ON a.run_id = r.id AND a.stage_name = s.name
         WHERE r.id = $1
         GROUP BY r.id, s.status, s.error_code`,
        [stale.runId],
      );
      expect(retryState.rows[0]).toMatchObject({
        status: 'queued',
        attempt_count: 2,
        completed_at: null,
        stage_status: 'queued',
        stage_error_code: 'temporary_failure',
        attempt_statuses: ['failed', 'failed'],
      });

      await expect(
        pool.query(
          `INSERT INTO analysis_runs
             (id, workspace_id, repository_id, source_binding_id, status,
              snapshot_revision, analyzer_version, configuration_hash, created_by)
           VALUES ($1, $2, $3, $4, 'queued', 'commit-0', 'test', 'test-config', $5)`,
          [crypto.randomUUID(), workspaceId, repositoryId, sourceBindingId, userId],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    } finally {
      firstClient.release();
      secondClient.release();
    }
  });

  it('marks a failed terminal stage and run after the final transient attempt', async () => {
    const runId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO analysis_runs
         (id, workspace_id, repository_id, source_binding_id, status,
          snapshot_revision, analyzer_version, configuration_hash, created_by, attempt_count)
       VALUES ($1, $2, $3, $4, 'queued', 'commit-exhausted', 'test', 'test-config', $5, 4)`,
      [runId, workspaceId, repositoryId, sourceBindingId, userId],
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
        `INSERT INTO analysis_stages (workspace_id, run_id, name, status)
         VALUES ($1, $2, $3, 'queued')`,
        [workspaceId, runId, name],
      );
    }

    const client = await pool.connect();
    try {
      const job = await claimNextJob(client);
      expect(job?.runId).toBe(runId);
      const attemptNumber = await startWorkerStage(client, job!, 'parsing', crypto.randomUUID());
      expect(attemptNumber).toBe(1);
      expect(
        await recordWorkerFailure(
          client,
          job!,
          { retry: false, delayMs: 0 },
          'parser_unavailable',
          'parsing',
          attemptNumber!,
        ),
      ).toBe(true);
      const terminal = await pool.query<{
        run_status: string;
        completed_at: Date | null;
        run_error: string | null;
        stage_status: string;
        stage_error: string | null;
        attempt_status: string;
      }>(
        `SELECT r.status AS run_status, r.completed_at, r.error_summary AS run_error,
                s.status AS stage_status, s.error_summary AS stage_error, a.status AS attempt_status
         FROM analysis_runs r
         JOIN analysis_stages s ON s.run_id = r.id AND s.name = 'parsing'
         JOIN analysis_attempts a ON a.run_id = r.id AND a.stage_name = s.name
         WHERE r.id = $1`,
        [runId],
      );
      expect(terminal.rows[0]).toMatchObject({
        run_status: 'failed',
        run_error: 'Analysis failed during parsing; the worker attempt has been exhausted.',
        stage_status: 'failed',
        stage_error: 'Analysis failed during parsing; the worker attempt has been exhausted.',
        attempt_status: 'failed',
      });
      expect(terminal.rows[0]?.completed_at).toBeInstanceOf(Date);
      expect(terminal.rows[0]?.run_error).not.toContain('secret');
    } finally {
      client.release();
    }
  });

  it('rejects duplicate idempotency keys even when the request hash differs', async () => {
    const key = `request-${crypto.randomUUID()}`;
    await pool.query(
      `INSERT INTO idempotency_records (workspace_id, key, request_hash, run_id)
       VALUES ($1, $2, 'first-hash', $3)`,
      [workspaceId, key, runIds[0]],
    );
    await expect(
      pool.query(
        `INSERT INTO idempotency_records (workspace_id, key, request_hash, run_id)
         VALUES ($1, $2, 'different-hash', $3)`,
        [workspaceId, key, runIds[1]],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('coalesces active work, supports distinct runs, and enforces idempotency request hashes', async () => {
    const service = new AnalysisRunService(
      {
        resolveRevision: async (_connectionId, _repositoryId, revision) => ({
          requestedRevision: revision ?? null,
          snapshotRevision: 'commit-service',
        }),
      },
      pool,
    );
    const [first, concurrent] = await Promise.all([
      service.start(workspaceId, userId, repositoryId, {
        revision: 'main',
        createDistinctRun: false,
      }),
      service.start(workspaceId, userId, repositoryId, {
        revision: 'main',
        createDistinctRun: false,
      }),
    ]);
    expect(first.run.id).toBe(concurrent.run.id);
    expect([first.reused, concurrent.reused]).toContain(true);
    expect(first.run.stages).toHaveLength(7);

    const keyed = await service.start(
      workspaceId,
      userId,
      repositoryId,
      { revision: 'main', createDistinctRun: true },
      'service-idempotency-key',
    );
    const repeated = await service.start(
      workspaceId,
      userId,
      repositoryId,
      { revision: 'main', createDistinctRun: true },
      'service-idempotency-key',
    );
    expect(repeated.run.id).toBe(keyed.run.id);
    await expect(
      service.start(
        workspaceId,
        userId,
        repositoryId,
        { revision: 'release', createDistinctRun: true },
        'service-idempotency-key',
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    const distinct = await service.start(workspaceId, userId, repositoryId, {
      revision: 'main',
      createDistinctRun: true,
    });
    expect(distinct.run.id).not.toBe(first.run.id);
  });

  it('enforces stage progress and snapshot immutability constraints', async () => {
    const runId = runIds[0]!;
    await expect(
      pool.query('UPDATE analysis_runs SET snapshot_revision = $1 WHERE id = $2', [
        'changed-revision',
        runId,
      ]),
    ).rejects.toMatchObject({ code: 'P0001' });
    await expect(
      pool.query(
        `UPDATE analysis_stages SET progress_current = 3, progress_total = 2
         WHERE run_id = $1 AND name = 'parsing'`,
        [runId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
