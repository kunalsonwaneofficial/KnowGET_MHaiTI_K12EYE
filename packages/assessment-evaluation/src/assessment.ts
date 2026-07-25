import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type {
  AssessmentStatus,
  AssessmentType,
  DeliveryMode,
  EvaluationStrategy,
  RubricCriterion,
} from "./assessment-value";
import { AssessmentStateError, EmptyAssessmentFieldError } from "./errors";

/**
 * An individual assessment — a formative/summative/diagnostic/CCE/CBE/project/practical/oral/
 * portfolio/observation/board/institution assessment of a subject, carrying the outcomes and
 * competencies it measures, its maximum marks, an optional rubric, its evaluation strategy and
 * delivery mode. Draft → published → in_progress → completed, or cancelled; content is finalised
 * at publication (editable only while a draft). Structurally satisfies the intelligence engine's
 * assessment view.
 */
export interface Assessment {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subjectId: Uuid;
  readonly frameworkId: Uuid | null;
  readonly planId: Uuid | null;
  readonly assessmentType: AssessmentType;
  readonly title: string;
  readonly learningOutcomeIds: readonly Uuid[];
  readonly competencies: readonly string[];
  readonly maximumMarks: number;
  readonly rubric: readonly RubricCriterion[];
  readonly evaluationStrategy: EvaluationStrategy;
  readonly deliveryMode: DeliveryMode;
  readonly status: AssessmentStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAssessmentParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subjectId: Uuid;
  readonly assessmentType: AssessmentType;
  readonly title: string;
  readonly frameworkId?: Uuid | null;
  readonly planId?: Uuid | null;
  readonly learningOutcomeIds?: readonly Uuid[];
  readonly competencies?: readonly string[];
  readonly maximumMarks?: number;
  readonly rubric?: readonly RubricCriterion[];
  readonly evaluationStrategy?: EvaluationStrategy;
  readonly deliveryMode?: DeliveryMode;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyAssessmentFieldError(field);
  }
  return trimmed;
};

const nonNegative = (value: number | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;

const touch = (assessment: Assessment, patch: Partial<Assessment>): Assessment => ({
  ...assessment,
  ...patch,
  updatedAt: nowIso(),
});

/** Content is editable only while the assessment is a draft (finalised at publication). */
const assertDraft = (assessment: Assessment): void => {
  if (assessment.status !== "draft") {
    throw new AssessmentStateError(assessment.id, "draft", assessment.status);
  }
};

/** Create a new draft assessment. */
export function createAssessment(params: CreateAssessmentParams): Assessment {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    subjectId: params.subjectId,
    frameworkId: params.frameworkId ?? null,
    planId: params.planId ?? null,
    assessmentType: params.assessmentType,
    title: requireText(params.title, "title"),
    learningOutcomeIds: params.learningOutcomeIds ? [...params.learningOutcomeIds] : [],
    competencies: params.competencies ? [...params.competencies] : [],
    maximumMarks: nonNegative(params.maximumMarks, 0),
    rubric: params.rubric ? [...params.rubric] : [],
    evaluationStrategy: params.evaluationStrategy ?? "manual",
    deliveryMode: params.deliveryMode ?? "offline",
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

/** Rename the assessment. Only while a draft. */
export function renameAssessment(assessment: Assessment, title: string): Assessment {
  assertDraft(assessment);
  return touch(assessment, { title: requireText(title, "title") });
}

/** Replace the outcomes the assessment measures. Only while a draft. */
export function setAssessmentOutcomes(
  assessment: Assessment,
  outcomeIds: readonly Uuid[],
): Assessment {
  assertDraft(assessment);
  return touch(assessment, { learningOutcomeIds: [...outcomeIds] });
}

/** Replace the competencies the assessment measures. Only while a draft. */
export function setAssessmentCompetencies(
  assessment: Assessment,
  competencies: readonly string[],
): Assessment {
  assertDraft(assessment);
  return touch(assessment, { competencies: [...competencies] });
}

/** Set the maximum marks. Only while a draft. */
export function setMaximumMarks(assessment: Assessment, maximumMarks: number): Assessment {
  assertDraft(assessment);
  return touch(assessment, { maximumMarks: nonNegative(maximumMarks, 0) });
}

/** Replace the rubric. Only while a draft. */
export function setRubric(assessment: Assessment, rubric: readonly RubricCriterion[]): Assessment {
  assertDraft(assessment);
  return touch(assessment, { rubric: [...rubric] });
}

/** Publish the assessment, finalising its definition (draft → published). */
export function publishAssessment(assessment: Assessment): Assessment {
  if (assessment.status !== "draft") {
    throw new AssessmentStateError(assessment.id, "draft", assessment.status);
  }
  return touch(assessment, { status: "published" });
}

/** Start the assessment (published → in_progress). */
export function startAssessment(assessment: Assessment): Assessment {
  if (assessment.status !== "published") {
    throw new AssessmentStateError(assessment.id, "published", assessment.status);
  }
  return touch(assessment, { status: "in_progress" });
}

/** Complete the assessment (in_progress → completed). Terminal. */
export function completeAssessment(assessment: Assessment): Assessment {
  if (assessment.status !== "in_progress") {
    throw new AssessmentStateError(assessment.id, "in_progress", assessment.status);
  }
  return touch(assessment, { status: "completed" });
}

/** Cancel the assessment (from any non-terminal state). Terminal. */
export function cancelAssessment(assessment: Assessment): Assessment {
  if (assessment.status === "completed" || assessment.status === "cancelled") {
    throw new AssessmentStateError(
      assessment.id,
      "draft, published or in_progress",
      assessment.status,
    );
  }
  return touch(assessment, { status: "cancelled" });
}
