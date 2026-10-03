import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import {
  claimNextJob,
  completeWorkerStage,
  getPool,
  finalizeWorkerRun,
  getWorkerStageStatus,
  isJobLeaseCurrent,
  recordWorkerFailure,
  renewJobLease,
  startWorkerStage,
  updateWorkerStageProgress,
} from '@codeorbit/persistence';
import { deriveRunStatus, STAGE_NAMES } from '@codeorbit/domain';
import type { StageName, StageStatus } from '@codeorbit/domain';
import type { ClaimedJob, WorkerStageName } from '@codeorbit/persistence';
import { decideRetry } from './retry-policy.js';
import {
  recordWorkerFailure as recordWorkerFailureMetric,
  recordWorkerRunCompletion,
  recordWorkerStageCompletion,
  recordWorkerStageDuration,
} from './observability/metrics.js';

const LEASE_SECONDS = 60;
const HEARTBEAT_INTERVAL_MS = 20_000;

export interface RunExecutionContext {
  assertLeaseCurrent(): Promise<void>;
  runStage<T>(stageName: WorkerStageName, execute: () => Promise<T>): Promise<T>;
  updateProgress(stageName: WorkerStageName, current: number, total: number | null): Promise<void>;
}

export interface RunExecutionOutcome {
  readonly usefulResults: boolean;
  readonly itemIssues: boolean;
  readonly errorSummary?: string;
}

export interface RunExecutor {
  execute(job: ClaimedJob, context: RunExecutionContext): Promise<void | RunExecutionOutcome>;
}

export class StaleWorkerLeaseError extends Error {
  constructor() {
    super('The worker no longer owns this analysis lease.');
    this.name = 'StaleWorkerLeaseError';
  }
}

function safeErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[a-zA-Z0-9_-]{1,64}$/.test(error.code)
  ) {
    return error.code;
  }
  return 'analysis_worker_error';
}

async function withClient<T>(
  pool: pg.Pool,
  action: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await action(client);
  } finally {
    client.release();
  }
}

export async function runNextJob(
  executor: RunExecutor,
  pool: pg.Pool = getPool(),
  random: () => number = Math.random,
): Promise<boolean> {
  const job = await withClient(pool, claimNextJob);
  if (!job) return false;

  let leaseLost = false;
  let heartbeatError: unknown;
  let heartbeatTimer: NodeJS.Timeout | undefined;
  let stopped = false;
  let failedStage:
    | { readonly name: WorkerStageName; readonly attemptNumber: number; readonly startedAt: number }
    | undefined;
  const replayingCompletedStages = new Set<WorkerStageName>();
  const scheduleHeartbeat = (): void => {
    if (stopped) return;
    heartbeatTimer = setTimeout(() => {
      if (stopped) return;
      void withClient(pool, (client) =>
        renewJobLease(client, job.runId, job.leaseGeneration, LEASE_SECONDS),
      )
        .then((renewed) => {
          if (!renewed) {
            leaseLost = true;
            return;
          }
          scheduleHeartbeat();
        })
        .catch((error: unknown) => {
          heartbeatError = error;
          leaseLost = true;
        });
    }, HEARTBEAT_INTERVAL_MS);
    heartbeatTimer.unref();
  };
  const assertLeaseCurrent = async (): Promise<void> => {
    if (leaseLost) {
      throw new StaleWorkerLeaseError();
    }
    const current = await withClient(pool, (client) =>
      isJobLeaseCurrent(client, job.runId, job.leaseGeneration),
    );
    if (!current) {
      leaseLost = true;
      throw new StaleWorkerLeaseError();
    }
  };
  const runStage = async <T>(stageName: WorkerStageName, execute: () => Promise<T>): Promise<T> => {
    await assertLeaseCurrent();
    const previous = await withClient(pool, (client) =>
      getWorkerStageStatus(client, job, stageName),
    );
    if (!previous) {
      leaseLost = true;
      throw new StaleWorkerLeaseError();
    }
    if (previous.status === 'completed') {
      replayingCompletedStages.add(stageName);
      const startedAt = performance.now();
      try {
        return await execute();
      } finally {
        replayingCompletedStages.delete(stageName);
        recordWorkerStageDuration(stageName, performance.now() - startedAt);
      }
    }
    if (previous.status !== 'queued') {
      leaseLost = true;
      throw new StaleWorkerLeaseError();
    }
    const attemptNumber = await withClient(pool, (client) =>
      startWorkerStage(client, job, stageName, randomUUID()),
    );
    if (attemptNumber === null) {
      leaseLost = true;
      throw new StaleWorkerLeaseError();
    }
    const startedAt = performance.now();
    failedStage = { name: stageName, attemptNumber, startedAt };
    const result = await execute();
    await assertLeaseCurrent();
    const completed = await withClient(pool, (client) =>
      completeWorkerStage(client, job, stageName, attemptNumber),
    );
    if (!completed) {
      leaseLost = true;
      throw new StaleWorkerLeaseError();
    }
    recordWorkerStageCompletion(stageName, performance.now() - startedAt);
    failedStage = undefined;
    return result;
  };
  const updateProgress = async (
    stageName: WorkerStageName,
    current: number,
    total: number | null,
  ): Promise<void> => {
    await assertLeaseCurrent();
    if (replayingCompletedStages.has(stageName)) return;
    const updated = await withClient(pool, (client) =>
      updateWorkerStageProgress(client, job, stageName, current, total),
    );
    if (!updated) {
      leaseLost = true;
      throw new StaleWorkerLeaseError();
    }
  };
  scheduleHeartbeat();

  try {
    const outcome = await executor.execute(job, { assertLeaseCurrent, runStage, updateProgress });
    await assertLeaseCurrent();
    const stageStatuses = await withClient(pool, async (client) => {
      const result = await client.query<{ name: (typeof STAGE_NAMES)[number]; status: string }>(
        `SELECT name, status FROM analysis_stages WHERE workspace_id = $1 AND run_id = $2`,
        [job.workspaceId, job.runId],
      );
      return result.rows;
    });
    const finalStatus = deriveRunStatus({
      stages: stageStatuses.map((stage) => ({
        name: stage.name as StageName,
        status: stage.status as StageStatus,
      })),
      usefulResults: outcome?.usefulResults ?? true,
      itemIssues: outcome?.itemIssues ?? false,
      retriesExhausted: false,
    });
    if (finalStatus === 'running' || finalStatus === 'queued') {
      throw new Error('The worker pipeline returned before all required stages completed.');
    }
    const finalized = await withClient(pool, (client) =>
      finalizeWorkerRun(client, job, finalStatus, outcome?.errorSummary),
    );
    if (!finalized) {
      leaseLost = true;
      throw new StaleWorkerLeaseError();
    }
    recordWorkerRunCompletion(finalStatus);
  } catch (error) {
    if (leaseLost || error instanceof StaleWorkerLeaseError) {
      if (heartbeatError instanceof Error) throw new StaleWorkerLeaseError();
      throw error instanceof StaleWorkerLeaseError ? error : new StaleWorkerLeaseError();
    }
    await assertLeaseCurrent();
    if (!failedStage) {
      const failedStageName = await withClient(pool, async (client) => {
        const result = await client.query<{ name: WorkerStageName }>(
          `SELECT name FROM analysis_stages
           WHERE workspace_id = $1 AND run_id = $2 AND status = 'queued'
           ORDER BY array_position($3::text[], name) LIMIT 1`,
          [job.workspaceId, job.runId, STAGE_NAMES],
        );
        return result.rows[0]?.name;
      });
      if (!failedStageName) throw error;
      const attemptNumber = await withClient(pool, (client) =>
        startWorkerStage(client, job, failedStageName, randomUUID()),
      );
      if (attemptNumber === null) throw new StaleWorkerLeaseError();
      failedStage = { name: failedStageName, attemptNumber, startedAt: performance.now() };
    }
    const retry = decideRetry(error, job.attemptCount, undefined, random);
    recordWorkerStageDuration(failedStage.name, performance.now() - failedStage.startedAt);
    recordWorkerFailureMetric(failedStage.name, retry.retry);
    const recorded = await withClient(pool, (client) =>
      recordWorkerFailure(
        client,
        job,
        retry,
        safeErrorCode(error),
        failedStage!.name,
        failedStage!.attemptNumber,
      ),
    );
    if (!recorded) throw new StaleWorkerLeaseError();
    if (!retry.retry) recordWorkerRunCompletion('failed');
  } finally {
    stopped = true;
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
  }
  return true;
}
