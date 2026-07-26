import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { AlumniChapter } from "./alumni-chapter";
import type { AlumniEngagementProfile } from "./alumni-engagement-profile";
import type { AlumniEvent } from "./alumni-event";
import type { AlumniProfile } from "./alumni-profile";
import type { ChapterMembership } from "./chapter-membership";
import type { Contribution } from "./contribution";
import type { EventRegistration } from "./event-registration";
import type { MentorshipConnection } from "./mentorship-connection";

/**
 * Domain events for the Alumni, Community & Relationship Platform (P2-D24), on the `alumni.*` namespace.
 * Payloads carry ids, non-sensitive metadata (a code, a type, a role, a status, a tier) and counts — never
 * money (no gift amount), and never free text or PII: no person name, no graduation year, no chapter/event
 * name, no mentorship focus.
 */

// --- Alumni profile --------------------------------------------------------------
export const ALUMNI_PROFILE_CREATED = "alumni.profile.created";
export const ALUMNI_PROFILE_UPDATED = "alumni.profile.updated";
export const ALUMNI_PROFILE_LAPSED = "alumni.profile.lapsed";
export const ALUMNI_PROFILE_REACTIVATED = "alumni.profile.reactivated";
export const ALUMNI_PROFILE_OPTED_OUT = "alumni.profile.opted_out";

export interface AlumniProfileEventPayload {
  readonly alumniProfileId: Uuid;
  readonly organizationId: Uuid;
  readonly alumnusPersonId: Uuid;
  readonly status: string;
}

export type AlumniProfileCreatedEvent = DomainEvent<
  typeof ALUMNI_PROFILE_CREATED,
  AlumniProfileEventPayload
>;
export type AlumniProfileUpdatedEvent = DomainEvent<
  typeof ALUMNI_PROFILE_UPDATED,
  AlumniProfileEventPayload
>;
export type AlumniProfileLapsedEvent = DomainEvent<
  typeof ALUMNI_PROFILE_LAPSED,
  AlumniProfileEventPayload
>;
export type AlumniProfileReactivatedEvent = DomainEvent<
  typeof ALUMNI_PROFILE_REACTIVATED,
  AlumniProfileEventPayload
>;
export type AlumniProfileOptedOutEvent = DomainEvent<
  typeof ALUMNI_PROFILE_OPTED_OUT,
  AlumniProfileEventPayload
>;

const profilePayload = (profile: AlumniProfile): AlumniProfileEventPayload => ({
  alumniProfileId: profile.id,
  organizationId: profile.organizationId,
  alumnusPersonId: profile.alumnusPersonId,
  status: profile.status,
});

export const alumniProfileCreated = (p: AlumniProfile): AlumniProfileCreatedEvent =>
  createEvent(ALUMNI_PROFILE_CREATED, profilePayload(p), { tenantId: p.tenantId });
export const alumniProfileUpdated = (p: AlumniProfile): AlumniProfileUpdatedEvent =>
  createEvent(ALUMNI_PROFILE_UPDATED, profilePayload(p), { tenantId: p.tenantId });
export const alumniProfileLapsed = (p: AlumniProfile): AlumniProfileLapsedEvent =>
  createEvent(ALUMNI_PROFILE_LAPSED, profilePayload(p), { tenantId: p.tenantId });
export const alumniProfileReactivated = (p: AlumniProfile): AlumniProfileReactivatedEvent =>
  createEvent(ALUMNI_PROFILE_REACTIVATED, profilePayload(p), { tenantId: p.tenantId });
export const alumniProfileOptedOut = (p: AlumniProfile): AlumniProfileOptedOutEvent =>
  createEvent(ALUMNI_PROFILE_OPTED_OUT, profilePayload(p), { tenantId: p.tenantId });

// --- Alumni chapter --------------------------------------------------------------
export const CHAPTER_CREATED = "alumni.chapter.created";
export const CHAPTER_RENAMED = "alumni.chapter.renamed";
export const CHAPTER_TYPE_SET = "alumni.chapter.type_set";
export const CHAPTER_REGION_SET = "alumni.chapter.region_set";
export const CHAPTER_ACTIVATED = "alumni.chapter.activated";
export const CHAPTER_DEACTIVATED = "alumni.chapter.deactivated";
export const CHAPTER_ARCHIVED = "alumni.chapter.archived";

export interface ChapterEventPayload {
  readonly chapterId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly type: string;
  readonly status: string;
}

export type ChapterCreatedEvent = DomainEvent<typeof CHAPTER_CREATED, ChapterEventPayload>;
export type ChapterRenamedEvent = DomainEvent<typeof CHAPTER_RENAMED, ChapterEventPayload>;
export type ChapterTypeSetEvent = DomainEvent<typeof CHAPTER_TYPE_SET, ChapterEventPayload>;
export type ChapterRegionSetEvent = DomainEvent<typeof CHAPTER_REGION_SET, ChapterEventPayload>;
export type ChapterActivatedEvent = DomainEvent<typeof CHAPTER_ACTIVATED, ChapterEventPayload>;
export type ChapterDeactivatedEvent = DomainEvent<typeof CHAPTER_DEACTIVATED, ChapterEventPayload>;
export type ChapterArchivedEvent = DomainEvent<typeof CHAPTER_ARCHIVED, ChapterEventPayload>;

const chapterPayload = (chapter: AlumniChapter): ChapterEventPayload => ({
  chapterId: chapter.id,
  organizationId: chapter.organizationId,
  code: chapter.code,
  type: chapter.type,
  status: chapter.status,
});

export const chapterCreated = (c: AlumniChapter): ChapterCreatedEvent =>
  createEvent(CHAPTER_CREATED, chapterPayload(c), { tenantId: c.tenantId });
export const chapterRenamed = (c: AlumniChapter): ChapterRenamedEvent =>
  createEvent(CHAPTER_RENAMED, chapterPayload(c), { tenantId: c.tenantId });
export const chapterTypeSet = (c: AlumniChapter): ChapterTypeSetEvent =>
  createEvent(CHAPTER_TYPE_SET, chapterPayload(c), { tenantId: c.tenantId });
export const chapterRegionSet = (c: AlumniChapter): ChapterRegionSetEvent =>
  createEvent(CHAPTER_REGION_SET, chapterPayload(c), { tenantId: c.tenantId });
export const chapterActivated = (c: AlumniChapter): ChapterActivatedEvent =>
  createEvent(CHAPTER_ACTIVATED, chapterPayload(c), { tenantId: c.tenantId });
export const chapterDeactivated = (c: AlumniChapter): ChapterDeactivatedEvent =>
  createEvent(CHAPTER_DEACTIVATED, chapterPayload(c), { tenantId: c.tenantId });
export const chapterArchived = (c: AlumniChapter): ChapterArchivedEvent =>
  createEvent(CHAPTER_ARCHIVED, chapterPayload(c), { tenantId: c.tenantId });

// --- Chapter membership ----------------------------------------------------------
export const MEMBERSHIP_JOINED = "alumni.membership.joined";
export const MEMBERSHIP_ROLE_SET = "alumni.membership.role_set";
export const MEMBERSHIP_LEFT = "alumni.membership.left";
export const MEMBERSHIP_REACTIVATED = "alumni.membership.reactivated";

export interface MembershipEventPayload {
  readonly membershipId: Uuid;
  readonly organizationId: Uuid;
  readonly chapterId: Uuid;
  readonly alumniProfileId: Uuid;
  readonly role: string;
  readonly status: string;
}

export type MembershipJoinedEvent = DomainEvent<typeof MEMBERSHIP_JOINED, MembershipEventPayload>;
export type MembershipRoleSetEvent = DomainEvent<
  typeof MEMBERSHIP_ROLE_SET,
  MembershipEventPayload
>;
export type MembershipLeftEvent = DomainEvent<typeof MEMBERSHIP_LEFT, MembershipEventPayload>;
export type MembershipReactivatedEvent = DomainEvent<
  typeof MEMBERSHIP_REACTIVATED,
  MembershipEventPayload
>;

const membershipPayload = (membership: ChapterMembership): MembershipEventPayload => ({
  membershipId: membership.id,
  organizationId: membership.organizationId,
  chapterId: membership.chapterId,
  alumniProfileId: membership.alumniProfileId,
  role: membership.role,
  status: membership.status,
});

export const membershipJoined = (m: ChapterMembership): MembershipJoinedEvent =>
  createEvent(MEMBERSHIP_JOINED, membershipPayload(m), { tenantId: m.tenantId });
export const membershipRoleSet = (m: ChapterMembership): MembershipRoleSetEvent =>
  createEvent(MEMBERSHIP_ROLE_SET, membershipPayload(m), { tenantId: m.tenantId });
export const membershipLeft = (m: ChapterMembership): MembershipLeftEvent =>
  createEvent(MEMBERSHIP_LEFT, membershipPayload(m), { tenantId: m.tenantId });
export const membershipReactivated = (m: ChapterMembership): MembershipReactivatedEvent =>
  createEvent(MEMBERSHIP_REACTIVATED, membershipPayload(m), { tenantId: m.tenantId });

// --- Alumni event ----------------------------------------------------------------
export const EVENT_CREATED = "alumni.event.created";
export const EVENT_RENAMED = "alumni.event.renamed";
export const EVENT_TYPE_SET = "alumni.event.type_set";
export const EVENT_CAPACITY_SET = "alumni.event.capacity_set";
export const EVENT_WINDOW_SET = "alumni.event.window_set";
export const EVENT_SCHEDULED = "alumni.event.scheduled";
export const EVENT_OPENED = "alumni.event.opened";
export const EVENT_CLOSED = "alumni.event.closed";
export const EVENT_COMPLETED = "alumni.event.completed";
export const EVENT_CANCELLED = "alumni.event.cancelled";

export interface EventEventPayload {
  readonly eventId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly type: string;
  readonly capacity: number;
  readonly status: string;
}

export type EventCreatedEvent = DomainEvent<typeof EVENT_CREATED, EventEventPayload>;
export type EventRenamedEvent = DomainEvent<typeof EVENT_RENAMED, EventEventPayload>;
export type EventTypeSetEvent = DomainEvent<typeof EVENT_TYPE_SET, EventEventPayload>;
export type EventCapacitySetEvent = DomainEvent<typeof EVENT_CAPACITY_SET, EventEventPayload>;
export type EventWindowSetEvent = DomainEvent<typeof EVENT_WINDOW_SET, EventEventPayload>;
export type EventScheduledEvent = DomainEvent<typeof EVENT_SCHEDULED, EventEventPayload>;
export type EventOpenedEvent = DomainEvent<typeof EVENT_OPENED, EventEventPayload>;
export type EventClosedEvent = DomainEvent<typeof EVENT_CLOSED, EventEventPayload>;
export type EventCompletedEvent = DomainEvent<typeof EVENT_COMPLETED, EventEventPayload>;
export type EventCancelledEvent = DomainEvent<typeof EVENT_CANCELLED, EventEventPayload>;

const eventPayload = (event: AlumniEvent): EventEventPayload => ({
  eventId: event.id,
  organizationId: event.organizationId,
  code: event.code,
  type: event.type,
  capacity: event.capacity,
  status: event.status,
});

export const eventCreated = (e: AlumniEvent): EventCreatedEvent =>
  createEvent(EVENT_CREATED, eventPayload(e), { tenantId: e.tenantId });
export const eventRenamed = (e: AlumniEvent): EventRenamedEvent =>
  createEvent(EVENT_RENAMED, eventPayload(e), { tenantId: e.tenantId });
export const eventTypeSet = (e: AlumniEvent): EventTypeSetEvent =>
  createEvent(EVENT_TYPE_SET, eventPayload(e), { tenantId: e.tenantId });
export const eventCapacitySet = (e: AlumniEvent): EventCapacitySetEvent =>
  createEvent(EVENT_CAPACITY_SET, eventPayload(e), { tenantId: e.tenantId });
export const eventWindowSet = (e: AlumniEvent): EventWindowSetEvent =>
  createEvent(EVENT_WINDOW_SET, eventPayload(e), { tenantId: e.tenantId });
export const eventScheduled = (e: AlumniEvent): EventScheduledEvent =>
  createEvent(EVENT_SCHEDULED, eventPayload(e), { tenantId: e.tenantId });
export const eventOpened = (e: AlumniEvent): EventOpenedEvent =>
  createEvent(EVENT_OPENED, eventPayload(e), { tenantId: e.tenantId });
export const eventClosed = (e: AlumniEvent): EventClosedEvent =>
  createEvent(EVENT_CLOSED, eventPayload(e), { tenantId: e.tenantId });
export const eventCompleted = (e: AlumniEvent): EventCompletedEvent =>
  createEvent(EVENT_COMPLETED, eventPayload(e), { tenantId: e.tenantId });
export const eventCancelled = (e: AlumniEvent): EventCancelledEvent =>
  createEvent(EVENT_CANCELLED, eventPayload(e), { tenantId: e.tenantId });

// --- Event registration ----------------------------------------------------------
export const REGISTRATION_REGISTERED = "alumni.registration.registered";
export const REGISTRATION_ATTENDED = "alumni.registration.attended";
export const REGISTRATION_NO_SHOW = "alumni.registration.no_show";
export const REGISTRATION_CANCELLED = "alumni.registration.cancelled";
export const REGISTRATION_REINSTATED = "alumni.registration.reinstated";

export interface RegistrationEventPayload {
  readonly registrationId: Uuid;
  readonly organizationId: Uuid;
  readonly eventId: Uuid;
  readonly alumniProfileId: Uuid;
  readonly status: string;
}

export type RegistrationRegisteredEvent = DomainEvent<
  typeof REGISTRATION_REGISTERED,
  RegistrationEventPayload
>;
export type RegistrationAttendedEvent = DomainEvent<
  typeof REGISTRATION_ATTENDED,
  RegistrationEventPayload
>;
export type RegistrationNoShowEvent = DomainEvent<
  typeof REGISTRATION_NO_SHOW,
  RegistrationEventPayload
>;
export type RegistrationCancelledEvent = DomainEvent<
  typeof REGISTRATION_CANCELLED,
  RegistrationEventPayload
>;
export type RegistrationReinstatedEvent = DomainEvent<
  typeof REGISTRATION_REINSTATED,
  RegistrationEventPayload
>;

const registrationPayload = (registration: EventRegistration): RegistrationEventPayload => ({
  registrationId: registration.id,
  organizationId: registration.organizationId,
  eventId: registration.eventId,
  alumniProfileId: registration.alumniProfileId,
  status: registration.status,
});

export const registrationRegistered = (r: EventRegistration): RegistrationRegisteredEvent =>
  createEvent(REGISTRATION_REGISTERED, registrationPayload(r), { tenantId: r.tenantId });
export const registrationAttended = (r: EventRegistration): RegistrationAttendedEvent =>
  createEvent(REGISTRATION_ATTENDED, registrationPayload(r), { tenantId: r.tenantId });
export const registrationNoShow = (r: EventRegistration): RegistrationNoShowEvent =>
  createEvent(REGISTRATION_NO_SHOW, registrationPayload(r), { tenantId: r.tenantId });
export const registrationCancelled = (r: EventRegistration): RegistrationCancelledEvent =>
  createEvent(REGISTRATION_CANCELLED, registrationPayload(r), { tenantId: r.tenantId });
export const registrationReinstated = (r: EventRegistration): RegistrationReinstatedEvent =>
  createEvent(REGISTRATION_REINSTATED, registrationPayload(r), { tenantId: r.tenantId });

// --- Mentorship connection -------------------------------------------------------
export const MENTORSHIP_PROPOSED = "alumni.mentorship.proposed";
export const MENTORSHIP_ACTIVATED = "alumni.mentorship.activated";
export const MENTORSHIP_COMPLETED = "alumni.mentorship.completed";
export const MENTORSHIP_ENDED = "alumni.mentorship.ended";

export interface MentorshipEventPayload {
  readonly connectionId: Uuid;
  readonly organizationId: Uuid;
  readonly mentorProfileId: Uuid;
  readonly menteeProfileId: Uuid;
  readonly status: string;
}

export type MentorshipProposedEvent = DomainEvent<
  typeof MENTORSHIP_PROPOSED,
  MentorshipEventPayload
>;
export type MentorshipActivatedEvent = DomainEvent<
  typeof MENTORSHIP_ACTIVATED,
  MentorshipEventPayload
>;
export type MentorshipCompletedEvent = DomainEvent<
  typeof MENTORSHIP_COMPLETED,
  MentorshipEventPayload
>;
export type MentorshipEndedEvent = DomainEvent<typeof MENTORSHIP_ENDED, MentorshipEventPayload>;

const mentorshipPayload = (connection: MentorshipConnection): MentorshipEventPayload => ({
  connectionId: connection.id,
  organizationId: connection.organizationId,
  mentorProfileId: connection.mentorProfileId,
  menteeProfileId: connection.menteeProfileId,
  status: connection.status,
});

export const mentorshipProposed = (m: MentorshipConnection): MentorshipProposedEvent =>
  createEvent(MENTORSHIP_PROPOSED, mentorshipPayload(m), { tenantId: m.tenantId });
export const mentorshipActivated = (m: MentorshipConnection): MentorshipActivatedEvent =>
  createEvent(MENTORSHIP_ACTIVATED, mentorshipPayload(m), { tenantId: m.tenantId });
export const mentorshipCompleted = (m: MentorshipConnection): MentorshipCompletedEvent =>
  createEvent(MENTORSHIP_COMPLETED, mentorshipPayload(m), { tenantId: m.tenantId });
export const mentorshipEnded = (m: MentorshipConnection): MentorshipEndedEvent =>
  createEvent(MENTORSHIP_ENDED, mentorshipPayload(m), { tenantId: m.tenantId });

// --- Contribution ----------------------------------------------------------------
export const CONTRIBUTION_RECORDED = "alumni.contribution.recorded";

export interface ContributionEventPayload {
  readonly contributionId: Uuid;
  readonly organizationId: Uuid;
  readonly alumniProfileId: Uuid;
  readonly type: string;
  readonly recognitionTier: string;
}

export type ContributionRecordedEvent = DomainEvent<
  typeof CONTRIBUTION_RECORDED,
  ContributionEventPayload
>;

/** A giving act was recorded — carries the type and recognition tier only, never the money amount (Finance, P2-D14). */
export const contributionRecorded = (contribution: Contribution): ContributionRecordedEvent =>
  createEvent(
    CONTRIBUTION_RECORDED,
    {
      contributionId: contribution.id,
      organizationId: contribution.organizationId,
      alumniProfileId: contribution.alumniProfileId,
      type: contribution.type,
      recognitionTier: contribution.recognitionTier,
    },
    { tenantId: contribution.tenantId },
  );

// --- Alumni engagement profile ---------------------------------------------------
export const ENGAGEMENT_PROFILE_REFRESHED = "alumni.engagement_profile.refreshed";

export interface EngagementProfileEventPayload {
  readonly profileId: Uuid;
  readonly organizationId: Uuid;
  readonly alumniProfileId: Uuid;
  readonly score: number;
  readonly level: string;
  readonly eventsAttended: number;
  readonly activeChapters: number;
  readonly activeMentorships: number;
  readonly contributionsCount: number;
}

export type EngagementProfileRefreshedEvent = DomainEvent<
  typeof ENGAGEMENT_PROFILE_REFRESHED,
  EngagementProfileEventPayload
>;

/** The derived per-alumnus engagement projection has been recomputed. Carries counts and the score only — no PII. */
export const engagementProfileRefreshed = (
  profile: AlumniEngagementProfile,
): EngagementProfileRefreshedEvent =>
  createEvent(
    ENGAGEMENT_PROFILE_REFRESHED,
    {
      profileId: profile.id,
      organizationId: profile.organizationId,
      alumniProfileId: profile.alumniProfileId,
      score: profile.score,
      level: profile.level,
      eventsAttended: profile.eventsAttended,
      activeChapters: profile.activeChapters,
      activeMentorships: profile.activeMentorships,
      contributionsCount: profile.contributionsCount,
    },
    { tenantId: profile.tenantId },
  );
