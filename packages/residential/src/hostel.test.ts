import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  assignHostelWarden,
  decommissionHostel,
  isHostelActive,
  registerHostel,
  renameHostel,
  returnHostelFromMaintenance,
  sendHostelToMaintenance,
  unassignHostelWarden,
} from "./hostel";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const make = () =>
  registerHostel({ tenantId, organizationId, code: " H1 ", name: " North Wing ", type: "boys" });

describe("registerHostel", () => {
  it("registers an active hostel with trimmed code/name and no warden", () => {
    const hostel = make();
    expect(hostel.code).toBe("H1");
    expect(hostel.name).toBe("North Wing");
    expect(hostel.type).toBe("boys");
    expect(hostel.wardenId).toBeNull();
    expect(hostel.status).toBe("active");
    expect(isHostelActive(hostel)).toBe(true);
  });

  it("rejects an empty code or name", () => {
    expect(() =>
      registerHostel({ tenantId, organizationId, code: "  ", name: "x", type: "boys" }),
    ).toThrow();
    expect(() =>
      registerHostel({ tenantId, organizationId, code: "H", name: "  ", type: "boys" }),
    ).toThrow();
  });
});

describe("hostel warden assignment", () => {
  it("assigns and clears a warden", () => {
    const wardenId = "33333333-3333-3333-3333-333333333333" as Uuid;
    const assigned = assignHostelWarden(make(), wardenId);
    expect(assigned.wardenId).toBe(wardenId);
    expect(unassignHostelWarden(assigned).wardenId).toBeNull();
  });
});

describe("hostel lifecycle", () => {
  it("moves active ↔ under_maintenance and → decommissioned", () => {
    const inMaint = sendHostelToMaintenance(make());
    expect(inMaint.status).toBe("under_maintenance");
    expect(isHostelActive(inMaint)).toBe(false);
    const back = returnHostelFromMaintenance(inMaint);
    expect(back.status).toBe("active");
    expect(decommissionHostel(back).status).toBe("decommissioned");
  });

  it("rejects invalid transitions", () => {
    expect(() => returnHostelFromMaintenance(make())).toThrow();
    const decommissioned = decommissionHostel(make());
    expect(() => sendHostelToMaintenance(decommissioned)).toThrow();
    expect(() => decommissionHostel(decommissioned)).toThrow();
  });

  it("rejects renaming to blank", () => {
    expect(() => renameHostel(make(), "   ")).toThrow();
  });
});
