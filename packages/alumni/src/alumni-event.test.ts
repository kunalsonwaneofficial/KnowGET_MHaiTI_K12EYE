import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  cancelEvent,
  closeEvent,
  completeEvent,
  createAlumniEvent,
  isEventOpen,
  openEvent,
  scheduleEvent,
  setEventCapacity,
} from "./alumni-event";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const make = (capacity = 100) =>
  createAlumniEvent({
    tenantId,
    organizationId,
    code: "R25",
    name: "Reunion 2025",
    type: "reunion",
    capacity,
  });

describe("AlumniEvent", () => {
  it("runs draft → scheduled → open → closed → completed", () => {
    let e = make();
    expect(e.status).toBe("draft");
    e = scheduleEvent(e);
    e = openEvent(e);
    expect(isEventOpen(e)).toBe(true);
    e = closeEvent(e);
    expect(isEventOpen(e)).toBe(false);
    e = completeEvent(e);
    expect(e.status).toBe("completed");
  });

  it("cancels from a pre-completed state and cannot re-cancel", () => {
    const cancelled = cancelEvent(scheduleEvent(make()));
    expect(cancelled.status).toBe("cancelled");
    expect(() => cancelEvent(cancelled)).toThrow(/cannot move/);
  });

  it("validates capacity and freezes config once closed", () => {
    expect(() => make(-1)).toThrow(/non-negative integer/);
    const closed = closeEvent(openEvent(scheduleEvent(make())));
    expect(() => setEventCapacity(closed, 50)).toThrow(/cannot move/);
  });
});
