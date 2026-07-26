import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AlumniProfileService } from "./alumni-profile-service";
import type { OrganizationDirectory, PersonDirectory } from "./ports";
import { InMemoryAlumniProfileRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const alumnusPersonId = "33333333-3333-3333-3333-333333333333" as Uuid;

const organizations: OrganizationDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === organizationId;
  },
};
const persons: PersonDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === alumnusPersonId;
  },
};

const setup = () => {
  const repository = new InMemoryAlumniProfileRepository();
  const events: DomainEvent[] = [];
  const service = new AlumniProfileService({
    repository,
    organizations,
    persons,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, service, events };
};

describe("AlumniProfileService", () => {
  it("creates a profile (validating org + person), then lapses and opts out with events", async () => {
    const { service, events } = await setup();
    const p = await service.create({
      tenantId,
      organizationId,
      alumnusPersonId,
      graduationYear: "2015",
    });
    await service.markLapsed(tenantId, p.id);
    await service.optOut(tenantId, p.id);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("alumni.profile.created")).toBe(true);
    expect(types.has("alumni.profile.lapsed")).toBe(true);
    expect(types.has("alumni.profile.opted_out")).toBe(true);
  });

  it("rejects an unknown org/person and a duplicate profile for the same alumnus", async () => {
    const { service } = await setup();
    await expect(
      service.create({
        tenantId,
        organizationId: "00000000-0000-0000-0000-000000000000" as Uuid,
        alumnusPersonId,
        graduationYear: "2015",
      }),
    ).rejects.toThrow(/Organization/);
    await expect(
      service.create({
        tenantId,
        organizationId,
        alumnusPersonId: "00000000-0000-0000-0000-000000000000" as Uuid,
        graduationYear: "2015",
      }),
    ).rejects.toThrow(/Person/);
    await service.create({ tenantId, organizationId, alumnusPersonId, graduationYear: "2015" });
    await expect(
      service.create({ tenantId, organizationId, alumnusPersonId, graduationYear: "2016" }),
    ).rejects.toThrow(/already exists/);
  });
});
