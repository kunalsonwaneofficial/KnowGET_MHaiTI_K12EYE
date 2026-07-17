/** Exponential backoff (ms) for a given prior-attempt count, capped. */
export const exponentialBackoff =
  (baseMs = 100, maxMs = 10_000) =>
  (attempt: number): number =>
    Math.min(baseMs * 2 ** (attempt - 1), maxMs);

export interface RetryOptions {
  readonly maxAttempts?: number;
  readonly backoff?: (attempt: number) => number;
  readonly shouldRetry?: (error: unknown) => boolean;
  /** Delay primitive (injected for deterministic tests). */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly onRetry?: (error: unknown, attempt: number) => void;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying on failure up to `maxAttempts` with backoff between tries.
 * `shouldRetry` can restrict retries to transient errors; the final failure is
 * rethrown. The delay primitive is injectable so retry logic is testable without
 * real time.
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const backoff = options.backoff ?? exponentialBackoff();
  const shouldRetry = options.shouldRetry ?? (() => true);
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetry(error)) {
        throw error;
      }
      options.onRetry?.(error, attempt);
      await sleep(backoff(attempt));
    }
  }
  throw lastError;
}
