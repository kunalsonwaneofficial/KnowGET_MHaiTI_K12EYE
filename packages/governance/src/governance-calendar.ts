import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyCalendarEntryTitleError, InvalidCalendarEntryTransitionError } from "./errors";
import type { GovernanceEventType } from "./governance-event-type";

export type CalendarEntryStatus = "scheduled" | "completed" | "cancelled";

/**
 * An entry on the governance calendar — a meeting, compliance deadline, board
 * activity, regulatory event or review. Meetings capture minutes and attendance on
 * completion. Optionally tied to a governance body and/or committee. Together the
 * entries and the resolutions form the auditable governance history.
 */
export interface GovernanceCalendarEntry {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly governanceBodyId: Uuid | null;
  readonly committeeId: Uuid | null;
  readonly type: GovernanceEventType;
  readonly title: string;
  readonly description: string | null;
  readonly scheduledOn: string;
  readonly status: CalendarEntryStatus;
  readonly completedOn: string | null;
  /** Minutes recorded when a meeting entry is completed. */
  readonly minutes: string | null;
  /** Attendee Person ids recorded when a meeting entry is completed. */
  readonly attendeeIds: readonly Uuid[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ScheduleEntryParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly type: GovernanceEventType;
  readonly title: string;
  readonly scheduledOn: string;
  readonly governanceBodyId?: Uuid | null;
  readonly committeeId?: Uuid | null;
  readonly description?: string | null;
}

/** Schedule a new governance calendar entry (rejecting an empty title). */
export function scheduleEntry(params: ScheduleEntryParams): GovernanceCalendarEntry {
  const title = params.title.trim();
  if (title.length === 0) {
    throw new EmptyCalendarEntryTitleError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    governanceBodyId: params.governanceBodyId ?? null,
    committeeId: params.committeeId ?? null,
    type: params.type,
    title,
    description: params.description?.trim() || null,
    scheduledOn: params.scheduledOn,
    status: "scheduled",
    completedOn: null,
    minutes: null,
    attendeeIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  entry: GovernanceCalendarEntry,
  patch: Partial<GovernanceCalendarEntry>,
): GovernanceCalendarEntry => ({
  ...entry,
  ...patch,
  updatedAt: nowIso(),
});

/** Move a scheduled entry to a new date. */
export function rescheduleEntry(
  entry: GovernanceCalendarEntry,
  scheduledOn: string,
): GovernanceCalendarEntry {
  if (entry.status !== "scheduled") {
    throw new InvalidCalendarEntryTransitionError(entry.status, "rescheduled");
  }
  return touch(entry, { scheduledOn });
}

export interface CompleteEntryParams {
  readonly completedOn?: string | null;
  readonly minutes?: string | null;
  readonly attendeeIds?: readonly Uuid[];
}

/** Complete a scheduled entry, recording minutes and attendance for meetings. */
export function completeEntry(
  entry: GovernanceCalendarEntry,
  params: CompleteEntryParams = {},
): GovernanceCalendarEntry {
  if (entry.status !== "scheduled") {
    throw new InvalidCalendarEntryTransitionError(entry.status, "completed");
  }
  return touch(entry, {
    status: "completed",
    completedOn: params.completedOn ?? nowIso().slice(0, 10),
    minutes: params.minutes?.trim() || null,
    attendeeIds: params.attendeeIds ?? [],
  });
}

/** Cancel a scheduled entry. */
export function cancelEntry(entry: GovernanceCalendarEntry): GovernanceCalendarEntry {
  if (entry.status !== "scheduled") {
    throw new InvalidCalendarEntryTransitionError(entry.status, "cancelled");
  }
  return touch(entry, { status: "cancelled" });
}

/** True when a scheduled entry's date has passed relative to `on`. */
export const isOverdue = (entry: GovernanceCalendarEntry, on: string): boolean =>
  entry.status === "scheduled" && entry.scheduledOn < on;
