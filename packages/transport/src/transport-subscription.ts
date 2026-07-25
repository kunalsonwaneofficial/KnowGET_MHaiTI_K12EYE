import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidSubscriptionTransitionError } from "./errors";
import type { RouteDirection, SubscriptionStatus } from "./transport-value";

/**
 * A student's transport subscription — their enrollment on a {@link Route}, riding from a pickup stop to
 * a drop stop in one direction. It runs `requested → active → suspended → ended`. The pickup/drop stops
 * are validated against the route by the service; the organization is derived from the student. Exactly
 * one open (requested/active/suspended) subscription per student per route.
 */
export interface TransportSubscription {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly routeId: Uuid;
  readonly pickupStopKey: string;
  readonly dropStopKey: string;
  readonly direction: RouteDirection;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly status: SubscriptionStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RequestSubscriptionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly routeId: Uuid;
  readonly pickupStopKey: string;
  readonly dropStopKey: string;
  readonly direction: RouteDirection;
  readonly effectiveFrom: string;
}

/** Request a transport subscription (status `requested`). */
export function requestSubscription(params: RequestSubscriptionParams): TransportSubscription {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    routeId: params.routeId,
    pickupStopKey: params.pickupStopKey,
    dropStopKey: params.dropStopKey,
    direction: params.direction,
    effectiveFrom: params.effectiveFrom,
    effectiveTo: null,
    status: "requested",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  subscription: TransportSubscription,
  patch: Partial<TransportSubscription>,
): TransportSubscription => ({
  ...subscription,
  ...patch,
  updatedAt: nowIso(),
});

/** Activate a requested subscription (→ `active`). */
export function activateSubscription(subscription: TransportSubscription): TransportSubscription {
  if (subscription.status !== "requested") {
    throw new InvalidSubscriptionTransitionError(subscription.status, "active");
  }
  return touch(subscription, { status: "active" });
}

/** Suspend an active subscription (→ `suspended`). */
export function suspendSubscription(subscription: TransportSubscription): TransportSubscription {
  if (subscription.status !== "active") {
    throw new InvalidSubscriptionTransitionError(subscription.status, "suspended");
  }
  return touch(subscription, { status: "suspended" });
}

/** Resume a suspended subscription (→ `active`). */
export function resumeSubscription(subscription: TransportSubscription): TransportSubscription {
  if (subscription.status !== "suspended") {
    throw new InvalidSubscriptionTransitionError(subscription.status, "active");
  }
  return touch(subscription, { status: "active" });
}

/** End a subscription (→ `ended`, terminal), recording the effective end date. */
export function endSubscription(
  subscription: TransportSubscription,
  effectiveTo?: string | null,
): TransportSubscription {
  if (subscription.status === "ended") {
    throw new InvalidSubscriptionTransitionError(subscription.status, "ended");
  }
  return touch(subscription, { status: "ended", effectiveTo: effectiveTo ?? null });
}

/** Whether the subscription is currently active (a riding student counted for utilization). */
export const isSubscriptionActive = (subscription: TransportSubscription): boolean =>
  subscription.status === "active";

/** Whether the subscription is still open (not ended) — blocks a second subscription on the route. */
export const isSubscriptionOpen = (subscription: TransportSubscription): boolean =>
  subscription.status !== "ended";
