import { describe, expect, it } from 'vitest';
import { ProviderError } from '../../packages/domain/src/errors.js';
import { decideRetry } from '../../apps/analysis-worker/src/retry-policy.js';

describe('worker retry policy', () => {
  it('retries transient failures with capped exponential backoff', () => {
    const transient = new ProviderError('temporary', 'Temporary provider failure.', 503, true);
    expect(decideRetry(transient, 1, undefined, () => 1)).toEqual({
      retry: true,
      delayMs: 2_000,
    });
    expect(decideRetry(transient, 5, 6, () => 1)).toEqual({ retry: true, delayMs: 30_000 });
    expect(decideRetry(transient, 2, undefined, () => 0.25)).toEqual({
      retry: true,
      delayMs: 1_000,
    });
    expect(decideRetry(transient, 1, undefined, () => -1)).toEqual({
      retry: true,
      delayMs: 0,
    });
  });

  it('does not retry permanent errors or exhausted attempts', () => {
    expect(decideRetry(new ProviderError('denied', 'Access denied.', 403), 1)).toEqual({
      retry: false,
      delayMs: 0,
    });
    expect(
      decideRetry(
        new ProviderError('temporary', 'Temporary provider failure.', 503, true),
        3,
        3,
        () => 1,
      ),
    ).toEqual({ retry: false, delayMs: 0 });
  });
});
