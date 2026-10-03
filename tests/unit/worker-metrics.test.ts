import { describe, expect, it } from 'vitest';
import {
  recordOversizedPartial,
  recordWorkerFailure,
  recordWorkerStageCompletion,
  renderWorkerMetrics,
} from '../../apps/analysis-worker/src/observability/metrics.js';

describe('worker operational metrics', () => {
  it('exposes stage duration, failure, retry, and oversized-partial series', () => {
    recordWorkerStageCompletion('parsing', 120);
    recordWorkerFailure('parsing', true);
    recordOversizedPartial();
    const metrics = renderWorkerMetrics();

    expect(metrics).toContain('codeorbit_worker_stage_completions_total{stage="parsing"}');
    expect(metrics).toContain(
      'codeorbit_worker_stage_duration_milliseconds_bucket{stage="parsing"',
    );
    expect(metrics).toContain('codeorbit_worker_stage_failures_total{stage="parsing"}');
    expect(metrics).toContain('codeorbit_worker_retries_total{stage="parsing"}');
    expect(metrics).toContain('codeorbit_worker_oversized_partials_total 1');
  });
});
