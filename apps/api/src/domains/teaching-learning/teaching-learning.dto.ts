import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();

// --- Shared enums ----------------------------------------------------------------
const academicPlanType = z.enum(["annual", "term", "department", "subject"]);
const resourceType = z.enum([
  "document",
  "presentation",
  "video",
  "interactive",
  "external_reference",
  "ai_generated",
]);
const assignmentType = z.enum(["homework", "project", "practice", "reading", "collaborative"]);
const submissionStatus = z.enum(["submitted", "late", "missing"]);
const evidenceType = z.enum([
  "submission",
  "observation",
  "activity_completion",
  "portfolio_artifact",
  "practical_work",
]);
const activityKind = z.enum(["lesson_plan", "classroom_session", "assignment"]);
const participationSummary = z.object({
  expected: z.number().int().nonnegative(),
  engaged: z.number().int().nonnegative(),
});

// --- Shared bodies ---------------------------------------------------------------
export const renameSchema = z.object({ title: nonEmpty });
export const noteSchema = z.object({ note: nonEmpty });
export const stringListSchema = z.object({ items: z.array(z.string()) });
export const uuidListSchema = z.object({ ids: z.array(uuid) });

// --- Academic plan ---------------------------------------------------------------
export const createAcademicPlanSchema = z.object({
  organizationId: uuid,
  planType: academicPlanType,
  code: nonEmpty,
  title: nonEmpty,
  academicYear: z.string().optional(),
  term: z.string().optional(),
  subjectId: uuid.optional(),
  objectives: z.array(z.string()).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});
export const setObjectivesSchema = z.object({ objectives: z.array(z.string()) });
export const setPeriodSchema = z.object({ fromDate: nullableText, toDate: nullableText });

// --- Unit plan -------------------------------------------------------------------
export const createUnitPlanSchema = z.object({
  organizationId: uuid,
  subjectId: uuid,
  academicPlanId: uuid.optional(),
  title: nonEmpty,
  sequence: z.number().int().nonnegative().optional(),
  curriculumFrameworkId: uuid.optional(),
  learningOutcomeIds: z.array(uuid).optional(),
  competencies: z.array(z.string()).optional(),
  estimatedInstructionalHours: z.number().nonnegative().optional(),
  assessmentStrategy: z.string().optional(),
});
export const setEstimatedHoursSchema = z.object({ hours: z.number().nonnegative() });
export const setAssessmentStrategySchema = z.object({ assessmentStrategy: nullableText });

// --- Lesson plan -----------------------------------------------------------------
export const createLessonPlanSchema = z.object({
  organizationId: uuid,
  subjectId: uuid,
  unitPlanId: uuid.optional(),
  title: nonEmpty,
  objectives: z.array(z.string()).optional(),
  learningOutcomeIds: z.array(uuid).optional(),
  teachingStrategies: z.array(z.string()).optional(),
  learningActivities: z.array(z.string()).optional(),
  assessmentCheckpoints: z.array(z.string()).optional(),
  requiredResourceIds: z.array(uuid).optional(),
  differentiationStrategies: z.array(z.string()).optional(),
  reflectionNotes: z.string().optional(),
});
export const setReflectionNotesSchema = z.object({ notes: nullableText });

// --- Learning resource -----------------------------------------------------------
export const createLearningResourceSchema = z.object({
  organizationId: uuid,
  title: nonEmpty,
  resourceType,
  description: z.string().optional(),
  url: z.string().optional(),
  tags: z.array(z.string()).optional(),
  subjectId: uuid.optional(),
  learningOutcomeIds: z.array(uuid).optional(),
});
export const setDescriptionSchema = z.object({ description: nullableText });
export const setUrlSchema = z.object({ url: nullableText });

// --- Classroom session -----------------------------------------------------------
export const createClassroomSessionSchema = z.object({
  organizationId: uuid,
  title: nonEmpty,
  date: nonEmpty,
  scheduleSlotId: uuid.optional(),
  lessonPlanId: uuid.optional(),
  sectionId: uuid.optional(),
  subjectId: uuid.optional(),
  plannedTopics: z.array(z.string()).optional(),
});
export const deliverySchema = z.object({
  actualTopicsCovered: z.array(z.string()).optional(),
  activitiesCompleted: z.array(z.string()).optional(),
  resourcesUsedIds: z.array(uuid).optional(),
  participation: participationSummary.nullable().optional(),
});
export const reflectionsSchema = z.object({ reflections: nullableText });

// --- Assignment ------------------------------------------------------------------
export const createAssignmentSchema = z.object({
  organizationId: uuid,
  subjectId: uuid,
  sectionId: uuid.optional(),
  lessonPlanId: uuid.optional(),
  title: nonEmpty,
  assignmentType,
  instructions: z.string().optional(),
  assignedDate: z.string().optional(),
  dueDate: z.string().optional(),
  submissionOpensAt: z.string().optional(),
  submissionClosesAt: z.string().optional(),
});
export const setInstructionsSchema = z.object({ instructions: nullableText });
export const setScheduleSchema = z.object({ assignedDate: nullableText, dueDate: nullableText });
export const setSubmissionWindowSchema = z.object({
  opensAt: nullableText,
  closesAt: nullableText,
});
export const recordSubmissionSchema = z.object({
  studentId: uuid,
  status: submissionStatus,
  submittedAt: z.string().optional(),
  note: z.string().optional(),
});

// --- Learning evidence -----------------------------------------------------------
export const captureLearningEvidenceSchema = z.object({
  organizationId: uuid,
  studentId: uuid,
  evidenceType,
  activityKind,
  activityId: uuid,
  title: nonEmpty,
  subjectId: uuid.optional(),
  learningOutcomeIds: z.array(uuid).optional(),
  description: z.string().optional(),
  capturedAt: z.string().optional(),
  capturedBy: uuid.optional(),
});
