import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const uuid = z.string().uuid();

// --- Prospect ---------------------------------------------------------------------
const leadSource = z.enum([
  "walk_in",
  "website",
  "referral",
  "campaign",
  "event",
  "social_media",
  "other",
]);

export const captureProspectSchema = z.object({
  organizationId: uuid,
  personId: uuid,
  leadSource,
  campaign: z.string().optional(),
  interests: z.array(z.string()).optional(),
});
export const recordFollowUpSchema = z.object({ note: z.string().min(1), byId: uuid.optional() });

// --- Applicant --------------------------------------------------------------------
const documentStatus = z.enum(["required", "received", "verified", "waived"]);

export const startApplicationSchema = z.object({
  organizationId: uuid,
  personId: uuid,
  prospectId: uuid.optional(),
  programId: uuid.optional(),
  requiredDocuments: z.array(z.string().min(1)).optional(),
});
export const addDocumentSchema = z.object({ type: z.string().min(1) });
export const setDocumentStatusSchema = z.object({ status: documentStatus });
export const scheduleInterviewSchema = z.object({
  scheduledOn: isoDate,
  mode: z.string().optional(),
});
export const interviewOutcomeSchema = z.object({ outcome: z.string().min(1) });
export const decideApplicationSchema = z.object({
  decidedById: uuid.optional(),
  decidedOn: isoDate.optional(),
  note: z.string().optional(),
});

// --- Student ----------------------------------------------------------------------
const academicStatus = z.enum(["good_standing", "probation", "suspended"]);
const administrativeStatus = z.enum(["clear", "hold"]);

export const enrollStudentSchema = z.object({
  organizationId: uuid,
  personId: uuid,
  studentNumber: z.string().min(1),
  membershipId: uuid.optional(),
  applicantId: uuid.optional(),
  programId: uuid.optional(),
  sectionId: uuid.optional(),
  academicYear: z.string().optional(),
  rollNumber: z.string().optional(),
  enrolledOn: isoDate.optional(),
});
export const promoteStudentSchema = z.object({
  academicYear: z.string().optional(),
  sectionId: uuid.optional(),
});
export const exitStudentSchema = z.object({ exitedOn: isoDate.optional() });
export const assignSectionSchema = z.object({ sectionId: uuid.nullable() });
export const assignRollNumberSchema = z.object({ rollNumber: z.string().nullable() });
export const academicStatusSchema = z.object({ status: academicStatus });
export const administrativeStatusSchema = z.object({ status: administrativeStatus });

// --- Educational journey ----------------------------------------------------------
const journeyEventType = z.enum([
  "enrollment",
  "promotion",
  "retention",
  "transfer",
  "withdrawal",
  "graduation",
]);

export const startJourneySchema = z.object({ studentId: uuid, organizationId: uuid });
export const recordProgressionSchema = z.object({
  type: journeyEventType,
  academicYear: z.string().optional(),
  fromGrade: z.string().optional(),
  toGrade: z.string().optional(),
  note: z.string().optional(),
  on: isoDate.optional(),
});

// --- Intelligence profile ---------------------------------------------------------
const riskLevel = z.enum(["low", "medium", "high"]);

export const createProfileSchema = z.object({ studentId: uuid, organizationId: uuid });
export const updateIndicatorsSchema = z.object({
  academicRisk: riskLevel.nullable().optional(),
  academicTrajectory: z.string().nullable().optional(),
  attendanceTrend: z.string().nullable().optional(),
  behaviourTrend: z.string().nullable().optional(),
  engagement: z.string().nullable().optional(),
  wellbeing: z.string().nullable().optional(),
});
export const recordInterventionSchema = z.object({
  kind: z.string().min(1),
  note: z.string().optional(),
  byId: uuid.optional(),
  on: isoDate.optional(),
});

// --- Timeline ---------------------------------------------------------------------
const timelineEntryType = z.enum([
  "admission",
  "enrollment",
  "class_change",
  "promotion",
  "award",
  "incident",
  "intervention",
  "graduation",
  "status_change",
  "note",
]);

export const recordTimelineSchema = z.object({
  studentId: uuid,
  organizationId: uuid,
  type: timelineEntryType,
  summary: z.string().min(1),
  occurredOn: isoDate.optional(),
  detail: z.string().optional(),
  sourceEvent: z.string().optional(),
});
