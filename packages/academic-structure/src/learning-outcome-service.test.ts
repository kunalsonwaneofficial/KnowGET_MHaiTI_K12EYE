import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { createCurriculumFramework } from "./curriculum-framework";
import {
  CurriculumFrameworkNotFoundError,
  DuplicateLearningOutcomeError,
  LearningOutcomeNotFoundError,
  SubjectNotFoundError,
} from "./errors";
import { LearningOutcomeService } from "./learning-outcome-service";
import {
  InMemoryCurriculumFrameworkRepository,
  InMemoryLearningOutcomeRepository,
  InMemorySubjectRepository,
} from "./ports";
import { createSubject } from "./subject";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

async function service(): Promise<{
  svc: LearningOutcomeService;
  events: DomainEvent[];
  subjectId: Uuid;
  curriculumId: Uuid;
}> {
  const events: DomainEvent[] = [];
  const subjects = new InMemorySubjectRepository();
  const subject = createSubject({
    tenantId: TENANT,
    organizationId: ORG,
    name: "Mathematics",
    code: "MATH",
    kind: "mandatory",
  });
  await subjects.save(subject);
  const curricula = new InMemoryCurriculumFrameworkRepository();
  const curriculum = createCurriculumFramework({
    tenantId: TENANT,
    organizationId: ORG,
    name: "CBSE",
    code: "CBSE",
    board: "CBSE",
  });
  await curricula.save(curriculum);
  const svc = new LearningOutcomeService({
    repository: new InMemoryLearningOutcomeRepository(),
    subjects,
    curricula,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events, subjectId: subject.id, curriculumId: curriculum.id };
}

describe("LearningOutcomeService", () => {
  it("defines an outcome, deriving org from the subject, publishing academic.learning_outcome.defined", async () => {
    const { svc, events, subjectId, curriculumId } = await service();
    const o = await svc.create({
      tenantId: TENANT,
      subjectId,
      code: "LO-1",
      statement: "Solve linear equations",
      bloomLevel: "apply",
      curriculumFrameworkId: curriculumId,
    });
    expect(o.organizationId).toBe(ORG);
    expect(o.curriculumFrameworkId).toBe(curriculumId);
    expect(events.map((e) => e.type)).toEqual(["academic.learning_outcome.defined"]);
    expect(await svc.listForSubject(TENANT, subjectId)).toHaveLength(1);
  });

  it("rejects an unknown subject, unknown curriculum and a duplicate code", async () => {
    const { svc, subjectId } = await service();
    await expect(
      svc.create({ tenantId: TENANT, subjectId: UNKNOWN, code: "LO", statement: "x" }),
    ).rejects.toBeInstanceOf(SubjectNotFoundError);
    await expect(
      svc.create({
        tenantId: TENANT,
        subjectId,
        code: "LO",
        statement: "x",
        curriculumFrameworkId: UNKNOWN,
      }),
    ).rejects.toBeInstanceOf(CurriculumFrameworkNotFoundError);
    await svc.create({ tenantId: TENANT, subjectId, code: "LO-1", statement: "x" });
    await expect(
      svc.create({ tenantId: TENANT, subjectId, code: "LO-1", statement: "y" }),
    ).rejects.toBeInstanceOf(DuplicateLearningOutcomeError);
  });

  it("edits outcome (bumping version), validates curriculum alignment, reports a missing outcome", async () => {
    const { svc, subjectId, curriculumId } = await service();
    const o = await svc.create({ tenantId: TENANT, subjectId, code: "LO-1", statement: "x" });
    await svc.setCompetencies(TENANT, o.id, ["Reasoning"]);
    const aligned = await svc.setCurriculumAlignment(TENANT, o.id, curriculumId);
    expect(aligned.curriculumFrameworkId).toBe(curriculumId);
    expect(aligned.version).toBe(3); // define + competencies + alignment
    await expect(svc.setCurriculumAlignment(TENANT, o.id, UNKNOWN)).rejects.toBeInstanceOf(
      CurriculumFrameworkNotFoundError,
    );
    await expect(svc.getById(TENANT, UNKNOWN)).rejects.toBeInstanceOf(LearningOutcomeNotFoundError);
  });
});
