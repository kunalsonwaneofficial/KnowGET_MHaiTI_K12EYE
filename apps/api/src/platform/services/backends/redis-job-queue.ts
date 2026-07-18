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
// sorted set and remove them in one step, so no two replicas run the same job.
const CLAIM_SCRIPT = `
local ids = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if #ids > 0 then redis.call('ZREM', KEYS[1], unpack(ids)) end
return ids
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
}

/**
 * Redis-backed pull-based job queue (TD-19). Jobs live in a shared sorted set
 * scored by `availableAt`; `process()` **atomically claims** the due jobs (a Lua
 * `ZRANGEBYSCORE`+`ZREM`) so concurrent replicas never double-run one, executes
 * each with the local handler, retries with backoff up to `maxAttempts`, then
 * dead-letters. Handlers are process-local (every replica registers its own); the
 * queue itself is shared. A claimed job whose replica crashes mid-run is not yet
 * re-queued (no visibility timeout) — a noted future refinement.
 */
export class RedisJobQueue implements JobQueue {
  private readonly handlers = new Map<string, JobHandler<never>>();
  private readonly ns: string;
  private readonly backoff: BackoffStrategy;
  private readonly defaultMaxAttempts: number;
  private readonly clock: () => number;

  constructor(
    private readonly redis: Redis,
    options: RedisJobQueueOptions = {},
  ) {
    this.ns = options.namespace ?? "jobs";
    this.backoff = options.backoff ?? exponentialBackoff();
    this.defaultMaxAttempts = options.defaultMaxAttempts ?? 3;
    this.clock = options.clock ?? Date.now;
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
    const ids = (await this.redis.eval(CLAIM_SCRIPT, 1, this.ready(), now)) as string[];
    let succeeded = 0;
    let retried = 0;
    let deadLettered = 0;

    for (const id of ids) {
      const job = await this.load(id);
      if (!job) {
        continue;
      }
      job.attempts += 1;
      const handler = this.handlers.get(job.type);
      try {
        if (!handler) {
          throw new Error(`No handler registered for job type "${job.type}"`);
        }
        await handler(job.payload as never, this.toJob(job) as Job<never>);
        await this.redis.del(this.jobKey(id));
        succeeded += 1;
      } catch {
        if (job.attempts >= job.maxAttempts) {
          await this.redis.rpush(this.dead(), JSON.stringify(this.toJob(job)));
          await this.redis.del(this.jobKey(id));
          deadLettered += 1;
        } else {
          job.availableAt = now + this.backoff(job.attempts);
          await this.save(job);
          await this.redis.zadd(this.ready(), job.availableAt, id);
          retried += 1;
        }
      }
    }
    return { processed: ids.length, succeeded, retried, deadLettered };
  }

  async pending(): Promise<number> {
    return this.redis.zcard(this.ready());
  }

  async deadLetter(): Promise<readonly Job[]> {
    const raw = await this.redis.lrange(this.dead(), 0, -1);
    return raw.map((entry) => JSON.parse(entry) as Job);
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

  private dead(): string {
    return `${this.ns}:dead`;
  }

  private jobKey(id: string): string {
    return `${this.ns}:job:${id}`;
  }
}
