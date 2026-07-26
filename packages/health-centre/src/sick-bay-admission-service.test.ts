import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { registerHealthCentre } from "./health-centre";
import { AdmissionService } from "./sick-bay-admission-service";
import {
  InMemoryAdmissionRepository,
  InMemoryHealthCentreRepository,
  type PersonDirectory,
} from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const personDir = (known = true): PersonDirectory => ({
  async exists() {
    return known;
  },
});

const setup = async (capacity = 2, patientKnown = true) => {
  const repository = new InMemoryAdmissionRepository();
  const centres = new InMemoryHealthCentreRepository();
  const events: DomainEvent[] = [];
  const centre = registerHealthCentre({
    tenantId,
    organizationId,
    code: "HC-1",
    name: "Infirmary",
    type: "infirmary",
    sickBayCapacity: capacity,
  });
  await centres.save(centre);
  const service = new AdmissionService({
    repository,
    centres,
    persons: personDir(patientKnown),
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, centres, service, centre, events };
};

const admit = (service: AdmissionService, centreId: Uuid, patientId: string, bedLabel: string) =>
  service.admit({
    tenantId,
    centreId,
    patientId: patientId as Uuid,
    bedLabel,
    admittedOn: "2026-01-01",
  });

describe("AdmissionService", () => {
  it("admits, derives the org, and reports occupancy via the engine", async () => {
    const { service, centre, events } = await setup(4);
    const a = await admit(service, centre.id, "p1", "B-1");
    expect(a.organizationId).toBe(organizationId);
    const occ = await service.occupancy(tenantId, centre.id);
    expect(occ).toMatchObject({
      bedCapacity: 4,
      occupantCount: 1,
      bedsAvailable: 3,
      overCapacity: false,
    });
    expect(events.map((e) => e.type)).toContain("clinical.admission.opened");
  });

  it("enforces one active admission per bed and one per patient (TD-39)", async () => {
    const { service, centre } = await setup(4);
    await admit(service, centre.id, "p1", "B-1");
    await expect(admit(service, centre.id, "p2", "B-1")).rejects.toThrow(/already occupied/);
    await expect(admit(service, centre.id, "p1", "B-2")).rejects.toThrow(/already has an active/);
  });

  it("refuses to admit beyond the sick-bay capacity", async () => {
    const { service, centre } = await setup(1);
    await admit(service, centre.id, "p1", "B-1");
    await expect(admit(service, centre.id, "p2", "B-2")).rejects.toThrow(/at capacity/);
  });

  it("frees the bed and the patient on discharge, so re-admission is allowed", async () => {
    const { service, centre } = await setup(2);
    const a = await admit(service, centre.id, "p1", "B-1");
    await service.discharge(tenantId, a.id, "2026-01-02");
    const occ = await service.occupancy(tenantId, centre.id);
    expect(occ.occupantCount).toBe(0);
    // bed and patient are free again
    await expect(admit(service, centre.id, "p1", "B-1")).resolves.toMatchObject({
      status: "active",
    });
  });

  it("rejects an unknown patient", async () => {
    const { service, centre } = await setup(2, false);
    await expect(admit(service, centre.id, "p1", "B-1")).rejects.toThrow(/Person/);
  });
});
