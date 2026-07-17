import { describe, expect, it } from "vitest";
import { SystemClock } from "./clock";
import { UuidIdService } from "./id-service";

describe("SystemClock", () => {
  it("returns iso, milliseconds and a Date", () => {
    const clock = new SystemClock();
    expect(clock.now()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof clock.nowMs()).toBe("number");
    expect(clock.date()).toBeInstanceOf(Date);
  });
});

describe("UuidIdService", () => {
  it("generates unique ids and correlation ids", () => {
    const ids = new UuidIdService();
    expect(ids.newId()).not.toBe(ids.newId());
    expect(ids.newId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids.newCorrelationId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
