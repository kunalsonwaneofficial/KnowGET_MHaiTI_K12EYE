import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { CompetencyFrameworkService } from "./competency-framework-service";
import { DuplicateFrameworkCodeError, OrganizationNotFoundForFacultyError } from "./errors";
import { InMemoryCompetencyFrameworkRepository, type OrganizationDirectory } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const orgDir: OrganizationDirectory = { exists: async (_t, id) => id === ORG };

function service(): { svc: CompetencyFrameworkService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new CompetencyFrameworkService({
    repository: new InMemoryCompetencyFrameworkRepository(),
    organizations: orgDir,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const create = (code = "TEACH-STD") =>
  ({
    tenantId: TENANT,
    organizationId: ORG,
    code,
    name: "Teaching Standards",
    competencies: [{ key: "ped-1", name: "Planning" }],
  }) as const;

describe("CompetencyFrameworkService", () => {
  it("creates, enforces a unique code, and publishes an event", async () => {
    const { svc, events } = service();
    const fw = await svc.create(create());
    expect(fw.status).toBe("draft");
    expect(events.map((e) => e.type)).toEqual(["faculty.framework.created"]);
    await expect(svc.create(create("TEACH-STD"))).rejects.toBeInstanceOf(
      DuplicateFrameworkCodeError,
    );
    expect((await svc.getByCode(TENANT, "TEACH-STD")).id).toBe(fw.id);
  });

  it("rejects an unknown organization", async () => {
    const { svc } = service();
    await expect(
      svc.create({ ...create(), organizationId: "00000000-0000-0000-0000-000000000000" as Uuid }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForFacultyError);
  });

  it("edits competencies then activates and archives, publishing lifecycle events", async () => {
    const { svc, events } = service();
    const fw = await svc.create(create());
    await svc.addCompetency(TENANT, fw.id, { key: "mgmt-1", name: "Management" });
    const active = await svc.activate(TENANT, fw.id);
    expect(active.competencies).toHaveLength(2);
    await svc.archive(TENANT, fw.id);
    expect(events.map((e) => e.type)).toEqual([
      "faculty.framework.created",
      "faculty.framework.activated",
      "faculty.framework.archived",
    ]);
  });
});
