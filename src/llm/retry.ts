/**
 * Retry with exponential backoff — Master Spec §33.3.
 * Generic enough to wrap any async operation, not just LLM calls.
 * `sleepImpl` is injectable so tests run instantly instead of waiting
 * on real timers.
 */

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  sleepImpl?: ((ms: number) => Promise<void>) | undefined;
  onRetry?: ((attempt: number, error: unknown) => void) | undefined;
}

export class RetryExhaustedError extends Error {
  constructor(
    public readonly attempts: number,
    public readonly lastError: unknown
  ) {
    super(`Exhausted ${attempts} attempt(s). Last error: ${String(lastError)}`);
    this.name = "RetryExhaustedError";
  }
}

function defaultSleep(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown;
  const sleep = options.sleepImpl ?? defaultSleep;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      options.onRetry?.(attempt, err);
      if (attempt === options.maxAttempts) break;
      await sleep(options.baseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw new RetryExhaustedError(options.maxAttempts, lastError);
}
