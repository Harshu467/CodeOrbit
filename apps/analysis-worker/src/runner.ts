import type pg from 'pg';
import {
  claimNextJob,
  getPool,
  isJobLeaseCurrent,
  recordWorkerFailure,
  renewJobLease,
} from '@codeorbit/persistence';
import type { ClaimedJob } from '@codeorbit/persistence';
import { decideRetry } from './retry-policy.js';

const LEASE_SECONDS = 60;
const HEARTBEAT_INTERVAL_MS = 20_000;

export interface RunExecutionContext {
  assertLeaseCurrent(): Promise<void>;
}

export interface RunExecutor {
  execute(job: ClaimedJob, context: RunExecutionContext): Promise<void>;
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

async function withClient<T>(pool: pg.Pool, action: (client: pg.PoolClient) => Promise<T>): Promise<T> {
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
): Promise<boolean> {
  const job = await withClient(pool, claimNextJob);
  if (!job) return false;

  let leaseLost = false;
  let heartbeatError: unknown;
  let heartbeatTimer: NodeJS.Timeout | undefined;
  let stopped = false;
  const scheduleHeartbeat = (): void => {
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
  scheduleHeartbeat();

  try {
    await executor.execute(job, { assertLeaseCurrent });
    await assertLeaseCurrent();
  } catch (error) {
    if (leaseLost || error instanceof StaleWorkerLeaseError) {
      if (heartbeatError instanceof Error) throw new StaleWorkerLeaseError();
      throw error instanceof StaleWorkerLeaseError ? error : new StaleWorkerLeaseError();
    }
    await assertLeaseCurrent();
    const retry = decideRetry(error, job.attemptCount);
    const recorded = await withClient(pool, (client) =>
      recordWorkerFailure(client, job, retry, safeErrorCode(error)),
    );
    if (!recorded) throw new StaleWorkerLeaseError();
  } finally {
    stopped = true;
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
  }
  return true;
}
