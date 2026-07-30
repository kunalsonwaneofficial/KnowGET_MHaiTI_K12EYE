import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import { isUuid } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * Permissions gating the gateway surface (P3-D01). Five scopes, and the split follows this contract's own rule —
 * expose capabilities, never implementation — by separating the acts that widen what an outsider may reach from
 * the acts that merely operate what is already reachable.
 *
 * `gateway:read` is every read: consumers, contracts and their routes, traffic policies, endpoints, webhook
 * subscriptions, the delivery ledger and the idempotency ledger. Wide on purpose. An institution that cannot see
 * which outside systems hold keys to it, what those keys open, and what has been sent where has no integration
 * governance at all — and a reader is shown a route's public address, method, version and required scope while
 * never being shown the internal target it resolves to, because that projection is enforced in the controllers
 * rather than in the permission model.
 *
 * `gateway:publish` is the surface-definition scope: defining, revising, publishing, deprecating and sunsetting a
 * contract, and registering, revising, retargeting, activating and retiring the routes under one. This is the act
 * of deciding what the platform offers the outside world and under what version, and it is separated from every
 * other write because a published route is a promise a third party will build against. Retargeting sits here
 * rather than in an operational scope for the same reason: pointing a live public address at a different internal
 * capability changes what a caller's existing integration actually invokes, without changing anything they can
 * see.
 *
 * `gateway:admit` stands alone and is the narrowest scope here, because it is the one that hands out access.
 * Registering a consumer, rotating its credential, granting and revoking its scopes, activating, suspending and
 * retiring it. Granting scopes is authorization amplification — whoever holds this scope can give an outside
 * system reach it did not have, up to and including reach the grantor does not themselves hold — so it is not
 * bundled with publishing. A person who defines what the platform offers still cannot decide who may call it.
 *
 * `gateway:integrate` is the outbound arrangement scope: registering, renaming, rebinding, activating,
 * quarantining, disabling and retiring an integration endpoint, and creating, resubscribing, rebinding, rotating
 * the secret of, pausing, resuming and revoking a webhook subscription. Every subscription is an egress path, so
 * this scope is what somebody needs before institutional facts start leaving the platform on a wire. It is kept
 * apart from `gateway:admit` because an inbound key and an outbound feed fail in opposite directions and are
 * almost never the same person's job.
 *
 * `gateway:operate` is the running surface: defining, revising, renaming, deactivating and reactivating traffic
 * policies; the quarantine sweep; replaying and abandoning a dead-lettered delivery; and the idempotency purge.
 * None of it changes what exists or who may reach it — a policy tightens or loosens a limit on an arrangement
 * somebody else made, a replay re-sends a payload that was already authorised, and the two sweeps are
 * housekeeping the platform would otherwise ask a human to remember. It is separate rather than folded into the
 * scopes above because this is the work an operations rota does at three in the morning, and the account that
 * does it should not be able to admit a new consumer or publish a route.
 */
export const GATEWAY_READ = "gateway:read";
export const GATEWAY_PUBLISH = "gateway:publish";
export const GATEWAY_ADMIT = "gateway:admit";
export const GATEWAY_INTEGRATE = "gateway:integrate";
export const GATEWAY_OPERATE = "gateway:operate";

interface ZodLike<T> {
  safeParse: (
    value: unknown,
  ) => { success: true; data: T } | { success: false; error: { issues: unknown } };
}

/** Parse a request body with a zod schema, mapping failure to a 400 ValidationError. */
export function parseBody<T>(schema: ZodLike<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError("Invalid request body", { details: { issues: result.error.issues } });
  }
  return result.data;
}

/** The tenant of the current principal, or a 400 when none is associated. */
export function tenantOf(principal: Principal): TenantId {
  if (!principal.tenantId) {
    throw new ValidationError("No tenant is associated with the current principal");
  }
  return principal.tenantId;
}

/**
 * The person the institution will be held to — who admitted a consumer, who granted it a scope, who published a
 * route, who pointed an endpoint somewhere new, who revoked a feed, who replayed a delivery.
 *
 * Taken from the authenticated principal and never from the body, anywhere in this domain. This is the contract
 * where every write either widens or narrows what an outside system can reach into the institution, and the only
 * thing that makes such a change reviewable afterwards is knowing whose decision it was. A `registeredBy` a
 * caller could type in would let the one act that hands out access to institutional data be attributed to
 * whoever the caller found convenient — which is the same as recording nothing, except that it reads like a
 * record.
 *
 * An unidentifiable principal is refused here rather than recorded as nobody. The aggregates do admit `null`
 * attribution, because a delivery attempt or a sweep genuinely has no user behind it — but that is a decision for
 * a background worker to make, not something an authenticated HTTP request should ever produce.
 */
export function actorOf(principal: Principal): Uuid {
  const actor = principal.id.trim();
  if (!actor || !isUuid(actor)) {
    throw new ValidationError("No user is associated with the current principal");
  }
  return actor as Uuid;
}
