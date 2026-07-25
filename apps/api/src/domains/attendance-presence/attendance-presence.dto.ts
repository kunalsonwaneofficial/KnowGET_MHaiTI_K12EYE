import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO YYYY-MM-DD date");

// --- Shared enums ----------------------------------------------------------------
const sessionType = z.enum([
  "academic_period",
  "examination",
  "event",
  "activity",
  "meeting",
  "club_session",
]);
const attendanceStatus = z.enum([
  "present",
  "absent",
  "late",
  "excused",
  "medical_leave",
  "official_duty",
  "remote",
  "partial",
]);
const attendanceMethod = z.enum([
  "manual",
  "bulk",
  "teacher_assisted",
  "device_assisted",
  "biometric",
  "rfid",
  "nfc",
  "facial",
  "other",
]);
const participantType = z.enum(["student", "teacher", "staff"]);
const leaveType = z.enum(["student", "staff", "medical", "emergency", "approved_absence"]);
const policyRuleType = z.enum([
  "minimum_attendance_percentage",
  "examination_eligibility",
  "promotion_eligibility",
  "late_arrival",
  "early_departure",
  "grace_period",
]);
const activityType = z.enum([
  "club",
  "sport",
  "cultural",
  "competition",
  "institutional_event",
  "community_service",
]);
const engagementLevel = z.enum(["low", "medium", "high"]);
const supportingDocument = z.object({ name: nonEmpty, url: nonEmpty });

// --- Shared bodies ---------------------------------------------------------------
export const organizationScopeSchema = z.object({ organizationId: uuid });
export const renameSchema = z.object({ name: nonEmpty });
export const noteSchema = z.object({ note: nonEmpty });

// --- Attendance session ----------------------------------------------------------
export const createSessionSchema = z.object({
  organizationId: uuid,
  sessionType,
  title: nonEmpty,
  date: isoDate,
  scheduleSlotId: uuid.optional(),
  sectionId: uuid.optional(),
  subjectId: uuid.optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});

// --- Attendance record -----------------------------------------------------------
export const recordSchema = z.object({
  sessionId: uuid,
  participantId: uuid,
  participantType,
  status: attendanceStatus,
  method: attendanceMethod,
  recordedBy: uuid.optional(),
  remarks: z.string().optional(),
});
export const bulkRecordSchema = z.object({
  sessionId: uuid,
  method: attendanceMethod,
  recordedBy: uuid.optional(),
  entries: z
    .array(
      z.object({
        participantId: uuid,
        participantType,
        status: attendanceStatus,
        remarks: z.string().optional(),
      }),
    )
    .min(1),
});
export const correctSchema = z.object({
  toStatus: attendanceStatus,
  reason: nonEmpty,
  correctedBy: uuid.optional(),
});
export const amendRemarksSchema = z.object({ remarks: nullableText });

// --- Leave -----------------------------------------------------------------------
export const requestLeaveSchema = z.object({
  organizationId: uuid,
  personId: uuid,
  holderType: participantType,
  leaveType,
  fromDate: isoDate,
  toDate: isoDate,
  reason: nonEmpty,
  supportingDocuments: z.array(supportingDocument).optional(),
});
export const leaveDecisionSchema = z.object({ reviewedBy: uuid, note: z.string().optional() });
export const addDocumentSchema = supportingDocument;

// --- Attendance policy -----------------------------------------------------------
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

// --- Participation ---------------------------------------------------------------
export const recordParticipationSchema = z.object({
  organizationId: uuid,
  participantId: uuid,
  activityType,
  activityName: nonEmpty,
  date: isoDate,
  sessionId: uuid.optional(),
  role: z.string().optional(),
  engagementLevel: engagementLevel.optional(),
  remarks: z.string().optional(),
});
export const setEngagementSchema = z.object({ engagementLevel: engagementLevel.nullable() });
