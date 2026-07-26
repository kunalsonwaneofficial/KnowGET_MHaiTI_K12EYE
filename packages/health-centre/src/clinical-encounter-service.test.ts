import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { registerClinician } from "./clinician";
import { EncounterService } from "./clinical-encounter-service";
import { registerHealthCentre } from "./health-centre";
import {
  InMemoryClinicianRepository,
  InMemoryEncounterRepository,
  InMemoryHealthCentreRepository,
  type PersonDirectory,
} from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const patientId = "44444444-4444-4444-4444-444444444444" as Uuid;

const personDir = (known = true): PersonDirectory => ({
  async exists() {
    return known;
  },
});

const setup = async () => {
  const repository = new InMemoryEncounterRepository();
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
  const service = new EncounterService({
    repository,
    centres,
    persons: personDir(),
    clinicians,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, centres, clinicians, service, centre, clinician, events };
};

describe("EncounterService", () => {
  it("opens, assigns a clinician, starts, assesses and completes — with content-free events", async () => {
    const { service, centre, clinician, events } = await setup();
    const e = await service.open({
      tenantId,
      centreId: centre.id,
      patientId,
      triageAcuity: "urgent",
      chiefComplaint: "headache",
    });
    expect(e.organizationId).toBe(organizationId);
    await service.assignClinician(tenantId, e.id, clinician.id);
    await service.start(tenantId, e.id);
    await service.recordAssessment(tenantId, e.id, "migraine");
    const done = await service.complete(tenantId, e.id, "discharged");
    expect(done.status).toBe("completed");
    expect(done.disposition).toBe("discharged");

    const completedEvent = events.find((ev) => ev.type === "clinical.encounter.completed");
    expect(completedEvent).toBeDefined();
    // The event must not leak any clinical content.
    const payloadKeys = Object.keys(completedEvent?.payload ?? {});
    expect(payloadKeys).not.toContain("chiefComplaint");
    expect(payloadKeys).not.toContain("assessment");
    expect(payloadKeys).not.toContain("disposition");
    expect(payloadKeys).not.toContain("triageAcuity");
    expect(JSON.stringify(completedEvent?.payload)).not.toContain("migraine");
  });

  it("lists open encounters for a centre", async () => {
    const { service, centre, clinician } = await setup();
    const open = await service.open({
      tenantId,
      centreId: centre.id,
      patientId,
      triageAcuity: "routine",
    });
    const other = await service.open({
      tenantId,
      centreId: centre.id,
      patientId: "p2" as Uuid,
      triageAcuity: "routine",
    });
    await service.assignClinician(tenantId, other.id, clinician.id);
    await service.start(tenantId, other.id);
    await service.complete(tenantId, other.id, "discharged");
    const openList = await service.listOpenForCentre(tenantId, centre.id);
    expect(openList.map((e) => e.id)).toEqual([open.id]);
  });

  it("rejects opening at a missing centre or for an unknown patient", async () => {
    const { centres, centre } = await setup();
    const noPatient = new EncounterService({
      repository: new InMemoryEncounterRepository(),
      centres,
      persons: personDir(false),
      clinicians: new InMemoryClinicianRepository(),
    });
    await expect(
      noPatient.open({ tenantId, centreId: centre.id, patientId, triageAcuity: "routine" }),
    ).rejects.toThrow(/Person/);
    await expect(
      noPatient.open({ tenantId, centreId: "missing" as Uuid, patientId, triageAcuity: "routine" }),
    ).rejects.toThrow(/Health centre/);
  });
});
