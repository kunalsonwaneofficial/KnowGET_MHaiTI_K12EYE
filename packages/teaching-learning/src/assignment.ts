import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { AssignmentStatus, AssignmentSubmission, AssignmentType } from "./assignment-type";
import {
  AssignmentStateError,
  EmptyAssignmentFieldError,
  InvalidAssignmentWindowError,
} from "./errors";

/**
 * An assignment — homework, a project, practice, reading or collaborative work — scheduled to a
 * subject (and optionally a section), with a submission window and per-learner completion
 * tracking. **Evaluation and grading are an Assessment-platform (P2-D10) concern** and an
 * explicit non-goal: an assignment schedules and tracks work, it never scores it. Draft →
 * published → closed; submissions are recorded only while published. Structurally satisfies the
 * intelligence engine's assignment view.
 */
export interface Assignment {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subjectId: Uuid;
  readonly sectionId: Uuid | null;
  readonly lessonPlanId: Uuid | null;
  readonly title: string;
  readonly assignmentType: AssignmentType;
  readonly instructions: string | null;
  readonly assignedDate: string | null;
  readonly dueDate: string | null;
  readonly submissionOpensAt: string | null;
  readonly submissionClosesAt: string | null;
  readonly status: AssignmentStatus;
  readonly submissions: readonly AssignmentSubmission[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAssignmentParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subjectId: Uuid;
  readonly sectionId?: Uuid | null;
  readonly lessonPlanId?: Uuid | null;
  readonly title: string;
  readonly assignmentType: AssignmentType;
  readonly instructions?: string | null;
  readonly assignedDate?: string | null;
  readonly dueDate?: string | null;
  readonly submissionOpensAt?: string | null;
  readonly submissionClosesAt?: string | null;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyAssignmentFieldError(field);
  }
  return trimmed;
};

const assertWindowOrder = (opensAt: string | null, closesAt: string | null): void => {
  if (opensAt && closesAt && closesAt < opensAt) {
    throw new InvalidAssignmentWindowError(opensAt, closesAt);
  }
};

const touch = (assignment: Assignment, patch: Partial<Assignment>): Assignment => ({
  ...assignment,
  ...patch,
  updatedAt: nowIso(),
});

const assertNotClosed = (assignment: Assignment): void => {
  if (assignment.status === "closed") {
    throw new AssignmentStateError(assignment.id, "draft or published", assignment.status);
  }
};

/** Create a new draft assignment. */
export function createAssignment(params: CreateAssignmentParams): Assignment {
  assertWindowOrder(params.submissionOpensAt ?? null, params.submissionClosesAt ?? null);
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    subjectId: params.subjectId,
    sectionId: params.sectionId ?? null,
    lessonPlanId: params.lessonPlanId ?? null,
    title: requireText(params.title, "title"),
    assignmentType: params.assignmentType,
    instructions: params.instructions?.trim() || null,
    assignedDate: params.assignedDate ?? null,
    dueDate: params.dueDate ?? null,
    submissionOpensAt: params.submissionOpensAt ?? null,
    submissionClosesAt: params.submissionClosesAt ?? null,
    status: "draft",
    submissions: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Rename the assignment. Not permitted once closed. */
export function renameAssignment(assignment: Assignment, title: string): Assignment {
  assertNotClosed(assignment);
  return touch(assignment, { title: requireText(title, "title") });
}

/** Set (or clear) the assignment instructions. Not permitted once closed. */
export function setAssignmentInstructions(
  assignment: Assignment,
  instructions: string | null,
): Assignment {
  assertNotClosed(assignment);
  return touch(assignment, { instructions: instructions?.trim() || null });
}

/** Set (or clear) the assigned and due dates. Not permitted once closed. */
export function setAssignmentSchedule(
  assignment: Assignment,
  assignedDate: string | null,
  dueDate: string | null,
): Assignment {
  assertNotClosed(assignment);
  return touch(assignment, { assignedDate: assignedDate ?? null, dueDate: dueDate ?? null });
}

/** Set (or clear) the submission window. Not permitted once closed. */
export function setSubmissionWindow(
  assignment: Assignment,
  opensAt: string | null,
  closesAt: string | null,
): Assignment {
  assertNotClosed(assignment);
  assertWindowOrder(opensAt ?? null, closesAt ?? null);
  return touch(assignment, {
    submissionOpensAt: opensAt ?? null,
    submissionClosesAt: closesAt ?? null,
  });
}

/** Publish the assignment so it is distributed and submissions are tracked (draft → published). */
export function publishAssignment(assignment: Assignment): Assignment {
  if (assignment.status !== "draft") {
    throw new AssignmentStateError(assignment.id, "draft", assignment.status);
  }
  return touch(assignment, { status: "published" });
}

/**
 * Record (or replace) a learner's submission — completion tracking only, never a mark. Only
 * while the assignment is published; a subsequent record for the same learner supersedes the
 * previous one.
 */
export function recordAssignmentSubmission(
  assignment: Assignment,
  submission: AssignmentSubmission,
): Assignment {
  if (assignment.status !== "published") {
    throw new AssignmentStateError(assignment.id, "published", assignment.status);
  }
  const others = assignment.submissions.filter((s) => s.studentId !== submission.studentId);
  return touch(assignment, { submissions: [...others, submission] });
}

/** Close the assignment (published → closed). Terminal. */
export function closeAssignment(assignment: Assignment): Assignment {
  if (assignment.status !== "published") {
    throw new AssignmentStateError(assignment.id, "published", assignment.status);
  }
  return touch(assignment, { status: "closed" });
}
