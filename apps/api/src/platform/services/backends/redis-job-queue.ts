import {
  type BackoffStrategy,
  type EnqueueOptions,
  exponentialBackoff,
  type Job,
  type JobHandler,
  type ProcessSummary,
} from "@knowget/jobs";
import { newUuid } from "@knowget/shared";
import type Redis from "ioredis";
import type { JobQueue } from "./job-queue";

// Atomically claim every job due at or before ARGV[1]: read the ids from the ready
// sorted set, remove them, and move them to the in-flight set with a visibility
// deadline (ARGV[2]) — so no two replicas run the same job, and a worker that dies
// mid-run leaves the job in-flight to be reaped rather than losing it.
const CLAIM_SCRIPT = `
local ids = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if #ids > 0 then
  redis.call('ZREM', KEYS[1], unpack(ids))
  for i = 1, #ids do redis.call('ZADD', KEYS[2], ARGV[2], ids[i]) end
end
return ids
`;

// Atomically re-queue in-flight jobs whose visibility deadline has passed (ARGV[1]):
// a crashed worker's claim is moved back from the in-flight set to the ready set so
// another worker retries it. Returns how many were recovered.
const REAP_SCRIPT = `
local expired = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if #expired > 0 then
  redis.call('ZREM', KEYS[1], unpack(expired))
  for i = 1, #expired do redis.call('ZADD', KEYS[2], ARGV[1], expired[i]) end
end
return #expired
`;

interface StoredJob {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  availableAt: number;
}

export interface RedisJobQueueOptions {
  readonly namespace?: string;
  readonly backoff?: BackoffStrategy;
  readonly defaultMaxAttempts?: number;
  readonly clock?: () => number;
  /**
   * How long a claimed job may run before it is considered abandoned and re-queued
   * (the visibility timeout). A worker that crashes mid-run leaves the job in-flight;
   * once this elapses, the next `process()` reaps it back to ready. Default 30s.
   */
  readonly visibilityTimeoutMs?: number;
}

/**
 * Redis-backed pull-based job queue (TD-19). Jobs live in a shared sorted set
 * scored by `availableAt`; `process()` **atomically claims** the due jobs (a Lua
 * `ZRANGEBYSCORE`+`ZREM`) into an **in-flight set** scored by a visibility deadline,
 * so concurrent replicas never double-run one and a worker that crashes mid-run does
 * not lose the job. Each claimed job runs with the local handler, then retries with
 * backoff up to `maxAttempts` and dead-letters. Before claiming, `process()` **reaps**
 * in-flight jobs whose visibility deadline has passed, re-queuing them — so a crashed
 * worker's job is retried (at-least-once). Handlers are process-local (every replica
 * registers its own); the queue itself is shared.
 */
export class RedisJobQueue implements JobQueue {
  private readonly handlers = new Map<string, JobHandler<never>>();
  private readonly ns: string;
  private readonly backoff: BackoffStrategy;
  private readonly defaultMaxAttempts: number;
  private readonly clock: () => number;
  private readonly visibilityTimeoutMs: number;

  constructor(
    private readonly redis: Redis,
    options: RedisJobQueueOptions = {},
  ) {
    this.ns = options.namespace ?? "jobs";
    this.backoff = options.backoff ?? exponentialBackoff();
    this.defaultMaxAttempts = options.defaultMaxAttempts ?? 3;
    this.clock = options.clock ?? Date.now;
    this.visibilityTimeoutMs = options.visibilityTimeoutMs ?? 30_000;
  }

  register<T>(type: string, handler: JobHandler<T>): void {
    this.handlers.set(type, handler as JobHandler<never>);
  }

  async enqueue<T>(type: string, payload: T, options: EnqueueOptions = {}): Promise<Job<T>> {
    const job: StoredJob = {
      id: newUuid(),
      type,
      payload,
      attempts: 0,
      maxAttempts: options.maxAttempts ?? this.defaultMaxAttempts,
      availableAt: this.clock() + (options.delayMs ?? 0),
    };
    await this.save(job);
    await this.redis.zadd(this.ready(), job.availableAt, job.id);
    return { ...job, payload } as Job<T>;
  }

  async process(): Promise<ProcessSummary> {
    const now = this.clock();
    // Recover jobs abandoned by crashed workers before claiming new ones.
    await this.redis.eval(REAP_SCRIPT, 2, this.inflight(), this.ready(), now);
    const ids = (await this.redis.eval(
      CLAIM_SCRIPT,
      2,
      this.ready(),
      this.inflight(),
      now,
      now + this.visibilityTimeoutMs,
    )) as string[];
    let succeeded = 0;
    let retried = 0;
    let deadLettered = 0;

    for (const id of ids) {
      const job = await this.load(id);
      if (!job) {
        await this.redis.zrem(this.inflight(), id); // orphaned claim; drop it
        continue;
      }
      job.attempts += 1;
      const handler = this.handlers.get(job.type);
      try {
        if (!handler) {
          throw new Error(`No handler registered for job type "${job.type}"`);
        }
        await handler(job.payload as never, this.toJob(job) as Job<never>);
        await this.complete(id);
        succeeded += 1;
      } catch {
        if (job.attempts >= job.maxAttempts) {
          await this.redis.rpush(this.dead(), JSON.stringify(this.toJob(job)));
          await this.complete(id);
          deadLettered += 1;
        } else {
          job.availableAt = now + this.backoff(job.attempts);
          await this.save(job);
          await this.redis.zrem(this.inflight(), id);
          await this.redis.zadd(this.ready(), job.availableAt, id);
          retried += 1;
        }
      }
    }
    return { processed: ids.length, succeeded, retried, deadLettered };
  }

  /** Jobs not yet completed: waiting to run (ready) plus claimed-and-running (in-flight). */
  async pending(): Promise<number> {
    const [ready, inflight] = await Promise.all([
      this.redis.zcard(this.ready()),
      this.redis.zcard(this.inflight()),
    ]);
    return ready + inflight;
  }

  async deadLetter(): Promise<readonly Job[]> {
    const raw = await this.redis.lrange(this.dead(), 0, -1);
    return raw.map((entry) => JSON.parse(entry) as Job);
  }

  /** Remove a finished job from the in-flight set and delete its stored payload. */
  private async complete(id: string): Promise<void> {
    await this.redis.zrem(this.inflight(), id);
    await this.redis.del(this.jobKey(id));
  }

  private async save(job: StoredJob): Promise<void> {
    await this.redis.set(this.jobKey(job.id), JSON.stringify(job));
  }

  private async load(id: string): Promise<StoredJob | null> {
    const raw = await this.redis.get(this.jobKey(id));
    return raw ? (JSON.parse(raw) as StoredJob) : null;
  }

  private toJob(job: StoredJob): Job {
    return {
      id: job.id,
      type: job.type,
      payload: job.payload,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      availableAt: job.availableAt,
    };
  }

  private ready(): string {
    return `${this.ns}:ready`;
  }

  private inflight(): string {
    return `${this.ns}:inflight`;
  }

  private dead(): string {
    return `${this.ns}:dead`;
  }

  private jobKey(id: string): string {
    return `${this.ns}:job:${id}`;
  }
}
