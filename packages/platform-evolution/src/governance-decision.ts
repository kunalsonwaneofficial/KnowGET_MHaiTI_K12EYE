import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  BlankDecisionConditionError,
  ConditionsNotPermittedError,
  ConditionsRequiredError,
  DecisionRationaleLengthError,
  GateAlreadySettledError,
  ProposerMayNotDecideError,
  RepeatBallotError,
  TooManyDecisionConditionsError,
  UnattributedBallotError,
  UnattributedProposalError,
} from "./errors";
import {
  type ChangeClass,
  type DecisionVerdict,
  type GateOutcome,
  type GovernanceGate,
  MAX_DECISION_CONDITIONS,
  MAX_RATIONALE_LENGTH,
  MIN_RATIONALE_LENGTH,
} from "./evolution-value";
import type { GateVerdict } from "./evolution-view";
import { evaluateGate, isGateSettled } from "./governance";

/**
 * A governance decision: the gate an initiative has to cross, and the people who spoke at it.
 *
 * This is *evolution always requires human governance* as a stored record rather than as a rule someone
 * remembers. The initiative aggregate refuses to advance without a satisfied gate; this aggregate is the gate —
 * who was asked, what each of them said, why, and on what terms. An institution can have the first without the
 * second and it usually does: a status field somewhere says `approved`, and the question of who approved it and
 * what they thought they were approving has no answer anybody can produce two years later.
 *
 * **The record is the point, not the verdict.** A gate that stored only its outcome would be a boolean with
 * governance vocabulary printed on it. What makes this worth keeping is the {@link DecisionBallot} list:
 * compulsory rationales, conditions attached where somebody attached them, and the order people spoke in. When a
 * change is revisited — and the reversion gate exists because changes are revisited — the useful question is
 * never *was this approved*. It is *what did the people who approved it believe was going to happen*, and that is
 * answerable only from text somebody was required to write at the time.
 *
 * **The aggregate refuses at the door what the engine merely discounts.** {@link evaluateGate} accepts a
 * proposer's own ballot, or a second ballot from somebody already counted, reports it as an issue and leaves it
 * out of the arithmetic — correct behaviour for a function whose output is a number. It is the wrong behaviour
 * for a minute. A gate listing the author of a change among the people who spoke to it is precisely the
 * appearance the rule exists to prevent, and the fact that the count underneath excluded them is invisible to
 * everyone who reads the record afterwards. So {@link castBallot} throws where the engine would report, and a
 * stored gate consequently carries no ballot issues at all — an invariant rather than a coincidence.
 *
 * **The counts are derived and re-derived, never set.** Every ballot re-runs the engine over the whole list and
 * the verdict is flattened onto the record, so a gate can be filtered by outcome and sorted by outstanding count
 * in the database rather than in a service. {@link gateStanding} is the one mapper back, reassembled from the
 * stored columns rather than recomputed, so what it reports is what this gate was decided to be rather than what
 * today's engine would say about the same ballots.
 *
 * **The quorum a gate faced is copied onto it.** `changeClass` and `proposedBy` are stored here as well as on the
 * initiative, which is duplication and is deliberate: the number of people who had to agree is a function of the
 * change class, and a decision record that could not state the quorum it was held to without joining to a row
 * somebody has since reclassified is not a record of anything. The initiative freezes its class before submission
 * for the same reason from the other end.
 *
 * There is no reopening and no abandoning. A gate settles once and stays settled, including a gate nobody ever
 * finished — a pending gate three months old is a true statement about an institution that stopped asking, and
 * deleting it would replace that statement with silence. Reconsideration is a new gate, which arrives with its
 * own date, its own people and the previous round still readable underneath it.
 */

// --- The aggregate ---------------------------------------------------------------

/**
 * One person's decision at a gate, with what they said and what they attached to it.
 *
 * Richer than the governance engine's {@link file://./evolution-view.ts} `GateBallot`, which carries only the
 * decider and the verdict because those are the only two things arithmetic needs. The rationale, the conditions
 * and the moment are for the reader, and they are the entire reason this record outlives the count it produced.
 */
export interface DecisionBallot {
  readonly deciderId: Uuid;
  readonly verdict: DecisionVerdict;
  /** Why. Compulsory on every ballot, including a plain approval, and it is what the record is for. */
  readonly rationale: string;
  /** Terms attached to a conditional approval. Empty on every other verdict, and refused there. */
  readonly conditions: readonly string[];
  readonly castAt: ISODateString;
}

export interface GovernanceDecision {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The initiative this gate stands in front of. */
  readonly initiativeId: Uuid;
  readonly gate: GovernanceGate;
  /** Copied from the initiative at convocation, so the quorum this gate faced is readable without a join. */
  readonly changeClass: ChangeClass;
  /** Who put the change forward. Their own ballot is refused, in either direction. */
  readonly proposedBy: Uuid;
  /** Derived by the governance engine on every ballot. Never set by hand. */
  readonly outcome: GateOutcome;
  /** Distinct people who must agree. Never zero. */
  readonly required: number;
  /** Distinct people who did. */
  readonly affirmed: number;
  /** How many more are needed. `0` once the gate has settled either way. */
  readonly outstanding: number;
  /** Affirmations that came with conditions attached. */
  readonly conditional: number;
  /** Whether anybody refused. One refusal settles the gate, whatever sits opposite it. */
  readonly refused: boolean;
  /** How many deferred. A deferral leaves the gate open rather than settling it. */
  readonly deferrals: number;
  /** Every ballot cast, in the order cast. The counts above are a function of exactly this list. */
  readonly ballots: readonly DecisionBallot[];
  readonly convokedAt: ISODateString;
  /** Who convened the gate. `null` for a gate opened by an automated step. */
  readonly convokedBy: Uuid | null;
  /** When the gate settled, either way. `null` while it is still open. */
  readonly settledAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ConvokeGateParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly initiativeId: Uuid;
  readonly gate: GovernanceGate;
  /** The initiative's frozen change class. It decides how many people must agree. */
  readonly changeClass: ChangeClass;
  readonly proposedBy: Uuid;
  /** `null` when an automated step opened the gate, which is permitted and decides nothing. */
  readonly convokedBy: Uuid | null;
}

export interface CastBallotParams {
  readonly deciderId: Uuid;
  readonly verdict: DecisionVerdict;
  readonly rationale: string;
  /** Terms of a conditional approval. Required to be non-empty there and empty everywhere else. */
  readonly conditions: readonly string[];
}

// --- Convening -------------------------------------------------------------------

/**
 * Flatten the engine's verdict onto the record.
 *
 * One helper for convocation and for every ballot, so the seven derived columns are written in exactly one place
 * and cannot acquire a second opinion about what the engine said between the two call sites.
 */
const applyStanding = (
  verdict: GateVerdict,
): Pick<
  GovernanceDecision,
  "outcome" | "required" | "affirmed" | "outstanding" | "conditional" | "refused" | "deferrals"
> => ({
  outcome: verdict.outcome,
  required: verdict.required,
  affirmed: verdict.affirmed,
  outstanding: verdict.outstanding,
  conditional: verdict.conditional,
  refused: verdict.refused,
  deferrals: verdict.deferrals,
});

/**
 * Open a gate: name the change, the class it falls in, who proposed it, and start asking.
 *
 * The opening counts are produced by running the engine over an empty ballot list rather than written out here.
 * A gate that stated its own `required` figure would be holding a second opinion about a quorum, and the day the
 * change-class table moved, the gates already open would keep the old number without anybody being able to tell
 * which ones.
 *
 * A gate with no recorded proposer is refused rather than opened. The engine's answer to that case is a gate that
 * stays pending forever, which is honest and useless: it produces a queue entry somebody eventually has to
 * explain, when the actual remedy — say who proposed this — was available at the only moment it was cheap.
 *
 * Nothing here refuses a second open gate on the same initiative. This package holds no directory of its own
 * decisions, and that rule is decided where they are stored.
 */
export function convokeGate(params: ConvokeGateParams): GovernanceDecision {
  const proposedBy = params.proposedBy.trim();
  if (proposedBy.length === 0) throw new UnattributedProposalError();

  const standing = evaluateGate({
    gate: params.gate,
    changeClass: params.changeClass,
    proposedBy,
    ballots: [],
  });

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    initiativeId: params.initiativeId,
    gate: params.gate,
    changeClass: params.changeClass,
    proposedBy: params.proposedBy,
    ...applyStanding(standing),
    ballots: [],
    convokedAt: now,
    convokedBy: params.convokedBy,
    settledAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

// --- Ballots ---------------------------------------------------------------------

/** A reason nobody can read is a decision with no reason, which is the thing this record exists to prevent. */
function requireRationale(rationale: string): string {
  const text = rationale.trim();
  if (text.length < MIN_RATIONALE_LENGTH || text.length > MAX_RATIONALE_LENGTH) {
    throw new DecisionRationaleLengthError(text.length, MIN_RATIONALE_LENGTH, MAX_RATIONALE_LENGTH);
  }
  return text;
}

/**
 * Check the conditions against the verdict they arrived with, and return them trimmed.
 *
 * Permission is checked before shape on purpose. Telling somebody their third condition is blank, and then —
 * once they have fixed it — that a rejection may not carry conditions at all, walks them through correcting text
 * that was never going to be stored.
 */
function requireConditions(
  verdict: DecisionVerdict,
  conditions: readonly string[],
): readonly string[] {
  if (verdict === "approved_with_conditions") {
    if (conditions.length === 0) throw new ConditionsRequiredError();
  } else if (conditions.length > 0) {
    throw new ConditionsNotPermittedError(verdict);
  }

  if (conditions.length > MAX_DECISION_CONDITIONS) {
    throw new TooManyDecisionConditionsError(conditions.length, MAX_DECISION_CONDITIONS);
  }

  return conditions.map((condition, index) => {
    const text = condition.trim();
    if (text.length === 0) throw new BlankDecisionConditionError(index);
    return text;
  });
}

/**
 * Record one person's decision at the gate.
 *
 * Three of the four checks below are refusals the governance engine would report and survive. They are raised
 * here instead because the engine's job is to produce a defensible count and this aggregate's job is to produce a
 * defensible minute, and a minute that lists a proposer's own approval is indefensible however the count treated
 * it. The fourth, a ballot arriving at a settled gate, is not something the engine sees at all: it would simply
 * count it, and the institution would hold a decision showing more agreement than it was actually taken on.
 *
 * The checks run state first, then identity, then text. A gate that closed last week makes every other complaint
 * moot, and being told to lengthen a rationale for a decision that has already been taken is worse than being
 * told nothing.
 */
export function castBallot(
  decision: GovernanceDecision,
  params: CastBallotParams,
): GovernanceDecision {
  if (isGateSettled(decision.outcome)) {
    throw new GateAlreadySettledError(decision.id, decision.outcome);
  }

  const deciderId = params.deciderId.trim();
  if (deciderId.length === 0) throw new UnattributedBallotError();
  if (deciderId === decision.proposedBy.trim()) {
    throw new ProposerMayNotDecideError(decision.id, deciderId);
  }
  if (decision.ballots.some((ballot) => ballot.deciderId.trim() === deciderId)) {
    throw new RepeatBallotError(decision.id, deciderId);
  }

  const rationale = requireRationale(params.rationale);
  const conditions = requireConditions(params.verdict, params.conditions);

  const now = nowIso();
  const ballots: readonly DecisionBallot[] = [
    ...decision.ballots,
    {
      deciderId: params.deciderId,
      verdict: params.verdict,
      rationale,
      conditions,
      castAt: now,
    },
  ];

  const standing = evaluateGate({
    gate: decision.gate,
    changeClass: decision.changeClass,
    proposedBy: decision.proposedBy,
    ballots: ballots.map((ballot) => ({
      deciderId: ballot.deciderId,
      verdict: ballot.verdict,
    })),
  });

  return {
    ...decision,
    ...applyStanding(standing),
    ballots,
    settledAt: isGateSettled(standing.outcome) ? now : null,
    updatedAt: now,
  };
}

// --- Reading ---------------------------------------------------------------------

/**
 * The gate, back in the governance engine's shape.
 *
 * Reassembled from the stored columns rather than recomputed from the ballots, and the difference is the point.
 * This reports what the gate was decided to be — which is what the initiative advanced on — rather than what
 * today's engine would make of the same ballots. `issues` is always empty, and that is an invariant rather than
 * an omission: every issue the engine can report is refused by {@link castBallot} and {@link convokeGate} before
 * it can be stored.
 */
export const gateStanding = (decision: GovernanceDecision): GateVerdict => ({
  gate: decision.gate,
  outcome: decision.outcome,
  required: decision.required,
  affirmed: decision.affirmed,
  outstanding: decision.outstanding,
  conditional: decision.conditional,
  refused: decision.refused,
  deferrals: decision.deferrals,
  issues: [],
});

/** Whether the gate has finished, either way. A settled gate is not waiting for anybody. */
export const isDecisionSettled = (decision: GovernanceDecision): boolean =>
  isGateSettled(decision.outcome);

/** Whether the gate opened. The only state in which the initiative aggregate will let a change through. */
export const isDecisionSatisfied = (decision: GovernanceDecision): boolean =>
  decision.outcome === "satisfied";

/**
 * The gate of this name a change currently stands on, chosen from its whole decision trail.
 *
 * This is the read the initiative aggregate's gate argument is filled from, and it is deliberately not the same
 * question the repository's `findOpenGate` answers. That one asks *is anybody still being asked*, which is what
 * stops a second gate being convened alongside a live one, and it excludes settled gates for exactly that
 * reason. This one asks *what did the institution decide*, and the answer to that is almost always a settled
 * gate — an approval that was satisfied last month is precisely what an initiative advances on.
 *
 * An unsettled gate wins when there is one, because a change with a question still open stands on that question
 * rather than on the previous answer: an initiative refused at approval, reworked, and put again is `pending`
 * until the new gate closes, not still `refused`. There can only ever be one, so the choice is unambiguous.
 * Otherwise the last settled gate answers, which is the most recent decision the institution took.
 *
 * Takes the trail rather than reaching for a store, so what counts as *current* is one rule readable in one
 * place rather than a filter written slightly differently in each service that needs it.
 */
export const currentGate = (
  decisions: readonly GovernanceDecision[],
  gate: GovernanceGate,
): GovernanceDecision | null => {
  const atGate = decisions.filter((decision) => decision.gate === gate);
  const unsettled = atGate.find((decision) => !isDecisionSettled(decision));
  return unsettled ?? atGate[atGate.length - 1] ?? null;
};

/**
 * Every term anybody attached to their approval, in the order the ballots were cast.
 *
 * These are the commitments the institution made in order to get the change through, and they are the thing an
 * adoption review is measured against later. Kept as one flat list because that is the question actually asked —
 * *what did we promise* — rather than one list per decider, which is the question of who wanted what and is
 * answerable from {@link GovernanceDecision.ballots} directly.
 */
export const decisionConditions = (decision: GovernanceDecision): readonly string[] =>
  decision.ballots.flatMap((ballot) => ballot.conditions);
