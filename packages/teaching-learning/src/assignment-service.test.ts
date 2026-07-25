import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AssignmentService } from "./assignment-service";
import {
  AssignmentStateError,
  InvalidAssignmentWindowError,
  SubjectNotFoundForTeachingError,
} from "./errors";
import { ASSIGNMENT_PUBLISHED, ASSIGNMENT_SUBMITTED } from "./teaching-learning-events";
import {
  InMemoryAssignmentRepository,
  type OrganizationDirectory,
  type SubjectDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;
const SUBJECT = "subj-1" as Uuid;

const allow = (allowed: readonly string[]) => ({
  exists: async (_t: TenantId, id: Uuid) => allowed.includes(id),
});

describe("AssignmentService", () => {
  let repository: InMemoryAssignmentRepository;
  let events: DomainEvent[];
  let service: AssignmentService;

  beforeEach(() => {
    repository = new InMemoryAssignmentRepository();
    events = [];
    service = new AssignmentService({
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
      title: "Fractions homework",
      assignmentType: "homework",
    });

  it("rejects an unknown subject", async () => {
    await expect(
      service.create({
        tenantId: TENANT,
        organizationId: ORG,
        subjectId: "ghost" as Uuid,
        title: "X",
        assignmentType: "homework",
      }),
    ).rejects.toBeInstanceOf(SubjectNotFoundForTeachingError);
  });

  it("rejects an inverted submission window", async () => {
    await expect(
      service.create({
        tenantId: TENANT,
        organizationId: ORG,
        subjectId: SUBJECT,
        title: "X",
        assignmentType: "homework",
        submissionOpensAt: "2026-09-20",
        submissionClosesAt: "2026-09-10",
      }),
    ).rejects.toBeInstanceOf(InvalidAssignmentWindowError);
  });

  it("publishes, tracks a submission (upserting per learner), then closes", async () => {
    const assignment = await create();
    await expect(
      service.recordSubmission(TENANT, assignment.id, {
        studentId: "s1" as Uuid,
        status: "submitted",
      }),
    ).rejects.toBeInstanceOf(AssignmentStateError); // not yet published

    await service.publish(TENANT, assignment.id);
    await service.recordSubmission(TENANT, assignment.id, {
      studentId: "s1" as Uuid,
      status: "missing",
    });
    const updated = await service.recordSubmission(TENANT, assignment.id, {
      studentId: "s1" as Uuid,
      status: "submitted",
      submittedAt: "2026-09-18",
    });
    // upsert: one record for s1, latest status wins
    expect(updated.submissions).toHaveLength(1);
    expect(updated.submissions[0]?.status).toBe("submitted");

    const closed = await service.close(TENANT, assignment.id);
    expect(closed.status).toBe("closed");

    expect(events.map((e) => e.type)).toEqual([
      ASSIGNMENT_PUBLISHED,
      ASSIGNMENT_SUBMITTED,
      ASSIGNMENT_SUBMITTED,
    ]);
  });
});
