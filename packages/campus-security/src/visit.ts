import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { VisitStatus } from "./campus-security-value";
import { OPEN_VISIT_STATUSES } from "./campus-security-value";
import { InvalidVisitTransitionError } from "./errors";

/**
 * A visit — a visitor's specific trip to the campus to see a host (a Person, P2-D01-M02), optionally bound
 * for an access zone, for a stated purpose at a scheduled time. It runs `requested → approved → checked_in →
 * checked_out`, with `denied` (from requested), `cancelled` (from requested/approved) and `expired` (from
 * requested/approved) branches. A `checked_in` visit is what the presence engine counts as on-site; the
 * purpose is held on the aggregate and never rides an event. The organization is the campus context.
 */
export interface Visit {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly visitorId: Uuid;
  readonly hostPersonId: Uuid;
  readonly zoneId: Uuid | null;
  readonly purpose: string | null;
  readonly scheduledFor: string;
  readonly status: VisitStatus;
  readonly checkedInAt: string | null;
  readonly checkedOutAt: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RequestVisitParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly visitorId: Uuid;
  readonly hostPersonId: Uuid;
  readonly zoneId?: Uuid | null;
  readonly purpose?: string | null;
  readonly scheduledFor: string;
}

const OPEN: readonly VisitStatus[] = OPEN_VISIT_STATUSES;

/** Whether a visit is still open (non-terminal — requested, approved or checked-in). */
export const isVisitOpen = (visit: Visit): boolean => OPEN.includes(visit.status);

/** Whether a visit is currently on-site (checked in and not yet checked out). */
export const isVisitOnSite = (visit: Visit): boolean => visit.status === "checked_in";

/** Request a visit (status `requested`, unassigned check-in/out). */
export function requestVisit(params: RequestVisitParams): Visit {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    visitorId: params.visitorId,
    hostPersonId: params.hostPersonId,
    zoneId: params.zoneId ?? null,
    purpose: params.purpose?.trim() || null,
    scheduledFor: params.scheduledFor,
    status: "requested",
    checkedInAt: null,
    checkedOutAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (visit: Visit, patch: Partial<Visit>): Visit => ({
  ...visit,
  ...patch,
  updatedAt: nowIso(),
});

/** Set (or clear) the destination zone — only while the visit is open (requested/approved/checked-in). */
export function setVisitZone(visit: Visit, zoneId: Uuid | null): Visit {
  if (!isVisitOpen(visit)) {
    throw new InvalidVisitTransitionError(visit.status, "zone-set");
  }
  return touch(visit, { zoneId });
}

/** Approve a requested visit (→ `approved`). */
export function approveVisit(visit: Visit): Visit {
  if (visit.status !== "requested") {
    throw new InvalidVisitTransitionError(visit.status, "approved");
  }
  return touch(visit, { status: "approved" });
}

/** Deny a requested visit (→ `denied`, terminal). */
export function denyVisit(visit: Visit): Visit {
  if (visit.status !== "requested") {
    throw new InvalidVisitTransitionError(visit.status, "denied");
  }
  return touch(visit, { status: "denied" });
}

/** Check a visitor in (approved → `checked_in`, recording the arrival time). */
export function checkInVisit(visit: Visit, checkedInAt: string): Visit {
  if (visit.status !== "approved") {
    throw new InvalidVisitTransitionError(visit.status, "checked_in");
  }
  return touch(visit, { status: "checked_in", checkedInAt });
}

/** Check a visitor out (checked_in → `checked_out`, recording the departure time). */
export function checkOutVisit(visit: Visit, checkedOutAt: string): Visit {
  if (visit.status !== "checked_in") {
    throw new InvalidVisitTransitionError(visit.status, "checked_out");
  }
  return touch(visit, { status: "checked_out", checkedOutAt });
}

/** Cancel an unstarted visit (requested/approved → `cancelled`, terminal). */
export function cancelVisit(visit: Visit): Visit {
  if (visit.status !== "requested" && visit.status !== "approved") {
    throw new InvalidVisitTransitionError(visit.status, "cancelled");
  }
  return touch(visit, { status: "cancelled" });
}

/** Expire an unstarted visit whose time has passed (requested/approved → `expired`, terminal). */
export function expireVisit(visit: Visit): Visit {
  if (visit.status !== "requested" && visit.status !== "approved") {
    throw new InvalidVisitTransitionError(visit.status, "expired");
  }
  return touch(visit, { status: "expired" });
}
