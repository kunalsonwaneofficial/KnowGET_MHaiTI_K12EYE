import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type {
  EvaluationEntry,
  EvaluationStatus,
  EvaluationType,
  RubricScore,
} from "./evaluation-value";
import { EvaluationStateError } from "./errors";
import { computePercentage } from "./grading";

/**
 * The evaluation of one student's assessment — the auditable marking workflow. Marks (or rubric
 * scores) are recorded while a draft, then the evaluation runs draft → submitted → moderated →
 * approved, every transition appended to an immutable history. An approved evaluation may be
 * **reopened** for re-evaluation (recorded, version bumped), so results are always traceable.
 * Structurally satisfies the intelligence engine's evaluation view (status + percentage).
 */
export interface Evaluation {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly assessmentId: Uuid;
  readonly studentId: Uuid;
  readonly evaluationType: EvaluationType;
  readonly maximumMarks: number;
  readonly marksAwarded: number | null;
  readonly percentage: number | null;
  readonly rubricScores: readonly RubricScore[];
  readonly remarks: string | null;
  readonly status: EvaluationStatus;
  readonly version: number;
  readonly history: readonly EvaluationEntry[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateEvaluationParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly assessmentId: Uuid;
  readonly studentId: Uuid;
  readonly maximumMarks: number;
  readonly evaluationType?: EvaluationType;
  readonly evaluatedBy?: Uuid | null;
}

const touch = (evaluation: Evaluation, patch: Partial<Evaluation>): Evaluation => ({
  ...evaluation,
  ...patch,
  updatedAt: nowIso(),
});

const entry = (action: string, actor: Uuid | null, note: string | null): EvaluationEntry => ({
  action,
  actor,
  at: nowIso(),
  note,
});

const assertDraft = (evaluation: Evaluation): void => {
  if (evaluation.status !== "draft") {
    throw new EvaluationStateError(evaluation.id, "draft", evaluation.status);
  }
};

/** Create a new draft evaluation. */
export function createEvaluation(params: CreateEvaluationParams): Evaluation {
  const now = nowIso();
  const actor = params.evaluatedBy ?? null;
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    assessmentId: params.assessmentId,
    studentId: params.studentId,
    evaluationType: params.evaluationType ?? "manual",
    maximumMarks: params.maximumMarks,
    marksAwarded: null,
    percentage: null,
    rubricScores: [],
    remarks: null,
    status: "draft",
    version: 1,
    history: [{ action: "created", actor, at: now, note: null }],
    createdAt: now,
    updatedAt: now,
  };
}

/** Record marks awarded, computing the percentage against the maximum. Only while a draft. */
export function recordMarks(
  evaluation: Evaluation,
  marksAwarded: number,
  actor: Uuid | null = null,
): Evaluation {
  assertDraft(evaluation);
  const marks = Math.max(0, marksAwarded);
  return touch(evaluation, {
    marksAwarded: marks,
    percentage: computePercentage(marks, evaluation.maximumMarks),
    history: [...evaluation.history, entry("marks_recorded", actor, null)],
  });
}

/**
 * Record rubric scores and derive the total marks (and percentage). Only while a draft; moves
 * the evaluation to rubric-based.
 */
export function recordRubricScores(
  evaluation: Evaluation,
  rubricScores: readonly RubricScore[],
  actor: Uuid | null = null,
): Evaluation {
  assertDraft(evaluation);
  const total = rubricScores.reduce((sum, s) => sum + Math.max(0, s.score), 0);
  return touch(evaluation, {
    evaluationType: "rubric_based",
    rubricScores: [...rubricScores],
    marksAwarded: total,
    percentage: computePercentage(total, evaluation.maximumMarks),
    history: [...evaluation.history, entry("rubric_scored", actor, null)],
  });
}

/** Set (or clear) the evaluation remarks. Only while a draft. */
export function amendEvaluationRemarks(evaluation: Evaluation, remarks: string | null): Evaluation {
  assertDraft(evaluation);
  return touch(evaluation, { remarks: remarks?.trim() || null });
}

/** Submit the evaluation for moderation/approval (draft → submitted). */
export function submitEvaluation(evaluation: Evaluation, actor: Uuid | null = null): Evaluation {
  if (evaluation.status !== "draft") {
    throw new EvaluationStateError(evaluation.id, "draft", evaluation.status);
  }
  return touch(evaluation, {
    status: "submitted",
    history: [...evaluation.history, entry("submitted", actor, null)],
  });
}

/** Moderate a submitted evaluation (submitted → moderated). */
export function moderateEvaluation(
  evaluation: Evaluation,
  actor: Uuid | null = null,
  note: string | null = null,
): Evaluation {
  if (evaluation.status !== "submitted") {
    throw new EvaluationStateError(evaluation.id, "submitted", evaluation.status);
  }
  return touch(evaluation, {
    status: "moderated",
    history: [...evaluation.history, entry("moderated", actor, note?.trim() || null)],
  });
}

/** Approve a submitted or moderated evaluation (→ approved). Final sign-off. */
export function approveEvaluation(
  evaluation: Evaluation,
  actor: Uuid | null = null,
  note: string | null = null,
): Evaluation {
  if (evaluation.status !== "submitted" && evaluation.status !== "moderated") {
    throw new EvaluationStateError(evaluation.id, "submitted or moderated", evaluation.status);
  }
  return touch(evaluation, {
    status: "approved",
    history: [...evaluation.history, entry("approved", actor, note?.trim() || null)],
  });
}

/**
 * Reopen an approved evaluation for re-evaluation — bump the version, record the reopen in the
 * history, and return it to draft so marks can be revised and re-approved.
 */
export function reopenEvaluation(
  evaluation: Evaluation,
  actor: Uuid | null = null,
  note: string | null = null,
): Evaluation {
  if (evaluation.status !== "approved") {
    throw new EvaluationStateError(evaluation.id, "approved", evaluation.status);
  }
  return touch(evaluation, {
    status: "draft",
    version: evaluation.version + 1,
    history: [...evaluation.history, entry("reopened", actor, note?.trim() || null)],
  });
}
