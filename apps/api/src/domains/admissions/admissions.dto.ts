import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();

const campaignChannel = z.enum([
  "referral",
  "online_ad",
  "social_media",
  "event",
  "print",
  "walk_in",
  "partner",
  "other",
]);
const evaluationType = z.enum([
  "entrance_test",
  "interview",
  "portfolio",
  "group_activity",
  "other",
]);
const evaluationRecommendation = z.enum(["recommend", "hold", "not_recommend"]);
const gradeCapacity = z.object({ grade: nonEmpty, capacity: z.number().int().min(0) });

// --- Marketing campaign (marketing:*) --------------------------------------------
export const createCampaignSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  name: nonEmpty,
  channel: campaignChannel,
  startOn: nullableText.optional(),
  endOn: nullableText.optional(),
});
export const renameCampaignSchema = z.object({ name: nonEmpty });
export const setCampaignChannelSchema = z.object({ channel: campaignChannel });
export const setCampaignPeriodSchema = z.object({ startOn: nullableText, endOn: nullableText });

// --- Lead (marketing:*) ----------------------------------------------------------
export const createLeadSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  contactName: nonEmpty,
  source: campaignChannel,
  phone: nullableText.optional(),
  email: nullableText.optional(),
  campaignId: uuid.nullable().optional(),
});
export const updateLeadContactSchema = z.object({ phone: nullableText, email: nullableText });

// --- Admission cycle (admissions:*) ----------------------------------------------
export const createCycleSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  name: nonEmpty,
  academicYear: nonEmpty,
  gradeCapacities: z.array(gradeCapacity).optional(),
  opensOn: nullableText.optional(),
  closesOn: nullableText.optional(),
});
export const renameCycleSchema = z.object({ name: nonEmpty });
export const setCycleSeatPlanSchema = z.object({ gradeCapacities: z.array(gradeCapacity) });
export const setCycleWindowSchema = z.object({ opensOn: nullableText, closesOn: nullableText });

// --- Application (admissions:*) ---------------------------------------------------
export const submitApplicationSchema = z.object({
  cycleId: uuid,
  applicantPersonId: uuid,
  code: nonEmpty,
  gradeApplyingFor: nonEmpty,
  submittedOn: nonEmpty,
  leadId: uuid.nullable().optional(),
});
export const decideApplicationSchema = z.object({ decidedOn: nonEmpty });

// --- Admission evaluation (admissions:*) -----------------------------------------
export const recordEvaluationSchema = z.object({
  applicationId: uuid,
  type: evaluationType,
  score: z.number().int().min(0).max(100),
  recommendation: evaluationRecommendation,
  evaluatedOn: nonEmpty,
});

// --- Offer (admissions:*) ---------------------------------------------------------
export const extendOfferSchema = z.object({
  applicationId: uuid,
  extendedOn: nonEmpty,
  gradeOffered: nonEmpty.optional(),
  respondBy: nullableText.optional(),
});
export const respondOfferSchema = z.object({ respondedOn: nonEmpty });

// --- Enrollment confirmation (admissions:*) --------------------------------------
export const confirmEnrollmentSchema = z.object({
  offerId: uuid,
  confirmedOn: nonEmpty,
  studentId: uuid.nullable().optional(),
});

// --- Admissions funnel profile (admissions:*) ------------------------------------
export const refreshFunnelProfileSchema = z.object({ cycleId: uuid });
