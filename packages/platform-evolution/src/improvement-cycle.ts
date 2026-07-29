import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { elapsedPeriods, inspectSpan, inspectStageChange } from "./cadence";
import {
  CycleAlreadyInStageError,
  CycleClosureGateNotConvenedError,
  CycleClosureGatePendingError,
  CycleClosureGateRefusedError,
  CycleIntentFrozenError,
  CycleIntentLengthError,
  CycleSettledError,
  CycleSpanFixedError,
  CycleWithoutLessonsError,
  EmptyAbandonmentReasonError,
  EmptyCycleKeyError,
  InvalidCycleKeyError,
  InvalidCycleProgressionError,
  UnusableCycleSpanError,
} from "./errors";
import {
  type CycleStage,
  type GateOutcome,
  MAX_SUMMARY_LENGTH,
  MIN_LESSONS_FOR_CLOSURE,
  MIN_SUMMARY_LENGTH,
  isTerminalCycleStage,
  isValidKey,
  normalizeKey,
} from "./evolution-value";
import type { SpanVerdict } from "./evolution-view";

/**
 * An improvement cycle: a bounded round of work the institution ran in order to get better at something.
 *
 * An initiative is one change. A cycle is the container the institution actually works in — a term, a review
 * period, an accreditation round — inside which signals are gathered, changes are tried and, at the end, somebody
 * writes down what was learned. It is the record that answers *did we improve anything this year*, which is a
 * different question from *what did we change*, and the one most institutions cannot answer because nothing ever
 * drew the boundary.
 *
 * **A cycle closes only if it produced a lesson.** This is the contract's rule enforced from the end nobody
 * enforces it from. A cycle that ran four periods, delivered everything it promised and concluded nothing has
 * left the institution knowing exactly what it knew before; filing it as a completed improvement cycle is how
 * organizations accumulate years of improvement activity and no memory of any of it. The remedy is not to write a
 * lesson to satisfy a check — it is `abandoned`, which records the same work under a name that does not claim a
 * conclusion.
 *
 * **Two things freeze, at two different moments, and both freezes are about being judged.** The span fixes when
 * the work starts, because a cycle whose boundaries move once it is running is a cycle that overran becoming a
 * cycle that always intended to take that long. The intent fixes when review begins, because review asks whether
 * the cycle achieved what it set out to achieve, and an intent still editable at that point lets the cycle be
 * judged against whatever it happened to accomplish.
 *
 * **The lesson count is written once, at closure, from a figure the caller took then.** It is not a running total
 * this record maintains. A counter incremented as lessons arrive would drift from the lesson rows themselves the
 * first time one was written against a different cycle or corrected after the fact, and the drift would be
 * invisible: the number on the cycle is the number a report quotes, and nothing would ever compare it back.
 *
 * **Closure is governed and abandonment is not.** Declaring a cycle complete is a claim about the institution
 * that outlives everyone who made it, so it stands on a `cycle_closure` gate. Abandoning one is somebody
 * admitting the round did not get where it meant to, which needs a reason rather than a quorum — requiring one
 * would leave failed cycles sitting `executing` forever because nobody could be assembled to bury them.
 *
 * Periods are integer indices into a grid the caller defines, never dates read off a clock, which is what makes a
 * cycle's length reproducible years after the cycle.
 */

// --- The aggregate ---------------------------------------------------------------

export interface ImprovementCycle {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** What every lesson, initiative and lineage trace quotes when it says which round it came out of. */
  readonly cycleKey: string;
  /** What this round set out to improve. Fixed once review begins: this is what review judges it against. */
  readonly intent: string;
  readonly stage: CycleStage;
  /** The period the round runs from, on the caller's grid. */
  readonly startPeriod: number;
  /** The period the round runs to, inclusive. */
  readonly endPeriod: number;
  /** Periods the span covers, both ends counted. Derived by the cadence engine, never set directly. */
  readonly periods: number;
  /** Lessons this cycle produced, counted at closure. `0` until then, and never a running total. */
  readonly lessonsRecorded: number;
  /** Who opened the round. */
  readonly openedBy: Uuid;
  readonly executionStartedAt: ISODateString | null;
  readonly reviewStartedAt: ISODateString | null;
  readonly settledAt: ISODateString | null;
  /** Who executed the ending. The people who agreed to a closure are on its gate's decision, not here. */
  readonly settledBy: Uuid | null;
  /** Why it was abandoned. Compulsory on an abandonment and empty on a closure. */
  readonly abandonmentReason: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface OpenCycleParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly cycleKey: string;
  readonly intent: string;
  readonly startPeriod: number;
  readonly endPeriod: number;
  readonly openedBy: Uuid;
}

// --- Opening ---------------------------------------------------------------------

/** An intent nobody can read is an intent review cannot judge anything against. */
function requireIntent(intent: string): string {
  const text = intent.trim();
  if (text.length < MIN_SUMMARY_LENGTH || text.length > MAX_SUMMARY_LENGTH) {
    throw new CycleIntentLengthError(text.length, MIN_SUMMARY_LENGTH, MAX_SUMMARY_LENGTH);
  }
  return text;
}

/**
 * The three span columns, flattened from the cadence engine's verdict.
 *
 * `periods` is stored rather than recomputed on read for the same reason the gate counts are stored on a
 * governance decision: a report that counts a cycle's length has to get the same number as the cycle did, and a
 * derivation repeated in two places eventually disagrees with itself.
 */
const applySpan = (
  verdict: SpanVerdict,
): Pick<ImprovementCycle, "endPeriod" | "periods" | "startPeriod"> => ({
  startPeriod: verdict.startPeriod,
  endPeriod: verdict.endPeriod,
  periods: verdict.periods,
});

/** Ask the cadence engine for a span, and refuse the whole cycle if it cannot make one. */
function requireSpan(cycleKey: string, startPeriod: number, endPeriod: number): SpanVerdict {
  const verdict = inspectSpan(startPeriod, endPeriod);
  if (!verdict.usable) throw new UnusableCycleSpanError(cycleKey, verdict.issues);
  return verdict;
}

/**
 * Open a round of improvement work. Starts in `planning`, which is the only stage its span can still move in.
 *
 * Nothing here refuses a duplicate key: this package holds no directory of its own cycles, and that rule lives
 * where identity is stored.
 */
export function openCycle(params: OpenCycleParams): ImprovementCycle {
  const cycleKey = normalizeKey(params.cycleKey);
  if (cycleKey.length === 0) throw new EmptyCycleKeyError();
  if (!isValidKey(cycleKey)) throw new InvalidCycleKeyError(cycleKey);

  const intent = requireIntent(params.intent);
  const span = requireSpan(cycleKey, params.startPeriod, params.endPeriod);

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    cycleKey,
    intent,
    stage: "planning",
    ...applySpan(span),
    lessonsRecorded: 0,
    openedBy: params.openedBy,
    executionStartedAt: null,
    reviewStartedAt: null,
    settledAt: null,
    settledBy: null,
    abandonmentReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (cycle: ImprovementCycle, patch: Partial<ImprovementCycle>): ImprovementCycle => ({
  ...cycle,
  ...patch,
  updatedAt: nowIso(),
});

/** The two stages in which the round's intent is still being written. Review reads it. */
const AUTHORING_STAGES: readonly CycleStage[] = ["planning", "executing"];

/** A settled cycle is closed or abandoned and nothing is written on top of it. */
function requireUnsettled(cycle: ImprovementCycle): void {
  if (isTerminalCycleStage(cycle.stage)) {
    throw new CycleSettledError(cycle.id, cycle.stage);
  }
}

/**
 * Ask the cadence engine whether a stage change is permitted, and raise the refusal it names.
 *
 * One helper for all four transitions. The engine's seven refusals become seven error types rather than one,
 * because they have seven different remedies, and the three gate refusals are the governance rule itself: nobody
 * has been asked, somebody has not answered yet, somebody said no. They are cycle-specific errors rather than the
 * initiative ones they mirror, because an operator handed a message about an improvement initiative goes looking
 * for a record that is not the one refusing them.
 *
 * The gate refusals are reached only when the engine reported a gate, which it always does for those three; the
 * check is what tells the compiler so, and the fallthrough covers a move the table simply does not allow.
 */
function requireStageChange(
  cycle: ImprovementCycle,
  to: CycleStage,
  gateOutcome: GateOutcome | null,
  lessonsRecorded: number,
): void {
  const verdict = inspectStageChange({ from: cycle.stage, to, gateOutcome, lessonsRecorded });
  if (verdict.allowed) return;

  const { id, stage } = cycle;
  if (verdict.refusal === "same_stage") throw new CycleAlreadyInStageError(id, stage);
  if (verdict.refusal === "terminal_stage") throw new CycleSettledError(id, stage);
  if (verdict.refusal === "no_lessons") {
    throw new CycleWithoutLessonsError(id, lessonsRecorded, MIN_LESSONS_FOR_CLOSURE);
  }
  if (verdict.gate !== null) {
    if (verdict.refusal === "gate_missing") {
      throw new CycleClosureGateNotConvenedError(id, verdict.gate);
    }
    if (verdict.refusal === "gate_pending")
      throw new CycleClosureGatePendingError(id, verdict.gate);
    if (verdict.refusal === "gate_refused")
      throw new CycleClosureGateRefusedError(id, verdict.gate);
  }
  throw new InvalidCycleProgressionError(id, stage, to);
}

// --- Authoring -------------------------------------------------------------------

/**
 * Rewrite what this round set out to improve.
 *
 * Permitted while the work is being planned and while it is running, because a cycle that discovers in period two
 * that it was aimed at the wrong thing should say so rather than carry a sentence everybody has stopped believing.
 * Refused from review onward, which is the freeze the module comment argues for.
 */
export function reviseCycleIntent(cycle: ImprovementCycle, intent: string): ImprovementCycle {
  requireUnsettled(cycle);
  if (!AUTHORING_STAGES.includes(cycle.stage)) {
    throw new CycleIntentFrozenError(cycle.id, cycle.stage);
  }
  return touch(cycle, { intent: requireIntent(intent) });
}

/**
 * Move the round's boundaries.
 *
 * Planning only, and this is the narrowest window in the aggregate. Before the work starts, a span is a plan and
 * changing it is planning; once the work is running, changing it is the difference between a cycle that overran
 * and a cycle that always meant to take that long — and only one of those is a thing the institution can learn
 * from. A round whose dates genuinely changed after it began is a round that was abandoned and opened again.
 */
export function rescheduleCycle(
  cycle: ImprovementCycle,
  startPeriod: number,
  endPeriod: number,
): ImprovementCycle {
  requireUnsettled(cycle);
  if (cycle.stage !== "planning") throw new CycleSpanFixedError(cycle.id, cycle.stage);
  return touch(cycle, applySpan(requireSpan(cycle.cycleKey, startPeriod, endPeriod)));
}

// --- Lifecycle -------------------------------------------------------------------

/** Start the work. The moment the span stops moving. */
export function startCycleExecution(cycle: ImprovementCycle): ImprovementCycle {
  requireStageChange(cycle, "executing", null, 0);
  return touch(cycle, { stage: "executing", executionStartedAt: nowIso() });
}

/**
 * Start looking back at what the round achieved. The moment the intent stops moving.
 *
 * A separate stage from execution rather than a formality. The interval between the work ending and the review
 * beginning is the only measure of whether an institution reflects at all, and a programme where every cycle is
 * `executing` until the next one opens has a retrospective process that exists on paper.
 */
export function startCycleReview(cycle: ImprovementCycle): ImprovementCycle {
  requireStageChange(cycle, "reviewing", null, 0);
  return touch(cycle, { stage: "reviewing", reviewStartedAt: nowIso() });
}

/**
 * Close the round: it ran, it concluded something, and a closure gate agreed it was done.
 *
 * The lesson count is an argument rather than a field this record has been keeping, and the caller is expected to
 * have counted the lessons actually filed against this cycle at the moment of closure. That is the only count
 * that can be checked against the lesson rows afterwards; a total this aggregate incremented would be a second
 * answer to the same question, and the day the two disagreed the one on the cycle would be the one in the report.
 *
 * Both requirements are refused by the cadence engine rather than here, and neither has an override: a cycle with
 * no lessons cannot be closed by a caller with more permissions, and a closure with no gate cannot be closed by a
 * caller in a hurry.
 */
export function closeCycle(
  cycle: ImprovementCycle,
  gateOutcome: GateOutcome | null,
  lessonsRecorded: number,
  actor: Uuid | null,
): ImprovementCycle {
  requireStageChange(cycle, "closed", gateOutcome, lessonsRecorded);
  return touch(cycle, {
    stage: "closed",
    lessonsRecorded,
    settledAt: nowIso(),
    settledBy: actor,
  });
}

/**
 * Abandon the round. Available from every stage before an ending.
 *
 * The reason is compulsory, and it is the only compulsory free text on a cycle. This is the honest ending for a
 * round that did not get where it meant to, and it takes no gate: a cycle nobody can close is not improved by
 * being left open, and requiring a quorum to admit that would guarantee it stays `executing` for years. What the
 * institution needs from it is the reason, because a year later the difference between a round that was
 * deliberately stopped and one that everybody simply forgot is the whole of what there is to learn.
 */
export function abandonCycle(
  cycle: ImprovementCycle,
  actor: Uuid | null,
  reason: string,
): ImprovementCycle {
  requireStageChange(cycle, "abandoned", null, 0);
  const abandonmentReason = reason.trim();
  if (abandonmentReason.length === 0) throw new EmptyAbandonmentReasonError();
  return touch(cycle, {
    stage: "abandoned",
    abandonmentReason,
    settledAt: nowIso(),
    settledBy: actor,
  });
}

// --- Reading ---------------------------------------------------------------------

/** Whether the round is still going somewhere. */
export const isCycleOpen = (cycle: ImprovementCycle): boolean => !isTerminalCycleStage(cycle.stage);

/** Whether the round reached one of its two endings. */
export const isCycleSettled = (cycle: ImprovementCycle): boolean =>
  isTerminalCycleStage(cycle.stage);

/** Whether the round concluded rather than merely stopped. The subset improvement reporting counts. */
export const isCycleClosed = (cycle: ImprovementCycle): boolean => cycle.stage === "closed";

/**
 * The cycle's span, re-inspected from its stored boundaries.
 *
 * Re-derived rather than reassembled from the stored `periods`, because a caller asking for the span wants the
 * engine's answer about these two numbers and not this record's memory of an answer given earlier. On a stored
 * cycle the two agree by construction — the span was checked before it was written — which is what makes the
 * re-derivation a cheap invariant check rather than a second opinion.
 */
export const cycleSpan = (cycle: ImprovementCycle): SpanVerdict =>
  inspectSpan(cycle.startPeriod, cycle.endPeriod);

/**
 * Whole periods the round has been running for as of a period the caller names.
 *
 * Zero for a period before the one it started in: the cadence engine does not count backwards, and a round asked
 * about its own past reports that it has not started rather than a negative duration.
 */
export const cycleElapsedPeriods = (cycle: ImprovementCycle, asOfPeriod: number): number =>
  elapsedPeriods(cycle.startPeriod, asOfPeriod);
