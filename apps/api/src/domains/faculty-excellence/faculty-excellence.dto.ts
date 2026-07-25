import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableUuid = uuid.nullable();
const nullableText = z.string().nullable();

// --- Shared enums (mirror the @knowget/faculty-excellence value objects) ---------
const observationType = z.enum(["formal", "informal", "peer", "learning_walk", "self"]);
const pdCategory = z.enum([
  "pedagogy",
  "subject_knowledge",
  "classroom_management",
  "assessment",
  "digital",
  "inclusion",
  "wellbeing",
  "leadership",
  "compliance",
  "other",
]);
const rating = z.number().min(1).max(4);

// --- Competency framework --------------------------------------------------------
const competencyInput = z.object({
  key: nonEmpty,
  name: nonEmpty,
  domain: nullableText.optional(),
  description: nullableText.optional(),
});
export const createFrameworkSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  name: nonEmpty,
  description: nullableText.optional(),
  competencies: z.array(competencyInput).optional(),
});
export const renameFrameworkSchema = z.object({ name: nonEmpty });
export const setFrameworkDescriptionSchema = z.object({ description: nullableText });
export const addCompetencySchema = competencyInput;

// --- Observation -----------------------------------------------------------------
export const scheduleObservationSchema = z.object({
  frameworkId: uuid,
  employeeId: uuid,
  observerId: uuid,
  observationType,
  observedOn: nullableText.optional(),
  context: nullableText.optional(),
});
const ratingInput = z.object({
  competencyKey: nonEmpty,
  rating,
  comment: nullableText.optional(),
});
export const conductObservationSchema = z.object({
  ratings: z.array(ratingInput).min(1),
  strengths: nullableText.optional(),
  growthAreas: nullableText.optional(),
});

// --- Coaching engagement ---------------------------------------------------------
export const proposeEngagementSchema = z.object({
  organizationId: uuid,
  coachId: uuid,
  coacheeId: uuid,
  focus: nonEmpty,
  frameworkId: nullableUuid.optional(),
  startDate: nullableText.optional(),
});
export const setFocusSchema = z.object({ focus: nonEmpty });
export const endDateSchema = z.object({ endDate: nullableText.optional() });

// --- Coaching session ------------------------------------------------------------
export const logSessionSchema = z.object({
  engagementId: uuid,
  sessionDate: nullableText.optional(),
  focus: nullableText.optional(),
  notes: nullableText.optional(),
  nextSteps: nullableText.optional(),
});
export const amendSessionSchema = z.object({
  focus: nullableText.optional(),
  notes: nullableText.optional(),
  nextSteps: nullableText.optional(),
});

// --- Development requirement / activity ------------------------------------------
export const setRequirementSchema = z.object({
  employeeId: uuid,
  category: pdCategory,
  period: nonEmpty,
  requiredHours: z.number().nonnegative(),
});
export const reviseRequirementSchema = z.object({ requiredHours: z.number().nonnegative() });
export const planActivitySchema = z.object({
  employeeId: uuid,
  title: nonEmpty,
  category: pdCategory,
  hours: z.number().positive(),
  provider: nullableText.optional(),
  period: z.string().min(1).optional(),
  startDate: nullableText.optional(),
});
export const setActivityHoursSchema = z.object({ hours: z.number().positive() });
export const completeActivitySchema = z.object({ completedOn: nullableText.optional() });

// --- Development goal -------------------------------------------------------------
export const draftGoalSchema = z.object({
  employeeId: uuid,
  description: nonEmpty,
  targetCompetencyKey: nullableText.optional(),
  frameworkId: nullableUuid.optional(),
  engagementId: nullableUuid.optional(),
  targetDate: nullableText.optional(),
});
export const setGoalDescriptionSchema = z.object({ description: nonEmpty });
export const setGoalTargetDateSchema = z.object({ targetDate: nullableText });
export const goalOutcomeSchema = z.object({ outcome: nullableText.optional() });

// --- Faculty profile -------------------------------------------------------------
export const refreshProfileSchema = z.object({ period: nonEmpty });
