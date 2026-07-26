import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  cancelRollCall,
  completeRollCall,
  recordRollCallMark,
  rollCallSummary,
  scheduleRollCall,
  startRollCall,
} from "./roll-call-session";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const hostelId = "33333333-3333-3333-3333-333333333333" as Uuid;
const r1 = "aaaaaaaa-0000-0000-0000-000000000001" as Uuid;
const r2 = "aaaaaaaa-0000-0000-0000-000000000002" as Uuid;
const r3 = "aaaaaaaa-0000-0000-0000-000000000003" as Uuid;

const schedule = (roster: Uuid[] = [r1, r2, r3]) =>
  scheduleRollCall({
    tenantId,
    organizationId,
    hostelId,
    scheduledFor: "2026-07-01T21:00:00Z",
    expectedResidentIds: roster,
  });

describe("roll call lifecycle", () => {
  it("schedules, starts, marks residents and completes with a reconciled summary", () => {
    let rc = startRollCall(schedule());
    rc = recordRollCallMark(rc, { residentId: r1, mark: "present", notedAt: "t" });
    rc = recordRollCallMark(rc, { residentId: r2, mark: "on_leave", notedAt: "t" });
    rc = recordRollCallMark(rc, { residentId: r3, mark: "absent", notedAt: "t" });
    const summary = rollCallSummary(rc);
    expect(summary.presentCount).toBe(1);
    expect(summary.onLeaveCount).toBe(1);
    expect(summary.absentCount).toBe(1);
    expect(summary.unaccountedForCount).toBe(1); // the absent one
    expect(summary.allAccountedFor).toBe(false);
    expect(completeRollCall(rc).status).toBe("completed");
  });

  it("counts unmarked roster members as unaccounted for", () => {
    const rc = recordRollCallMark(startRollCall(schedule()), {
      residentId: r1,
      mark: "present",
      notedAt: "t",
    });
    // r2 and r3 never marked
    expect(rollCallSummary(rc).unaccountedForCount).toBe(2);
  });
});

describe("roll call guards", () => {
  it("rejects marking before start, off-roster residents, and duplicate marks", () => {
    expect(() =>
      recordRollCallMark(schedule(), { residentId: r1, mark: "present", notedAt: "t" }),
    ).toThrow(/not in progress/);
    const rc = startRollCall(schedule([r1]));
    expect(() => recordRollCallMark(rc, { residentId: r2, mark: "present", notedAt: "t" })).toThrow(
      /not on the roster/,
    );
    const marked = recordRollCallMark(rc, { residentId: r1, mark: "present", notedAt: "t" });
    expect(() =>
      recordRollCallMark(marked, { residentId: r1, mark: "late", notedAt: "t" }),
    ).toThrow(/already been marked/);
  });

  it("cancels from scheduled or in progress", () => {
    expect(cancelRollCall(schedule()).status).toBe("cancelled");
    expect(cancelRollCall(startRollCall(schedule())).status).toBe("cancelled");
  });
});
