import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { CurriculumFrameworkService } from "./curriculum-framework-service";
import {
  CurriculumFrameworkNotFoundError,
  DuplicateCurriculumFrameworkError,
  OrganizationNotFoundForAcademicError,
} from "./errors";
import { InMemoryCurriculumFrameworkRepository, type OrganizationDirectory } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const organizations: OrganizationDirectory = { exists: async (_t, id) => id === ORG };

function service(): { svc: CurriculumFrameworkService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new CurriculumFrameworkService({
    repository: new InMemoryCurriculumFrameworkRepository(),
    organizations,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const create = (svc: CurriculumFrameworkService, code = "CBSE") =>
  svc.create({ tenantId: TENANT, organizationId: ORG, name: "CBSE", code, board: "CBSE" });

describe("CurriculumFrameworkService", () => {
  it("creates a framework and publishes academic.curriculum.created", async () => {
    const { svc, events } = service();
    const f = await create(svc);
    expect(f.version).toBe(1);
    expect(events.map((e) => e.type)).toEqual(["academic.curriculum.created"]);
    expect(await svc.getByCode(TENANT, ORG, "CBSE")).toEqual(f);
  });

  it("lets multiple curricula coexist but rejects a duplicate code and unknown org", async () => {
    const { svc } = service();
    await create(svc, "CBSE");
    expect(await create(svc, "IB")).toBeDefined();
    expect(await svc.listForOrganization(TENANT, ORG)).toHaveLength(2);
    await expect(create(svc, "CBSE")).rejects.toBeInstanceOf(DuplicateCurriculumFrameworkError);
    await expect(
      svc.create({ tenantId: TENANT, organizationId: UNKNOWN, name: "X", code: "X", board: "X" }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForAcademicError);
  });

  it("activates, revises (publishing academic.curriculum.revised) and archives", async () => {
    const { svc, events } = service();
    const f = await create(svc);
    await svc.activate(TENANT, f.id);
    await svc.setSubjectFramework(TENANT, f.id, ["Languages", "Sciences"]);
    const revised = await svc.revise(TENANT, f.id, "align to 2027 syllabus");
    expect(revised.version).toBe(2);
    expect(revised.subjectFramework).toEqual(["Languages", "Sciences"]);
    expect(events.at(-1)?.type).toBe("academic.curriculum.revised");
    const archived = await svc.archive(TENANT, f.id);
    expect(archived.status).toBe("archived");
    await expect(svc.getById(TENANT, UNKNOWN)).rejects.toBeInstanceOf(
      CurriculumFrameworkNotFoundError,
    );
  });
});
