import { describe, expect, it } from "vitest";
import { createEvent } from "./create-event";
import type { EventBus } from "./event-bus";
import { InMemoryEventBus } from "./in-memory-event-bus";
import { InMemoryOutbox, OutboxRelay } from "./outbox";

describe("InMemoryOutbox + OutboxRelay", () => {
  it("enqueues then relays events to the bus and marks them processed", async () => {
    const outbox = new InMemoryOutbox();
    const bus = new InMemoryEventBus();
    const received: string[] = [];
    bus.subscribe("thing.happened", (e) => {
      received.push(e.metadata.eventId);
    });

    const record = await outbox.enqueue(createEvent("thing.happened", { n: 1 }));
    expect(await outbox.pending()).toHaveLength(1);

    const summary = await new OutboxRelay(outbox, bus).relayOnce();
    expect(summary).toEqual({ published: 1, failed: 0 });
    expect(received).toEqual([record.event.metadata.eventId]);
    expect(await outbox.pending()).toHaveLength(0);
  });

  it("leaves a record pending (and counts the attempt) when publishing fails", async () => {
    const outbox = new InMemoryOutbox();
    const failingBus: EventBus = {
      publish: () => Promise.reject(new Error("bus down")),
      subscribe: () => ({ unsubscribe: () => undefined }),
    };
    await outbox.enqueue(createEvent("x", {}));

    const summary = await new OutboxRelay(outbox, failingBus).relayOnce();
    expect(summary).toEqual({ published: 0, failed: 1 });
    const pending = await outbox.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.attempts).toBe(1);
  });

  it("respects the batch size", async () => {
    const outbox = new InMemoryOutbox();
    const bus = new InMemoryEventBus();
    for (let i = 0; i < 5; i += 1) {
      await outbox.enqueue(createEvent("e", { i }));
    }
    const summary = await new OutboxRelay(outbox, bus).relayOnce(2);
    expect(summary.published).toBe(2);
    expect(await outbox.pending()).toHaveLength(3);
  });
});
