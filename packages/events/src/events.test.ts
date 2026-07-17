import { createLogger, type LogRecord } from "@knowget/logging";
import { describe, expect, it, vi } from "vitest";
import { createEvent } from "./create-event";
import { InMemoryEventBus } from "./in-memory-event-bus";

type StudentEnrolled = ReturnType<typeof enrolled>;
const enrolled = (studentId: string) => createEvent("student.enrolled", { studentId });

describe("createEvent", () => {
  it("fills default metadata", () => {
    const event = enrolled("s1");
    expect(event.type).toBe("student.enrolled");
    expect(event.payload).toEqual({ studentId: "s1" });
    expect(event.metadata.version).toBe(1);
    expect(event.metadata.eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(event.metadata.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("InMemoryEventBus", () => {
  it("delivers events to all subscribers of a type", async () => {
    const bus = new InMemoryEventBus();
    const seen: string[] = [];
    bus.subscribe<StudentEnrolled>("student.enrolled", (e) => {
      seen.push(`a:${e.payload.studentId}`);
    });
    bus.subscribe<StudentEnrolled>("student.enrolled", (e) => {
      seen.push(`b:${e.payload.studentId}`);
    });
    await bus.publish(enrolled("s1"));
    expect(seen.sort()).toEqual(["a:s1", "b:s1"]);
  });

  it("stops delivery after unsubscribe", async () => {
    const bus = new InMemoryEventBus();
    const handler = vi.fn();
    const sub = bus.subscribe("student.enrolled", handler);
    sub.unsubscribe();
    await bus.publish(enrolled("s2"));
    expect(handler).not.toHaveBeenCalled();
    expect(bus.handlerCount("student.enrolled")).toBe(0);
  });

  it("isolates handler errors and reports them", async () => {
    const records: LogRecord[] = [];
    const bus = new InMemoryEventBus(
      createLogger({ level: "error", sink: (r) => records.push(r) }),
    );
    const good = vi.fn();
    bus.subscribe("student.enrolled", () => {
      throw new Error("boom");
    });
    bus.subscribe("student.enrolled", good);
    await bus.publish(enrolled("s3"));
    expect(good).toHaveBeenCalledOnce();
    expect(records[0]?.message).toBe("Event handler failed");
  });

  it("is a no-op when there are no subscribers", async () => {
    const bus = new InMemoryEventBus();
    await expect(bus.publish(enrolled("s4"))).resolves.toBeUndefined();
  });
});
