import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { AcknowledgementReceipt } from "./acknowledgement";
import type { Announcement } from "./announcement";
import type { Audience } from "./audience";
import type { MessageThread } from "./message-thread";

/**
 * Domain events for the Unified Communication, Engagement & Collaboration Platform (P2-D22), on the
 * `engagement.*` namespace. Payloads carry ids, non-sensitive metadata (a code, a category, a priority, a
 * status) and counts — never money, and never free text: no audience name, no announcement title or body, no
 * message body, no survey question or response content.
 */

// --- Audience --------------------------------------------------------------------
export const AUDIENCE_CREATED = "engagement.audience.created";
export const AUDIENCE_RENAMED = "engagement.audience.renamed";
export const AUDIENCE_DESCRIPTION_SET = "engagement.audience.description_set";
export const AUDIENCE_CRITERIA_SET = "engagement.audience.criteria_set";
export const AUDIENCE_MEMBERS_ADDED = "engagement.audience.members_added";
export const AUDIENCE_MEMBERS_REMOVED = "engagement.audience.members_removed";
export const AUDIENCE_ARCHIVED = "engagement.audience.archived";

export interface AudienceEventPayload {
  readonly audienceId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly memberCount: number;
  readonly status: string;
}

export type AudienceCreatedEvent = DomainEvent<typeof AUDIENCE_CREATED, AudienceEventPayload>;
export type AudienceRenamedEvent = DomainEvent<typeof AUDIENCE_RENAMED, AudienceEventPayload>;
export type AudienceDescriptionSetEvent = DomainEvent<
  typeof AUDIENCE_DESCRIPTION_SET,
  AudienceEventPayload
>;
export type AudienceCriteriaSetEvent = DomainEvent<
  typeof AUDIENCE_CRITERIA_SET,
  AudienceEventPayload
>;
export type AudienceMembersAddedEvent = DomainEvent<
  typeof AUDIENCE_MEMBERS_ADDED,
  AudienceEventPayload
>;
export type AudienceMembersRemovedEvent = DomainEvent<
  typeof AUDIENCE_MEMBERS_REMOVED,
  AudienceEventPayload
>;
export type AudienceArchivedEvent = DomainEvent<typeof AUDIENCE_ARCHIVED, AudienceEventPayload>;

const audiencePayload = (audience: Audience): AudienceEventPayload => ({
  audienceId: audience.id,
  organizationId: audience.organizationId,
  code: audience.code,
  memberCount: audience.memberPersonIds.length,
  status: audience.status,
});

export const audienceCreated = (audience: Audience): AudienceCreatedEvent =>
  createEvent(AUDIENCE_CREATED, audiencePayload(audience), { tenantId: audience.tenantId });
export const audienceRenamed = (audience: Audience): AudienceRenamedEvent =>
  createEvent(AUDIENCE_RENAMED, audiencePayload(audience), { tenantId: audience.tenantId });
export const audienceDescriptionSet = (audience: Audience): AudienceDescriptionSetEvent =>
  createEvent(AUDIENCE_DESCRIPTION_SET, audiencePayload(audience), { tenantId: audience.tenantId });
export const audienceCriteriaSet = (audience: Audience): AudienceCriteriaSetEvent =>
  createEvent(AUDIENCE_CRITERIA_SET, audiencePayload(audience), { tenantId: audience.tenantId });
export const audienceMembersAdded = (audience: Audience): AudienceMembersAddedEvent =>
  createEvent(AUDIENCE_MEMBERS_ADDED, audiencePayload(audience), { tenantId: audience.tenantId });
export const audienceMembersRemoved = (audience: Audience): AudienceMembersRemovedEvent =>
  createEvent(AUDIENCE_MEMBERS_REMOVED, audiencePayload(audience), { tenantId: audience.tenantId });
export const audienceArchived = (audience: Audience): AudienceArchivedEvent =>
  createEvent(AUDIENCE_ARCHIVED, audiencePayload(audience), { tenantId: audience.tenantId });

// --- Announcement ----------------------------------------------------------------
export const ANNOUNCEMENT_DRAFTED = "engagement.announcement.drafted";
export const ANNOUNCEMENT_CONTENT_EDITED = "engagement.announcement.content_edited";
export const ANNOUNCEMENT_CATEGORY_SET = "engagement.announcement.category_set";
export const ANNOUNCEMENT_PRIORITY_SET = "engagement.announcement.priority_set";
export const ANNOUNCEMENT_SCHEDULED = "engagement.announcement.scheduled";
export const ANNOUNCEMENT_PUBLISHED = "engagement.announcement.published";
export const ANNOUNCEMENT_PINNED = "engagement.announcement.pinned";
export const ANNOUNCEMENT_UNPINNED = "engagement.announcement.unpinned";
export const ANNOUNCEMENT_ARCHIVED = "engagement.announcement.archived";
export const ANNOUNCEMENT_CANCELLED = "engagement.announcement.cancelled";

export interface AnnouncementEventPayload {
  readonly announcementId: Uuid;
  readonly organizationId: Uuid;
  readonly audienceId: Uuid;
  readonly authorPersonId: Uuid;
  readonly category: string;
  readonly priority: string;
  readonly status: string;
  readonly pinned: boolean;
}

export type AnnouncementDraftedEvent = DomainEvent<
  typeof ANNOUNCEMENT_DRAFTED,
  AnnouncementEventPayload
>;
export type AnnouncementContentEditedEvent = DomainEvent<
  typeof ANNOUNCEMENT_CONTENT_EDITED,
  AnnouncementEventPayload
>;
export type AnnouncementCategorySetEvent = DomainEvent<
  typeof ANNOUNCEMENT_CATEGORY_SET,
  AnnouncementEventPayload
>;
export type AnnouncementPrioritySetEvent = DomainEvent<
  typeof ANNOUNCEMENT_PRIORITY_SET,
  AnnouncementEventPayload
>;
export type AnnouncementScheduledEvent = DomainEvent<
  typeof ANNOUNCEMENT_SCHEDULED,
  AnnouncementEventPayload
>;
export type AnnouncementPublishedEvent = DomainEvent<
  typeof ANNOUNCEMENT_PUBLISHED,
  AnnouncementEventPayload
>;
export type AnnouncementPinnedEvent = DomainEvent<
  typeof ANNOUNCEMENT_PINNED,
  AnnouncementEventPayload
>;
export type AnnouncementUnpinnedEvent = DomainEvent<
  typeof ANNOUNCEMENT_UNPINNED,
  AnnouncementEventPayload
>;
export type AnnouncementArchivedEvent = DomainEvent<
  typeof ANNOUNCEMENT_ARCHIVED,
  AnnouncementEventPayload
>;
export type AnnouncementCancelledEvent = DomainEvent<
  typeof ANNOUNCEMENT_CANCELLED,
  AnnouncementEventPayload
>;

const announcementPayload = (announcement: Announcement): AnnouncementEventPayload => ({
  announcementId: announcement.id,
  organizationId: announcement.organizationId,
  audienceId: announcement.audienceId,
  authorPersonId: announcement.authorPersonId,
  category: announcement.category,
  priority: announcement.priority,
  status: announcement.status,
  pinned: announcement.pinned,
});

export const announcementDrafted = (a: Announcement): AnnouncementDraftedEvent =>
  createEvent(ANNOUNCEMENT_DRAFTED, announcementPayload(a), { tenantId: a.tenantId });
export const announcementContentEdited = (a: Announcement): AnnouncementContentEditedEvent =>
  createEvent(ANNOUNCEMENT_CONTENT_EDITED, announcementPayload(a), { tenantId: a.tenantId });
export const announcementCategorySet = (a: Announcement): AnnouncementCategorySetEvent =>
  createEvent(ANNOUNCEMENT_CATEGORY_SET, announcementPayload(a), { tenantId: a.tenantId });
export const announcementPrioritySet = (a: Announcement): AnnouncementPrioritySetEvent =>
  createEvent(ANNOUNCEMENT_PRIORITY_SET, announcementPayload(a), { tenantId: a.tenantId });
export const announcementScheduled = (a: Announcement): AnnouncementScheduledEvent =>
  createEvent(ANNOUNCEMENT_SCHEDULED, announcementPayload(a), { tenantId: a.tenantId });
export const announcementPublished = (a: Announcement): AnnouncementPublishedEvent =>
  createEvent(ANNOUNCEMENT_PUBLISHED, announcementPayload(a), { tenantId: a.tenantId });
export const announcementPinned = (a: Announcement): AnnouncementPinnedEvent =>
  createEvent(ANNOUNCEMENT_PINNED, announcementPayload(a), { tenantId: a.tenantId });
export const announcementUnpinned = (a: Announcement): AnnouncementUnpinnedEvent =>
  createEvent(ANNOUNCEMENT_UNPINNED, announcementPayload(a), { tenantId: a.tenantId });
export const announcementArchived = (a: Announcement): AnnouncementArchivedEvent =>
  createEvent(ANNOUNCEMENT_ARCHIVED, announcementPayload(a), { tenantId: a.tenantId });
export const announcementCancelled = (a: Announcement): AnnouncementCancelledEvent =>
  createEvent(ANNOUNCEMENT_CANCELLED, announcementPayload(a), { tenantId: a.tenantId });

// --- Acknowledgement receipt -----------------------------------------------------
export const ACKNOWLEDGEMENT_RECORDED = "engagement.acknowledgement.recorded";

export interface AcknowledgementEventPayload {
  readonly receiptId: Uuid;
  readonly organizationId: Uuid;
  readonly announcementId: Uuid;
  readonly personId: Uuid;
  readonly acknowledgedAt: string;
}

export type AcknowledgementRecordedEvent = DomainEvent<
  typeof ACKNOWLEDGEMENT_RECORDED,
  AcknowledgementEventPayload
>;

export const acknowledgementRecorded = (
  receipt: AcknowledgementReceipt,
): AcknowledgementRecordedEvent =>
  createEvent(
    ACKNOWLEDGEMENT_RECORDED,
    {
      receiptId: receipt.id,
      organizationId: receipt.organizationId,
      announcementId: receipt.announcementId,
      personId: receipt.personId,
      acknowledgedAt: receipt.acknowledgedAt,
    },
    { tenantId: receipt.tenantId },
  );

// --- Message thread --------------------------------------------------------------
export const THREAD_OPENED = "engagement.thread.opened";
export const THREAD_PARTICIPANT_ADDED = "engagement.thread.participant_added";
export const THREAD_CLOSED = "engagement.thread.closed";
export const THREAD_REOPENED = "engagement.thread.reopened";
export const THREAD_ARCHIVED = "engagement.thread.archived";

export interface ThreadEventPayload {
  readonly threadId: Uuid;
  readonly organizationId: Uuid;
  readonly participantCount: number;
  readonly status: string;
}

export type ThreadOpenedEvent = DomainEvent<typeof THREAD_OPENED, ThreadEventPayload>;
export type ThreadParticipantAddedEvent = DomainEvent<
  typeof THREAD_PARTICIPANT_ADDED,
  ThreadEventPayload
>;
export type ThreadClosedEvent = DomainEvent<typeof THREAD_CLOSED, ThreadEventPayload>;
export type ThreadReopenedEvent = DomainEvent<typeof THREAD_REOPENED, ThreadEventPayload>;
export type ThreadArchivedEvent = DomainEvent<typeof THREAD_ARCHIVED, ThreadEventPayload>;

const threadPayload = (thread: MessageThread): ThreadEventPayload => ({
  threadId: thread.id,
  organizationId: thread.organizationId,
  participantCount: thread.participantPersonIds.length,
  status: thread.status,
});

export const threadOpened = (t: MessageThread): ThreadOpenedEvent =>
  createEvent(THREAD_OPENED, threadPayload(t), { tenantId: t.tenantId });
export const threadParticipantAdded = (t: MessageThread): ThreadParticipantAddedEvent =>
  createEvent(THREAD_PARTICIPANT_ADDED, threadPayload(t), { tenantId: t.tenantId });
export const threadClosed = (t: MessageThread): ThreadClosedEvent =>
  createEvent(THREAD_CLOSED, threadPayload(t), { tenantId: t.tenantId });
export const threadReopened = (t: MessageThread): ThreadReopenedEvent =>
  createEvent(THREAD_REOPENED, threadPayload(t), { tenantId: t.tenantId });
export const threadArchived = (t: MessageThread): ThreadArchivedEvent =>
  createEvent(THREAD_ARCHIVED, threadPayload(t), { tenantId: t.tenantId });
