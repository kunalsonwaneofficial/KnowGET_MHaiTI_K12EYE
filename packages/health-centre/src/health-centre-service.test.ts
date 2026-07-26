import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { registerClinician, suspendClinician } from "./clinician";
import { HealthCentreService } from "./health-centre-service";
import {
  InMemoryClinicianRepository,
  InMemoryHealthCentreRepository,
  type OrganizationDirectory,
} from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const orgDir = (known = true): OrganizationDirectory => ({
  async exists() {
    return known;
  },
});

const setup = (orgKnown = true) => {
  const repository = new InMemoryHealthCentreRepository();
  const clinicians = new InMemoryClinicianRepository();
  const events: DomainEvent[] = [];
  const service = new HealthCentreService({
    repository,
    organizations: orgDir(orgKnown),
    clinicians,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, clinicians, service, events };
};

const create = (service: HealthCentreService, code = "HC-1") =>
  service.create({ tenantId, organizationId, code, name: "Infirmary", type: "infirmary" });

describe("HealthCentreService", () => {
  it("registers a centre, validating the org and a unique code, and emits", async () => {
    const { service, events } = setup();
    const c = await create(service);
    expect(c.status).toBe("active");
    expect(events.map((e) => e.type)).toContain("clinical.centre.registered");
    await expect(create(service, "HC-1")).rejects.toThrow(/already in use/);
  });

  it("rejects an unknown organization", async () => {
    const { service } = setup(false);
    await expect(create(service)).rejects.toThrow(/Organization/);
  });

  it("assigns a lead clinician only when active, and can clear it", async () => {
    const { service, clinicians } = setup();
    const centre = await create(service);
    const active = registerClinician({
      tenantId,
      organizationId,
      employeeId: "e1" as Uuid,
      role: "physician",
    });
    await clinicians.save(active);
    const assigned = await service.assignLead(tenantId, centre.id, active.id);
    expect(assigned.leadClinicianId).toBe(active.id);
    expect((await service.unassignLead(tenantId, centre.id)).leadClinicianId).toBeNull();

    const suspended = suspendClinician(
      registerClinician({
        tenantId,
        organizationId,
        employeeId: "e2" as Uuid,
        role: "nurse",
      }),
    );
    await clinicians.save(suspended);
    await expect(service.assignLead(tenantId, centre.id, suspended.id)).rejects.toThrow(
      /not active/,
    );
    await expect(service.assignLead(tenantId, centre.id, "missing" as Uuid)).rejects.toThrow(
      /Clinician/,
    );
  });

  it("drives the maintenance/decommission lifecycle and emits distinct events", async () => {
    const { service, events } = setup();
    const c = await create(service);
    await service.setCapacity(tenantId, c.id, 20);
    await service.sendToMaintenance(tenantId, c.id);
    await service.returnFromMaintenance(tenantId, c.id);
    await service.decommission(tenantId, c.id);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("clinical.centre.capacity_set")).toBe(true);
    expect(types.has("clinical.centre.sent_to_maintenance")).toBe(true);
    expect(types.has("clinical.centre.returned_from_maintenance")).toBe(true);
    expect(types.has("clinical.centre.decommissioned")).toBe(true);
  });
});
