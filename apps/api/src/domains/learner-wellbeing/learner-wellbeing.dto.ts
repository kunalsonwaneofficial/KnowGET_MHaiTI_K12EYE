import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();

// --- Shared enums ----------------------------------------------------------------
const wellbeingLevel = z.enum(["thriving", "stable", "monitor", "at_risk", "concern"]);
const wellbeingDimensionKey = z.enum(["physical", "emotional", "social", "behavioural"]);
const medicalAlertSeverity = z.enum(["info", "caution", "critical"]);
const behaviourObservationType = z.enum(["positive", "neutral", "concern"]);
const behaviourIncidentSeverity = z.enum(["minor", "moderate", "major", "severe"]);
const behaviourIncidentStatus = z.enum(["reported", "under_review", "resolved"]);
const goalStatus = z.enum(["active", "achieved", "abandoned"]);
const counsellingPriority = z.enum(["low", "normal", "high", "urgent"]);
const safeguardingRiskLevel = z.enum(["low", "medium", "high", "critical"]);

// --- Wellbeing profile -----------------------------------------------------------
export const createWellbeingProfileSchema = z.object({ studentId: uuid });
export const setDimensionSchema = z.object({
  dimension: wellbeingDimensionKey,
  level: wellbeingLevel.nullable(),
});
export const updateDimensionsSchema = z.object({
  physical: wellbeingLevel.nullable().optional(),
  emotional: wellbeingLevel.nullable().optional(),
  social: wellbeingLevel.nullable().optional(),
  behavioural: wellbeingLevel.nullable().optional(),
});
export const setLearningSupportIndicatorsSchema = z.object({
  indicators: z.array(z.string()),
});
export const putSuccessMetricSchema = z.object({ name: nonEmpty, value: z.number() });
export const updateIndicatorsSchema = z.object({
  wellbeingTrend: nullableText.optional(),
  behaviourPattern: nullableText.optional(),
  engagementLevel: nullableText.optional(),
  attendanceCorrelation: nullableText.optional(),
  academicSignal: nullableText.optional(),
  interventionEffectiveness: nullableText.optional(),
});

// --- Health record ---------------------------------------------------------------
export const createHealthRecordSchema = z.object({
  studentId: uuid,
  medicalHistory: nullableText.optional(),
  bloodGroup: nullableText.optional(),
});
export const setMedicalHistorySchema = z.object({ history: nullableText });
export const setBloodGroupSchema = z.object({ bloodGroup: nullableText });
export const setEmergencyPlanSchema = z.object({ plan: nullableText });
export const putAllergySchema = z.object({
  substance: nonEmpty,
  reaction: nullableText,
  severity: medicalAlertSeverity,
});
export const addChronicConditionSchema = z.object({ name: nonEmpty, notes: nullableText });
export const addImmunizationSchema = z.object({
  vaccine: nonEmpty,
  administeredOn: z.string().nullable(),
});
export const putMedicationSchema = z.object({
  name: nonEmpty,
  dosage: nullableText,
  active: z.boolean(),
});
export const raiseMedicalAlertSchema = z.object({
  label: nonEmpty,
  severity: medicalAlertSeverity,
});

// --- Behaviour record ------------------------------------------------------------
export const createBehaviourRecordSchema = z.object({ studentId: uuid });
export const recordObservationSchema = z.object({
  type: behaviourObservationType,
  note: nonEmpty,
  observedBy: uuid,
  observedAt: z.string().optional(),
});
export const reportIncidentSchema = z.object({
  category: nonEmpty,
  severity: behaviourIncidentSeverity,
  description: nonEmpty,
  reportedBy: uuid,
  reportedAt: z.string().optional(),
});
export const updateIncidentStatusSchema = z.object({ status: behaviourIncidentStatus });
export const addRestorativeActionSchema = z.object({ description: nonEmpty });
export const setBehaviourGoalSchema = z.object({ description: nonEmpty });
export const updateBehaviourGoalStatusSchema = z.object({ status: goalStatus });
export const setImprovementPlanSchema = z.object({
  strategies: z.array(z.string()),
  reviewOn: z.string().nullable().optional(),
  notes: nullableText.optional(),
});

// --- Counselling case ------------------------------------------------------------
export const openCounsellingCaseSchema = z.object({
  studentId: uuid,
  counsellorId: uuid,
  presentingConcern: nonEmpty,
  priority: counsellingPriority.optional(),
});
export const assignCounsellorSchema = z.object({ counsellorId: uuid });
export const setCasePrioritySchema = z.object({ priority: counsellingPriority });
export const recordSessionSchema = z.object({
  note: nonEmpty,
  recordedBy: uuid,
  occurredOn: z.string().optional(),
});
export const addReferralSchema = z.object({ referredTo: nonEmpty, reason: nonEmpty });
export const setCounsellingGoalSchema = z.object({ description: nonEmpty });
export const updateCounsellingGoalStatusSchema = z.object({ status: goalStatus });
export const closeCounsellingCaseSchema = z.object({ outcome: nonEmpty });

// --- Safeguarding case -----------------------------------------------------------
export const openSafeguardingCaseSchema = z.object({
  studentId: uuid,
  concern: nonEmpty,
  category: nonEmpty,
  reportedBy: uuid,
  riskLevel: safeguardingRiskLevel.optional(),
});
export const classifyRiskSchema = z.object({ riskLevel: safeguardingRiskLevel });
export const fileIncidentReportSchema = z.object({
  description: nonEmpty,
  reportedBy: uuid,
  occurredOn: z.string().optional(),
});
export const escalateSchema = z.object({
  escalatedTo: nonEmpty,
  reason: nonEmpty,
  escalatedBy: uuid,
});
export const coordinateExternalAgencySchema = z.object({
  agency: nonEmpty,
  reference: nullableText.optional(),
  notes: nullableText.optional(),
});
export const resolveSafeguardingCaseSchema = z.object({ resolution: nonEmpty });

// --- Learner support plan --------------------------------------------------------
export const createSupportPlanSchema = z.object({ studentId: uuid });
export const setListSchema = z.object({ items: z.array(z.string()) });
export const addSupportGoalSchema = z.object({
  description: nonEmpty,
  targetDate: z.string().nullable().optional(),
});
export const updateSupportGoalStatusSchema = z.object({ status: goalStatus });
export const setReviewScheduleSchema = z.object({
  frequency: nullableText.optional(),
  nextReviewOn: z.string().nullable().optional(),
});
export const recordReviewSchema = z.object({ reviewedOn: z.string().optional() });

// --- Intervention plan -----------------------------------------------------------
export const createInterventionPlanSchema = z.object({ studentId: uuid });
export const setEarlyWarningTriggersSchema = z.object({ triggers: z.array(z.string()) });
export const assignInterventionSchema = z.object({
  description: nonEmpty,
  responsibleStaff: uuid,
});
export const recordInterventionProgressSchema = z.object({ note: nonEmpty, recordedBy: uuid });
export const completeInterventionSchema = z.object({ outcome: nonEmpty });
