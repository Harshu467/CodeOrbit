import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type pg from 'pg';
import type { WorkerStageName } from '@codeorbit/persistence';

const STAGE_DURATION_BUCKETS = [10, 50, 100, 500, 1_000, 5_000, 30_000];
const stageCompletions = new Map<WorkerStageName, number>();
const stageFailures = new Map<WorkerStageName, number>();
const stageRetries = new Map<WorkerStageName, number>();
const retryExhaustions = new Map<WorkerStageName, number>();
const stageDurations = new Map<WorkerStageName, number[]>();
let stuckLeaseCount = 0;
let oversizedPartialCount = 0;
const runCompletions = new Map<string, number>();

export function recordWorkerStageCompletion(stage: WorkerStageName, durationMs: number): void {
  stageCompletions.set(stage, (stageCompletions.get(stage) ?? 0) + 1);
  recordWorkerStageDuration(stage, durationMs);
}

export function recordWorkerStageDuration(stage: WorkerStageName, durationMs: number): void {
  const observations = stageDurations.get(stage) ?? [];
  observations.push(Math.max(0, durationMs));
  stageDurations.set(stage, observations);
}

export function recordWorkerFailure(stage: WorkerStageName, retry: boolean): void {
  stageFailures.set(stage, (stageFailures.get(stage) ?? 0) + 1);
  if (retry) {
    stageRetries.set(stage, (stageRetries.get(stage) ?? 0) + 1);
  } else {
    retryExhaustions.set(stage, (retryExhaustions.get(stage) ?? 0) + 1);
  }
}

export function recordWorkerRunCompletion(status: 'completed' | 'partial' | 'failed'): void {
  runCompletions.set(status, (runCompletions.get(status) ?? 0) + 1);
}

export function recordOversizedPartial(): void {
  oversizedPartialCount += 1;
}

export async function refreshStuckLeaseGauge(pool: pg.Pool): Promise<void> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*) AS count FROM analysis_runs
     WHERE status = 'running' AND lease_expires_at <= now()`,
  );
  stuckLeaseCount = Number(result.rows[0]?.count ?? 0);
}

export function renderWorkerMetrics(): string {
  const lines = [
    '# HELP codeorbit_worker_stage_completions_total Completed worker stages.',
    '# TYPE codeorbit_worker_stage_completions_total counter',
  ];
  for (const [stage, count] of stageCompletions) {
    lines.push(`codeorbit_worker_stage_completions_total{stage="${stage}"} ${count}`);
  }
  lines.push(
    '# HELP codeorbit_worker_stage_failures_total Failed worker stage attempts.',
    '# TYPE codeorbit_worker_stage_failures_total counter',
  );
  for (const [stage, count] of stageFailures) {
    lines.push(`codeorbit_worker_stage_failures_total{stage="${stage}"} ${count}`);
  }
  lines.push(
    '# HELP codeorbit_worker_retries_total Scheduled transient stage retries.',
    '# TYPE codeorbit_worker_retries_total counter',
  );
  for (const [stage, count] of stageRetries) {
    lines.push(`codeorbit_worker_retries_total{stage="${stage}"} ${count}`);
  }
  lines.push(
    '# HELP codeorbit_worker_retry_exhaustions_total Exhausted transient retry policies.',
    '# TYPE codeorbit_worker_retry_exhaustions_total counter',
  );
  for (const [stage, count] of retryExhaustions) {
    lines.push(`codeorbit_worker_retry_exhaustions_total{stage="${stage}"} ${count}`);
  }
  lines.push(
    '# HELP codeorbit_worker_stage_duration_milliseconds Stage execution duration.',
    '# TYPE codeorbit_worker_stage_duration_milliseconds histogram',
  );
  for (const [stage, values] of stageDurations) {
    for (const bound of STAGE_DURATION_BUCKETS) {
      const count = values.filter((value) => value <= bound).length;
      lines.push(
        `codeorbit_worker_stage_duration_milliseconds_bucket{stage="${stage}",le="${bound}"} ${count}`,
      );
    }
    lines.push(
      `codeorbit_worker_stage_duration_milliseconds_bucket{stage="${stage}",le="+Inf"} ${values.length}`,
    );
    lines.push(
      `codeorbit_worker_stage_duration_milliseconds_count{stage="${stage}"} ${values.length}`,
    );
    lines.push(
      `codeorbit_worker_stage_duration_milliseconds_sum{stage="${stage}"} ${values.reduce((sum, value) => sum + value, 0)}`,
    );
  }
  lines.push(
    '# HELP codeorbit_worker_stuck_leases Current number of expired running leases.',
    '# TYPE codeorbit_worker_stuck_leases gauge',
    `codeorbit_worker_stuck_leases ${stuckLeaseCount}`,
    '# HELP codeorbit_worker_oversized_partials_total Repositories marked partial by configured size limits.',
    '# TYPE codeorbit_worker_oversized_partials_total counter',
    `codeorbit_worker_oversized_partials_total ${oversizedPartialCount}`,
    '# HELP codeorbit_worker_runs_completed_total Terminal worker run outcomes.',
    '# TYPE codeorbit_worker_runs_completed_total counter',
  );
  for (const [status, count] of runCompletions) {
    lines.push(`codeorbit_worker_runs_completed_total{status="${status}"} ${count}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function startWorkerMetricsServer(port: number): Promise<Server> {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new RangeError('WORKER_METRICS_PORT must be a valid TCP port.');
  }
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/metrics') {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' });
    response.end(renderWorkerMetrics());
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}
