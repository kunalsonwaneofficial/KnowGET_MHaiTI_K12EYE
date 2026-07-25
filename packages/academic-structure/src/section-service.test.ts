import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { createAcademicClass } from "./academic-class";
import { ClassNotFoundError, DuplicateSectionError, SectionNotFoundError } from "./errors";
import { SectionService } from "./section-service";
import { InMemoryAcademicClassRepository, InMemorySectionRepository } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const GRADE = "44444444-4444-4444-4444-444444444444" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

async function service(): Promise<{ svc: SectionService; events: DomainEvent[]; classId: Uuid }> {
  const events: DomainEvent[] = [];
  const classes = new InMemoryAcademicClassRepository();
  const klass = createAcademicClass({
    tenantId: TENANT,
    organizationId: ORG,
    gradeId: GRADE,
    academicYear: "2026-2027",
    name: "Grade 5",
  });
  await classes.save(klass);
  const svc = new SectionService({
    repository: new InMemorySectionRepository(),
    classes,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events, classId: klass.id };
}

describe("SectionService", () => {
  it("creates a section, deriving the organization from the class, publishing academic.section.created", async () => {
    const { svc, events, classId } = await service();
    const s = await svc.create({ tenantId: TENANT, classId, name: "A", capacity: 40 });
    expect(s.organizationId).toBe(ORG);
    expect(s.status).toBe("planned");
    expect(events.map((e) => e.type)).toEqual(["academic.section.created"]);
    expect(await svc.listForClass(TENANT, classId)).toHaveLength(1);
    expect(await svc.listForOrganization(TENANT, ORG)).toHaveLength(1);
  });

  it("rejects an unknown class and a duplicate section name", async () => {
    const { svc, classId } = await service();
    await expect(
      svc.create({ tenantId: TENANT, classId: UNKNOWN, name: "A", capacity: 40 }),
    ).rejects.toBeInstanceOf(ClassNotFoundError);
    await svc.create({ tenantId: TENANT, classId, name: "A", capacity: 40 });
    await expect(
      svc.create({ tenantId: TENANT, classId, name: "A", capacity: 30 }),
    ).rejects.toBeInstanceOf(DuplicateSectionError);
    // a different name is fine
    expect(await svc.create({ tenantId: TENANT, classId, name: "B", capacity: 35 })).toBeDefined();
  });

  it("drives the lifecycle and capacity, and reports a missing section", async () => {
    const { svc, classId } = await service();
    const s = await svc.create({ tenantId: TENANT, classId, name: "A", capacity: 40 });
    await svc.activate(TENANT, s.id);
    const resized = await svc.setCapacity(TENANT, s.id, 45);
    expect(resized.capacity).toBe(45);
    const closed = await svc.close(TENANT, s.id);
    expect(closed.status).toBe("closed");
    await expect(svc.getById(TENANT, UNKNOWN)).rejects.toBeInstanceOf(SectionNotFoundError);
  });
});
