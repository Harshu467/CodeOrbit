import type pg from 'pg';

export interface ClaimedJob {
  readonly runId: string;
  readonly workspaceId: string;
  readonly leaseGeneration: number;
  readonly attemptCount: number;
}

export async function claimNextJob(client: pg.PoolClient): Promise<ClaimedJob | null> {
  const result = await client.query<{
    id: string;
    workspace_id: string;
    lease_generation: number;
    attempt_count: number;
  }>(
    `WITH candidate AS (
       SELECT id FROM analysis_runs
       WHERE (status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= now()))
          OR (status = 'running' AND lease_expires_at <= now())
       ORDER BY COALESCE(next_attempt_at, created_at), created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE analysis_runs r SET status='running', started_at=COALESCE(started_at, now()),
       attempt_count=attempt_count+1, lease_generation=lease_generation+1,
       next_attempt_at=NULL, lease_expires_at=now() + interval '60 seconds'
     FROM candidate WHERE r.id=candidate.id
     RETURNING r.id, r.workspace_id, r.lease_generation, r.attempt_count`,
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
       AND lease_expires_at > now()`,
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
       AND lease_expires_at > now()`,
    [runId, leaseGeneration],
  );
  return result.rowCount === 1;
}

export async function recordWorkerFailure(
  client: pg.PoolClient,
  job: ClaimedJob,
  retry: { readonly retry: boolean; readonly delayMs: number },
  errorCode: string,
): Promise<boolean> {
  const result = await client.query(
    `UPDATE analysis_runs SET
       status = CASE WHEN $4 THEN 'queued' ELSE 'failed' END,
       completed_at = CASE WHEN $4 THEN NULL ELSE now() END,
       next_attempt_at = CASE
         WHEN $4 THEN now() + make_interval(secs => $5::double precision / 1000)
         ELSE NULL
       END,
       lease_expires_at = NULL,
       error_summary = $6
     WHERE id = $1 AND workspace_id = $2 AND status = 'running'
       AND lease_generation = $3`,
    [
      job.runId,
      job.workspaceId,
      job.leaseGeneration,
      retry.retry,
      retry.delayMs,
      `${errorCode}: analysis attempt failed.`,
    ],
  );
  return result.rowCount === 1;
}
