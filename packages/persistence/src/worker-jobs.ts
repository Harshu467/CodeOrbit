import type pg from 'pg';

export type WorkerStageName =
  | 'acquisition'
  | 'file_discovery'
  | 'language_detection'
  | 'parsing'
  | 'symbol_extraction'
  | 'relationship_extraction'
  | 'persistence';

export interface ClaimedJob {
  readonly runId: string;
  readonly workspaceId: string;
  readonly leaseGeneration: number;
  readonly attemptCount: number;
}

const DEFAULT_MAX_ATTEMPTS = 5;

export async function claimNextJob(
  client: pg.PoolClient,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
): Promise<ClaimedJob | null> {
  await client.query(
    `WITH expired AS MATERIALIZED (
       SELECT id, workspace_id FROM analysis_runs
       WHERE status = 'running' AND lease_expires_at <= now()
         AND attempt_count >= $1
       FOR UPDATE SKIP LOCKED
     ), failed_attempts AS (
       UPDATE analysis_attempts a SET status = 'failed', completed_at = now(),
         error_code = 'worker_lease_expired',
         error_summary = 'The worker lease expired before the stage completed.'
       FROM expired e
       WHERE a.workspace_id = e.workspace_id AND a.run_id = e.id AND a.status = 'running'
       RETURNING a.workspace_id, a.run_id, a.stage_name
     ), failed_stages AS (
       UPDATE analysis_stages s SET status = 'failed', completed_at = now(),
         error_code = 'worker_lease_expired',
         error_summary = 'The worker lease expired and retry attempts were exhausted.'
       FROM expired e
       WHERE s.workspace_id = e.workspace_id AND s.run_id = e.id
         AND (s.status = 'running' OR EXISTS (
           SELECT 1 FROM failed_attempts a
           WHERE a.workspace_id = s.workspace_id AND a.run_id = s.run_id
             AND a.stage_name = s.name
         ) OR (
           s.status = 'queued'
           AND NOT EXISTS (
             SELECT 1 FROM failed_attempts a
             WHERE a.workspace_id = s.workspace_id AND a.run_id = s.run_id
           )
           AND s.name = (
             SELECT pending.name FROM analysis_stages pending
             WHERE pending.workspace_id = s.workspace_id AND pending.run_id = s.run_id
               AND pending.status IN ('queued', 'running')
             ORDER BY array_position(ARRAY[
               'acquisition', 'file_discovery', 'language_detection', 'parsing',
               'symbol_extraction', 'relationship_extraction', 'persistence'
             ]::text[], pending.name)
             LIMIT 1
           )
         ))
       RETURNING s.workspace_id, s.run_id, s.name
     )
     UPDATE analysis_runs r SET status = 'failed', completed_at = now(),
       lease_expires_at = NULL, next_attempt_at = NULL,
       error_summary = 'Analysis failed during ' || COALESCE(fs.name, 'worker execution')
         || ' after worker lease retry attempts were exhausted.'
     FROM expired e
     LEFT JOIN (
       SELECT workspace_id, run_id, min(name) AS name
       FROM failed_stages GROUP BY workspace_id, run_id
     ) fs ON fs.workspace_id = e.workspace_id AND fs.run_id = e.id
     WHERE r.workspace_id = e.workspace_id AND r.id = e.id`,
    [maxAttempts],
  );

  const result = await client.query<{
    id: string;
    workspace_id: string;
    lease_generation: number;
    attempt_count: number;
  }>(
    `WITH candidate AS MATERIALIZED (
       SELECT id, workspace_id, status, attempt_count FROM analysis_runs
       WHERE (status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= now()))
          OR (status = 'running' AND lease_expires_at <= now() AND attempt_count < $1)
       ORDER BY COALESCE(next_attempt_at, created_at), created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     ), expired_attempts AS (
       UPDATE analysis_attempts a SET status = 'failed', completed_at = now(),
         error_code = 'worker_lease_expired',
         error_summary = 'The worker lease expired before the stage completed.'
       FROM candidate c
       WHERE c.status = 'running' AND a.workspace_id = c.workspace_id
         AND a.run_id = c.id AND a.status = 'running'
       RETURNING a.workspace_id, a.run_id, a.stage_name
     ), recovered_stages AS (
       UPDATE analysis_stages s SET status = 'queued', completed_at = NULL,
         error_code = 'worker_lease_expired',
         error_summary = 'The worker lease expired; this stage will be retried.'
       FROM candidate c
       WHERE c.status = 'running' AND s.workspace_id = c.workspace_id AND s.run_id = c.id
         AND (s.status = 'running' OR EXISTS (
           SELECT 1 FROM expired_attempts a
           WHERE a.workspace_id = s.workspace_id AND a.run_id = s.run_id
             AND a.stage_name = s.name
         ))
       RETURNING s.run_id
     ), recovery_barrier AS (
       SELECT count(*) FROM recovered_stages
     )
     UPDATE analysis_runs r SET status='running', started_at=COALESCE(started_at, now()),
       attempt_count=attempt_count+1, lease_generation=lease_generation+1,
       next_attempt_at=NULL, lease_expires_at=now() + interval '60 seconds'
     FROM candidate, recovery_barrier
     WHERE r.id=candidate.id AND r.workspace_id=candidate.workspace_id
     RETURNING r.id, r.workspace_id, r.lease_generation, r.attempt_count`,
    [maxAttempts],
  );
  const row = result.rows[0];
  return row
    ? {
        runId: row.id,
        workspaceId: row.workspace_id,
        leaseGeneration: row.lease_generation,
        attemptCount: row.attempt_count,
      }
    : null;
}

export async function startWorkerStage(
  client: pg.PoolClient,
  job: ClaimedJob,
  stageName: WorkerStageName,
  attemptId: string,
): Promise<number | null> {
  const result = await client.query<{ attempt_count: number }>(
    `WITH current_lease AS MATERIALIZED (
       SELECT workspace_id FROM analysis_runs
       WHERE workspace_id = $1 AND id = $2 AND status = 'running'
         AND lease_generation = $3 AND lease_expires_at > clock_timestamp()
       FOR UPDATE
     ), transitioned AS (
       UPDATE analysis_stages s SET status = 'running',
         attempt_count = s.attempt_count + 1, started_at = now(),
         completed_at = NULL, duration_ms = NULL,
         error_code = NULL, error_summary = NULL
       FROM current_lease l
       WHERE s.workspace_id = l.workspace_id AND s.run_id = $2 AND s.name = $4
         AND s.status = 'queued'
       RETURNING s.workspace_id, s.attempt_count
     ), inserted AS (
       INSERT INTO analysis_attempts
         (id, workspace_id, run_id, stage_name, attempt_number, status)
       SELECT $5, t.workspace_id, $2, $4, t.attempt_count, 'running'
       FROM transitioned t
       RETURNING attempt_number
     )
     SELECT attempt_count FROM transitioned JOIN inserted USING (attempt_number)`,
    [job.workspaceId, job.runId, job.leaseGeneration, stageName, attemptId],
  );
  return result.rows[0]?.attempt_count ?? null;
}

export async function completeWorkerStage(
  client: pg.PoolClient,
  job: ClaimedJob,
  stageName: WorkerStageName,
  attemptNumber: number,
): Promise<boolean> {
  const result = await client.query(
    `WITH current_lease AS MATERIALIZED (
       SELECT workspace_id FROM analysis_runs
       WHERE workspace_id = $1 AND id = $2 AND status = 'running'
         AND lease_generation = $3 AND lease_expires_at > clock_timestamp()
       FOR UPDATE
     ), closed_attempt AS (
       UPDATE analysis_attempts a SET status = 'completed', completed_at = now()
       FROM current_lease l
       WHERE a.workspace_id = l.workspace_id AND a.run_id = $2 AND a.stage_name = $4
         AND a.attempt_number = $5 AND a.status = 'running'
       RETURNING a.workspace_id, a.run_id, a.stage_name, a.attempt_number
     ), completed_stage AS (
       UPDATE analysis_stages s SET status = 'completed', completed_at = now(),
         duration_ms = GREATEST(0, (extract(epoch FROM (now() - s.started_at)) * 1000)::integer),
         error_code = NULL, error_summary = NULL
       FROM closed_attempt a, current_lease l
       WHERE s.workspace_id = l.workspace_id AND s.run_id = a.run_id
         AND s.name = a.stage_name AND s.attempt_count = a.attempt_number
         AND s.status = 'running'
       RETURNING s.run_id
     )
     SELECT 1 FROM completed_stage`,
    [job.workspaceId, job.runId, job.leaseGeneration, stageName, attemptNumber],
  );
  return result.rowCount === 1;
}

export async function renewJobLease(
  client: pg.PoolClient,
  runId: string,
  leaseGeneration: number,
  leaseSeconds = 60,
): Promise<boolean> {
  const result = await client.query(
    `UPDATE analysis_runs
     SET lease_expires_at = now() + make_interval(secs => $3)
     WHERE id = $1 AND status = 'running' AND lease_generation = $2
       AND lease_expires_at > clock_timestamp()`,
    [runId, leaseGeneration, leaseSeconds],
  );
  return result.rowCount === 1;
}

export async function isJobLeaseCurrent(
  client: pg.PoolClient,
  runId: string,
  leaseGeneration: number,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM analysis_runs
     WHERE id = $1 AND status = 'running' AND lease_generation = $2
       AND lease_expires_at > clock_timestamp()`,
    [runId, leaseGeneration],
  );
  return result.rowCount === 1;
}

export async function recordWorkerFailure(
  client: pg.PoolClient,
  job: ClaimedJob,
  retry: { readonly retry: boolean; readonly delayMs: number },
  errorCode: string,
  stageName: WorkerStageName = 'acquisition',
  attemptNumber = job.attemptCount,
): Promise<boolean> {
  const result = await client.query(
    `WITH current_lease AS MATERIALIZED (
       SELECT workspace_id FROM analysis_runs
       WHERE id = $1 AND workspace_id = $2 AND status = 'running'
         AND lease_generation = $3 AND lease_expires_at > clock_timestamp()
       FOR UPDATE
     ), failed_attempt AS (
       UPDATE analysis_attempts a SET status = 'failed', completed_at = now(),
         error_code = $6, error_summary = $7
       FROM current_lease l
       WHERE a.workspace_id = l.workspace_id AND a.run_id = $1
         AND a.stage_name = $8 AND a.attempt_number = $9 AND a.status = 'running'
       RETURNING a.workspace_id, a.run_id, a.stage_name, a.attempt_number
     ), failed_stage AS (
       UPDATE analysis_stages s SET status = CASE WHEN $4 THEN 'queued' ELSE 'failed' END,
         completed_at = CASE WHEN $4 THEN NULL ELSE now() END,
         duration_ms = CASE WHEN $4 THEN NULL
           ELSE GREATEST(0, (extract(epoch FROM (now() - s.started_at)) * 1000)::integer) END,
         error_code = $6, error_summary = $7
       FROM failed_attempt a, current_lease l
       WHERE s.workspace_id = l.workspace_id AND s.run_id = a.run_id
         AND s.name = a.stage_name AND s.attempt_count = a.attempt_number
         AND s.status = 'running'
       RETURNING s.run_id
     ), updated_run AS (
       UPDATE analysis_runs r SET
       status = CASE WHEN $4 THEN 'queued' ELSE 'failed' END,
       completed_at = CASE WHEN $4 THEN NULL ELSE now() END,
       next_attempt_at = CASE
         WHEN $4 THEN now() + make_interval(secs => $5::double precision / 1000)
         ELSE NULL
       END,
       lease_expires_at = NULL,
       error_summary = $7
       FROM current_lease l, failed_stage s
       WHERE r.id = $1 AND r.workspace_id = l.workspace_id AND r.status = 'running'
         AND r.lease_generation = $3
       RETURNING r.id
     )
     SELECT 1 FROM updated_run`,
    [
      job.runId,
      job.workspaceId,
      job.leaseGeneration,
      retry.retry,
      retry.delayMs,
      errorCode,
      `Analysis failed during ${stageName}; the worker attempt ${retry.retry ? 'will be retried' : 'has been exhausted'}.`,
      stageName,
      attemptNumber,
    ],
  );
  return result.rowCount === 1;
}
