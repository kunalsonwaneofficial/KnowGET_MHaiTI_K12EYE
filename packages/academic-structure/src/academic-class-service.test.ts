import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { createCurriculumFramework } from "./curriculum-framework";
import {
  ClassNotFoundError,
  CurriculumFrameworkNotFoundError,
  DuplicateClassError,
  GradeNotFoundError,
} from "./errors";
import { createGrade } from "./grade";
import { AcademicClassService } from "./academic-class-service";
import {
  InMemoryAcademicClassRepository,
  InMemoryCurriculumFrameworkRepository,
  InMemoryGradeRepository,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PROGRAM = "55555555-5555-5555-5555-555555555555" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

async function service(): Promise<{
  svc: AcademicClassService;
  events: DomainEvent[];
  gradeId: Uuid;
  curriculumId: Uuid;
}> {
  const events: DomainEvent[] = [];
  const grades = new InMemoryGradeRepository();
  const grade = createGrade({
    tenantId: TENANT,
    organizationId: ORG,
    programId: PROGRAM,
    name: "Grade 5",
    code: "G5",
    level: 5,
  });
  await grades.save(grade);
  const curricula = new InMemoryCurriculumFrameworkRepository();
  const curriculum = createCurriculumFramework({
    tenantId: TENANT,
    organizationId: ORG,
    name: "CBSE",
    code: "CBSE",
    board: "CBSE",
  });
  await curricula.save(curriculum);
  const svc = new AcademicClassService({
    repository: new InMemoryAcademicClassRepository(),
    grades,
    curricula,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events, gradeId: grade.id, curriculumId: curriculum.id };
}

describe("AcademicClassService", () => {
  it("creates a class, deriving the organization from the grade, publishing academic.class.created", async () => {
    const { svc, events, gradeId, curriculumId } = await service();
    const c = await svc.create({
      tenantId: TENANT,
      gradeId,
      academicYear: "2026-2027",
      name: "Grade 5",
      curriculumFrameworkId: curriculumId,
    });
    expect(c.organizationId).toBe(ORG);
    expect(c.curriculumFrameworkId).toBe(curriculumId);
    expect(events.map((e) => e.type)).toEqual(["academic.class.created"]);
    expect(await svc.listForGrade(TENANT, gradeId)).toHaveLength(1);
  });

  it("rejects an unknown grade, unknown curriculum and a duplicate class", async () => {
    const { svc, gradeId } = await service();
    await expect(
      svc.create({ tenantId: TENANT, gradeId: UNKNOWN, academicYear: "2026-2027", name: "X" }),
    ).rejects.toBeInstanceOf(GradeNotFoundError);
    await expect(
      svc.create({
        tenantId: TENANT,
        gradeId,
        academicYear: "2026-2027",
        name: "X",
        curriculumFrameworkId: UNKNOWN,
      }),
    ).rejects.toBeInstanceOf(CurriculumFrameworkNotFoundError);
    await svc.create({ tenantId: TENANT, gradeId, academicYear: "2026-2027", name: "Grade 5" });
    await expect(
      svc.create({ tenantId: TENANT, gradeId, academicYear: "2026-2027", name: "Grade 5" }),
    ).rejects.toBeInstanceOf(DuplicateClassError);
    // same name, different year is fine
    expect(
      await svc.create({ tenantId: TENANT, gradeId, academicYear: "2027-2028", name: "Grade 5" }),
    ).toBeDefined();
  });

  it("reassigns curriculum (validated), renames and reports a missing class", async () => {
    const { svc, gradeId, curriculumId } = await service();
    const c = await svc.create({ tenantId: TENANT, gradeId, academicYear: "2026-2027", name: "A" });
    const assigned = await svc.assignCurriculum(TENANT, c.id, curriculumId);
    expect(assigned.curriculumFrameworkId).toBe(curriculumId);
    await expect(svc.assignCurriculum(TENANT, c.id, UNKNOWN)).rejects.toBeInstanceOf(
      CurriculumFrameworkNotFoundError,
    );
    expect((await svc.assignCurriculum(TENANT, c.id, null)).curriculumFrameworkId).toBeNull();
    await expect(svc.getById(TENANT, UNKNOWN)).rejects.toBeInstanceOf(ClassNotFoundError);
  });
});
