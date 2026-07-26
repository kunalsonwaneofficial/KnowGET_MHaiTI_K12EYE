import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AdmissionCycleService } from "./admission-cycle-service";
import type { OrganizationDirectory } from "./ports";
import { InMemoryAdmissionCycleRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const organizations: OrganizationDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === organizationId;
  },
};

const setup = () => {
  const repository = new InMemoryAdmissionCycleRepository();
  const events: DomainEvent[] = [];
  const service = new AdmissionCycleService({
    repository,
    organizations,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, service, events };
};

describe("AdmissionCycleService", () => {
  it("creates a cycle validating org + unique code, then runs the lifecycle", async () => {
    const { service, events } = setup();
    const c = await service.create({
      tenantId,
      organizationId,
      code: "CYC-27",
      name: "Intake",
      academicYear: "2027-28",
      gradeCapacities: [{ grade: "G1", capacity: 40 }],
    });
    await service.open(tenantId, c.id);
    await service.close(tenantId, c.id);
    await service.archive(tenantId, c.id);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("admissions.cycle.created")).toBe(true);
    expect(types.has("admissions.cycle.opened")).toBe(true);
    expect(types.has("admissions.cycle.closed")).toBe(true);
    expect(types.has("admissions.cycle.archived")).toBe(true);

    await expect(
      service.create({
        tenantId,
        organizationId,
        code: "CYC-27",
        name: "Dup",
        academicYear: "2027",
      }),
    ).rejects.toThrow(/already in use/);
    await expect(
      service.create({
        tenantId,
        organizationId: "x" as Uuid,
        code: "C2",
        name: "n",
        academicYear: "2027",
      }),
    ).rejects.toThrow(/Organization/);
  });
});
