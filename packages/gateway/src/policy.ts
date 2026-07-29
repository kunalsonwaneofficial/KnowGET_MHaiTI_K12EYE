import type { Uuid } from "@knowget/types";
import { normalizeKey, policySpecificity } from "./gateway-value";
import type {
  EffectivePolicy,
  PolicyCandidate,
  PolicyLimits,
  PolicySelector,
} from "./gateway-view";

/**
 * Which traffic policy actually applies to a call, and what the ones it beat were.
 *
 * Four scopes compete for every request — everybody, this capability, this consumer, this consumer on this
 * capability — and exactly one of them has to win, deterministically, on every replica, in an order nobody has
 * to think about. {@link policySpecificity} gives each scope a distinct rank, so the winner is a fact about the
 * vocabulary rather than about which row a query returned first.
 *
 * **The most specific policy wins wholesale; limits are not merged.** This is the load-bearing decision in the
 * module and the tempting alternative is merging — take the rate from the consumer policy, the payload ceiling
 * from the global one, and so on. Merging is refused because it leaves no way to express *this consumer has no
 * payload ceiling*: an unset field would have to mean inherit, so removing a limit at a specific scope becomes
 * impossible and an operator writing "this integration is exempt" writes something that half works. With
 * wholesale replacement an unset limit means exactly one thing — not enforced — and the policy an operator reads
 * is the policy that is applied. The cost is real and worth stating: a consumer policy that sets only a rate
 * gives that consumer no payload ceiling at all, so the specific policy has to be written in full.
 *
 * **The losers are named rather than discarded.** *Why am I limited to a hundred a minute* is the question a
 * gateway is asked more than any other, and {@link EffectivePolicy.supersededPolicyIds} is the difference
 * between answering it by naming the four policies considered and the one that won, and answering it by reading
 * a table for an afternoon.
 *
 * **A tie is impossible by construction and survivable anyway.** Two active policies at the same scope over the
 * same subject are refused when the second is created, so the specificity ranking never has to break a tie. If
 * one reaches here through a repair script or a restore, resolution still orders by policy id, because two
 * replicas disagreeing about a consumer's rate limit is a far worse failure than one of two identical-scope
 * policies quietly winning.
 *
 * Nothing here reads a clock, a store or a counter. Candidates in, verdict out.
 */

// --- No policy -------------------------------------------------------------------

/**
 * The limits that apply when no policy does: none of them.
 *
 * Open rather than closed, and deliberately. A gateway whose default was *deny everything* would take a
 * misconfigured tenant — one whose policies failed to load, or were never written — and turn it into a total
 * outage for every integration the institution runs, which is a far larger failure than the unmetered traffic
 * the alternative permits. Policy is a governor on traffic the platform has already decided to serve; the
 * decision to serve at all is admission's, and admission refuses on identity, scope and lifecycle whether a
 * policy exists or not.
 */
export const UNLIMITED: PolicyLimits = Object.freeze({
  requestsPerWindow: null,
  window: null,
  burstAllowance: null,
  maxPayloadBytes: null,
  timeoutMs: null,
});

/** The verdict when nothing applied: no policy, no scope, no limits, nothing superseded. */
const noPolicy = (): EffectivePolicy =>
  Object.freeze({
    policyId: null,
    scope: null,
    limits: UNLIMITED,
    consideredCount: 0,
    supersededPolicyIds: Object.freeze([]) as readonly Uuid[],
  });

// --- Applicability ---------------------------------------------------------------

/**
 * Whether one policy is in the running for one request.
 *
 * Inactive policies are excluded here rather than by the caller, so that every path into resolution honours
 * deactivation. A policy left out of force by an operator that still applied because one query forgot to filter
 * on it would be the exact failure deactivation exists to make impossible.
 */
export function policyApplies(candidate: PolicyCandidate, selector: PolicySelector): boolean {
  if (!candidate.active) return false;

  const capabilityKey = normalizeKey(selector.capabilityKey);

  switch (candidate.scope) {
    case "global":
      return true;
    case "capability":
      return candidate.capabilityKey === capabilityKey;
    case "consumer":
      return candidate.consumerId === selector.consumerId;
    case "consumer_capability":
      return (
        candidate.consumerId === selector.consumerId && candidate.capabilityKey === capabilityKey
      );
  }
}

// --- Resolution ------------------------------------------------------------------

/**
 * Most specific first, then by policy id.
 *
 * The second comparison never decides anything in a healthy tenant; it is there so that resolution is a
 * function of the candidate set rather than of its order, which is what lets two gateway replicas reading the
 * same rows agree without coordinating.
 */
const comparePrecedence = (left: PolicyCandidate, right: PolicyCandidate): number => {
  const bySpecificity = policySpecificity(right.scope) - policySpecificity(left.scope);
  if (bySpecificity !== 0) return bySpecificity;
  if (left.policyId === right.policyId) return 0;
  return left.policyId < right.policyId ? -1 : 1;
};

/**
 * The policy that applies to a request, and the ones it displaced.
 *
 * `consideredCount` counts the policies that were *in the running* rather than the ones handed in. A candidate
 * that named a different consumer was never a contender, and counting it would make the number depend on how
 * much the caller happened to load — which turns an explanation into a puzzle about the query.
 */
export function resolvePolicy(
  selector: PolicySelector,
  candidates: readonly PolicyCandidate[],
): EffectivePolicy {
  const applicable = candidates.filter((candidate) => policyApplies(candidate, selector));
  const ranked = applicable.slice().sort(comparePrecedence);

  let winner: PolicyCandidate | null = null;
  const superseded: Uuid[] = [];
  for (const candidate of ranked) {
    if (winner === null) {
      winner = candidate;
      continue;
    }
    superseded.push(candidate.policyId);
  }

  if (winner === null) return noPolicy();

  return Object.freeze({
    policyId: winner.policyId,
    scope: winner.scope,
    limits: winner.limits,
    consideredCount: ranked.length,
    supersededPolicyIds: Object.freeze(superseded),
  });
}
