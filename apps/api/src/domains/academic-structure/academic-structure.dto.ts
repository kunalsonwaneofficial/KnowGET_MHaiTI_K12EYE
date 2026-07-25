import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();

// --- Shared enums ----------------------------------------------------------------
const termType = z.enum(["term", "semester", "trimester"]);
const holidayKind = z.enum(["public", "institutional", "vacation", "observance"]);
const weekday = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);
const programStage = z.enum([
  "pre_primary",
  "primary",
  "middle",
  "secondary",
  "higher_secondary",
  "diploma",
  "vocational",
  "custom",
]);
const subjectKind = z.enum(["mandatory", "elective"]);
const bloomLevel = z.enum(["remember", "understand", "apply", "analyze", "evaluate", "create"]);

// --- Academic calendar -----------------------------------------------------------
export const createCalendarSchema = z.object({
  organizationId: uuid,
  academicYear: nonEmpty,
  startDate: nonEmpty,
  endDate: nonEmpty,
});
export const addTermSchema = z.object({
  name: nonEmpty,
  type: termType,
  startDate: nonEmpty,
  endDate: nonEmpty,
  sequence: z.number().int(),
});
export const addHolidaySchema = z.object({
  name: nonEmpty,
  startDate: nonEmpty,
  endDate: nonEmpty,
  kind: holidayKind,
});
export const addExaminationPeriodSchema = z.object({
  name: nonEmpty,
  startDate: nonEmpty,
  endDate: nonEmpty,
});
export const addSpecialEventSchema = z.object({
  name: nonEmpty,
  date: nonEmpty,
  category: nonEmpty,
});
export const setWorkingDaysSchema = z.object({ weekdays: z.array(weekday) });

// --- Academic program ------------------------------------------------------------
export const createProgramSchema = z.object({
  organizationId: uuid,
  name: nonEmpty,
  code: nonEmpty,
  stage: programStage,
  description: nullableText.optional(),
});
export const renameSchema = z.object({ name: nonEmpty });
export const setProgramDescriptionSchema = z.object({ description: nullableText });
export const setProgramStageSchema = z.object({ stage: programStage });

// --- Curriculum framework --------------------------------------------------------
export const createCurriculumSchema = z.object({
  organizationId: uuid,
  name: nonEmpty,
  code: nonEmpty,
  board: nonEmpty,
  learningPhilosophy: nullableText.optional(),
  competencyModel: nullableText.optional(),
  assessmentPhilosophy: nullableText.optional(),
  subjectFramework: z.array(z.string()).optional(),
});
export const setPhilosophySchema = z.object({ value: nullableText });
export const setSubjectFrameworkSchema = z.object({ subjects: z.array(z.string()) });
export const reviseCurriculumSchema = z.object({ note: nonEmpty });

// --- Grade -----------------------------------------------------------------------
export const createGradeSchema = z.object({
  programId: uuid,
  name: nonEmpty,
  code: nonEmpty,
  level: z.number().int(),
  promotionRule: nullableText.optional(),
  minAge: z.number().int().nullable().optional(),
  maxAge: z.number().int().nullable().optional(),
});
export const setGradeLevelSchema = z.object({ level: z.number().int() });
export const setPromotionRuleSchema = z.object({ rule: nullableText });
export const setAgeGuidelinesSchema = z.object({
  minAge: z.number().int().nullable(),
  maxAge: z.number().int().nullable(),
});
export const setNextGradeSchema = z.object({ nextGradeId: uuid.nullable() });

// --- Class -----------------------------------------------------------------------
export const createClassSchema = z.object({
  gradeId: uuid,
  academicYear: nonEmpty,
  name: nonEmpty,
  curriculumFrameworkId: uuid.nullable().optional(),
});
export const assignClassCurriculumSchema = z.object({ curriculumFrameworkId: uuid.nullable() });

// --- Section ---------------------------------------------------------------------
export const createSectionSchema = z.object({
  classId: uuid,
  name: nonEmpty,
  capacity: z.number().int().nonnegative(),
});
export const setCapacitySchema = z.object({ capacity: z.number().int().nonnegative() });

// --- Subject ---------------------------------------------------------------------
export const createSubjectSchema = z.object({
  organizationId: uuid,
  name: nonEmpty,
  code: nonEmpty,
  kind: subjectKind,
  credits: z.number().nullable().optional(),
  electiveGroup: nullableText.optional(),
  crossDisciplinary: z.boolean().optional(),
});
export const setSubjectKindSchema = z.object({ kind: subjectKind });
export const setSubjectCreditsSchema = z.object({ credits: z.number().nullable() });
export const setElectiveGroupSchema = z.object({ electiveGroup: nullableText });
export const setCrossDisciplinarySchema = z.object({ crossDisciplinary: z.boolean() });
export const prerequisiteSchema = z.object({ prerequisiteId: uuid });

// --- Learning outcome ------------------------------------------------------------
export const createLearningOutcomeSchema = z.object({
  subjectId: uuid,
  code: nonEmpty,
  statement: nonEmpty,
  bloomLevel: bloomLevel.nullable().optional(),
  curriculumFrameworkId: uuid.nullable().optional(),
});
export const setStatementSchema = z.object({ statement: nonEmpty });
export const setBloomLevelSchema = z.object({ bloomLevel: bloomLevel.nullable() });
export const setCompetenciesSchema = z.object({ competencies: z.array(z.string()) });
export const setCurriculumAlignmentSchema = z.object({ curriculumFrameworkId: uuid.nullable() });
export const setAssessmentAlignmentSchema = z.object({ methods: z.array(z.string()) });
