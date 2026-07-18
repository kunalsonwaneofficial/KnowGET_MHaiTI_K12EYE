import { describe, expect, it } from "vitest";
import { InMemoryJobQueueAdapter } from "./job-queue";

describe("InMemoryJobQueueAdapter", () => {
  it("enqueues and processes a job", async () => {
    const queue = new InMemoryJobQueueAdapter();
    const seen: string[] = [];
    queue.register<string>("greet", (payload) => {
      seen.push(payload);
    });

    await queue.enqueue("greet", "hello");
    expect(await queue.pending()).toBe(1);

    const summary = await queue.process();
    expect(summary).toMatchObject({ processed: 1, succeeded: 1 });
    expect(seen).toEqual(["hello"]);
    expect(await queue.pending()).toBe(0);
  });

  it("dead-letters a job after exhausting its attempts", async () => {
    const queue = new InMemoryJobQueueAdapter();
    queue.register("boom", () => {
      throw new Error("fail");
    });

    await queue.enqueue("boom", {}, { maxAttempts: 1 });
    const summary = await queue.process();

    expect(summary.deadLettered).toBe(1);
    expect(await queue.deadLetter()).toHaveLength(1);
  });
});
