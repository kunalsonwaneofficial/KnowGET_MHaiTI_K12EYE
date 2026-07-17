import { newUuid } from "@knowget/shared";
import {
  type BackoffStrategy,
  type EnqueueOptions,
  exponentialBackoff,
  type Job,
  type JobHandler,
  type ProcessSummary,
} from "./job";

export interface JobQueueOptions {
  readonly backoff?: BackoffStrategy;
  readonly defaultMaxAttempts?: number;
  readonly clock?: () => number;
}

interface MutableJob {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  availableAt: number;
}

/**
 * In-memory, pull-based job queue. Work is executed by an explicit
 * {@link process} pass (as a real worker would poll), which makes retry and
 * backoff behaviour deterministic and testable. Failed jobs are retried with
 * the configured backoff up to `maxAttempts`, then moved to the dead-letter
 * list. A distributed queue can replace it behind the same surface.
 */
export class InMemoryJobQueue {
  private readonly handlers = new Map<string, JobHandler<never>>();
  private readonly jobs: MutableJob[] = [];
  private readonly dead: Job[] = [];
  private readonly backoff: BackoffStrategy;
  private readonly defaultMaxAttempts: number;
  private readonly clock: () => number;

  constructor(options: JobQueueOptions = {}) {
    this.backoff = options.backoff ?? exponentialBackoff();
    this.defaultMaxAttempts = options.defaultMaxAttempts ?? 3;
    this.clock = options.clock ?? Date.now;
  }

  /** Register the handler that executes jobs of a given type. */
  register<T>(type: string, handler: JobHandler<T>): void {
    this.handlers.set(type, handler as JobHandler<never>);
  }

  enqueue<T>(type: string, payload: T, options: EnqueueOptions = {}): Job<T> {
    const job: MutableJob = {
      id: newUuid(),
      type,
      payload,
      attempts: 0,
      maxAttempts: options.maxAttempts ?? this.defaultMaxAttempts,
      availableAt: this.clock() + (options.delayMs ?? 0),
    };
    this.jobs.push(job);
    return { ...job, payload } as Job<T>;
  }

  /** Execute every job whose `availableAt` has arrived, once each. */
  async process(): Promise<ProcessSummary> {
    const now = this.clock();
    const due = this.jobs.filter((job) => job.availableAt <= now);
    let succeeded = 0;
    let retried = 0;
    let deadLettered = 0;

    for (const job of due) {
      const handler = this.handlers.get(job.type);
      job.attempts += 1;
      try {
        if (!handler) {
          throw new Error(`No handler registered for job type "${job.type}"`);
        }
        await handler(job.payload as never, this.snapshot(job) as Job<never>);
        this.remove(job.id);
        succeeded += 1;
      } catch {
        if (job.attempts >= job.maxAttempts) {
          this.remove(job.id);
          this.dead.push(this.snapshot(job));
          deadLettered += 1;
        } else {
          job.availableAt = now + this.backoff(job.attempts);
          retried += 1;
        }
      }
    }

    return { processed: due.length, succeeded, retried, deadLettered };
  }

  /** Jobs waiting to run (excludes dead-lettered). */
  get pending(): number {
    return this.jobs.length;
  }

  /** Jobs that exhausted their attempts. */
  get deadLetter(): readonly Job[] {
    return this.dead;
  }

  private snapshot(job: MutableJob): Job {
    return {
      id: job.id,
      type: job.type,
      payload: job.payload,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      availableAt: job.availableAt,
    };
  }

  private remove(id: string): void {
    const index = this.jobs.findIndex((job) => job.id === id);
    if (index >= 0) {
      this.jobs.splice(index, 1);
    }
  }
}
