import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateRollCallMarkError,
  InvalidRollCallTransitionError,
  ResidentNotOnRosterError,
  RollCallNotInProgressError,
} from "./errors";
import { computeRollCall } from "./roll-call";
import { makeRollCallMark, type RollCallMark, type RollCallMarkInput } from "./roll-call-mark";
import type { RollCallStatus } from "./residential-value";
import type { RollCallSummary } from "./residential-view";

/**
 * A roll call — a curfew presence check for a {@link Hostel} against its resident roster. It captures the
 * expected residents at scheduling and accumulates one marking per resident while in progress. It runs
 * `scheduled → in_progress → completed`, or `cancelled`. A marking is rejected if the resident is not on
 * the roster or has already been marked. The summary (present/absent/on-leave counts and the
 * safety-critical unaccounted-for number) is derived by the pure engine, never stored. The organization
 * is derived from the hostel.
 */
export interface RollCall {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly hostelId: Uuid;
  readonly scheduledFor: string;
  readonly expectedResidentIds: readonly Uuid[];
  readonly marks: readonly RollCallMark[];
  readonly status: RollCallStatus;
  readonly startedAt: ISODateString | null;
  readonly completedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ScheduleRollCallParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly hostelId: Uuid;
  readonly scheduledFor: string;
  readonly expectedResidentIds: readonly Uuid[];
}

/** Schedule a roll call (status `scheduled`, no marks yet), capturing the resident roster. */
export function scheduleRollCall(params: ScheduleRollCallParams): RollCall {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    hostelId: params.hostelId,
    scheduledFor: params.scheduledFor,
    expectedResidentIds: [...params.expectedResidentIds],
    marks: [],
    status: "scheduled",
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (rollCall: RollCall, patch: Partial<RollCall>): RollCall => ({
  ...rollCall,
  ...patch,
  updatedAt: nowIso(),
});

/** Whether the resident is on the roll call's roster. */
export const isResidentOnRoster = (rollCall: RollCall, residentId: Uuid): boolean =>
  rollCall.expectedResidentIds.includes(residentId);

/** Whether the resident has already been marked on the roll call. */
export const isResidentMarked = (rollCall: RollCall, residentId: Uuid): boolean =>
  rollCall.marks.some((m) => m.residentId === residentId);

/** Start a scheduled roll call (→ `in_progress`), stamping the start time. */
export function startRollCall(rollCall: RollCall): RollCall {
  if (rollCall.status !== "scheduled") {
    throw new InvalidRollCallTransitionError(rollCall.status, "in_progress");
  }
  return touch(rollCall, { status: "in_progress", startedAt: nowIso() });
}

/**
 * Record a resident's marking on an in-progress roll call. Rejected if the roll call is not in progress,
 * the resident is not on the roster, or the resident has already been marked.
 */
export function recordRollCallMark(rollCall: RollCall, input: RollCallMarkInput): RollCall {
  if (rollCall.status !== "in_progress") {
    throw new RollCallNotInProgressError(rollCall.id);
  }
  const mark = makeRollCallMark(input);
  if (!isResidentOnRoster(rollCall, mark.residentId)) {
    throw new ResidentNotOnRosterError(rollCall.id, mark.residentId);
  }
  if (isResidentMarked(rollCall, mark.residentId)) {
    throw new DuplicateRollCallMarkError(rollCall.id, mark.residentId);
  }
  return touch(rollCall, { marks: [...rollCall.marks, mark] });
}

/** Complete an in-progress roll call (→ `completed`), stamping the completion time. */
export function completeRollCall(rollCall: RollCall): RollCall {
  if (rollCall.status !== "in_progress") {
    throw new InvalidRollCallTransitionError(rollCall.status, "completed");
  }
  return touch(rollCall, { status: "completed", completedAt: nowIso() });
}

/** Cancel a scheduled or in-progress roll call (→ `cancelled`). */
export function cancelRollCall(rollCall: RollCall): RollCall {
  if (rollCall.status !== "scheduled" && rollCall.status !== "in_progress") {
    throw new InvalidRollCallTransitionError(rollCall.status, "cancelled");
  }
  return touch(rollCall, { status: "cancelled" });
}

/** The roll call's reconciled summary (counts + unaccounted-for), via the pure engine. */
export const rollCallSummary = (rollCall: RollCall): RollCallSummary =>
  computeRollCall(rollCall.expectedResidentIds.length, rollCall.marks);
