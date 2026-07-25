import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();

// --- Shared enums ----------------------------------------------------------------
const dimension = z.enum(["academic", "attendance", "engagement", "wellbeing", "progression"]);
const riskBand = z.enum(["on_track", "watch", "at_risk", "critical"]);
const signalSource = z.enum([
  "student_lifecycle",
  "wellbeing",
  "attendance_presence",
  "teaching_learning",
  "assessment_evaluation",
  "manual",
]);
const signalTrend = z.enum(["improving", "stable", "declining"]);
const insightCategory = z.enum(["strength", "gap", "trend", "risk", "opportunity"]);
const insightPriority = z.enum(["low", "medium", "high"]);
const recommendationCategory = z.enum([
  "instructional_support",
  "intervention",
  "enrichment",
  "wellbeing_support",
  "family_engagement",
  "monitoring",
]);
const cohortScopeType = z.enum(["organization", "grade", "section"]);
const goalOutcome = z.enum(["met", "missed"]);

// --- Shared value objects --------------------------------------------------------
/** A partial evidence reference (a signal fills the rest in). */
const signalEvidence = z.object({
  source: signalSource.optional(),
  kind: z.string().optional(),
  ref: uuid.nullable().optional(),
  detail: z.string().nullable().optional(),
});
/** A full evidence reference for a warning / insight / recommendation. */
const evidenceRef = z.object({
  source: signalSource,
  kind: z.string().default("reference"),
  ref: uuid.nullable().default(null),
  detail: z.string().nullable().default(null),
});
const goalInput = z.object({
  description: nonEmpty,
  targetDimension: dimension.optional(),
  note: z.string().optional(),
});

// --- Shared bodies ---------------------------------------------------------------
export const actorNoteSchema = z.object({
  actor: uuid.nullable().optional(),
  note: z.string().nullable().optional(),
});
export const deciderNoteSchema = z.object({
  decidedBy: uuid.nullable().optional(),
  note: z.string().nullable().optional(),
});
export const setPrioritySchema = z.object({ priority: insightPriority });

// --- Learning signal -------------------------------------------------------------
export const captureSignalSchema = z.object({
  organizationId: uuid,
  studentId: uuid,
  dimension,
  source: signalSource,
  metric: nonEmpty,
  value: z.number(),
  trend: signalTrend.optional(),
  observedAt: z.string().optional(),
  evidence: signalEvidence.optional(),
  note: z.string().optional(),
});

// --- Learner insight profile -----------------------------------------------------
export const ensureProfileSchema = z.object({ organizationId: uuid, studentId: uuid });

// --- Early warning ---------------------------------------------------------------
export const raiseWarningSchema = z.object({
  organizationId: uuid,
  studentId: uuid,
  dimension,
  ruleId: nonEmpty,
  severity: riskBand,
  observedScore: z.number(),
  rationale: nonEmpty,
  evidence: z.array(evidenceRef).optional(),
  raisedBy: uuid.nullable().optional(),
});

// --- Educational insight ---------------------------------------------------------
export const proposeInsightSchema = z.object({
  organizationId: uuid,
  studentId: uuid,
  category: insightCategory,
  title: nonEmpty,
  narrative: nonEmpty,
  dimension: dimension.optional(),
  priority: insightPriority.optional(),
  evidence: z.array(evidenceRef).optional(),
  proposedBy: uuid.nullable().optional(),
});
export const reviseInsightSchema = z.object({ title: nonEmpty, narrative: nonEmpty });

// --- Recommendation --------------------------------------------------------------
export const proposeRecommendationSchema = z.object({
  organizationId: uuid,
  studentId: uuid,
  category: recommendationCategory,
  action: nonEmpty,
  rationale: nonEmpty,
  priority: insightPriority.optional(),
  targetDimension: dimension.optional(),
  evidence: z.array(evidenceRef).optional(),
  proposedBy: uuid.nullable().optional(),
});
export const reviseRecommendationSchema = z.object({ action: nonEmpty, rationale: nonEmpty });

// --- Growth plan -----------------------------------------------------------------
export const createGrowthPlanSchema = z.object({
  organizationId: uuid,
  studentId: uuid,
  title: nonEmpty,
  focusDimension: dimension.optional(),
  goals: z.array(goalInput).optional(),
  sourceRecommendationIds: z.array(uuid).optional(),
});
export const setGoalsSchema = z.object({ goals: z.array(goalInput) });
export const linkRecommendationSchema = z.object({ recommendationId: uuid });
export const recordGoalOutcomeSchema = z.object({
  goalId: uuid,
  outcome: goalOutcome,
  note: nullableText.optional(),
  actor: uuid.nullable().optional(),
});

// --- Cohort insight --------------------------------------------------------------
export const createCohortSchema = z.object({
  organizationId: uuid,
  scopeType: cohortScopeType,
  scopeId: uuid,
  label: nonEmpty,
  memberStudentIds: z.array(uuid).optional(),
});
export const setMembersSchema = z.object({ memberStudentIds: z.array(uuid) });
