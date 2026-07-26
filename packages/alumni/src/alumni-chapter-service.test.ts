import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AlumniChapterService } from "./alumni-chapter-service";
import type { OrganizationDirectory } from "./ports";
import { InMemoryAlumniChapterRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const organizations: OrganizationDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === organizationId;
  },
};

const setup = () => {
  const repository = new InMemoryAlumniChapterRepository();
  const events: DomainEvent[] = [];
  const service = new AlumniChapterService({
    repository,
    organizations,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { service, events };
};

describe("AlumniChapterService", () => {
  it("creates and activates a chapter with events", async () => {
    const { service, events } = await setup();
    const c = await service.create({
      tenantId,
      organizationId,
      code: "BAY",
      name: "Bay Area",
      type: "regional",
    });
    await service.activate(tenantId, c.id);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("alumni.chapter.created")).toBe(true);
    expect(types.has("alumni.chapter.activated")).toBe(true);
  });

  it("rejects an unknown org and a duplicate code", async () => {
    const { service } = await setup();
    await expect(
      service.create({
        tenantId,
        organizationId: "00000000-0000-0000-0000-000000000000" as Uuid,
        code: "BAY",
        name: "Bay Area",
        type: "regional",
      }),
    ).rejects.toThrow(/Organization/);
    await service.create({
      tenantId,
      organizationId,
      code: "BAY",
      name: "Bay Area",
      type: "regional",
    });
    await expect(
      service.create({ tenantId, organizationId, code: "BAY", name: "Dup", type: "interest" }),
    ).rejects.toThrow(/already in use/);
  });
});
