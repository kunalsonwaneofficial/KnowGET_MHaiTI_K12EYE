import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidOfferTransitionError } from "./errors";
import type { OfferStatus } from "./admissions-value";

/**
 * An admission offer — a seat offer extended for an application that has reached the `offered` state, for a
 * grade, with an optional response deadline. It runs `extended → accepted → …`; from `extended` it may also
 * be `declined`, `expired` or `withdrawn`. Accepting an offer is the bridge to an enrollment confirmation
 * (which hands the enrolled student off to Student Lifecycle, P2-D03). One offer per application.
 */
export interface Offer {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly applicationId: Uuid;
  readonly cycleId: Uuid;
  readonly gradeOffered: string;
  readonly extendedOn: string;
  readonly respondBy: string | null;
  readonly status: OfferStatus;
  readonly respondedOn: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ExtendOfferParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly applicationId: Uuid;
  readonly cycleId: Uuid;
  readonly gradeOffered: string;
  readonly extendedOn: string;
  readonly respondBy?: string | null;
}

/** Extend an offer (status `extended`). */
export function extendOffer(params: ExtendOfferParams): Offer {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    applicationId: params.applicationId,
    cycleId: params.cycleId,
    gradeOffered: params.gradeOffered,
    extendedOn: params.extendedOn,
    respondBy: params.respondBy?.trim() || null,
    status: "extended",
    respondedOn: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (offer: Offer, patch: Partial<Offer>): Offer => ({
  ...offer,
  ...patch,
  updatedAt: nowIso(),
});

/** Accept an extended offer (→ `accepted`), stamping the response date. */
export function acceptOffer(offer: Offer, respondedOn: string): Offer {
  if (offer.status !== "extended") {
    throw new InvalidOfferTransitionError(offer.status, "accepted");
  }
  return touch(offer, { status: "accepted", respondedOn });
}

/** Decline an extended offer (→ `declined`, terminal), stamping the response date. */
export function declineOffer(offer: Offer, respondedOn: string): Offer {
  if (offer.status !== "extended") {
    throw new InvalidOfferTransitionError(offer.status, "declined");
  }
  return touch(offer, { status: "declined", respondedOn });
}

/** Expire an unanswered offer (→ `expired`, terminal). */
export function expireOffer(offer: Offer): Offer {
  if (offer.status !== "extended") {
    throw new InvalidOfferTransitionError(offer.status, "expired");
  }
  return touch(offer, { status: "expired" });
}

/** Withdraw an extended offer (→ `withdrawn`, terminal). */
export function withdrawOffer(offer: Offer): Offer {
  if (offer.status !== "extended") {
    throw new InvalidOfferTransitionError(offer.status, "withdrawn");
  }
  return touch(offer, { status: "withdrawn" });
}

/** Whether the offer has been accepted (an enrollment may be confirmed from it). */
export const isOfferAccepted = (offer: Offer): boolean => offer.status === "accepted";
