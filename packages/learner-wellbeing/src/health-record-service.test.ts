import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicateHealthRecordError,
  HealthRecordNotFoundError,
  StudentNotFoundForWellbeingError,
} from "./errors";
import { HealthRecordService } from "./health-record-service";
import { InMemoryHealthRecordRepository, type StudentDirectory } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const students: StudentDirectory = {
  organizationOf: async (_t, id) => (id === STUDENT ? ORG : null),
};

function service(): { svc: HealthRecordService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new HealthRecordService({
    repository: new InMemoryHealthRecordRepository(),
    students,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

describe("HealthRecordService", () => {
  it("creates a record, deriving the organization and publishing health_record.created", async () => {
    const { svc, events } = service();
    const r = await svc.create({ tenantId: TENANT, studentId: STUDENT, bloodGroup: "O+" });
    expect(r.organizationId).toBe(ORG);
    expect(r.bloodGroup).toBe("O+");
    expect(events.map((e) => e.type)).toEqual(["wellbeing.health_record.created"]);
    expect(await svc.getByStudent(TENANT, STUDENT)).toEqual(r);
    expect(await svc.listForOrganization(TENANT, ORG)).toHaveLength(1);
  });

  it("rejects an unknown student and a duplicate record", async () => {
    const { svc } = service();
    await expect(svc.create({ tenantId: TENANT, studentId: UNKNOWN })).rejects.toBeInstanceOf(
      StudentNotFoundForWellbeingError,
    );
    await svc.create({ tenantId: TENANT, studentId: STUDENT });
    await expect(svc.create({ tenantId: TENANT, studentId: STUDENT })).rejects.toBeInstanceOf(
      DuplicateHealthRecordError,
    );
  });

  it("manages allergies, conditions, immunizations and medications", async () => {
    const { svc } = service();
    const r = await svc.create({ tenantId: TENANT, studentId: STUDENT });
    await svc.putAllergy(TENANT, r.id, {
      substance: "peanuts",
      reaction: null,
      severity: "critical",
    });
    await svc.addChronicCondition(TENANT, r.id, { name: "asthma", notes: null });
    await svc.addImmunization(TENANT, r.id, { vaccine: "MMR", administeredOn: "2020-05-01" });
    await svc.putMedication(TENANT, r.id, { name: "ventolin", dosage: "2 puffs", active: true });
    const discontinued = await svc.discontinueMedication(TENANT, r.id, "ventolin");
    expect(discontinued.allergies).toHaveLength(1);
    expect(discontinued.chronicConditions).toHaveLength(1);
    expect(discontinued.immunizations).toHaveLength(1);
    expect(discontinued.medications[0]?.active).toBe(false);
    const cleaned = await svc.removeAllergy(TENANT, r.id, "peanuts");
    expect(cleaned.allergies).toEqual([]);
  });

  it("raises and clears medical alerts, publishing medical_alert.updated each time", async () => {
    const { svc, events } = service();
    const r = await svc.create({ tenantId: TENANT, studentId: STUDENT });
    const { alert } = await svc.raiseMedicalAlert(TENANT, r.id, "anaphylaxis risk", "critical");
    const raisedEvent = events.at(-1);
    expect(raisedEvent?.type).toBe("wellbeing.medical_alert.updated");
    expect((raisedEvent?.payload as { activeAlerts: number }).activeAlerts).toBe(1);
    const cleared = await svc.clearMedicalAlert(TENANT, r.id, alert.id);
    expect(cleared.medicalAlerts).toEqual([]);
    expect((events.at(-1)?.payload as { activeAlerts: number }).activeAlerts).toBe(0);
  });

  it("sets free-text fields and reports a missing record", async () => {
    const { svc } = service();
    const r = await svc.create({ tenantId: TENANT, studentId: STUDENT });
    await svc.setMedicalHistory(TENANT, r.id, "asthma");
    await svc.setBloodGroup(TENANT, r.id, "A-");
    const withPlan = await svc.setEmergencyPlan(TENANT, r.id, "call guardian, use inhaler");
    expect(withPlan.medicalHistory).toBe("asthma");
    expect(withPlan.bloodGroup).toBe("A-");
    expect(withPlan.emergencyPlan).toBe("call guardian, use inhaler");
    await expect(svc.getById(TENANT, UNKNOWN)).rejects.toBeInstanceOf(HealthRecordNotFoundError);
  });
});
