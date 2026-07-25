import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AssessmentService } from "./assessment-service";
import {
  ASSESSMENT_COMPLETED,
  ASSESSMENT_PUBLISHED,
  ASSESSMENT_STARTED,
} from "./assessment-evaluation-events";
import { AssessmentStateError, SubjectNotFoundForAssessmentError } from "./errors";
import {
  InMemoryAssessmentRepository,
  type OrganizationDirectory,
  type SubjectDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;
const SUBJECT = "subj-1" as Uuid;

const allow = (allowed: readonly string[]) => ({
  exists: async (_t: TenantId, id: Uuid) => allowed.includes(id),
});

describe("AssessmentService", () => {
  let repository: InMemoryAssessmentRepository;
  let events: DomainEvent[];
  let service: AssessmentService;

  beforeEach(() => {
    repository = new InMemoryAssessmentRepository();
    events = [];
    service = new AssessmentService({
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
      assessmentType: "summative",
      title: "Term 1 Exam",
      maximumMarks: 100,
      learningOutcomeIds: ["o1" as Uuid],
    });

  it("rejects an assessment for an unknown subject", async () => {
    await expect(
      service.create({
        tenantId: TENANT,
        organizationId: ORG,
        subjectId: "ghost" as Uuid,
        assessmentType: "summative",
        title: "X",
      }),
    ).rejects.toBeInstanceOf(SubjectNotFoundForAssessmentError);
  });

  it("runs publish → start → complete, emitting each event", async () => {
    const assessment = await create();
    expect(assessment.status).toBe("draft");
    await service.publish(TENANT, assessment.id);
    await service.start(TENANT, assessment.id);
    const completed = await service.complete(TENANT, assessment.id);
    expect(completed.status).toBe("completed");
    expect(events.map((e) => e.type)).toEqual([
      ASSESSMENT_PUBLISHED,
      ASSESSMENT_STARTED,
      ASSESSMENT_COMPLETED,
    ]);
  });

  it("finalises content at publication (no edits once published)", async () => {
    const assessment = await create();
    await service.publish(TENANT, assessment.id);
    await expect(service.setMaximumMarks(TENANT, assessment.id, 50)).rejects.toBeInstanceOf(
      AssessmentStateError,
    );
  });

  it("cannot start straight from draft", async () => {
    const assessment = await create();
    await expect(service.start(TENANT, assessment.id)).rejects.toBeInstanceOf(AssessmentStateError);
  });
});
