import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { createAcademicProgram } from "./academic-program";
import { AcademicProgramNotFoundError, DuplicateGradeError, GradeNotFoundError } from "./errors";
import { GradeService } from "./grade-service";
import { InMemoryAcademicProgramRepository, InMemoryGradeRepository } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

async function service(): Promise<{ svc: GradeService; events: DomainEvent[]; programId: Uuid }> {
  const events: DomainEvent[] = [];
  const programs = new InMemoryAcademicProgramRepository();
  const program = createAcademicProgram({
    tenantId: TENANT,
    organizationId: ORG,
    name: "Primary",
    code: "PRIM",
    stage: "primary",
  });
  await programs.save(program);
  const svc = new GradeService({
    repository: new InMemoryGradeRepository(),
    programs,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events, programId: program.id };
}

describe("GradeService", () => {
  it("creates a grade, deriving the organization from the program", async () => {
    const { svc, events, programId } = await service();
    const g = await svc.create({
      tenantId: TENANT,
      programId,
      name: "Grade 1",
      code: "G1",
      level: 1,
    });
    expect(g.organizationId).toBe(ORG);
    expect(events.map((e) => e.type)).toEqual(["academic.grade.created"]);
    expect(await svc.listForProgram(TENANT, programId)).toHaveLength(1);
    expect(await svc.listForOrganization(TENANT, ORG)).toHaveLength(1);
  });

  it("rejects an unknown program and a duplicate grade code", async () => {
    const { svc, programId } = await service();
    await expect(
      svc.create({ tenantId: TENANT, programId: UNKNOWN, name: "X", code: "X", level: 1 }),
    ).rejects.toBeInstanceOf(AcademicProgramNotFoundError);
    await svc.create({ tenantId: TENANT, programId, name: "Grade 1", code: "G1", level: 1 });
    await expect(
      svc.create({ tenantId: TENANT, programId, name: "Grade One", code: "G1", level: 1 }),
    ).rejects.toBeInstanceOf(DuplicateGradeError);
  });

  it("links a promotion target (validated) and drives the mutation surface", async () => {
    const { svc, programId } = await service();
    const g1 = await svc.create({
      tenantId: TENANT,
      programId,
      name: "Grade 1",
      code: "G1",
      level: 1,
    });
    const g2 = await svc.create({
      tenantId: TENANT,
      programId,
      name: "Grade 2",
      code: "G2",
      level: 2,
    });
    const linked = await svc.setNextGrade(TENANT, g1.id, g2.id);
    expect(linked.nextGradeId).toBe(g2.id);
    await expect(svc.setNextGrade(TENANT, g1.id, UNKNOWN)).rejects.toBeInstanceOf(
      GradeNotFoundError,
    );
    const withRule = await svc.setPromotionRule(TENANT, g1.id, "min 40%");
    expect(withRule.promotionRule).toBe("min 40%");
    const aged = await svc.setAgeGuidelines(TENANT, g1.id, 6, 7);
    expect(aged.minAge).toBe(6);
    const archived = await svc.archive(TENANT, g1.id);
    expect(archived.status).toBe("archived");
    await expect(svc.getById(TENANT, UNKNOWN)).rejects.toBeInstanceOf(GradeNotFoundError);
  });
});
