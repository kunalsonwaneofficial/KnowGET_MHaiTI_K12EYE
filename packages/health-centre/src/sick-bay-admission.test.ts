import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { admitToSickBay, dischargeFromSickBay, isAdmissionActive } from "./sick-bay-admission";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const centreId = "33333333-3333-3333-3333-333333333333" as Uuid;
const patientId = "44444444-4444-4444-4444-444444444444" as Uuid;

const make = () =>
  admitToSickBay({
    tenantId,
    organizationId,
    centreId,
    patientId,
    bedLabel: "  B-1 ",
    admittedOn: "2026-01-01",
    reason: " observation ",
  });

describe("SickBayAdmission aggregate", () => {
  it("admits active, trimming the bed label and reason", () => {
    const a = make();
    expect(a.bedLabel).toBe("B-1");
    expect(a.reason).toBe("observation");
    expect(a.dischargedOn).toBeNull();
    expect(isAdmissionActive(a)).toBe(true);
  });

  it("rejects an empty bed label", () => {
    expect(() =>
      admitToSickBay({
        tenantId,
        organizationId,
        centreId,
        patientId,
        bedLabel: " ",
        admittedOn: "d",
      }),
    ).toThrow(/bed label/);
  });

  it("discharges an active admission and refuses to discharge twice", () => {
    const a = make();
    const d = dischargeFromSickBay(a, "2026-01-03");
    expect(d.status).toBe("discharged");
    expect(d.dischargedOn).toBe("2026-01-03");
    expect(isAdmissionActive(d)).toBe(false);
    expect(() => dischargeFromSickBay(d, "2026-01-04")).toThrow(/cannot move/);
  });
});
