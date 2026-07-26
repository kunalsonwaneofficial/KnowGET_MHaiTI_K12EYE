import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  assignIncident,
  cancelIncident,
  closeIncident,
  isIncidentOpen,
  reportIncident,
  resolveIncident,
  setIncidentSeverity,
  startIncidentInvestigation,
  triageIncident,
} from "./security-incident";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const assigneeId = "66666666-6666-6666-6666-666666666666" as Uuid;

const make = () =>
  reportIncident({
    tenantId,
    organizationId,
    code: "INC-1",
    category: "trespass",
    severity: "medium",
    summary: "Unknown person at the rear gate",
    reportedOn: "2026-07-01",
  });

describe("SecurityIncident aggregate", () => {
  it("reports an open, unassigned incident with a trimmed code and summary", () => {
    const i = reportIncident({
      tenantId,
      organizationId,
      code: "  INC-1 ",
      category: "trespass",
      severity: "medium",
      summary: "  Unknown person  ",
      reportedOn: "2026-07-01",
    });
    expect(i.code).toBe("INC-1");
    expect(i.summary).toBe("Unknown person");
    expect(i.status).toBe("reported");
    expect(i.assigneeId).toBeNull();
    expect(isIncidentOpen(i)).toBe(true);
    expect(() =>
      reportIncident({
        tenantId,
        organizationId,
        code: " ",
        category: "theft",
        severity: "low",
        summary: "x",
        reportedOn: "d",
      }),
    ).toThrow(/code/);
    expect(() =>
      reportIncident({
        tenantId,
        organizationId,
        code: "INC-2",
        category: "theft",
        severity: "low",
        summary: "  ",
        reportedOn: "d",
      }),
    ).toThrow(/summary/);
  });

  it("runs reported → triaged → investigating → resolved → closed, requiring an assignee to investigate", () => {
    const i = make();
    const t = triageIncident(i);
    expect(t.status).toBe("triaged");
    expect(() => startIncidentInvestigation(t)).toThrow(/must be assigned/); // no assignee yet
    const assigned = assignIncident(t, assigneeId);
    expect(assigned.assigneeId).toBe(assigneeId);
    const investigating = startIncidentInvestigation(assigned);
    expect(investigating.status).toBe("investigating");
    const resolved = resolveIncident(investigating, "2026-07-03");
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedOn).toBe("2026-07-03");
    const closed = closeIncident(resolved);
    expect(closed.status).toBe("closed");
    expect(isIncidentOpen(closed)).toBe(false);
  });

  it("edits severity and cancels while open; guards illegal moves and terminal states", () => {
    const i = make();
    expect(setIncidentSeverity(i, "critical").severity).toBe("critical");
    expect(() => triageIncident(triageIncident(i))).toThrow(/cannot move/); // not reported anymore
    expect(() => resolveIncident(i, "d")).toThrow(/cannot move/); // reported, not investigating
    const cancelled = cancelIncident(i);
    expect(cancelled.status).toBe("cancelled");
    expect(() => cancelIncident(cancelled)).toThrow(/cannot move/); // terminal
    expect(() => setIncidentSeverity(cancelled, "low")).toThrow(/cannot move/);
  });
});
