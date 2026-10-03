export interface RetryDecision {
  readonly retry: boolean;
  readonly delayMs: number;
}

const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 30_000;
const MAX_ATTEMPTS = 5;

function isRetryable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'retryable' in error &&
    error.retryable === true
  );
}

export function decideRetry(
  error: unknown,
  attemptCount: number,
  maxAttempts = MAX_ATTEMPTS,
): RetryDecision {
  if (!isRetryable(error) || attemptCount < 1 || attemptCount >= maxAttempts) {
    return { retry: false, delayMs: 0 };
  }
  const exponent = Math.min(attemptCount - 1, 30);
  return {
    retry: true,
    delayMs: Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** exponent),
  };
}
