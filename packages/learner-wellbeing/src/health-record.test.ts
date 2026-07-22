import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { EmptyHealthEntryError, MedicalAlertNotFoundError } from "./errors";
import {
  addChronicCondition,
  addImmunization,
  clearMedicalAlert,
  createHealthRecord,
  discontinueMedication,
  putAllergy,
  putMedication,
  raiseMedicalAlert,
  removeAllergy,
  setBloodGroup,
  setEmergencyPlan,
  setMedicalHistory,
} from "./health-record";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;

const record = () =>
  createHealthRecord({ tenantId: TENANT, organizationId: ORG, studentId: STUDENT });

describe("health record aggregate", () => {
  it("creates an empty record bound to the student and organization", () => {
    const r = record();
    expect(r.organizationId).toBe(ORG);
    expect(r.studentId).toBe(STUDENT);
    expect(r.medicalHistory).toBeNull();
    expect(r.allergies).toEqual([]);
    expect(r.medications).toEqual([]);
    expect(r.medicalAlerts).toEqual([]);
  });

  it("normalizes free-text fields, blanking whitespace-only input", () => {
    let r = setMedicalHistory(record(), "  asthma since 2019 ");
    expect(r.medicalHistory).toBe("asthma since 2019");
    r = setBloodGroup(r, " O+ ");
    expect(r.bloodGroup).toBe("O+");
    r = setEmergencyPlan(r, "   ");
    expect(r.emergencyPlan).toBeNull();
  });

  it("adds, replaces by substance and removes allergies", () => {
    let r = putAllergy(record(), {
      substance: " peanuts ",
      reaction: "hives",
      severity: "caution",
    });
    expect(r.allergies).toEqual([{ substance: "peanuts", reaction: "hives", severity: "caution" }]);
    r = putAllergy(r, { substance: "peanuts", reaction: "anaphylaxis", severity: "critical" });
    expect(r.allergies).toEqual([
      { substance: "peanuts", reaction: "anaphylaxis", severity: "critical" },
    ]);
    r = removeAllergy(r, "peanuts");
    expect(r.allergies).toEqual([]);
    expect(() =>
      putAllergy(record(), { substance: "  ", reaction: null, severity: "info" }),
    ).toThrow(EmptyHealthEntryError);
  });

  it("records chronic conditions and immunizations, rejecting blanks", () => {
    let r = addChronicCondition(record(), { name: "diabetes", notes: "type 1" });
    r = addImmunization(r, { vaccine: "MMR", administeredOn: "2020-05-01" });
    expect(r.chronicConditions).toHaveLength(1);
    expect(r.immunizations[0]?.vaccine).toBe("MMR");
    expect(() => addChronicCondition(r, { name: " ", notes: null })).toThrow(EmptyHealthEntryError);
    expect(() => addImmunization(r, { vaccine: "", administeredOn: null })).toThrow(
      EmptyHealthEntryError,
    );
  });

  it("adds, replaces and discontinues medications", () => {
    let r = putMedication(record(), { name: "insulin", dosage: "10u", active: true });
    r = putMedication(r, { name: "insulin", dosage: "12u", active: true });
    expect(r.medications).toEqual([{ name: "insulin", dosage: "12u", active: true }]);
    r = discontinueMedication(r, "insulin");
    expect(r.medications[0]?.active).toBe(false);
  });

  it("raises and clears standing medical alerts by id", () => {
    const raised = raiseMedicalAlert(record(), " anaphylaxis risk ", "critical");
    expect(raised.alert.label).toBe("anaphylaxis risk");
    expect(raised.record.medicalAlerts).toHaveLength(1);
    const cleared = clearMedicalAlert(raised.record, raised.alert.id);
    expect(cleared.medicalAlerts).toEqual([]);
    expect(() => clearMedicalAlert(raised.record, STUDENT)).toThrow(MedicalAlertNotFoundError);
    expect(() => raiseMedicalAlert(record(), "  ", "info")).toThrow(EmptyHealthEntryError);
  });
});
