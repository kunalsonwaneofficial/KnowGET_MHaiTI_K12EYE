import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  LessonPlanArchivedError,
  LessonPlanStateError,
  SubjectNotFoundForTeachingError,
} from "./errors";
import { LessonPlanService } from "./lesson-plan-service";
import { LESSON_PLANNED } from "./teaching-learning-events";
import {
  InMemoryLessonPlanRepository,
  type OrganizationDirectory,
  type SubjectDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;
const SUBJECT = "subj-1" as Uuid;

const allow = (allowed: readonly string[]) => ({
  exists: async (_t: TenantId, id: Uuid) => allowed.includes(id),
});

describe("LessonPlanService", () => {
  let repository: InMemoryLessonPlanRepository;
  let events: DomainEvent[];
  let service: LessonPlanService;

  beforeEach(() => {
    repository = new InMemoryLessonPlanRepository();
    events = [];
    service = new LessonPlanService({
      repository,
      organizations: allow([ORG]) as OrganizationDirectory,
      subjects: allow([SUBJECT]) as SubjectDirectory,
      events: { publish: async (e) => void events.push(e) },
    });
  });

  const create = () =>
    service.create({
      tenantId: TENANT,
      organizationId: ORG,
      subjectId: SUBJECT,
      title: "Adding fractions",
      learningOutcomeIds: ["o1" as Uuid],
    });

  it("creates a draft lesson and emits the planned event", async () => {
    const plan = await create();
    expect(plan.status).toBe("draft");
    expect(plan.version).toBe(1);
    expect(events.map((e) => e.type)).toEqual([LESSON_PLANNED]);
  });

  it("rejects an unknown subject", async () => {
    await expect(
      service.create({
        tenantId: TENANT,
        organizationId: ORG,
        subjectId: "ghost" as Uuid,
        title: "X",
      }),
    ).rejects.toBeInstanceOf(SubjectNotFoundForTeachingError);
  });

  it("runs submit → approve and freezes content edits once approved", async () => {
    const plan = await create();
    await service.submitForReview(TENANT, plan.id);
    const approved = await service.approve(TENANT, plan.id);
    expect(approved.status).toBe("approved");
    await expect(service.setObjectives(TENANT, plan.id, ["new"])).rejects.toBeInstanceOf(
      LessonPlanStateError,
    );
  });

  it("revises an approved lesson to a new version back in draft", async () => {
    const plan = await create();
    await service.submitForReview(TENANT, plan.id);
    await service.approve(TENANT, plan.id);
    const revised = await service.revise(TENANT, plan.id, "clarify objective");
    expect(revised.version).toBe(2);
    expect(revised.status).toBe("draft");
    expect(revised.revisions).toHaveLength(1);
  });

  it("cannot approve straight from draft (must be in review)", async () => {
    const plan = await create();
    await expect(service.approve(TENANT, plan.id)).rejects.toBeInstanceOf(LessonPlanStateError);
  });

  it("freezes an archived lesson", async () => {
    const plan = await create();
    await service.archive(TENANT, plan.id);
    await expect(service.rename(TENANT, plan.id, "New")).rejects.toBeInstanceOf(
      LessonPlanArchivedError,
    );
  });
});
