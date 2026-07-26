import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyReferralTargetError, InvalidReferralTransitionError } from "./errors";
import type { ReferralStatus, ReferralUrgency } from "./health-centre-value";

/**
 * A referral — a health centre's onward referral of a patient (a Person) to an external provider (a
 * hospital, specialist or diagnostic service). It carries the external target, an urgency, the referring
 * clinician, and an optional reason (held on the aggregate but never placed on a domain event). It runs
 * `raised → accepted → completed`, or `→ cancelled` from either open state. The organization is derived
 * from the centre; onward clinical care at the external provider is out of this platform's scope.
 */
export interface Referral {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly centreId: Uuid;
  readonly patientId: Uuid;
  readonly clinicianId: Uuid | null;
  readonly referredTo: string;
  readonly urgency: ReferralUrgency;
  readonly reason: string | null;
  readonly raisedOn: string;
  readonly status: ReferralStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RaiseReferralParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly centreId: Uuid;
  readonly patientId: Uuid;
  readonly referredTo: string;
  readonly urgency: ReferralUrgency;
  readonly raisedOn: string;
  readonly reason?: string | null;
  readonly clinicianId?: Uuid | null;
}

/** Raise a referral (status `raised`). Target required. */
export function raiseReferral(params: RaiseReferralParams): Referral {
  const referredTo = params.referredTo.trim();
  if (referredTo.length === 0) {
    throw new EmptyReferralTargetError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    centreId: params.centreId,
    patientId: params.patientId,
    clinicianId: params.clinicianId ?? null,
    referredTo,
    urgency: params.urgency,
    reason: params.reason?.trim() || null,
    raisedOn: params.raisedOn,
    status: "raised",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (referral: Referral, patch: Partial<Referral>): Referral => ({
  ...referral,
  ...patch,
  updatedAt: nowIso(),
});

/** Record that the external provider accepted the referral (→ `accepted`). */
export function acceptReferral(referral: Referral): Referral {
  if (referral.status !== "raised") {
    throw new InvalidReferralTransitionError(referral.status, "accepted");
  }
  return touch(referral, { status: "accepted" });
}

/** Complete an accepted referral (→ `completed`). */
export function completeReferral(referral: Referral): Referral {
  if (referral.status !== "accepted") {
    throw new InvalidReferralTransitionError(referral.status, "completed");
  }
  return touch(referral, { status: "completed" });
}

/** Cancel an open referral (→ `cancelled`). */
export function cancelReferral(referral: Referral): Referral {
  if (referral.status !== "raised" && referral.status !== "accepted") {
    throw new InvalidReferralTransitionError(referral.status, "cancelled");
  }
  return touch(referral, { status: "cancelled" });
}

/** Whether the referral is still open (raised or accepted). */
export const isReferralOpen = (referral: Referral): boolean =>
  referral.status === "raised" || referral.status === "accepted";
