import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  BurstBelowLimitError,
  EmptyGatewayKeyError,
  EmptyTrafficPolicyError,
  IncompleteRateLimitError,
  InvalidGatewayKeyError,
  InvalidPolicyLimitError,
  PolicyScopeMismatchError,
} from "./errors";
import { type PolicyScope, isPositiveCount, isValidKey, normalizeKey } from "./gateway-value";
import type { PolicyCandidate, PolicyLimits } from "./gateway-view";

/**
 * A traffic policy: how much of the platform one consumer, one capability, or everybody may use.
 *
 * The aggregate holds limits and the subject they attach to. It does not count anything and it does not decide
 * anything about a live request — counting belongs to the shared rate limiter the platform already owns, and
 * deciding belongs to the admission engine. What is settled here is the question those two cannot answer on
 * their own: *which numbers apply to this caller*, expressed as a record an operator can read, change and be
 * held to.
 *
 * **A policy's scope and its subject are one fact, checked as one.** A `consumer` policy that names no consumer
 * and a `global` policy that names one are both records that look configured and apply to nothing, or to
 * everything, depending on which query finds them. {@link defineTrafficPolicy} refuses both rather than
 * tolerating the field being empty, because the alternative — a resolver that skips incoherent rows — turns a
 * data-entry mistake into a silent absence of protection that nobody discovers until the traffic arrives.
 *
 * **A policy that sets nothing is refused.** {@link EmptyTrafficPolicyError} exists because an all-null policy
 * is the most dangerous row this table can hold: it appears in every listing, it satisfies every audit that
 * checks a policy exists, and it constrains nothing at all. Half a rate limit is refused for the same reason —
 * a window with no count enforces nothing while reading like a limit, and a count with no window would have to
 * be completed with an assumption the operator never made.
 *
 * **A policy is active the moment it is defined.** Unlike a contract or a route, nothing external can see a
 * policy, so there is no publication step to get wrong — and the failure mode of a two-step activation is
 * specific and bad: the protection an operator believes they configured is not in force, and the way they find
 * out is the incident it was written to prevent. Deactivation exists and is reversible; see
 * {@link deactivateTrafficPolicy} for why it does not raise on a repeat.
 */

// --- The aggregate ---------------------------------------------------------------

export interface TrafficPolicy {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** What the policy attaches to. Fixed at definition: changing it is a different policy. */
  readonly scope: PolicyScope;
  /** The consumer this applies to, for the two consumer scopes. `null` for the other two. */
  readonly consumerId: Uuid | null;
  /** The capability this applies to, for the two capability scopes. `null` for the other two. */
  readonly capabilityKey: string | null;
  /** What an operator sees in a list — `Trial tier`, `Bulk export`. Revisable; it is a label. */
  readonly displayName: string;
  readonly limits: PolicyLimits;
  /** Whether the policy is in force. Deactivation is how a policy stops applying without being lost. */
  readonly active: boolean;
  readonly deactivatedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DefineTrafficPolicyParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly scope: PolicyScope;
  readonly consumerId: Uuid | null;
  readonly capabilityKey: string | null;
  readonly displayName: string;
  readonly limits: PolicyLimits;
}

// --- Guards ----------------------------------------------------------------------

/** Normalise a key and refuse it if it is blank or does not fit the platform's grammar. */
function requireKey(kind: string, value: string): string {
  const key = normalizeKey(value);
  if (key.length === 0) throw new EmptyGatewayKeyError(kind);
  if (!isValidKey(key)) throw new InvalidGatewayKeyError(kind, key);
  return key;
}

/** An unset limit is not enforced; a set one must be a figure that means something. */
function requireLimit(name: string, value: number | null): void {
  if (value === null) return;
  if (!isPositiveCount(value)) throw new InvalidPolicyLimitError(name, value);
}

/**
 * Refuse a set of limits that could not be enforced as written.
 *
 * The checks run in the order an operator would fix them: each figure on its own, then the pairs that only mean
 * something together, then the relationship between the rate and its burst, and only last the question of
 * whether anything was set at all. Reversing the last two would answer a window with no count — a half-finished
 * thought — with a complaint that the policy is empty, which is both true and unhelpful.
 *
 * A burst equal to the sustained limit is accepted. It expresses *no burst allowance*, which is a coherent
 * thing to want and a tedious one to express by leaving a field blank and remembering why.
 */
function requireLimits(scope: PolicyScope, limits: PolicyLimits): PolicyLimits {
  requireLimit("requestsPerWindow", limits.requestsPerWindow);
  requireLimit("burstAllowance", limits.burstAllowance);
  requireLimit("maxPayloadBytes", limits.maxPayloadBytes);
  requireLimit("timeoutMs", limits.timeoutMs);

  if (limits.requestsPerWindow !== null && limits.window === null) {
    throw new IncompleteRateLimitError("the window");
  }
  if (limits.window !== null && limits.requestsPerWindow === null) {
    throw new IncompleteRateLimitError("the request count");
  }
  if (limits.burstAllowance !== null && limits.requestsPerWindow === null) {
    throw new IncompleteRateLimitError("the sustained count the burst rises above");
  }
  if (
    limits.burstAllowance !== null &&
    limits.requestsPerWindow !== null &&
    limits.burstAllowance < limits.requestsPerWindow
  ) {
    throw new BurstBelowLimitError(limits.burstAllowance, limits.requestsPerWindow);
  }

  const setsSomething =
    limits.requestsPerWindow !== null ||
    limits.maxPayloadBytes !== null ||
    limits.timeoutMs !== null;
  if (!setsSomething) throw new EmptyTrafficPolicyError(scope);

  return Object.freeze({ ...limits });
}

/**
 * Refuse a policy whose scope and subject disagree.
 *
 * Both directions are checked. A missing subject is the obvious mistake; a *surplus* one is the dangerous one,
 * because a global policy carrying a consumer id reads, to everybody who looks at the row afterwards, as though
 * it applies to that consumer alone — and it does not.
 */
function requireScopeSubject(params: DefineTrafficPolicyParams): {
  readonly consumerId: Uuid | null;
  readonly capabilityKey: string | null;
} {
  const namesConsumer = params.scope === "consumer" || params.scope === "consumer_capability";
  const namesCapability = params.scope === "capability" || params.scope === "consumer_capability";

  if (namesConsumer && params.consumerId === null) {
    throw new PolicyScopeMismatchError(params.scope, "must name the consumer it applies to");
  }
  if (!namesConsumer && params.consumerId !== null) {
    throw new PolicyScopeMismatchError(params.scope, "must not name a consumer");
  }
  if (namesCapability && params.capabilityKey === null) {
    throw new PolicyScopeMismatchError(params.scope, "must name the capability it applies to");
  }
  if (!namesCapability && params.capabilityKey !== null) {
    throw new PolicyScopeMismatchError(params.scope, "must not name a capability");
  }

  return {
    consumerId: params.consumerId,
    capabilityKey:
      params.capabilityKey === null ? null : requireKey("capability key", params.capabilityKey),
  };
}

// --- Definition ------------------------------------------------------------------

/** Define a traffic policy, in force from the moment it exists. */
export function defineTrafficPolicy(params: DefineTrafficPolicyParams): TrafficPolicy {
  const subject = requireScopeSubject(params);
  const limits = requireLimits(params.scope, params.limits);
  const now = nowIso();

  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    scope: params.scope,
    consumerId: subject.consumerId,
    capabilityKey: subject.capabilityKey,
    displayName: params.displayName.trim(),
    limits,
    active: true,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Replace a policy's limits wholesale.
 *
 * Wholesale rather than field by field, and the same argument that governs resolution governs this: a partial
 * edit needs a way to say *unset this one*, and every encoding of that in a patch — `null` meaning clear versus
 * `null` meaning leave alone — is a convention somebody will get backwards while raising a ceiling.
 */
export function reviseTrafficPolicy(policy: TrafficPolicy, limits: PolicyLimits): TrafficPolicy {
  return { ...policy, limits: requireLimits(policy.scope, limits), updatedAt: nowIso() };
}

/** Change the label an operator reads. The scope, the subject and the limits are untouched. */
export function renameTrafficPolicy(policy: TrafficPolicy, displayName: string): TrafficPolicy {
  return { ...policy, displayName: displayName.trim(), updatedAt: nowIso() };
}

// --- Force -----------------------------------------------------------------------

/**
 * Take a policy out of force, keeping the record.
 *
 * A repeat is not an error, and this is the one place in the package where that is true. A consumer or a
 * contract has a status somebody outside the institution can observe, so telling an operator they have already
 * made the change is telling them something that matters. A policy has no external observer and no terminal
 * state: deactivating one twice leaves the platform in the state the operator asked for both times. Raising
 * would convert a retried request — a double-clicked button, a re-run playbook — into an incident report.
 *
 * The record is returned untouched rather than restamped, so `updatedAt` continues to answer *when did this
 * policy last change* rather than *when was it last written to*.
 */
export function deactivateTrafficPolicy(policy: TrafficPolicy): TrafficPolicy {
  if (!policy.active) return policy;
  const now = nowIso();
  return { ...policy, active: false, deactivatedAt: now, updatedAt: now };
}

/** Put a policy back in force. `deactivatedAt` is cleared: it records a current absence, not a history. */
export function reactivateTrafficPolicy(policy: TrafficPolicy): TrafficPolicy {
  if (policy.active) return policy;
  return { ...policy, active: true, deactivatedAt: null, updatedAt: nowIso() };
}

/** Whether the policy is in force. */
export const isTrafficPolicyActive = (policy: TrafficPolicy): boolean => policy.active;

// --- Projection ------------------------------------------------------------------

/**
 * Reduce a policy to what resolution needs.
 *
 * The candidate carries no tenant, no organisation, no label and no timestamps, because resolution is a hot
 * path that runs on every inbound call and should be handed the four facts it reads rather than a record it has
 * to be trusted to ignore.
 */
export const toPolicyCandidate = (policy: TrafficPolicy): PolicyCandidate =>
  Object.freeze({
    policyId: policy.id,
    scope: policy.scope,
    consumerId: policy.consumerId,
    capabilityKey: policy.capabilityKey,
    limits: policy.limits,
    active: policy.active,
  });
