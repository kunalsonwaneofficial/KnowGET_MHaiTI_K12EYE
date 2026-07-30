import { InvalidPayloadSizeError } from "./errors";
import { type EnforcementReason, isCount, normalizeKey } from "./gateway-value";
import type { AdmissionRequest, AdmissionVerdict } from "./gateway-view";

/**
 * The one decision the gateway exists to make: whether this call is served, and if not, why not.
 *
 * Every other engine in this package answers a narrower question — is the contract still serving, which policy
 * applies, is the consumer over its allowance — and this one composes those answers into the single verdict a
 * request is actually admitted or refused on. It computes nothing the others compute. It reads the serving and
 * quota verdicts they produced and settles the order those answers are consulted in, which is the part that has
 * to live in exactly one place.
 *
 * **The order is fixed, and the first failure wins: who you are, whether you may, whether the thing is served,
 * how big it is, how fast you are going.** Order is not presentation here; it decides which of several true
 * statements the caller is told, and only one of them names a remedy they can act on. A suspended consumer whose
 * call is also over quota should hear that they are suspended, because waiting will not help them and calling
 * their account manager will.
 *
 * **Authorisation is settled before existence.** Scope is checked before route status, so a caller without the
 * scope is refused identically whether the route is active, still a draft or retired years ago. The alternative
 * leaks the shape of the platform to anyone with a credential and a list of guesses: a `route_not_active` for one
 * path and a `scope_not_granted` for another is an enumeration oracle, answered one request at a time.
 *
 * **Payload size is checked before quota, and that is deliberate too.** A body over the ceiling will be refused
 * on every retry, so telling the caller they are throttled would send them away to come back and fail the same
 * way in a minute. Ordering it the other way also spends the consumer's allowance on a request that was never
 * going to be served.
 *
 * **`deprecated` is reported on every verdict, including refusals.** A consumer being throttled on a version
 * that sunsets in six weeks needs both facts, and the deprecation is the one with a deadline attached. Dropping
 * it from denials would mean the integrations most in need of the warning — the ones failing often enough that
 * somebody is reading the responses — are the ones that never see it.
 *
 * **Nothing here reads a clock, a database or a consumer's record.** Whether the consumer is active, what scopes
 * they hold and what the quota ledger concluded all arrive on the request, so the verdict the platform gave three
 * months ago can be recomputed exactly from what was logged beside it.
 */

// --- Guards ----------------------------------------------------------------------

/**
 * Refuse a declared body size that is not a size, before it is compared against anything.
 *
 * `null` is a body that does not exist and is not a failure; a negative or fractional count is our own transport
 * mis-reporting, and comparing it to a ceiling would produce an `allow` for a request whose size was never
 * established.
 */
function requirePayloadBytes(payloadBytes: number | null): void {
  if (payloadBytes === null) return;
  if (!isCount(payloadBytes)) throw new InvalidPayloadSizeError(payloadBytes);
}

// --- Refusals --------------------------------------------------------------------

/**
 * The first reason this call cannot be served, or `null` when there is none.
 *
 * Every branch here is a denial. Throttling is not among them, because a throttle is the quota engine's verdict
 * and is carried through with its own decision and its own retry interval rather than being re-derived.
 */
function firstDenial(request: AdmissionRequest): EnforcementReason | null {
  if (!request.consumerActive) return "consumer_not_active";

  const requiredScope = normalizeKey(request.requiredScope);
  if (!request.grantedScopes.includes(requiredScope)) return "scope_not_granted";

  if (request.routeStatus !== "active") return "route_not_active";
  if (!request.serving.served) return request.serving.reason;

  const ceiling = request.limits.maxPayloadBytes;
  if (ceiling !== null && request.payloadBytes !== null && request.payloadBytes > ceiling) {
    return "payload_too_large";
  }

  return null;
}

// --- Admission -------------------------------------------------------------------

/**
 * Decide one inbound call.
 *
 * A denial carries no `retryAfterSeconds`, and that omission is information rather than an oversight: every
 * denial here is a condition that a later identical request meets identically, so a retry interval would be an
 * invitation to poll against a wall. Only the quota engine's outcomes carry one, and it carries the interval the
 * quota engine computed from the window rather than a figure invented here.
 *
 * A quota verdict that is neither `allow` nor a refusal cannot occur — the decision union has three members and
 * `throttle` and `deny` are both passed through — but the reason is taken from the quota verdict in both cases
 * rather than being mapped, so a new enforcement reason added to the quota engine reaches consumers without this
 * function needing to learn about it.
 */
export function admitRequest(request: AdmissionRequest): AdmissionVerdict {
  requirePayloadBytes(request.payloadBytes);

  const deprecated = request.serving.deprecated;
  const denial = firstDenial(request);
  if (denial !== null) {
    return Object.freeze({
      decision: "deny" as const,
      reason: denial,
      deprecated,
      retryAfterSeconds: null,
    });
  }

  if (request.quota.decision !== "allow") {
    return Object.freeze({
      decision: request.quota.decision,
      reason: request.quota.reason,
      deprecated,
      retryAfterSeconds: request.quota.retryAfterSeconds,
    });
  }

  return Object.freeze({
    decision: "allow" as const,
    reason: "within_limits" as const,
    deprecated,
    retryAfterSeconds: null,
  });
}
