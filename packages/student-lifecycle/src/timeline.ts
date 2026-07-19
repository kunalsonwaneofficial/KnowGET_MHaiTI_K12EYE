import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyTimelineSummaryError } from "./errors";

/** The kinds of institutional event captured on a learner's permanent timeline. */
export type TimelineEntryType =
  | "admission"
  | "enrollment"
  | "class_change"
  | "promotion"
  | "award"
  | "incident"
  | "intervention"
  | "graduation"
  | "status_change"
  | "note";

/**
 * A single immutable event on a student's permanent institutional timeline. The
 * timeline is append-only — no historical event is ever edited or lost. `sourceEvent`
 * links back to the domain event that produced the entry, when there is one.
 */
export interface TimelineEntry {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly studentId: Uuid;
  readonly organizationId: Uuid;
  readonly type: TimelineEntryType;
  readonly occurredOn: string;
  readonly summary: string;
  readonly detail: string | null;
  readonly sourceEvent: string | null;
  readonly recordedAt: ISODateString;
}

export interface RecordTimelineEntryParams {
  readonly tenantId: TenantId;
  readonly studentId: Uuid;
  readonly organizationId: Uuid;
  readonly type: TimelineEntryType;
  readonly summary: string;
  readonly occurredOn?: string | null;
  readonly detail?: string | null;
  readonly sourceEvent?: string | null;
}

/** Record a new immutable timeline entry (rejecting an empty summary). */
export function recordTimelineEntry(params: RecordTimelineEntryParams): TimelineEntry {
  const summary = params.summary.trim();
  if (summary.length === 0) {
    throw new EmptyTimelineSummaryError();
  }
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    studentId: params.studentId,
    organizationId: params.organizationId,
    type: params.type,
    occurredOn: params.occurredOn ?? nowIso().slice(0, 10),
    summary,
    detail: params.detail?.trim() || null,
    sourceEvent: params.sourceEvent?.trim() || null,
    recordedAt: nowIso(),
  };
}
