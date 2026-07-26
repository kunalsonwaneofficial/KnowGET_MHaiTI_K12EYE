import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  inspectionComplianceAsOf,
  recordHostelInspection,
  reinspectHostel,
} from "./hostel-inspection";

const base = {
  tenantId: "11111111-1111-1111-1111-111111111111" as TenantId,
  organizationId: "22222222-2222-2222-2222-222222222222" as Uuid,
  hostelId: "33333333-3333-3333-3333-333333333333" as Uuid,
  type: "fire_safety" as const,
  conductedOn: "2026-01-01",
  outcome: "compliant" as const,
  nextDueOn: "2026-12-31",
};

describe("recordHostelInspection", () => {
  it("records an inspection with trimmed inspector", () => {
    const inspection = recordHostelInspection({ ...base, inspector: "  Fire Dept  " });
    expect(inspection.inspector).toBe("Fire Dept");
    expect(inspection.outcome).toBe("compliant");
  });

  it("rejects an invalid date window (next-due before conducted)", () => {
    expect(() => recordHostelInspection({ ...base, nextDueOn: "2025-01-01" })).toThrow(
      /cannot be before/,
    );
    expect(() => recordHostelInspection({ ...base, conductedOn: "bad" })).toThrow(/valid date/);
  });
});

describe("reinspectHostel", () => {
  it("records a fresh inspection in place", () => {
    const first = recordHostelInspection(base);
    const again = reinspectHostel(
      first,
      "2027-01-01",
      "action_required",
      "2027-12-31",
      "Inspector B",
    );
    expect(again.id).toBe(first.id);
    expect(again.conductedOn).toBe("2027-01-01");
    expect(again.outcome).toBe("action_required");
    expect(again.inspector).toBe("Inspector B");
  });
});

describe("inspectionComplianceAsOf", () => {
  it("derives valid / due_soon / overdue from the next-due date", () => {
    const inspection = recordHostelInspection(base); // next due 2026-12-31
    expect(inspectionComplianceAsOf(inspection, "2026-06-01").status).toBe("valid");
    expect(inspectionComplianceAsOf(inspection, "2026-12-15").status).toBe("due_soon"); // within 30d
    expect(inspectionComplianceAsOf(inspection, "2026-12-31").status).toBe("due_soon"); // due day inclusive
    const overdue = inspectionComplianceAsOf(inspection, "2027-02-01");
    expect(overdue.status).toBe("overdue");
    expect(overdue.daysToDue).toBeLessThan(0);
  });
});
