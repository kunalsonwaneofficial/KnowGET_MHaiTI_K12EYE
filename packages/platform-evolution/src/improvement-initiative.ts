import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { elapsedPeriods } from "./cadence";
import {
  DuplicateOriginatingSignalError,
  EmptyInitiativeKeyError,
  EmptyWithdrawalReasonError,
  GovernanceGateNotConvenedError,
  GovernanceGatePendingError,
  GovernanceGateRefusedError,
  InitiativeAlreadyInStatusError,
  InitiativeNotDraftError,
  InitiativeSettledError,
  InitiativeSummaryLengthError,
  InitiativeTextFrozenError,
  InvalidInitiativeKeyError,
  InvalidInitiativeProgressionError,
  InvalidPilotPeriodError,
  PilotTooShortError,
} from "./errors";
import {
  type ChangeClass,
  type GateOutcome,
  type GovernanceGate,
  type InitiativeStatus,
  MAX_SUMMARY_LENGTH,
  MIN_PILOT_PERIODS,
  MIN_SUMMARY_LENGTH,
  isTerminalInitiativeStatus,
  isValidKey,
  isValidPeriod,
  normalizeKey,
} from "./evolution-value";
import { requiredDeciders } from "./governance";
import { inspectAdvance } from "./lifecycle";

/**
 * An improvement initiative: a change somebody has proposed to how the institution works, and how far it got.
 *
 * A signal says something is not working. An initiative says what to do instead, and it is the record that has to
 * survive longest — because in three years the question will not be *what did we change* but *why did we think
 * that was a good idea, and who agreed*. Most institutions can answer the first from their current practice and
 * cannot answer the second from anything at all.
 *
 * **Nothing here enacts.** An initiative reaches `adopted` and stops. No timetable is rewritten, no policy
 * published, no configuration touched; adoption is the institution recording that this is now how it works, and
 * making it so is the job of the contract that owns the thing being changed. A platform that could enact its own
 * conclusions is the single failure this contract exists to make impossible, and the absence has to be structural
 * rather than a convention somebody remembers.
 *
 * **The forward path is narrow and every step on it is somebody doing something.** `draft` → `submitted` →
 * `under_review` → `approved` → `piloting` → `adopted`, with two of those crossings standing on a governance
 * gate. There is no path from a draft to an adoption, so a change cannot become how the institution works on the
 * strength of one person updating one field.
 *
 * **Two things freeze, at two different moments, and both freezes are about quorum and consent.** The change
 * class fixes at `draft`, because the class names how many distinct people must agree — reclassifying a submitted
 * initiative moves the bar it faces, and downward it is the one move nobody would call by its real name. The
 * summary fixes at `approved`, because that text is what the deciders read; a proposal that could be rewritten
 * afterwards would make every decision record a statement about a document that no longer exists.
 *
 * **`adopted` is terminal, and that is the asymmetry that keeps this honest.** Undoing an adopted change is a
 * fresh initiative under the reversion gate, with its own proposal, its own deciders and its own lesson. Flipping
 * this record back would erase the period in which the institution believed the change was right — which is
 * precisely the period a later reader is trying to understand.
 *
 * **The intermediate transitions take no actor, and the omission is deliberate.** Who agreed to what is recorded
 * in the governance decisions attached to the gates, where it sits beside the ballots, the rationale and the
 * conditions. An `approvedBy` column here would be a second, thinner answer to the same question, and the day the
 * two disagreed the thin one would be the one on the screen. The three terminal transitions do carry an actor,
 * because a rejection, an adoption and a withdrawal are executed by somebody, and a withdrawal has no gate behind
 * it at all.
 *
 * Periods are integer indices into a grid the caller defines, never dates read off a clock, which is what makes a
 * pilot's length reproducible years after the pilot.
 */

// --- The aggregate ---------------------------------------------------------------

export interface ImprovementInitiative {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** What every decision, pilot, adoption review and lesson quotes when it refers to this change. Immutable. */
  readonly initiativeKey: string;
  /** How many distinct people must agree. Fixed once the initiative leaves the drafting table. */
  readonly changeClass: ChangeClass;
  /** What is being proposed. Fixed once approved: this is the text the deciders read. */
  readonly summary: string;
  /** The signals this change was raised to address. May be empty; the lineage engine reports the gap. */
  readonly originatingSignalIds: readonly Uuid[];
  readonly status: InitiativeStatus;
  /** Who put it forward. Never `null`: the rule that nobody approves their own proposal needs a proposer. */
  readonly proposedBy: Uuid;
  readonly submittedAt: ISODateString | null;
  readonly reviewStartedAt: ISODateString | null;
  readonly approvedAt: ISODateString | null;
  readonly pilotStartedAt: ISODateString | null;
  /** The period the pilot began in, on the caller's grid. What the pilot's length is measured from. */
  readonly pilotStartedPeriod: number | null;
  readonly settledAt: ISODateString | null;
  /** Who executed the ending. The people who agreed to it are on the gate's decision, not here. */
  readonly settledBy: Uuid | null;
  /** Why it was withdrawn. Compulsory on a withdrawal and empty on every other ending. */
  readonly withdrawalReason: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ProposeInitiativeParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly initiativeKey: string;
  readonly changeClass: ChangeClass;
  readonly summary: string;
  /** The signals this addresses. Empty is permitted; naming one twice is not. */
  readonly originatingSignalIds: readonly Uuid[];
  readonly proposedBy: Uuid;
}

// --- Proposing -------------------------------------------------------------------

/** A proposal nobody can read is a proposal that gets approved anyway. The bound is checked before the gate. */
function requireSummary(summary: string): string {
  const text = summary.trim();
  if (text.length < MIN_SUMMARY_LENGTH || text.length > MAX_SUMMARY_LENGTH) {
    throw new InitiativeSummaryLengthError(text.length, MIN_SUMMARY_LENGTH, MAX_SUMMARY_LENGTH);
  }
  return text;
}

/**
 * A defensive copy of the origins, refusing any signal named twice.
 *
 * Refused rather than collapsed. How many distinct problems a change was raised to address is a number governors
 * read straight off the proposal and weigh the change against; quietly deduplicating a pasted list would leave
 * the institution holding a figure it did not write and cannot account for.
 */
const copyOrigins = (signalIds: readonly Uuid[]): readonly Uuid[] => {
  const seen = new Set<string>();
  for (const signalId of signalIds) {
    if (seen.has(signalId)) throw new DuplicateOriginatingSignalError(signalId);
    seen.add(signalId);
  }
  return [...signalIds];
};

/**
 * Put a change forward. Starts as a draft, which is the only state in which its class can still be argued about.
 *
 * An initiative with no originating signal is permitted, and the permission is deliberate. A leadership-proposed
 * strategic change genuinely has no upstream complaint behind it, and requiring one would teach proposers to
 * attach whichever signal looked closest — which is worse than the gap, because a fabricated origin is
 * indistinguishable from a real one and a missing one is not. The lineage engine already reports a chain that
 * does not reach back to evidence, so the gap surfaces as a finding somebody can weigh rather than as a refusal
 * somebody routes around.
 *
 * Nothing here refuses a duplicate key: this package holds no directory of its own initiatives, and that rule
 * lives where identity is stored.
 */
export function proposeInitiative(params: ProposeInitiativeParams): ImprovementInitiative {
  const initiativeKey = normalizeKey(params.initiativeKey);
  if (initiativeKey.length === 0) throw new EmptyInitiativeKeyError();
  if (!isValidKey(initiativeKey)) throw new InvalidInitiativeKeyError(initiativeKey);

  const summary = requireSummary(params.summary);
  const originatingSignalIds = copyOrigins(params.originatingSignalIds);

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    initiativeKey,
    changeClass: params.changeClass,
    summary,
    originatingSignalIds,
    status: "draft",
    proposedBy: params.proposedBy,
    submittedAt: null,
    reviewStartedAt: null,
    approvedAt: null,
    pilotStartedAt: null,
    pilotStartedPeriod: null,
    settledAt: null,
    settledBy: null,
    withdrawalReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  initiative: ImprovementInitiative,
  patch: Partial<ImprovementInitiative>,
): ImprovementInitiative => ({
  ...initiative,
  ...patch,
  updatedAt: nowIso(),
});

/**
 * Whole periods the pilot has run for as of a given period. `0` before a pilot starts.
 *
 * The null start is answered rather than defaulted. Treating an unstarted pilot as having begun at period zero
 * would report a draft raised this term as having piloted for however many periods the institution's grid has
 * run, which is not a smaller mistake than crashing — it is the same mistake with a plausible number on it.
 */
const pilotPeriodsAsOf = (initiative: ImprovementInitiative, asOfPeriod: number): number =>
  initiative.pilotStartedPeriod === null
    ? 0
    : elapsedPeriods(initiative.pilotStartedPeriod, asOfPeriod);

/** The three statuses in which the proposal is still being written. Everything after this reads it. */
const DRAFTING_STATUSES: readonly InitiativeStatus[] = ["draft", "submitted", "under_review"];

/** A settled initiative is one of three endings and nothing is written on top of it. */
function requireUnsettled(initiative: ImprovementInitiative): void {
  if (isTerminalInitiativeStatus(initiative.status)) {
    throw new InitiativeSettledError(initiative.id, initiative.status);
  }
}

/**
 * Ask the lifecycle engine whether a move is permitted, and raise the refusal it names.
 *
 * One helper for all six transitions. The engine's seven refusals become seven error types rather than one,
 * because they have seven different remedies and three of them are the whole governance rule: nobody has been
 * asked, somebody has not answered yet, somebody said no. Collapsing the last into the second is how an
 * institution ends up re-running a refused gate until the answer changes.
 *
 * The gate refusals are reached only when the engine reported a gate, which it always does for those three; the
 * check is what tells the compiler so, and the fallthrough covers a move the table simply does not allow.
 */
function requireAdvance(
  initiative: ImprovementInitiative,
  to: InitiativeStatus,
  gateOutcome: GateOutcome | null,
  pilotPeriods: number,
): void {
  const verdict = inspectAdvance({ from: initiative.status, to, gateOutcome, pilotPeriods });
  if (verdict.allowed) return;

  const { id, status } = initiative;
  if (verdict.refusal === "same_status") throw new InitiativeAlreadyInStatusError(id, status);
  if (verdict.refusal === "terminal_status") throw new InitiativeSettledError(id, status);
  if (verdict.refusal === "pilot_too_short") {
    throw new PilotTooShortError(id, pilotPeriods, MIN_PILOT_PERIODS);
  }
  if (verdict.gate !== null) {
    if (verdict.refusal === "gate_missing") {
      throw new GovernanceGateNotConvenedError(id, verdict.gate);
    }
    if (verdict.refusal === "gate_pending") throw new GovernanceGatePendingError(id, verdict.gate);
    if (verdict.refusal === "gate_refused") throw new GovernanceGateRefusedError(id, verdict.gate);
  }
  throw new InvalidInitiativeProgressionError(id, status, to);
}

// --- Authoring -------------------------------------------------------------------

/**
 * Rewrite what is being proposed.
 *
 * Permitted while the proposal is still being read and argued about — through submission and review, because a
 * review that cannot ask for the text to be clearer produces approvals of text nobody made clearer. Refused from
 * approval onward, which is the freeze the module comment argues for.
 */
export function reviseInitiativeSummary(
  initiative: ImprovementInitiative,
  summary: string,
): ImprovementInitiative {
  requireUnsettled(initiative);
  if (!DRAFTING_STATUSES.includes(initiative.status)) {
    throw new InitiativeTextFrozenError(initiative.id, initiative.status);
  }
  return touch(initiative, { summary: requireSummary(summary) });
}

/**
 * Change how big a change this is.
 *
 * Draft only, and this is the narrowest window in the aggregate. The class decides the quorum, so reclassifying
 * after submission changes the bar an initiative faces after people have started answering: downward it lowers
 * the number of agreements needed, upward it invalidates ballots already cast. Either way it happens before
 * anybody is asked, or the proposal is withdrawn and put again at the class it should have carried.
 */
export function reclassifyInitiative(
  initiative: ImprovementInitiative,
  changeClass: ChangeClass,
): ImprovementInitiative {
  requireUnsettled(initiative);
  if (initiative.status !== "draft") {
    throw new InitiativeNotDraftError(initiative.id, initiative.status);
  }
  return touch(initiative, { changeClass });
}

// --- Lifecycle -------------------------------------------------------------------

/** Put the proposal forward for review. The moment the class and the quorum it implies stop moving. */
export function submitInitiative(initiative: ImprovementInitiative): ImprovementInitiative {
  requireAdvance(initiative, "submitted", null, 0);
  return touch(initiative, { status: "submitted", submittedAt: nowIso() });
}

/**
 * Record that the institution has started considering this.
 *
 * A separate step from submission rather than a formality. The interval between the two is the only measure of
 * whether proposals are being looked at, and a pipeline where everything is `submitted` for eleven months is a
 * governance process that exists on paper.
 */
export function startInitiativeReview(initiative: ImprovementInitiative): ImprovementInitiative {
  requireAdvance(initiative, "under_review", null, 0);
  return touch(initiative, { status: "under_review", reviewStartedAt: nowIso() });
}

/**
 * Approve the change, on the strength of a satisfied approval gate.
 *
 * The gate outcome is a required argument and `null` means no gate was convened, which is refused by its own
 * error. There is no flag, no override and no privileged caller that advances this without one — which is what
 * makes *evolution always requires human governance* a property of the code rather than a sentence in a document.
 */
export function approveInitiative(
  initiative: ImprovementInitiative,
  gateOutcome: GateOutcome | null,
): ImprovementInitiative {
  requireAdvance(initiative, "approved", gateOutcome, 0);
  return touch(initiative, { status: "approved", approvedAt: nowIso() });
}

/**
 * Reject the change: the institution considered it and is not making it.
 *
 * No gate is required to reject, and the asymmetry is deliberate. A refused approval gate already stops the
 * initiative advancing; recording the rejection is then somebody closing the file rather than a second vote, and
 * requiring a further quorum to say no would leave refused proposals sitting `under_review` forever because
 * nobody could be assembled to bury them.
 */
export function rejectInitiative(
  initiative: ImprovementInitiative,
  actor: Uuid | null,
): ImprovementInitiative {
  requireAdvance(initiative, "rejected", null, 0);
  return touch(initiative, { status: "rejected", settledAt: nowIso(), settledBy: actor });
}

/**
 * Start the pilot, from a period the caller names.
 *
 * The starting period is stored rather than derived from the timestamp beside it, because the pilot's length is
 * counted on the institution's own grid — terms, cycles, whatever the caller defined — and a duration recomputed
 * later from dates would depend on which calendar the recomputing code believed in.
 */
export function startInitiativePilot(
  initiative: ImprovementInitiative,
  startPeriod: number,
): ImprovementInitiative {
  requireAdvance(initiative, "piloting", null, 0);
  if (!isValidPeriod(startPeriod)) throw new InvalidPilotPeriodError(startPeriod);
  return touch(initiative, {
    status: "piloting",
    pilotStartedAt: nowIso(),
    pilotStartedPeriod: startPeriod,
  });
}

/**
 * Adopt the change: this is now how the institution works.
 *
 * Two things have to be true, and the second is the one improvement programmes skip. A pilot-exit gate must be
 * satisfied, and the pilot must actually have run — at least one whole period, counted from the period it
 * started in to the period being adopted in. The requirement is small on purpose, because the point is not the
 * duration but the existence of an interval in which the change was in contact with reality. Without it an
 * adoption review has nothing to observe and the benefits claimed for the change can never be measured against
 * anything.
 *
 * And then nothing happens. Adoption is a record, not an act; the contract that owns the thing being changed is
 * what changes it.
 */
export function adoptInitiative(
  initiative: ImprovementInitiative,
  gateOutcome: GateOutcome | null,
  asOfPeriod: number,
  actor: Uuid | null,
): ImprovementInitiative {
  if (!isValidPeriod(asOfPeriod)) throw new InvalidPilotPeriodError(asOfPeriod);
  requireAdvance(initiative, "adopted", gateOutcome, pilotPeriodsAsOf(initiative, asOfPeriod));
  return touch(initiative, { status: "adopted", settledAt: nowIso(), settledBy: actor });
}

/**
 * Withdraw the proposal. Available from every state before an ending, including mid-pilot.
 *
 * The reason is compulsory, and it is the only compulsory free text on an initiative. A proposal that vanished
 * without one is indistinguishable from one that was lost, and the difference matters to the person who wrote it
 * and to the next reader trying to work out whether this was tried before. Withdrawing mid-pilot is the honest
 * ending for a change that turned out not to work, and the record of it is worth more than the adoption would
 * have been.
 */
export function withdrawInitiative(
  initiative: ImprovementInitiative,
  actor: Uuid | null,
  reason: string,
): ImprovementInitiative {
  requireAdvance(initiative, "withdrawn", null, 0);
  const withdrawalReason = reason.trim();
  if (withdrawalReason.length === 0) throw new EmptyWithdrawalReasonError();
  return touch(initiative, {
    status: "withdrawn",
    withdrawalReason,
    settledAt: nowIso(),
    settledBy: actor,
  });
}

// --- Reading ---------------------------------------------------------------------

/** Whether the initiative is still going somewhere. */
export const isInitiativeOpen = (initiative: ImprovementInitiative): boolean =>
  !isTerminalInitiativeStatus(initiative.status);

/** Whether the initiative reached one of its three endings. */
export const isInitiativeSettled = (initiative: ImprovementInitiative): boolean =>
  isTerminalInitiativeStatus(initiative.status);

/** Whether this is now how the institution works. The subset an adoption review is drawn from. */
export const isInitiativeAdopted = (initiative: ImprovementInitiative): boolean =>
  initiative.status === "adopted";

/**
 * Whole periods this initiative has piloted for, as of a period the caller names.
 *
 * The same arithmetic {@link adoptInitiative} applies, exposed so that a caller can tell somebody a pilot has one
 * more period to run instead of finding out by being refused. Zero before a pilot starts, and zero for a period
 * before the one it started in — the cadence engine does not count backwards.
 */
export const initiativePilotPeriods = (
  initiative: ImprovementInitiative,
  asOfPeriod: number,
): number => pilotPeriodsAsOf(initiative, asOfPeriod);

/**
 * How many distinct people must agree to this initiative at a given gate.
 *
 * Delegates to the governance engine rather than reading the table here, because the reversion floor is a rule
 * about gates and not about initiatives: undoing something the institution agreed to needs more than one person
 * however small the change was, and an initiative that answered this from its class alone would say otherwise.
 */
export const initiativeRequiredDeciders = (
  initiative: ImprovementInitiative,
  gate: GovernanceGate,
): number => requiredDeciders(initiative.changeClass, gate);
