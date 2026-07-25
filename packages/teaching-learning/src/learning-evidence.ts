import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyLearningEvidenceFieldError } from "./errors";
import type { InstructionalActivityKind, LearningEvidenceType } from "./learning-evidence-type";

/**
 * A captured piece of evidence that learning happened — a student submission, a classroom
 * observation, an activity completion, a portfolio artifact or practical work. Every record is
 * about a Student (P2-D03) and is **linked to the instructional activity** (a lesson plan,
 * classroom session or assignment) that produced it, so learning is always traceable back to
 * the instruction — the P2-D09 definition of done. Descriptive only: it is never a grade or a
 * mark (that is the Assessment platform's).
 */
export interface LearningEvidence {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly evidenceType: LearningEvidenceType;
  readonly activityKind: InstructionalActivityKind;
  readonly activityId: Uuid;
  readonly subjectId: Uuid | null;
  readonly learningOutcomeIds: readonly Uuid[];
  readonly title: string;
  readonly description: string | null;
  readonly capturedAt: string;
  readonly capturedBy: Uuid | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateLearningEvidenceParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly evidenceType: LearningEvidenceType;
  readonly activityKind: InstructionalActivityKind;
  readonly activityId: Uuid;
  readonly title: string;
  readonly subjectId?: Uuid | null;
  readonly learningOutcomeIds?: readonly Uuid[];
  readonly description?: string | null;
  readonly capturedAt?: string | null;
  readonly capturedBy?: Uuid | null;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyLearningEvidenceFieldError(field);
  }
  return trimmed;
};

const touch = (evidence: LearningEvidence, patch: Partial<LearningEvidence>): LearningEvidence => ({
  ...evidence,
  ...patch,
  updatedAt: nowIso(),
});

/** Capture a new piece of learning evidence. `capturedAt` defaults to now when not supplied. */
export function createLearningEvidence(params: CreateLearningEvidenceParams): LearningEvidence {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    evidenceType: params.evidenceType,
    activityKind: params.activityKind,
    activityId: params.activityId,
    subjectId: params.subjectId ?? null,
    learningOutcomeIds: params.learningOutcomeIds ? [...params.learningOutcomeIds] : [],
    title: requireText(params.title, "title"),
    description: params.description?.trim() || null,
    capturedAt: params.capturedAt?.trim() || now,
    capturedBy: params.capturedBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Amend the evidence description. */
export function amendEvidenceDescription(
  evidence: LearningEvidence,
  description: string | null,
): LearningEvidence {
  return touch(evidence, { description: description?.trim() || null });
}

/** Replace the outcomes the evidence demonstrates. */
export function setEvidenceOutcomes(
  evidence: LearningEvidence,
  outcomeIds: readonly Uuid[],
): LearningEvidence {
  return touch(evidence, { learningOutcomeIds: [...outcomeIds] });
}
