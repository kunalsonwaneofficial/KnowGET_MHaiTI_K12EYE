import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  completePrescription,
  discontinuePrescription,
  isPrescriptionActive,
  issuePrescription,
  recordDose,
  totalDosesOf,
} from "./prescription";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const centreId = "33333333-3333-3333-3333-333333333333" as Uuid;
const patientId = "44444444-4444-4444-4444-444444444444" as Uuid;
const clinicianId = "55555555-5555-5555-5555-555555555555" as Uuid;

const make = () =>
  issuePrescription({
    tenantId,
    organizationId,
    centreId,
    patientId,
    clinicianId,
    medication: "  Amoxicillin ",
    dosage: " 500mg ",
    frequencyPerDay: 3,
    durationDays: 5,
    startDate: "2026-01-01",
  });

describe("Prescription aggregate", () => {
  it("issues active, trimming medication/dosage; total doses = freq × duration", () => {
    const p = make();
    expect(p.medication).toBe("Amoxicillin");
    expect(p.dosage).toBe("500mg");
    expect(p.dosesAdministered).toBe(0);
    expect(totalDosesOf(p)).toBe(15);
    expect(isPrescriptionActive(p)).toBe(true);
  });

  it("rejects an empty medication or a non-positive regimen", () => {
    expect(() =>
      issuePrescription({
        tenantId,
        organizationId,
        centreId,
        patientId,
        clinicianId,
        medication: "  ",
        frequencyPerDay: 3,
        durationDays: 5,
        startDate: "2026-01-01",
      }),
    ).toThrow(/medication/);
    expect(() =>
      issuePrescription({
        tenantId,
        organizationId,
        centreId,
        patientId,
        clinicianId,
        medication: "X",
        frequencyPerDay: 0,
        durationDays: 5,
        startDate: "2026-01-01",
      }),
    ).toThrow(/positive integer/);
  });

  it("records doses up to the total but never beyond it", () => {
    let p = make();
    p = recordDose(p, 10);
    expect(p.dosesAdministered).toBe(10);
    p = recordDose(p, 5);
    expect(p.dosesAdministered).toBe(15);
    expect(() => recordDose(p)).toThrow(/already had every prescribed dose/);
  });

  it("completes or discontinues, then refuses further transitions", () => {
    expect(completePrescription(make()).status).toBe("completed");
    const d = discontinuePrescription(make());
    expect(d.status).toBe("discontinued");
    expect(() => recordDose(d)).toThrow(/cannot move/);
    expect(() => completePrescription(d)).toThrow(/cannot move/);
  });
});
