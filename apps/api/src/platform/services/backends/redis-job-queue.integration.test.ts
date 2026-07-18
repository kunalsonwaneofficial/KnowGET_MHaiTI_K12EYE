import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RedisJobQueue } from "./redis-job-queue";

const url = process.env.REDIS_URL;

describe.skipIf(!url)("RedisJobQueue (integration)", () => {
  let redis: Redis;
  const ns = `jtest:${process.pid}`;

  beforeAll(() => {
    redis = new Redis(url as string);
  });

  afterAll(async () => {
    const keys = await redis.keys(`${ns}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.quit();
  });

  it("enqueues, claims and runs a job — shared across instances", async () => {
    const producer = new RedisJobQueue(redis, { namespace: `${ns}:a` });
    const worker = new RedisJobQueue(redis, { namespace: `${ns}:a` }); // another replica
    const seen: string[] = [];
    worker.register<string>("greet", (p) => {
      seen.push(p);
    });

    await producer.enqueue("greet", "hi");
    expect(await worker.pending()).toBe(1); // shared queue across instances

    const summary = await worker.process();
    expect(summary).toMatchObject({ processed: 1, succeeded: 1 });
    expect(seen).toEqual(["hi"]);
    expect(await worker.pending()).toBe(0);
  });

  it("retries then dead-letters a failing job", async () => {
    const queue = new RedisJobQueue(redis, { namespace: `${ns}:dl`, backoff: () => 0 });
    queue.register("boom", () => {
      throw new Error("fail");
    });

    await queue.enqueue("boom", {}, { maxAttempts: 2 });
    expect((await queue.process()).retried).toBe(1); // 1st attempt fails → re-scheduled
    expect((await queue.process()).deadLettered).toBe(1); // 2nd exhausts attempts
    expect(await queue.deadLetter()).toHaveLength(1);
  });

  it("does not process a delayed job early", async () => {
    const queue = new RedisJobQueue(redis, { namespace: `${ns}:delay` });
    await queue.enqueue("later", {}, { delayMs: 60_000 });

    expect((await queue.process()).processed).toBe(0);
    expect(await queue.pending()).toBe(1);
  });

  it("re-queues a job abandoned by a crashed worker (visibility timeout)", async () => {
    const queue = new RedisJobQueue(redis, { namespace: `${ns}:vis`, visibilityTimeoutMs: 50 });
    const seen: string[] = [];
    queue.register<string>("recover", (p) => {
      seen.push(p);
    });

    const job = await queue.enqueue("recover", "after-crash");
    // Simulate a worker that claimed the job then crashed: move it out of ready into
    // the in-flight set with an already-past visibility deadline, and never complete it.
    await redis.zrem(`${ns}:vis:ready`, job.id);
    await redis.zadd(`${ns}:vis:inflight`, 0, job.id);
    expect(await queue.pending()).toBe(1); // still owed (in-flight), not lost

    // The next process() reaps the abandoned claim back to ready and runs it.
    expect(await queue.process()).toMatchObject({ processed: 1, succeeded: 1 });
    expect(seen).toEqual(["after-crash"]);
    expect(await queue.pending()).toBe(0);
  });
});
