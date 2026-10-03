import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimedJob } from '@codeorbit/persistence';

const persistence = vi.hoisted(() => ({
  claimNextJob: vi.fn(),
  completeWorkerStage: vi.fn(),
  finalizeWorkerRun: vi.fn(),
  getWorkerStageStatus: vi.fn(),
  getPool: vi.fn(),
  isJobLeaseCurrent: vi.fn(),
  recordWorkerFailure: vi.fn(),
  renewJobLease: vi.fn(),
  startWorkerStage: vi.fn(),
  updateWorkerStageProgress: vi.fn(),
}));

vi.mock('../../packages/persistence/src/index.js', () => persistence);

import { runNextJob, StaleWorkerLeaseError } from '../../apps/analysis-worker/src/runner.js';

const job: ClaimedJob = {
  runId: 'run-1',
  workspaceId: 'workspace-1',
  leaseGeneration: 3,
  attemptCount: 2,
};
const pool = {
  connect: async () => ({
    query: async () => ({
      rows: [
        'acquisition',
        'file_discovery',
        'language_detection',
        'parsing',
        'symbol_extraction',
        'relationship_extraction',
        'persistence',
      ].map((name) => ({ name, status: 'completed' })),
    }),
    release: () => undefined,
  }),
} as never;

describe('analysis worker runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.claimNextJob.mockResolvedValue(job);
    persistence.isJobLeaseCurrent.mockResolvedValue(true);
    persistence.startWorkerStage.mockResolvedValue(1);
    persistence.completeWorkerStage.mockResolvedValue(true);
    persistence.recordWorkerFailure.mockResolvedValue(true);
    persistence.finalizeWorkerRun.mockResolvedValue(true);
    persistence.getWorkerStageStatus.mockResolvedValue({ status: 'queued', attemptCount: 0 });
  });

  it('persists stage attempts and completes their transitions', async () => {
    const execute = vi.fn(async (_job, context) => {
      await context.runStage('parsing', async () => 'parsed');
    });

    await expect(runNextJob({ execute }, pool)).resolves.toBe(true);
    expect(persistence.startWorkerStage).toHaveBeenCalledWith(
      expect.anything(),
      job,
      'parsing',
      expect.any(String),
    );
    expect(persistence.completeWorkerStage).toHaveBeenCalledWith(
      expect.anything(),
      job,
      'parsing',
      1,
    );
    expect(persistence.recordWorkerFailure).not.toHaveBeenCalled();
  });

  it('persists sanitized transient stage failure with injected retry jitter', async () => {
    const error = Object.assign(new Error('provider details must not be persisted'), {
      code: 'temporary_failure',
      retryable: true,
    });
    const execute = vi.fn(async (_job, context) => {
      await context.runStage('acquisition', async () => {
        throw error;
      });
    });

    await expect(runNextJob({ execute }, pool, () => 0.5)).resolves.toBe(true);
    expect(persistence.recordWorkerFailure).toHaveBeenCalledWith(
      expect.anything(),
      job,
      { retry: true, delayMs: 2_000 },
      'temporary_failure',
      'acquisition',
      1,
    );
  });

  it('does not persist any stage or run transition after the lease generation is fenced', async () => {
    persistence.completeWorkerStage.mockResolvedValue(false);
    const execute = vi.fn(async (_job, context) => {
      await context.runStage('parsing', async () => undefined);
    });

    await expect(runNextJob({ execute }, pool)).rejects.toBeInstanceOf(StaleWorkerLeaseError);
    expect(persistence.recordWorkerFailure).not.toHaveBeenCalled();
  });
});
