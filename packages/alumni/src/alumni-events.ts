import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { AlumniChapter } from "./alumni-chapter";
import type { AlumniProfile } from "./alumni-profile";

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
