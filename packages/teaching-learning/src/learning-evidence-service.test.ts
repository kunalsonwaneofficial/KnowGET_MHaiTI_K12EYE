import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { InstructionalActivityNotFoundError, StudentNotFoundForTeachingError } from "./errors";
import { LearningEvidenceService } from "./learning-evidence-service";
import { LEARNING_EVIDENCE_CAPTURED } from "./teaching-learning-events";
import {
  InMemoryAssignmentRepository,
  InMemoryLearningEvidenceRepository,
  type OrganizationDirectory,
  type StudentDirectory,
} from "./ports";
import { AssignmentService } from "./assignment-service";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;
const SUBJECT = "subj-1" as Uuid;
const STUDENT = "stu-1" as Uuid;

const allow = (allowed: readonly string[]) => ({
  exists: async (_t: TenantId, id: Uuid) => allowed.includes(id),
});

describe("LearningEvidenceService", () => {
  let assignments: InMemoryAssignmentRepository;
  let events: DomainEvent[];
  let service: LearningEvidenceService;
  let assignmentId: Uuid;

  beforeEach(async () => {
    assignments = new InMemoryAssignmentRepository();
    events = [];
    // seed a real assignment to link evidence to
    const assignmentService = new AssignmentService({
      repository: assignments,
      organizations: allow([ORG]) as OrganizationDirectory,
      subjects: allow([SUBJECT]) as never,
    });
    const assignment = await assignmentService.create({
      tenantId: TENANT,
      organizationId: ORG,
      subjectId: SUBJECT,
      title: "Essay",
      assignmentType: "project",
    });
    assignmentId = assignment.id;
    service = new LearningEvidenceService({
      repository: new InMemoryLearningEvidenceRepository(),
      organizations: allow([ORG]) as OrganizationDirectory,
      students: allow([STUDENT]) as StudentDirectory,
      assignments,
      events: { publish: async (e) => void events.push(e) },
    });
  });

  it("captures evidence linked to a validated activity and emits the event", async () => {
    const evidence = await service.capture({
      tenantId: TENANT,
      organizationId: ORG,
      studentId: STUDENT,
      evidenceType: "submission",
      activityKind: "assignment",
      activityId: assignmentId,
      title: "Submitted essay",
    });
    expect(evidence.studentId).toBe(STUDENT);
    expect(evidence.activityId).toBe(assignmentId);
    expect(events.map((e) => e.type)).toEqual([LEARNING_EVIDENCE_CAPTURED]);
  });

  it("rejects evidence for an unknown student", async () => {
    await expect(
      service.capture({
        tenantId: TENANT,
        organizationId: ORG,
        studentId: "ghost" as Uuid,
        evidenceType: "observation",
        activityKind: "assignment",
        activityId: assignmentId,
        title: "X",
      }),
    ).rejects.toBeInstanceOf(StudentNotFoundForTeachingError);
  });

  it("rejects evidence linked to a non-existent activity", async () => {
    await expect(
      service.capture({
        tenantId: TENANT,
        organizationId: ORG,
        studentId: STUDENT,
        evidenceType: "submission",
        activityKind: "assignment",
        activityId: "ghost" as Uuid,
        title: "X",
      }),
    ).rejects.toBeInstanceOf(InstructionalActivityNotFoundError);
  });
});
