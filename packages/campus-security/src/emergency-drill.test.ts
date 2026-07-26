import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  cancelDrill,
  completeDrill,
  recordDrillMuster,
  scheduleDrill,
  setDrillExpected,
  startDrill,
} from "./emergency-drill";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const make = (expectedCount = 30) =>
  scheduleDrill({
    tenantId,
    organizationId,
    code: "DRILL-1",
    type: "fire",
    scheduledFor: "2026-07-01T09:00:00.000Z",
    expectedCount,
  });

describe("EmergencyDrill aggregate", () => {
  it("schedules with a trimmed code and validates the expected roster", () => {
    const d = scheduleDrill({
      tenantId,
      organizationId,
      code: "  DRILL-1 ",
      type: "fire",
      scheduledFor: "2026-07-01T09:00:00.000Z",
      expectedCount: 30,
    });
    expect(d.code).toBe("DRILL-1");
    expect(d.status).toBe("scheduled");
    expect(d.expectedCount).toBe(30);
    expect(d.accountedCount).toBe(0);
    expect(() =>
      scheduleDrill({ tenantId, organizationId, code: " ", type: "fire", scheduledFor: "t" }),
    ).toThrow(/code/);
    expect(() =>
      scheduleDrill({
        tenantId,
        organizationId,
        code: "D",
        type: "fire",
        scheduledFor: "t",
        expectedCount: -1,
      }),
    ).toThrow(/non-negative/);
  });

  it("runs scheduled → in_progress → completed, recording the muster only while in progress", () => {
    const d = make();
    expect(setDrillExpected(d, 40).expectedCount).toBe(40);
    const started = startDrill(d, "2026-07-01T09:05:00.000Z");
    expect(started.status).toBe("in_progress");
    expect(started.startedAt).toBe("2026-07-01T09:05:00.000Z");
    const mustered = recordDrillMuster(started, 28);
    expect(mustered.accountedCount).toBe(28);
    const done = completeDrill(mustered, "2026-07-01T09:20:00.000Z");
    expect(done.status).toBe("completed");
    expect(done.completedAt).toBe("2026-07-01T09:20:00.000Z");
  });

  it("guards illegal transitions and terminal states", () => {
    const d = make();
    expect(() => recordDrillMuster(d, 10)).toThrow(/cannot move/); // scheduled, not in progress
    expect(() => completeDrill(d, "t")).toThrow(/cannot move/);
    const started = startDrill(d, "t");
    expect(() => setDrillExpected(started, 20)).toThrow(/cannot move/); // roster frozen once started
    expect(cancelDrill(started).status).toBe("cancelled");
    const cancelled = cancelDrill(d);
    expect(() => cancelDrill(cancelled)).toThrow(/cannot move/); // terminal
    expect(() => startDrill(cancelled, "t")).toThrow(/cannot move/);
  });
});
