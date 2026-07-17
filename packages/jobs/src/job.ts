/** A unit of deferred work held by the queue. */
export interface Job<T = unknown> {
  readonly id: string;
  readonly type: string;
  readonly payload: T;
  /** Number of times execution has been attempted. */
  readonly attempts: number;
  /** Maximum attempts before the job is dead-lettered. */
  readonly maxAttempts: number;
  /** Epoch ms at or after which the job becomes eligible to run. */
  readonly availableAt: number;
}

/** Executes a job's work. Throwing (or rejecting) marks the attempt failed. */
export type JobHandler<T = unknown> = (payload: T, job: Job<T>) => Promise<void> | void;

/** Backoff strategy: given the number of prior attempts, return the delay (ms). */
export type BackoffStrategy = (attempt: number) => number;

/** Exponential backoff with a cap: `min(baseMs * 2^attempt, maxMs)`. */
export const exponentialBackoff =
  (baseMs = 1000, maxMs = 60_000): BackoffStrategy =>
  (attempt) =>
    Math.min(baseMs * 2 ** attempt, maxMs);

export interface EnqueueOptions {
  readonly maxAttempts?: number;
  /** Delay (ms) before the job first becomes available. */
  readonly delayMs?: number;
}

/** Outcome summary of a single `process()` pass. */
export interface ProcessSummary {
  readonly processed: number;
  readonly succeeded: number;
  readonly retried: number;
  readonly deadLettered: number;
}
