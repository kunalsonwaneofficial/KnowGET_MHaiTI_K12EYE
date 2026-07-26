import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { registerClinician, suspendClinician } from "./clinician";
import { registerHealthCentre } from "./health-centre";
import {
  InMemoryClinicianRepository,
  InMemoryHealthCentreRepository,
  InMemoryPrescriptionRepository,
  type PersonDirectory,
} from "./ports";
import { PrescriptionService } from "./prescription-service";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const patientId = "44444444-4444-4444-4444-444444444444" as Uuid;

const personDir = (known = true): PersonDirectory => ({
  async exists() {
    return known;
  },
});

const setup = async (patientKnown = true) => {
  const repository = new InMemoryPrescriptionRepository();
  const centres = new InMemoryHealthCentreRepository();
  const clinicians = new InMemoryClinicianRepository();
  const events: DomainEvent[] = [];
  const centre = registerHealthCentre({
    tenantId,
    organizationId,
    code: "HC-1",
    name: "Infirmary",
    type: "infirmary",
  });
  await centres.save(centre);
  const clinician = registerClinician({
    tenantId,
    organizationId,
    employeeId: "e1" as Uuid,
    role: "physician",
  });
  await clinicians.save(clinician);
  const service = new PrescriptionService({
    repository,
    centres,
    persons: personDir(patientKnown),
    clinicians,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, centres, clinicians, service, centre, clinician, events };
};

const issue = (service: PrescriptionService, centreId: Uuid, clinicianId: Uuid) =>
  service.issue({
    tenantId,
    centreId,
    patientId,
    clinicianId,
    medication: "Amoxicillin",
    frequencyPerDay: 3,
    durationDays: 5,
    startDate: "2026-01-01",
  });

describe("PrescriptionService", () => {
  it("issues a course, records doses and derives the schedule status via the engine", async () => {
    const { service, centre, clinician, events } = await setup();
    const p = await issue(service, centre.id, clinician.id);
    expect(p.organizationId).toBe(organizationId);
    await service.recordDose(tenantId, p.id, 9);
    const status = await service.scheduleStatus(tenantId, p.id, "2026-01-04"); // day four: 12 due, 9 given
    expect(status.totalDoses).toBe(15);
    expect(status.dosesDue).toBe(12);
    expect(status.overdueDoses).toBe(3);
    expect(events.map((e) => e.type)).toContain("clinical.prescription.dose_recorded");
    // the dose event must not leak the medication
    const doseEvent = events.find((e) => e.type === "clinical.prescription.dose_recorded");
    expect(JSON.stringify(doseEvent?.payload)).not.toContain("Amoxicillin");
  });

  it("rejects an unknown centre, unknown patient and an inactive prescriber", async () => {
    const { service, centre, clinician } = await setup(false);
    await expect(issue(service, "missing" as Uuid, clinician.id)).rejects.toThrow(/Health centre/);
    await expect(issue(service, centre.id, clinician.id)).rejects.toThrow(/Person/); // patient unknown

    const { service: live, centre: c2, clinicians } = await setup();
    const suspended = suspendClinician(
      registerClinician({ tenantId, organizationId, employeeId: "e2" as Uuid, role: "nurse" }),
    );
    await clinicians.save(suspended);
    await expect(issue(live, c2.id, suspended.id)).rejects.toThrow(/not active/);
  });

  it("completes and discontinues", async () => {
    const { service, centre, clinician } = await setup();
    const p = await issue(service, centre.id, clinician.id);
    expect((await service.complete(tenantId, p.id)).status).toBe("completed");
    const q = await issue(service, centre.id, clinician.id);
    expect((await service.discontinue(tenantId, q.id)).status).toBe("discontinued");
  });
});
