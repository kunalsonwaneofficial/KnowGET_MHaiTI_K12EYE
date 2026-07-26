import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();

const chapterType = z.enum(["regional", "interest", "class_year", "professional", "other"]);
const membershipRole = z.enum(["member", "officer", "lead"]);
const eventType = z.enum(["reunion", "networking", "webinar", "fundraiser", "volunteer", "other"]);
const contributionType = z.enum(["pledge", "gift", "recurring", "in_kind"]);
const recognitionTier = z.enum(["supporter", "patron", "benefactor", "founder"]);

// --- Alumni profile (alumni:*) ---------------------------------------------------
export const createAlumniProfileSchema = z.object({
  organizationId: uuid,
  alumnusPersonId: uuid,
  graduationYear: nonEmpty,
  program: nullableText.optional(),
});
export const updateAlumniProfileSchema = z.object({
  graduationYear: nonEmpty.optional(),
  program: nullableText.optional(),
});

// --- Alumni chapter (community:*) ------------------------------------------------
export const createChapterSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  name: nonEmpty,
  type: chapterType,
  region: nullableText.optional(),
});
export const renameChapterSchema = z.object({ name: nonEmpty });
export const setChapterTypeSchema = z.object({ type: chapterType });
export const setChapterRegionSchema = z.object({ region: nullableText });

// --- Chapter membership (community:*) --------------------------------------------
export const joinChapterSchema = z.object({
  chapterId: uuid,
  alumniProfileId: uuid,
  joinedOn: nonEmpty,
  role: membershipRole.optional(),
});
export const setMembershipRoleSchema = z.object({ role: membershipRole });
export const leaveMembershipSchema = z.object({ leftOn: nonEmpty });

// --- Alumni event (community:*) --------------------------------------------------
export const createEventSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  name: nonEmpty,
  type: eventType,
  capacity: z.number().int().min(0).optional(),
  startsOn: nullableText.optional(),
  endsOn: nullableText.optional(),
});
export const renameEventSchema = z.object({ name: nonEmpty });
export const setEventTypeSchema = z.object({ type: eventType });
export const setEventCapacitySchema = z.object({ capacity: z.number().int().min(0) });
export const setEventWindowSchema = z.object({ startsOn: nullableText, endsOn: nullableText });

// --- Event registration (community:*) --------------------------------------------
export const registerForEventSchema = z.object({
  eventId: uuid,
  alumniProfileId: uuid,
  registeredOn: nonEmpty,
});
export const respondRegistrationSchema = z.object({ respondedOn: nonEmpty });

// --- Mentorship connection (alumni:*) --------------------------------------------
export const proposeMentorshipSchema = z.object({
  mentorProfileId: uuid,
  menteeProfileId: uuid,
  proposedOn: nonEmpty,
  focus: nullableText.optional(),
});
export const activateMentorshipSchema = z.object({ startedOn: nonEmpty });
export const endMentorshipSchema = z.object({ endedOn: nonEmpty });

// --- Contribution (alumni:*) -----------------------------------------------------
export const recordContributionSchema = z.object({
  alumniProfileId: uuid,
  type: contributionType,
  recognitionTier,
  contributedOn: nonEmpty,
  campaignRef: nullableText.optional(),
});

// --- Alumni engagement profile (alumni:*) ----------------------------------------
export const refreshEngagementProfileSchema = z.object({ alumniProfileId: uuid });
