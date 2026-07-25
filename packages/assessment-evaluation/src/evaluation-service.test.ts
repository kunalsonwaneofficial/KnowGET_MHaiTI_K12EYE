import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { createAssessment } from "./assessment";
import { EVALUATION_APPROVED, EVALUATION_SUBMITTED } from "./assessment-evaluation-events";
import {
  AssessmentNotFoundForEvaluationError,
  DuplicateEvaluationError,
  EvaluationStateError,
  StudentNotFoundForAssessmentError,
} from "./errors";
import { EvaluationService } from "./evaluation-service";
import {
  InMemoryAssessmentRepository,
  InMemoryEvaluationRepository,
  type StudentDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;
const SUBJECT = "subj-1" as Uuid;
const STUDENT = "stu-1" as Uuid;

const allow = (allowed: readonly string[]): StudentDirectory => ({
  exists: async (_t, id) => allowed.includes(id),
});

describe("EvaluationService", () => {
  let evaluations: InMemoryEvaluationRepository;
  let assessments: InMemoryAssessmentRepository;
  let events: DomainEvent[];
  let service: EvaluationService;
  let assessmentId: Uuid;

  beforeEach(async () => {
    evaluations = new InMemoryEvaluationRepository();
    assessments = new InMemoryAssessmentRepository();
    events = [];
    const assessment = createAssessment({
      tenantId: TENANT,
      organizationId: ORG,
      subjectId: SUBJECT,
      assessmentType: "summative",
      title: "Exam",
      maximumMarks: 50,
    });
    await assessments.save(assessment);
    assessmentId = assessment.id;
    service = new EvaluationService({
      repository: evaluations,
      assessments,
      students: allow([STUDENT]),
      events: { publish: async (e) => void events.push(e) },
    });
  });

  const create = () => service.create({ tenantId: TENANT, assessmentId, studentId: STUDENT });

  it("rejects an evaluation for an unknown assessment or student", async () => {
    await expect(
      service.create({ tenantId: TENANT, assessmentId: "ghost" as Uuid, studentId: STUDENT }),
    ).rejects.toBeInstanceOf(AssessmentNotFoundForEvaluationError);
    await expect(
      service.create({ tenantId: TENANT, assessmentId, studentId: "ghost" as Uuid }),
    ).rejects.toBeInstanceOf(StudentNotFoundForAssessmentError);
  });

  it("enforces one evaluation per (assessment, student)", async () => {
    await create();
    await expect(create()).rejects.toBeInstanceOf(DuplicateEvaluationError);
  });

  it("records marks (computing percentage), submits, approves and reopens", async () => {
    const evaluation = await create();
    const marked = await service.recordMarks(TENANT, evaluation.id, 40);
    expect(marked.percentage).toBe(80); // 40 / 50
    await service.submit(TENANT, evaluation.id);
    const approved = await service.approve(TENANT, evaluation.id);
    expect(approved.status).toBe("approved");
    expect(events.map((e) => e.type)).toEqual([EVALUATION_SUBMITTED, EVALUATION_APPROVED]);

    const reopened = await service.reopen(TENANT, evaluation.id, null, "re-check");
    expect(reopened.status).toBe("draft");
    expect(reopened.version).toBe(2);
    // full workflow reconstructable from the audit history
    expect(reopened.history.map((h) => h.action)).toEqual([
      "created",
      "marks_recorded",
      "submitted",
      "approved",
      "reopened",
    ]);
  });

  it("cannot approve straight from draft", async () => {
    const evaluation = await create();
    await expect(service.approve(TENANT, evaluation.id)).rejects.toBeInstanceOf(
      EvaluationStateError,
    );
  });
});
