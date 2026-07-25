import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyLearningOutcomeFieldError } from "./errors";

/** A level of Bloom's revised taxonomy, from lower- to higher-order thinking. */
export type BloomLevel = "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";

/** The lifecycle of a learning outcome. */
export type LearningOutcomeStatus = "active" | "archived";

/**
 * A learning outcome — a statement of what a learner should know or be able to do,
 * attached to a Subject. Carries a Bloom's-taxonomy level, a competency mapping, an
 * alignment to a curriculum framework and to assessment methods, and a version counter
 * that increments on every change. One per (subject, code). This is the semantic
 * foundation that teaching and assessment domains consume.
 */
export interface LearningOutcome {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subjectId: Uuid;
  readonly code: string;
  readonly statement: string;
  readonly bloomLevel: BloomLevel | null;
  readonly competencies: readonly string[];
  readonly curriculumFrameworkId: Uuid | null;
  readonly assessmentAlignment: readonly string[];
  readonly version: number;
  readonly status: LearningOutcomeStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateLearningOutcomeParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subjectId: Uuid;
  readonly code: string;
  readonly statement: string;
  readonly bloomLevel?: BloomLevel | null;
  readonly curriculumFrameworkId?: Uuid | null;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyLearningOutcomeFieldError(field);
  }
  return trimmed;
};

const normalizeList = (items: readonly string[]): string[] => [
  ...new Set(items.map((i) => i.trim()).filter((i) => i.length > 0)),
];

/** Define a new, active learning outcome at version 1. */
export function createLearningOutcome(params: CreateLearningOutcomeParams): LearningOutcome {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    subjectId: params.subjectId,
    code: requireText(params.code, "code"),
    statement: requireText(params.statement, "statement"),
    bloomLevel: params.bloomLevel ?? null,
    competencies: [],
    curriculumFrameworkId: params.curriculumFrameworkId ?? null,
    assessmentAlignment: [],
    version: 1,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

/** Every mutation bumps the version — the outcome's version history is its change count. */
const bump = (outcome: LearningOutcome, patch: Partial<LearningOutcome>): LearningOutcome => ({
  ...outcome,
  ...patch,
  version: outcome.version + 1,
  updatedAt: nowIso(),
});

/** Revise the outcome statement. */
export const setOutcomeStatement = (outcome: LearningOutcome, statement: string): LearningOutcome =>
  bump(outcome, { statement: requireText(statement, "statement") });

/** Set (or clear) the Bloom's-taxonomy level. */
export const setBloomLevel = (
  outcome: LearningOutcome,
  bloomLevel: BloomLevel | null,
): LearningOutcome => bump(outcome, { bloomLevel });

/** Set the competency mapping (trimmed, non-empty, deduplicated). */
export const setCompetencies = (
  outcome: LearningOutcome,
  competencies: readonly string[],
): LearningOutcome => bump(outcome, { competencies: normalizeList(competencies) });

/** Set (or clear) the aligned curriculum framework. */
export const setCurriculumAlignment = (
  outcome: LearningOutcome,
  curriculumFrameworkId: Uuid | null,
): LearningOutcome => bump(outcome, { curriculumFrameworkId });

/** Set the assessment-method alignment (trimmed, non-empty, deduplicated). */
export const setAssessmentAlignment = (
  outcome: LearningOutcome,
  methods: readonly string[],
): LearningOutcome => bump(outcome, { assessmentAlignment: normalizeList(methods) });

/** Archive the outcome. */
export const archiveLearningOutcome = (outcome: LearningOutcome): LearningOutcome =>
  bump(outcome, { status: "archived" });

/** Reactivate an archived outcome. */
export const activateLearningOutcome = (outcome: LearningOutcome): LearningOutcome =>
  bump(outcome, { status: "active" });
