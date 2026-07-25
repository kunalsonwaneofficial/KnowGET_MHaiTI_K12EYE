import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be a 24-hour HH:MM time");
const nonNegativeInt = z.number().int().nonnegative();

// --- Shared enums ----------------------------------------------------------------
const weekday = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);
const resourceKind = z.enum([
  "classroom",
  "laboratory",
  "library",
  "sports_ground",
  "auditorium",
  "conference_room",
  "equipment",
  "other",
]);
const allocationKind = z.enum(["teacher", "classroom", "laboratory", "equipment"]);
const policyRuleType = z.enum([
  "max_teaching_periods",
  "consecutive_period_limit",
  "subject_sequencing",
  "resource_priority",
  "availability_window",
  "break_rule",
]);
const substitutionType = z.enum(["teacher", "venue"]);
const availabilityWindow = z.object({ day: weekday, startsAt: time, endsAt: time });

// --- Shared bodies ---------------------------------------------------------------
export const renameSchema = z.object({ name: nonEmpty });
export const noteSchema = z.object({ note: nonEmpty });

// --- Timetable -------------------------------------------------------------------
export const createTimetableSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  name: nonEmpty,
  academicYear: nonEmpty,
  gradeId: uuid,
  term: z.string().optional(),
  classId: uuid.optional(),
  sectionId: uuid.optional(),
});

// --- Schedule slot ---------------------------------------------------------------
export const assignSlotSchema = z.object({
  timetableId: uuid,
  dayOfWeek: weekday,
  startsAt: time,
  endsAt: time,
  subjectId: uuid,
  teacherId: uuid,
  sectionId: uuid,
  classId: uuid.optional(),
  venueId: uuid.optional(),
});
export const setSlotTeacherSchema = z.object({ teacherId: uuid });
export const setSlotVenueSchema = z.object({ venueId: uuid.nullable() });
export const rescheduleSlotSchema = z.object({
  dayOfWeek: weekday,
  startsAt: time,
  endsAt: time,
});

// --- Resource --------------------------------------------------------------------
export const createResourceSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  name: nonEmpty,
  kind: resourceKind,
  capacity: nonNegativeInt.optional(),
  location: z.string().optional(),
  availabilityWindows: z.array(availabilityWindow).optional(),
});
export const setResourceCapacitySchema = z.object({ capacity: nonNegativeInt.nullable() });
export const setResourceLocationSchema = z.object({ location: nullableText });
export const setResourceAvailabilitySchema = z.object({ windows: z.array(availabilityWindow) });

// --- Allocation ------------------------------------------------------------------
export const allocateSchema = z.object({
  organizationId: uuid,
  resourceKind: allocationKind,
  resourceId: uuid,
  dayOfWeek: weekday,
  startsAt: time,
  endsAt: time,
  scheduleSlotId: uuid.optional(),
  sectionId: uuid.optional(),
  occupancy: nonNegativeInt.optional(),
});

// --- Scheduling policy -----------------------------------------------------------
export const createPolicySchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  name: nonEmpty,
  ruleType: policyRuleType,
  parameters: z.record(z.unknown()).optional(),
  description: z.string().optional(),
});
export const setPolicyParametersSchema = z.object({ parameters: z.record(z.unknown()) });
export const setPolicyDescriptionSchema = z.object({ description: nullableText });

// --- Substitution ----------------------------------------------------------------
export const assignSubstitutionSchema = z.object({
  scheduleSlotId: uuid,
  substitutionType,
  originalId: uuid,
  replacementId: uuid,
  reason: z.string().optional(),
  date: z.string().optional(),
});
