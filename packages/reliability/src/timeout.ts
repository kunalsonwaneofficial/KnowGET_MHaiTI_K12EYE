import { PlatformError } from "@knowget/exceptions";

/** Raised when an operation exceeds its allotted time (maps to HTTP 504). */
export class TimeoutError extends PlatformError {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`, {
      code: "UNAVAILABLE",
      httpStatus: 504,
      isOperational: true,
      details: { timeoutMs: ms },
    });
  }
}

/**
 * Reject with {@link TimeoutError} if `fn` does not settle within `ms`. The
 * timer is always cleared once the operation settles, so no dangling timers or
 * unhandled rejections leak.
 */
export function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    fn().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
