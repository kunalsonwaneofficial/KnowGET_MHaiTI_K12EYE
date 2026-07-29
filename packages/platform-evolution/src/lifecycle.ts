import {
  type GateOutcome,
  type GovernanceGate,
  type InitiativeStatus,
  MIN_PILOT_PERIODS,
  isTerminalInitiativeStatus,
} from "./evolution-value";
import type { AdvanceRequest, AdvanceVerdict } from "./evolution-view";

/**
 * The lifecycle engine: where a governed change may go next, what it has to have done first, and who has to have
 * agreed.
 *
 * The intake engine decides what the institution will look at; this one decides what it will actually change,
 * and it is where the contract's rule that evolution always requires human governance stops being a sentence in
 * a document. Two moves in this lifecycle are the ones that matter — the move into `approved`, where a proposal
 * becomes something the institution has agreed to, and the move into `adopted`, where it becomes how things are
 * done. Neither is reachable without a satisfied gate, and the engine has no parameter that would let a caller
 * say this one is different.
 *
 * The pilot rule sits alongside the gates and does a job no count of approvals can do. An institution that goes
 * from "we agreed to this" straight to "this is how we do things" has not learned anything from the change; it
 * has only recorded that it wanted to. Requiring whole completed periods of piloting before adoption can even be
 * argued means every adopted change has a period of evidence behind it, which is what gives the realization
 * engine something to compare and the lessons something to be about.
 *
 * Like the intake engine this one reports rather than throws, and it never mutates anything. It also never
 * *authorises*: whether the person asking is entitled to move an initiative is a question for the identity
 * contracts and the `evolution:*` scopes. This engine answers only whether the institution's own rules permit
 * the move, which is a different question and the one nothing else is in a position to answer.
 */

// --- Progression -----------------------------------------------------------------

/**
 * Which lifecycle states an initiative may move to from each state it can be in.
 *
 * The forward path is deliberately narrow — `draft → submitted → under_review → approved → piloting → adopted`
 * with no skipping — because every one of those steps leaves a record of somebody having done something, and a
 * lifecycle that allowed `draft → adopted` would let a change become institutional practice with a single
 * update and no trail at all.
 *
 * `withdrawn` is reachable from every non-terminal state and needs no gate, which is the asymmetry that makes
 * the governance rules bearable. Proposing costs one person's decision; changing an institution costs several.
 * A proposer who has thought better of it withdraws rather than arguing their own initiative down at a gate, and
 * nobody has to convene a meeting to stop something its author no longer wants.
 *
 * `rejected`, `adopted` and `withdrawn` are all terminal, including `adopted`. There is no arrow back out of it
 * and no `reverted` state to move into: undoing an adopted change is a *new* initiative under the reversion
 * gate, with its own proposal, its own deciders and its own lesson. Flipping the original record back would
 * erase the fact that the institution once believed it, which is precisely the fact a later reader needs.
 *
 * Frozen at both levels, for the reason the signal progressions are: a shallow freeze would leave the target
 * lists open to `push`, and a caller who could append `adopted` to what `draft` reaches would have removed both
 * governance gates from the whole institution without touching this file.
 */
export const INITIATIVE_PROGRESSIONS: Readonly<
  Record<InitiativeStatus, readonly InitiativeStatus[]>
> = Object.freeze({
  draft: Object.freeze<InitiativeStatus[]>(["submitted", "withdrawn"]),
  submitted: Object.freeze<InitiativeStatus[]>(["under_review", "withdrawn"]),
  under_review: Object.freeze<InitiativeStatus[]>(["approved", "rejected", "withdrawn"]),
  approved: Object.freeze<InitiativeStatus[]>(["piloting", "withdrawn"]),
  rejected: Object.freeze<InitiativeStatus[]>([]),
  piloting: Object.freeze<InitiativeStatus[]>(["adopted", "withdrawn"]),
  adopted: Object.freeze<InitiativeStatus[]>([]),
  withdrawn: Object.freeze<InitiativeStatus[]>([]),
});

/**
 * The gate a lifecycle move stands on, or `null` when it stands on none.
 *
 * Exactly two moves are gated and both are written out rather than derived, because a rule this consequential
 * should be readable in full without holding a table in your head. `under_review → approved` is the approval
 * gate: the institution agreeing to try something. `piloting → adopted` is the pilot-exit gate: the institution
 * agreeing that trying it worked. Everything else — submitting a draft, sending a submission for review,
 * starting an approved pilot, withdrawing — moves an initiative along without changing what the institution
 * does, so requiring a quorum for them would spend governance attention on paperwork and leave less of it for
 * the two decisions that matter.
 *
 * `rejected` is not gated on the way in for a reason worth stating: a rejection is not a separate decision to be
 * quorate for, it is what the approval gate returns when somebody refuses. Requiring a second quorum to record a
 * refusal would give a refused initiative a path back to life through inaction.
 */
export const requiredInitiativeGate = (
  from: InitiativeStatus,
  to: InitiativeStatus,
): GovernanceGate | null => {
  if (from === "under_review" && to === "approved") return "approval";
  if (from === "piloting" && to === "adopted") return "pilot_exit";
  return null;
};

// --- Advance ---------------------------------------------------------------------

/** The refusal a gate outcome earns, or `null` when the gate is satisfied. */
const gateRefusal = (
  outcome: GateOutcome | null,
): "gate_missing" | "gate_pending" | "gate_refused" | null => {
  if (outcome === null) return "gate_missing";
  if (outcome === "pending") return "gate_pending";
  if (outcome === "refused") return "gate_refused";
  return null;
};

/**
 * Whether an initiative may make the move somebody asked for, and if not, which kind of not.
 *
 * Seven refusals, and the order they are checked in is itself a decision. They are ordered by what has to happen
 * first *in the world*, not by how serious they are — so a caller who has asked to adopt an initiative that has
 * piloted for no periods and has no pilot-exit gate is told the pilot has not run, rather than told to go and
 * convene a gate about nothing. The refusal a caller sees is always the next thing they can actually do.
 *
 * The three gate refusals are kept apart for the same reason. `gate_missing` means nobody has been asked yet and
 * the remedy is to ask them. `gate_pending` means they were asked and have not all answered, and the remedy is
 * to wait. `gate_refused` means somebody said no, and there is no remedy at all on this initiative — a refused
 * gate is settled, and pursuing the change means a new proposal that addresses why. Collapsing these into one
 * unsatisfied-gate refusal would leave the third case looking like the second, which is how an institution ends
 * up quietly re-running a gate until the answer changes.
 */
export const inspectAdvance = (request: AdvanceRequest): AdvanceVerdict => {
  const { from, to } = request;
  const gate = requiredInitiativeGate(from, to);
  const refuse = (refusal: AdvanceVerdict["refusal"]): AdvanceVerdict => ({
    allowed: false,
    from,
    to,
    gate,
    refusal,
  });

  if (from === to) return refuse("same_status");
  if (isTerminalInitiativeStatus(from)) return refuse("terminal_status");
  if (!INITIATIVE_PROGRESSIONS[from].includes(to)) return refuse("unreachable_status");

  if (to === "adopted" && request.pilotPeriods < MIN_PILOT_PERIODS) {
    return refuse("pilot_too_short");
  }

  if (gate !== null) {
    const refusal = gateRefusal(request.gateOutcome);
    if (refusal !== null) return refuse(refusal);
  }

  return { allowed: true, from, to, gate, refusal: null };
};
