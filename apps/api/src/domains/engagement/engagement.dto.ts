import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();

const announcementCategory = z.enum([
  "general",
  "academic",
  "event",
  "administrative",
  "emergency",
  "celebration",
  "reminder",
  "other",
]);
const announcementPriority = z.enum(["low", "normal", "high", "urgent"]);
const surveyType = z.enum(["survey", "poll", "feedback", "consent_check"]);
const questionType = z.enum(["single_choice", "multi_choice", "rating", "text"]);

// --- Audience (communication:*) --------------------------------------------------
export const createAudienceSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  name: nonEmpty,
  description: nullableText.optional(),
  criteriaLabel: nullableText.optional(),
  memberPersonIds: z.array(uuid).optional(),
});
export const renameAudienceSchema = z.object({ name: nonEmpty });
export const setAudienceDescriptionSchema = z.object({ description: nullableText });
export const setAudienceCriteriaSchema = z.object({ criteriaLabel: nullableText });
export const audienceMembersSchema = z.object({ personIds: z.array(uuid).min(1) });

// --- Announcement (communication:*) ----------------------------------------------
export const draftAnnouncementSchema = z.object({
  audienceId: uuid,
  authorPersonId: uuid,
  title: nonEmpty,
  body: nonEmpty,
  category: announcementCategory,
  priority: announcementPriority.optional(),
});
export const editAnnouncementContentSchema = z.object({ title: nonEmpty, body: nonEmpty });
export const setAnnouncementCategorySchema = z.object({ category: announcementCategory });
export const setAnnouncementPrioritySchema = z.object({ priority: announcementPriority });
export const scheduleAnnouncementSchema = z.object({ scheduledFor: nonEmpty });
export const publishAnnouncementSchema = z.object({ publishedAt: nonEmpty });

// --- Acknowledgement receipt (communication:*) -----------------------------------
export const recordAcknowledgementSchema = z.object({
  announcementId: uuid,
  personId: uuid,
  acknowledgedAt: nonEmpty,
});

// --- Message thread (communication:*) --------------------------------------------
export const openThreadSchema = z.object({
  organizationId: uuid,
  subject: nonEmpty,
  participantPersonIds: z.array(uuid).min(2),
});
export const addThreadParticipantSchema = z.object({ personId: uuid });

// --- Message (communication:*) ---------------------------------------------------
export const postMessageSchema = z.object({
  threadId: uuid,
  authorPersonId: uuid,
  body: nonEmpty,
  sentAt: nonEmpty,
});

// --- Survey (engagement:*) -------------------------------------------------------
const questionSchema = z.object({
  key: nonEmpty,
  prompt: nonEmpty,
  type: questionType,
  options: z.array(z.string()),
  required: z.boolean(),
});
export const createSurveySchema = z.object({
  audienceId: uuid,
  title: nonEmpty,
  type: surveyType,
  questions: z.array(questionSchema).min(1),
});
export const editSurveyQuestionsSchema = z.object({ questions: z.array(questionSchema).min(1) });
export const setSurveyTitleSchema = z.object({ title: nonEmpty });
export const openSurveySchema = z.object({ opensAt: nonEmpty });
export const closeSurveySchema = z.object({ closesAt: nonEmpty });

// --- Survey response (engagement:*) ----------------------------------------------
const answerSchema = z.object({ questionKey: nonEmpty, values: z.array(z.string()) });
export const submitResponseSchema = z.object({
  surveyId: uuid,
  respondentPersonId: uuid.nullable().optional(),
  answers: z.array(answerSchema),
  submittedAt: nonEmpty,
});

// --- Engagement profile (engagement:*) -------------------------------------------
export const refreshProfileSchema = z.object({ audienceId: uuid, refreshedAt: nonEmpty });
