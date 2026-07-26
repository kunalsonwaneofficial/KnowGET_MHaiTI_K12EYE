import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  decommissionCentre,
  isHealthCentreActive,
  registerHealthCentre,
  renameHealthCentre,
  returnCentreFromMaintenance,
  sendCentreToMaintenance,
  setSickBayCapacity,
} from "./health-centre";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const make = (capacity = 8) =>
  registerHealthCentre({
    tenantId,
    organizationId,
    code: "HC-1",
    name: "Main Infirmary",
    type: "infirmary",
    sickBayCapacity: capacity,
  });

describe("HealthCentre aggregate", () => {
  it("registers active with a trimmed code/name and the given capacity", () => {
    const c = registerHealthCentre({
      tenantId,
      organizationId,
      code: "  HC-1  ",
      name: "  Main Infirmary ",
      type: "infirmary",
      sickBayCapacity: 8,
    });
    expect(c.code).toBe("HC-1");
    expect(c.name).toBe("Main Infirmary");
    expect(c.sickBayCapacity).toBe(8);
    expect(c.leadClinicianId).toBeNull();
    expect(isHealthCentreActive(c)).toBe(true);
  });

  it("defaults capacity to zero and rejects a negative or non-integer capacity", () => {
    const noCapacity = registerHealthCentre({
      tenantId,
      organizationId,
      code: "HC-0",
      name: "Clinic",
      type: "clinic",
    });
    expect(noCapacity.sickBayCapacity).toBe(0);
    expect(() => make(-1)).toThrow(/non-negative/);
    expect(() => make(2.5)).toThrow(/non-negative/);
    expect(() => setSickBayCapacity(make(), -3)).toThrow(/non-negative/);
  });

  it("rejects an empty code or name", () => {
    expect(() =>
      registerHealthCentre({ tenantId, organizationId, code: " ", name: "X", type: "clinic" }),
    ).toThrow(/code/);
    expect(() =>
      registerHealthCentre({ tenantId, organizationId, code: "HC", name: " ", type: "clinic" }),
    ).toThrow(/name/);
  });

  it("renames and re-capacities", () => {
    expect(renameHealthCentre(make(), "Annexe").name).toBe("Annexe");
    expect(setSickBayCapacity(make(), 12).sickBayCapacity).toBe(12);
  });

  it("runs active ↔ under_maintenance → decommissioned and guards illegal moves", () => {
    const c = make();
    const m = sendCentreToMaintenance(c);
    expect(m.status).toBe("under_maintenance");
    expect(isHealthCentreActive(m)).toBe(false);
    expect(returnCentreFromMaintenance(m).status).toBe("active");
    expect(() => sendCentreToMaintenance(m)).toThrow(/cannot move/); // already in maintenance
    const d = decommissionCentre(c);
    expect(d.status).toBe("decommissioned");
    expect(() => decommissionCentre(d)).toThrow(/cannot move/);
    expect(() => returnCentreFromMaintenance(c)).toThrow(/cannot move/); // active, not in maintenance
  });
});
