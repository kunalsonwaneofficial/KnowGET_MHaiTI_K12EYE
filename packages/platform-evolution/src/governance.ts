import {
  type ChangeClass,
  type GateOutcome,
  type GovernanceGate,
  MIN_REQUIRED_DECIDERS,
  REQUIRED_DECIDERS,
  isAffirmativeVerdict,
} from "./evolution-value";
import type { BallotIssue, GateRequest, GateVerdict } from "./evolution-view";

/**
 * The governance engine: how many people have to agree before an institution changes something, who is allowed
 * to be one of them, and what settles a gate.
 *
 * The contract's rule is that evolution always requires human governance, and this is the module where that
 * sentence stops being a policy somebody could forget to apply and becomes arithmetic nothing can route around.
 * There is no configuration here, no override, and no path that reaches a satisfied gate without a count of
 * named people who each said yes. The engine cannot be told that this particular change is urgent enough to
 * skip the count, because it has no parameter that would carry the message.
 *
 * Three properties are worth stating plainly because each one closes a specific way institutions talk
 * themselves past their own governance.
 *
 * **Nobody approves their own initiative.** The proposer's ballot is discarded before anything is counted, in
 * both directions — their approval does not help them and their rejection does not stop them, because a
 * proposer who has changed their mind withdraws the initiative rather than voting it down. Without a recorded
 * proposer the rule cannot be applied at all, so a gate assembled without one can never be satisfied; it is not
 * a gate with a missing field, it is a gate with its safeguard switched off.
 *
 * **A person speaks once at a gate.** A second ballot from somebody already counted is recorded as an issue and
 * changes nothing. The alternative — last vote wins — makes the outcome depend on the order ballots arrived in
 * and lets a gate be re-run until the number comes out right, which is precisely the thing an auditor cannot
 * reconstruct eighteen months later. Genuine reconsideration is a new gate with a new ballot set, and it leaves
 * both records behind.
 *
 * **One refusal settles it.** Not a majority, not a tie-break: a single `rejected` verdict refuses the gate
 * however many affirmations sit opposite. An institution whose governance let a majority overrule a refusal
 * would be manufacturing the one record nobody ever wants to be shown — proof that it was warned in writing and
 * proceeded anyway. A decider who does not want to block but is not ready to agree has `deferred`, which leaves
 * the gate open and costs nothing.
 */

// --- Quorum ----------------------------------------------------------------------

/**
 * The floor on how many people must agree to undo something the institution is already living with.
 *
 * Reversion is the one gate whose requirement is not simply inherited from the class of the original change,
 * and the reason is asymmetry. Adopting a clarification affects a practice nobody has adapted to yet; reverting
 * one nine months later unpicks work everybody has since built on, retrains around and cited in their own
 * decisions. Letting a single person undo a change on the same authority that introduced it would give an
 * institution a governance system that oscillates — each new post-holder reverting their predecessor, every
 * reversal fully documented, and nothing ever settling long enough to be evaluated.
 */
export const MIN_DECIDERS_FOR_REVERSION = 2;

/**
 * How many distinct people must agree at this gate, for a change of this class.
 *
 * The base count comes from the change class and is floored at {@link MIN_REQUIRED_DECIDERS} rather than
 * trusted, so no arrangement of inputs produces a gate that opens on nobody's agreement. A reversion is
 * additionally floored at {@link MIN_DECIDERS_FOR_REVERSION}; every other gate takes the base.
 */
export const requiredDeciders = (changeClass: ChangeClass, gate: GovernanceGate): number => {
  const base = Math.max(MIN_REQUIRED_DECIDERS, REQUIRED_DECIDERS[changeClass]);
  return gate === "reversion" ? Math.max(base, MIN_DECIDERS_FOR_REVERSION) : base;
};

/** Whether a gate has finished, either way. A settled gate is not waiting for anybody. */
export const isGateSettled = (outcome: GateOutcome): boolean => outcome !== "pending";

// --- Gates -----------------------------------------------------------------------

/**
 * Evaluate a gate against the ballots cast at it.
 *
 * Four ballot issues are reported and none of them is a fault in the ballot's author. `unattributed_ballot` is
 * a vote with nobody behind it, which cannot be a person agreeing. `proposer_may_not_decide` is the author of
 * the change voting on it. `repeat_ballot` is a second vote from somebody already counted. And
 * `unattributed_proposal`, the one issue that belongs to the gate rather than to a ballot, is a gate whose
 * proposer was never recorded — reported with a `null` index and, on its own, enough to keep the gate from ever
 * being satisfied.
 *
 * `outstanding` reads as how many more people are needed and is zeroed once the gate settles, since a refused
 * gate is not short of anything. It is deliberately *not* zeroed for the unattributed-proposal case even when
 * enough people have agreed: the honest report there is a gate with its count met, still pending, and an issue
 * saying exactly why — rather than a number quietly implying somebody else needs to vote.
 */
export const evaluateGate = (request: GateRequest): GateVerdict => {
  const required = requiredDeciders(request.changeClass, request.gate);
  const proposedBy = request.proposedBy.trim();
  const issues: BallotIssue[] = [];
  const counted = new Set<string>();
  let affirmed = 0;
  let conditional = 0;
  let deferrals = 0;
  let refused = false;

  if (proposedBy.length === 0) {
    issues.push({ code: "unattributed_proposal", ballotIndex: null });
  }

  request.ballots.forEach((ballot, index) => {
    const deciderId = ballot.deciderId.trim();

    if (deciderId.length === 0) {
      issues.push({ code: "unattributed_ballot", ballotIndex: index });
      return;
    }
    if (proposedBy.length > 0 && deciderId === proposedBy) {
      issues.push({ code: "proposer_may_not_decide", ballotIndex: index });
      return;
    }
    if (counted.has(deciderId)) {
      issues.push({ code: "repeat_ballot", ballotIndex: index });
      return;
    }
    counted.add(deciderId);

    if (ballot.verdict === "rejected") {
      refused = true;
    } else if (ballot.verdict === "deferred") {
      deferrals += 1;
    } else if (isAffirmativeVerdict(ballot.verdict)) {
      affirmed += 1;
      if (ballot.verdict === "approved_with_conditions") conditional += 1;
    }
  });

  const satisfied = proposedBy.length > 0 && affirmed >= required;
  const outcome: GateOutcome = refused ? "refused" : satisfied ? "satisfied" : "pending";

  return {
    gate: request.gate,
    outcome,
    required,
    affirmed,
    outstanding: isGateSettled(outcome) ? 0 : Math.max(0, required - affirmed),
    conditional,
    refused,
    deferrals,
    issues,
  };
};
