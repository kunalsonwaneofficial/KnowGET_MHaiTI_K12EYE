import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicateSubjectError,
  OrganizationNotFoundForAcademicError,
  SubjectNotFoundError,
} from "./errors";
import { InMemorySubjectRepository, type OrganizationDirectory } from "./ports";
import { SubjectService } from "./subject-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const organizations: OrganizationDirectory = { exists: async (_t, id) => id === ORG };

function service(): { svc: SubjectService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new SubjectService({
    repository: new InMemorySubjectRepository(),
    organizations,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const create = (svc: SubjectService, code = "MATH") =>
  svc.create({
    tenantId: TENANT,
    organizationId: ORG,
    name: "Mathematics",
    code,
    kind: "mandatory",
  });

describe("SubjectService", () => {
  it("registers a subject and publishes academic.subject.registered", async () => {
    const { svc, events } = service();
    const s = await create(svc);
    expect(s.version).toBe(1);
    expect(events.map((e) => e.type)).toEqual(["academic.subject.registered"]);
    expect(await svc.getByCode(TENANT, ORG, "MATH")).toEqual(s);
  });

  it("rejects an unknown org and a duplicate code", async () => {
    const { svc } = service();
    await expect(
      svc.create({
        tenantId: TENANT,
        organizationId: UNKNOWN,
        name: "X",
        code: "X",
        kind: "elective",
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForAcademicError);
    await create(svc);
    await expect(create(svc)).rejects.toBeInstanceOf(DuplicateSubjectError);
  });

  it("publishes academic.subject.updated on each change and validates prerequisites", async () => {
    const { svc, events } = service();
    const math = await create(svc, "MATH");
    const physics = await create(svc, "PHY");
    await svc.setKind(TENANT, physics.id, "elective");
    await svc.setCredits(TENANT, physics.id, 4);
    const withPrereq = await svc.addPrerequisite(TENANT, physics.id, math.id);
    expect(withPrereq.prerequisites).toEqual([math.id]);
    expect(withPrereq.version).toBe(4); // register + kind + credits + prereq
    expect(events.filter((e) => e.type === "academic.subject.updated")).toHaveLength(3);
    // adding the same prerequisite again is an idempotent no-op: no version bump, no event
    const again = await svc.addPrerequisite(TENANT, physics.id, math.id);
    expect(again.version).toBe(4);
    expect(events.filter((e) => e.type === "academic.subject.updated")).toHaveLength(3);
    await expect(svc.addPrerequisite(TENANT, physics.id, UNKNOWN)).rejects.toBeInstanceOf(
      SubjectNotFoundError,
    );
  });

  it("toggles lifecycle and reports a missing subject", async () => {
    const { svc } = service();
    const s = await create(svc);
    const archived = await svc.archive(TENANT, s.id);
    expect(archived.status).toBe("archived");
    expect((await svc.activate(TENANT, s.id)).status).toBe("active");
    await expect(svc.getById(TENANT, UNKNOWN)).rejects.toBeInstanceOf(SubjectNotFoundError);
  });
});
