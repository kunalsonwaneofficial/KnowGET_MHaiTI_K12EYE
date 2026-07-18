import {
  type EnqueueOptions,
  InMemoryJobQueue,
  type Job,
  type JobHandler,
  type ProcessSummary,
} from "@knowget/jobs";

/**
 * Async, backend-agnostic job queue. The in-memory adapter wraps the frozen
 * pull-based `InMemoryJobQueue` (per-instance); the Redis adapter makes the queue
 * **shared across replicas** (TD-19). Async because the frozen queue's `enqueue` /
 * `pending` are synchronous and a distributed backend cannot be.
 */
export interface JobQueue {
  register<T>(type: string, handler: JobHandler<T>): void;
  enqueue<T>(type: string, payload: T, options?: EnqueueOptions): Promise<Job<T>>;
  process(): Promise<ProcessSummary>;
  pending(): Promise<number>;
  deadLetter(): Promise<readonly Job[]>;
}

/** In-memory {@link JobQueue} — wraps the frozen `InMemoryJobQueue` behind the async port. */
export class InMemoryJobQueueAdapter implements JobQueue {
  constructor(private readonly queue: InMemoryJobQueue = new InMemoryJobQueue()) {}

  register<T>(type: string, handler: JobHandler<T>): void {
    this.queue.register(type, handler);
  }

  async enqueue<T>(type: string, payload: T, options?: EnqueueOptions): Promise<Job<T>> {
    return this.queue.enqueue(type, payload, options);
  }

  async process(): Promise<ProcessSummary> {
    return this.queue.process();
  }

  async pending(): Promise<number> {
    return this.queue.pending;
  }

  async deadLetter(): Promise<readonly Job[]> {
    return this.queue.deadLetter;
  }
}
