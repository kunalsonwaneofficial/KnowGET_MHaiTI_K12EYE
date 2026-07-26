import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  assignMaintenanceOrder,
  cancelMaintenanceOrder,
  completeMaintenanceOrder,
  isMaintenanceOrderOpen,
  reassignMaintenanceOrder,
  reportMaintenanceOrder,
  setMaintenancePriority,
  startMaintenanceOrder,
} from "./maintenance-order";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const buildingId = "33333333-3333-3333-3333-333333333333" as Uuid;
const assigneeId = "66666666-6666-6666-6666-666666666666" as Uuid;
const assignee2 = "77777777-7777-7777-7777-777777777777" as Uuid;

const make = () =>
  reportMaintenanceOrder({
    tenantId,
    organizationId,
    buildingId,
    code: "WO-1",
    summary: "Leaking tap in the science lab",
    category: "repair",
    priority: "medium",
    reportedOn: "2026-07-01",
  });

describe("MaintenanceOrder aggregate", () => {
  it("reports an unassigned order with a trimmed code and summary", () => {
    const o = reportMaintenanceOrder({
      tenantId,
      organizationId,
      buildingId,
      code: "  WO-1 ",
      summary: "  Leaking tap  ",
      category: "repair",
      priority: "medium",
      reportedOn: "2026-07-01",
    });
    expect(o.code).toBe("WO-1");
    expect(o.summary).toBe("Leaking tap");
    expect(o.status).toBe("reported");
    expect(o.assigneeId).toBeNull();
    expect(o.spaceId).toBeNull();
    expect(o.systemId).toBeNull();
    expect(isMaintenanceOrderOpen(o)).toBe(true);
    expect(() =>
      reportMaintenanceOrder({
        tenantId,
        organizationId,
        buildingId,
        code: " ",
        summary: "x",
        category: "repair",
        priority: "low",
        reportedOn: "2026-07-01",
      }),
    ).toThrow(/code/);
    expect(() =>
      reportMaintenanceOrder({
        tenantId,
        organizationId,
        buildingId,
        code: "WO-2",
        summary: "  ",
        category: "repair",
        priority: "low",
        reportedOn: "2026-07-01",
      }),
    ).toThrow(/summary/);
  });

  it("runs reported → assigned → in_progress → completed with dates", () => {
    const o = make();
    const a = assignMaintenanceOrder(o, assigneeId, "2026-07-02");
    expect(a.status).toBe("assigned");
    expect(a.assigneeId).toBe(assigneeId);
    expect(a.assignedOn).toBe("2026-07-02");
    const r = reassignMaintenanceOrder(a, assignee2);
    expect(r.assigneeId).toBe(assignee2);
    expect(r.status).toBe("assigned");
    const started = startMaintenanceOrder(r);
    expect(started.status).toBe("in_progress");
    const done = completeMaintenanceOrder(started, "2026-07-05");
    expect(done.status).toBe("completed");
    expect(done.completedOn).toBe("2026-07-05");
    expect(isMaintenanceOrderOpen(done)).toBe(false);
  });

  it("reprioritizes an open order and guards illegal transitions", () => {
    const o = make();
    expect(setMaintenancePriority(o, "urgent").priority).toBe("urgent");
    expect(() => startMaintenanceOrder(o)).toThrow(/cannot move/); // reported, not assigned
    expect(() => completeMaintenanceOrder(o, "2026-07-05")).toThrow(/cannot move/);
    expect(() => reassignMaintenanceOrder(o, assignee2)).toThrow(/cannot move/); // not yet assigned
    const done = completeMaintenanceOrder(
      startMaintenanceOrder(assignMaintenanceOrder(o, assigneeId, "2026-07-02")),
      "2026-07-05",
    );
    expect(() => setMaintenancePriority(done, "low")).toThrow(/cannot move/); // terminal
    expect(() => cancelMaintenanceOrder(done)).toThrow(/cannot move/); // terminal
  });

  it("cancels an open order", () => {
    const c = cancelMaintenanceOrder(make());
    expect(c.status).toBe("cancelled");
    expect(isMaintenanceOrderOpen(c)).toBe(false);
  });
});
