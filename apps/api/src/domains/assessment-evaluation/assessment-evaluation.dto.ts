import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();

// --- Shared enums ----------------------------------------------------------------
const assessmentModel = z.enum(["traditional", "cce", "cbe", "competency_based", "hybrid"]);
const assessmentPlanType = z.enum(["annual", "term", "unit", "classroom"]);
const assessmentType = z.enum([
  "formative",
  "summative",
  "diagnostic",
  "cce",
  "cbe",
  "project",
  "practical",
  "oral",
  "portfolio",
  "observation",
  "board",
  "institution",
]);
const evaluationStrategy = z.enum(["manual", "rubric_based"]);
const deliveryMode = z.enum(["offline", "online", "hybrid", "practical"]);
const questionType = z.enum([
  "mcq",
  "true_false",
  "short_answer",
  "long_answer",
  "practical",
  "oral",
  "match",
]);
const difficulty = z.enum(["easy", "medium", "hard"]);
const bloomLevel = z.enum(["remember", "understand", "apply", "analyze", "evaluate", "create"]);
const masteryLevel = z.enum([
  "not_assessed",
  "emerging",
  "developing",
  "proficient",
  "advanced",
  "mastered",
]);
const promotionDecision = z.enum(["pending", "promoted", "promoted_with_support", "retained"]);

// --- Shared value objects --------------------------------------------------------
const gradeBand = z.object({
  label: nonEmpty,
  minPercentage: z.number(),
  gpa: z.number().nullable().default(null),
});
const plannedAssessment = z.object({
  title: nonEmpty,
  assessmentType,
  date: z.string().nullable().default(null),
  scheduleSlotId: uuid.nullable().default(null),
});
const rubricCriterion = z.object({
  name: nonEmpty,
  maxScore: z.number(),
  descriptor: z.string().nullable().default(null),
});
const rubricScore = z.object({ criterion: nonEmpty, score: z.number() });
const gradeEntry = z.object({
  subjectId: uuid,
  marks: z.number(),
  maxMarks: z.number(),
  percentage: z.number(),
  grade: z.string().nullable().default(null),
  gpa: z.number().nullable().default(null),
  credits: z.number(),
});
const record = z.record(z.unknown());

// --- Shared bodies ---------------------------------------------------------------
export const renameTitleSchema = z.object({ title: nonEmpty });
export const renameNameSchema = z.object({ name: nonEmpty });
export const noteSchema = z.object({ note: nonEmpty });
export const stringListSchema = z.object({ items: z.array(z.string()) });
export const uuidListSchema = z.object({ ids: z.array(uuid) });
export const actorSchema = z.object({ actor: uuid.nullable().optional() });
export const actorNoteSchema = z.object({
  actor: uuid.nullable().optional(),
  note: z.string().nullable().optional(),
});

// --- Assessment framework --------------------------------------------------------
export const createFrameworkSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  name: nonEmpty,
  assessmentModel,
  weightageRules: record.optional(),
  gradeBands: z.array(gradeBand).optional(),
  competencyModel: z.array(z.string()).optional(),
  promotionCriteria: record.optional(),
});
export const setWeightageRulesSchema = z.object({ weightageRules: record });
export const setGradeBandsSchema = z.object({ gradeBands: z.array(gradeBand) });
export const setCompetencyModelSchema = z.object({ competencyModel: z.array(z.string()) });
export const setPromotionCriteriaSchema = z.object({ promotionCriteria: record });

// --- Assessment plan -------------------------------------------------------------
export const createPlanSchema = z.object({
  organizationId: uuid,
  planType: assessmentPlanType,
  title: nonEmpty,
  academicYear: z.string().optional(),
  term: z.string().optional(),
  subjectId: uuid.optional(),
  gradeId: uuid.optional(),
  plannedAssessments: z.array(plannedAssessment).optional(),
});
export const setPlannedAssessmentsSchema = z.object({
  plannedAssessments: z.array(plannedAssessment),
});

// --- Assessment ------------------------------------------------------------------
export const createAssessmentSchema = z.object({
  organizationId: uuid,
  subjectId: uuid,
  assessmentType,
  title: nonEmpty,
  frameworkId: uuid.optional(),
  planId: uuid.optional(),
  learningOutcomeIds: z.array(uuid).optional(),
  competencies: z.array(z.string()).optional(),
  maximumMarks: z.number().nonnegative().optional(),
  rubric: z.array(rubricCriterion).optional(),
  evaluationStrategy: evaluationStrategy.optional(),
  deliveryMode: deliveryMode.optional(),
});
export const setMaximumMarksSchema = z.object({ maximumMarks: z.number().nonnegative() });
export const setRubricSchema = z.object({ rubric: z.array(rubricCriterion) });

// --- Question bank ---------------------------------------------------------------
export const createQuestionBankSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  title: nonEmpty,
  subjectId: uuid.optional(),
});
export const questionInputSchema = z.object({
  text: nonEmpty,
  questionType,
  difficulty,
  bloomLevel: bloomLevel.nullable().optional(),
  marks: z.number().nonnegative().optional(),
  competencies: z.array(z.string()).optional(),
  learningOutcomeIds: z.array(uuid).optional(),
});

// --- Evaluation ------------------------------------------------------------------
export const createEvaluationSchema = z.object({
  assessmentId: uuid,
  studentId: uuid,
  evaluationType: evaluationStrategy.optional(),
  evaluatedBy: uuid.nullable().optional(),
});
export const recordMarksSchema = z.object({
  marksAwarded: z.number(),
  actor: uuid.nullable().optional(),
});
export const recordRubricScoresSchema = z.object({
  rubricScores: z.array(rubricScore),
  actor: uuid.nullable().optional(),
});
export const amendRemarksSchema = z.object({ remarks: nullableText });

// --- Competency profile ----------------------------------------------------------
export const ensureCompetencyProfileSchema = z.object({
  organizationId: uuid,
  studentId: uuid,
});
export const setMasterySchema = z.object({
  competencyId: nonEmpty,
  name: nonEmpty,
  masteryLevel,
  evidenceRefs: z.array(uuid).optional(),
  note: z.string().nullable().optional(),
});

// --- Academic record -------------------------------------------------------------
export const createAcademicRecordSchema = z.object({
  organizationId: uuid,
  studentId: uuid,
  academicYear: nonEmpty,
  term: nonEmpty,
  gradeEntries: z.array(gradeEntry).optional(),
});
export const setGradeEntriesSchema = z.object({ gradeEntries: z.array(gradeEntry) });
export const setPromotionDecisionSchema = z.object({ promotionDecision });
export const amendGradeEntriesSchema = z.object({
  gradeEntries: z.array(gradeEntry),
  reason: nonEmpty,
  amendedBy: uuid.nullable().optional(),
});
export const amendPromotionDecisionSchema = z.object({
  promotionDecision,
  reason: nonEmpty,
  amendedBy: uuid.nullable().optional(),
});
