import { describe, expect, it } from "vitest";
import { exponentialBackoff } from "./job";
import { InMemoryJobQueue } from "./job-queue";
import { Scheduler } from "./scheduler";

describe("InMemoryJobQueue", () => {
  it("processes a due job with its handler", async () => {
    const queue = new InMemoryJobQueue({ clock: () => 0 });
    const seen: string[] = [];
    queue.register<{ msg: string }>("greet", (p) => {
      seen.push(p.msg);
    });
    queue.enqueue("greet", { msg: "hi" });
    const summary = await queue.process();
    expect(summary).toEqual({ processed: 1, succeeded: 1, retried: 0, deadLettered: 0 });
    expect(seen).toEqual(["hi"]);
    expect(queue.pending).toBe(0);
  });

  it("does not run jobs before their delay elapses", async () => {
    let now = 0;
    const queue = new InMemoryJobQueue({ clock: () => now });
    queue.register("t", () => undefined);
    queue.enqueue("t", {}, { delayMs: 1000 });
    expect((await queue.process()).processed).toBe(0);
    now = 1000;
    expect((await queue.process()).succeeded).toBe(1);
  });

  it("retries with backoff, then dead-letters after maxAttempts", async () => {
    let now = 0;
    const queue = new InMemoryJobQueue({ clock: () => now, backoff: () => 100 });
    queue.register("boom", () => {
      throw new Error("fail");
    });
    queue.enqueue("boom", {}, { maxAttempts: 2 });

    let s = await queue.process();
    expect(s).toEqual({ processed: 1, succeeded: 0, retried: 1, deadLettered: 0 });
    expect(queue.pending).toBe(1);

    now = 100; // backoff elapsed
    s = await queue.process();
    expect(s.deadLettered).toBe(1);
    expect(queue.pending).toBe(0);
    expect(queue.deadLetter).toHaveLength(1);
    expect(queue.deadLetter[0]?.attempts).toBe(2);
  });

  it("dead-letters a job with no registered handler", async () => {
    const queue = new InMemoryJobQueue({ clock: () => 0 });
    queue.enqueue("unknown", {}, { maxAttempts: 1 });
    const s = await queue.process();
    expect(s.deadLettered).toBe(1);
  });

  it("exponentialBackoff grows and caps", () => {
    const backoff = exponentialBackoff(1000, 5000);
    expect(backoff(0)).toBe(1000);
    expect(backoff(1)).toBe(2000);
    expect(backoff(2)).toBe(4000);
    expect(backoff(10)).toBe(5000);
  });
});

describe("Scheduler", () => {
  it("runs a recurring task once per interval", async () => {
    let now = 0;
    const scheduler = new Scheduler(() => now);
    let runs = 0;
    scheduler.schedule("beat", 1000, () => {
      runs += 1;
    });
    expect(await scheduler.tick()).toBe(0); // not due yet
    now = 1000;
    await scheduler.tick();
    now = 2000;
    await scheduler.tick();
    expect(runs).toBe(2);
  });

  it("runs a one-shot task exactly once and removes it", async () => {
    let now = 0;
    const scheduler = new Scheduler(() => now);
    let runs = 0;
    scheduler.scheduleOnce("once", 500, () => {
      runs += 1;
    });
    now = 500;
    await scheduler.tick();
    now = 1000;
    await scheduler.tick();
    expect(runs).toBe(1);
    expect(scheduler.has("once")).toBe(false);
  });

  it("cancels a scheduled task", async () => {
    const scheduler = new Scheduler(() => 10_000);
    scheduler.schedule("x", 1000, () => undefined);
    expect(scheduler.cancel("x")).toBe(true);
    expect(await scheduler.tick()).toBe(0);
  });
});
