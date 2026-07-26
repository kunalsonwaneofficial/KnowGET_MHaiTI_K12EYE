import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyAnnouncementBodyError,
  EmptyAnnouncementTitleError,
  InvalidAnnouncementTransitionError,
} from "./errors";
import type {
  AnnouncementCategory,
  AnnouncementPriority,
  AnnouncementStatus,
} from "./engagement-value";

/**
 * An announcement — a one-to-many broadcast from the institution to an audience, with a title, a body, a
 * category and a priority. It runs `draft → scheduled → published → archived`, with `cancelled` reachable
 * from a pre-published state; content and category/priority are editable only before publication (a published
 * announcement's content is frozen), it can be pinned only while published, and both `published` and
 * `cancelled`/`archived` are terminal for content. Delivery to the audience over channels is the platform
 * notifications service's (P1-M05); reach is derived from the acknowledgement receipts it draws.
 */
export interface Announcement {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly audienceId: Uuid;
  readonly authorPersonId: Uuid;
  readonly title: string;
  readonly body: string;
  readonly category: AnnouncementCategory;
  readonly priority: AnnouncementPriority;
  readonly status: AnnouncementStatus;
  readonly pinned: boolean;
  readonly scheduledFor: string | null;
  readonly publishedAt: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAnnouncementParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly audienceId: Uuid;
  readonly authorPersonId: Uuid;
  readonly title: string;
  readonly body: string;
  readonly category: AnnouncementCategory;
  readonly priority?: AnnouncementPriority;
}

const requireTitle = (title: string): string => {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new EmptyAnnouncementTitleError();
  }
  return trimmed;
};

const requireBody = (body: string): string => {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new EmptyAnnouncementBodyError();
  }
  return trimmed;
};

/** Draft an announcement (status `draft`). Title and body required. */
export function createAnnouncement(params: CreateAnnouncementParams): Announcement {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    audienceId: params.audienceId,
    authorPersonId: params.authorPersonId,
    title: requireTitle(params.title),
    body: requireBody(params.body),
    category: params.category,
    priority: params.priority ?? "normal",
    status: "draft",
    pinned: false,
    scheduledFor: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (announcement: Announcement, patch: Partial<Announcement>): Announcement => ({
  ...announcement,
  ...patch,
  updatedAt: nowIso(),
});

/** Whether the announcement is still editable — draft or scheduled, before publication. */
const isEditable = (announcement: Announcement): boolean =>
  announcement.status === "draft" || announcement.status === "scheduled";

/** Edit an announcement's title and body; only before publication. */
export function editAnnouncementContent(
  announcement: Announcement,
  title: string,
  body: string,
): Announcement {
  if (!isEditable(announcement)) {
    throw new InvalidAnnouncementTransitionError(announcement.status, "content-edited");
  }
  return touch(announcement, { title: requireTitle(title), body: requireBody(body) });
}

/** Set the announcement's category; only before publication. */
export function setAnnouncementCategory(
  announcement: Announcement,
  category: AnnouncementCategory,
): Announcement {
  if (!isEditable(announcement)) {
    throw new InvalidAnnouncementTransitionError(announcement.status, "category-set");
  }
  return touch(announcement, { category });
}

/** Set the announcement's priority; only before publication. */
export function setAnnouncementPriority(
  announcement: Announcement,
  priority: AnnouncementPriority,
): Announcement {
  if (!isEditable(announcement)) {
    throw new InvalidAnnouncementTransitionError(announcement.status, "priority-set");
  }
  return touch(announcement, { priority });
}

/** Schedule an announcement for a future publish time (`draft → scheduled`). */
export function scheduleAnnouncement(
  announcement: Announcement,
  scheduledFor: string,
): Announcement {
  if (announcement.status !== "draft") {
    throw new InvalidAnnouncementTransitionError(announcement.status, "scheduled");
  }
  return touch(announcement, { status: "scheduled", scheduledFor });
}

/** Publish an announcement (`draft`/`scheduled → published`), stamping the publish time. */
export function publishAnnouncement(announcement: Announcement, publishedAt: string): Announcement {
  if (announcement.status !== "draft" && announcement.status !== "scheduled") {
    throw new InvalidAnnouncementTransitionError(announcement.status, "published");
  }
  return touch(announcement, { status: "published", publishedAt });
}

/** Pin a published announcement (surface it). */
export function pinAnnouncement(announcement: Announcement): Announcement {
  if (announcement.status !== "published") {
    throw new InvalidAnnouncementTransitionError(announcement.status, "pinned");
  }
  return touch(announcement, { pinned: true });
}

/** Unpin a published announcement. */
export function unpinAnnouncement(announcement: Announcement): Announcement {
  if (announcement.status !== "published") {
    throw new InvalidAnnouncementTransitionError(announcement.status, "unpinned");
  }
  return touch(announcement, { pinned: false });
}

/** Archive a published announcement (→ `archived`, terminal). */
export function archiveAnnouncement(announcement: Announcement): Announcement {
  if (announcement.status !== "published") {
    throw new InvalidAnnouncementTransitionError(announcement.status, "archived");
  }
  return touch(announcement, { status: "archived", pinned: false });
}

/** Cancel a pre-published announcement (`draft`/`scheduled → cancelled`, terminal). */
export function cancelAnnouncement(announcement: Announcement): Announcement {
  if (announcement.status !== "draft" && announcement.status !== "scheduled") {
    throw new InvalidAnnouncementTransitionError(announcement.status, "cancelled");
  }
  return touch(announcement, { status: "cancelled" });
}

/** Whether the announcement is published (acknowledgements may be recorded against it). */
export const isAnnouncementPublished = (announcement: Announcement): boolean =>
  announcement.status === "published";
