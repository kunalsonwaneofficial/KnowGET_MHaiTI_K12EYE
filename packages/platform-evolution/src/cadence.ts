import {
  type CycleStage,
  type GateOutcome,
  type GovernanceGate,
  MIN_LESSONS_FOR_CLOSURE,
  isTerminalCycleStage,
  isValidPeriod,
} from "./evolution-value";
import type { SpanVerdict, StageChangeRequest, StageChangeVerdict } from "./evolution-view";

/**
 * The cadence engine: how the institution's improvement work is spaced in time, and what an improvement cycle
 * has to have produced before it is allowed to end.
 *
 * Time here is an integer index into a grid the caller defines — a term, a half-term, an academic year — and
 * this module holds no clock, no calendar and no notion of what today is. That is not an omission to be filled
 * in later. A maturity assessment that consulted the system clock would produce a different answer on Tuesday
 * than on Monday and could never be reproduced for an inspector; a lesson whose review date depended on when the
 * question was asked would come due at different times for different readers. Making the period explicit costs
 * every caller one parameter and buys the whole contract reproducibility.
 *
 * The other half of the module is the improvement cycle's stages, and the rule that matters there is that a
 * cycle cannot close without having written something down. Improvement programmes do not usually fail loudly;
 * they run a term, absorb everybody's attention, and stop — and the institution ends up knowing exactly what it
 * knew before, with a folder of evidence that it was busy. Requiring at least one lesson before the closure gate
 * can even be crossed makes that outcome visible as an unfinished cycle rather than a completed one.
 */

// --- Periods ---------------------------------------------------------------------

/**
 * Check a span of periods and count it.
 *
 * Three things can be wrong and all three are reported together: `invalid_start_period` and `invalid_end_period`
 * for indices outside the legal grid, and `end_before_start` for a span that runs backwards. The count is
 * inclusive of both ends, so a cycle that begins and finishes in period 4 is one period long rather than zero —
 * it is a real cycle that really happened, and a length of zero would make it invisible to anything that
 * averages over the periods a programme ran for.
 *
 * An unusable span counts `0` rather than a best guess. A span whose ends are the wrong way round has no length
 * anybody would agree on, and returning a plausible number would let a broken record flow into an average and
 * quietly move it.
 */
export const inspectSpan = (startPeriod: number, endPeriod: number): SpanVerdict => {
  const issues: string[] = [];

  if (!isValidPeriod(startPeriod)) issues.push("invalid_start_period");
  if (!isValidPeriod(endPeriod)) issues.push("invalid_end_period");
  if (issues.length === 0 && endPeriod < startPeriod) issues.push("end_before_start");

  const usable = issues.length === 0;
  return {
    usable,
    startPeriod,
    endPeriod,
    periods: usable ? endPeriod - startPeriod + 1 : 0,
    issues,
  };
};

/**
 * How many whole periods have been completed since something started.
 *
 * Completed, not touched. Something that started in the current period has been running for zero periods, and
 * that is the whole point of the function: it is what {@link file://./lifecycle.ts} reads to decide whether a
 * pilot has actually run, and an institution that counted the period a pilot began in would let a change be
 * adopted the same week it was approved while still reporting a period of evidence behind it.
 *
 * Anything unusable — an index off the grid, an as-of before the start — returns `0` rather than a negative
 * number or a throw. A negative elapsed count has no meaning any caller could act on, and every caller of this
 * function is about to compare the result against a minimum, where `0` is exactly the honest answer: nothing has
 * elapsed that anybody can rely on.
 */
export const elapsedPeriods = (startPeriod: number, asOfPeriod: number): number => {
  if (!isValidPeriod(startPeriod) || !isValidPeriod(asOfPeriod)) return 0;
  return asOfPeriod > startPeriod ? asOfPeriod - startPeriod : 0;
};

// --- Stages ----------------------------------------------------------------------

/**
 * Which stages an improvement cycle may move to from each stage it can be in.
 *
 * The forward path is `planning → executing → reviewing → closed`, and the separation of `reviewing` from
 * `closed` carries the module's argument. Review is where a cycle's lessons get written; closure is where a
 * human agrees they are enough. A cycle that could close straight out of `executing` would be a cycle that
 * produced no lessons — which is the normal, unremarkable end of every improvement programme that has ever
 * quietly stopped, and the shape this contract exists to make impossible to record as a success.
 *
 * `abandoned` is reachable from every stage before closure and needs no gate. Cycles genuinely are abandoned — a
 * head leaves, an inspection lands, a priority moves — and a domain that modelled only successful cycles would
 * force its most instructive records into `closed`, where they would be counted as improvement work that
 * completed. An honest `abandoned` costs the institution nothing and tells a later reader the truth.
 *
 * Frozen at both levels, for the reason the other progression maps are.
 */
export const CYCLE_PROGRESSIONS: Readonly<Record<CycleStage, readonly CycleStage[]>> =
  Object.freeze({
    planning: Object.freeze<CycleStage[]>(["executing", "abandoned"]),
    executing: Object.freeze<CycleStage[]>(["reviewing", "abandoned"]),
    reviewing: Object.freeze<CycleStage[]>(["closed", "abandoned"]),
    closed: Object.freeze<CycleStage[]>([]),
    abandoned: Object.freeze<CycleStage[]>([]),
  });

/**
 * The gate a stage change stands on, or `null` when it stands on none.
 *
 * One move is gated: `reviewing → closed`. Closing a cycle is the institution saying that a period of
 * improvement work is finished and its lessons are the ones worth keeping, which is a judgement about what the
 * institution now believes — exactly the kind of thing the contract's rule reserves for people.
 *
 * Abandonment is deliberately ungated, and the asymmetry is the same one the initiative lifecycle makes. Closing
 * a cycle asserts something; abandoning one asserts nothing except that the work stopped. Requiring a quorum to
 * admit that a programme ran out of road would mean the admission never gets recorded, and the institution would
 * be left with cycles that are neither closed nor abandoned but simply the last thing anybody touched.
 */
export const requiredCycleGate = (from: CycleStage, to: CycleStage): GovernanceGate | null =>
  from === "reviewing" && to === "closed" ? "cycle_closure" : null;

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
 * Whether an improvement cycle may make the move somebody asked for, and if not, which kind of not.
 *
 * The lesson check runs before the gate check, on the same principle the lifecycle engine orders its refusals
 * by: what has to happen first in the world comes first in the report. Convening a closure gate for a cycle that
 * has written nothing down asks several people to agree that nothing is enough, and telling the caller to go and
 * do that would be worse than useless. They are told to write the lessons.
 */
export const inspectStageChange = (request: StageChangeRequest): StageChangeVerdict => {
  const { from, to } = request;
  const gate = requiredCycleGate(from, to);
  const refuse = (refusal: StageChangeVerdict["refusal"]): StageChangeVerdict => ({
    allowed: false,
    from,
    to,
    gate,
    refusal,
  });

  if (from === to) return refuse("same_stage");
  if (isTerminalCycleStage(from)) return refuse("terminal_stage");
  if (!CYCLE_PROGRESSIONS[from].includes(to)) return refuse("unreachable_stage");

  if (to === "closed" && request.lessonsRecorded < MIN_LESSONS_FOR_CLOSURE) {
    return refuse("no_lessons");
  }

  if (gate !== null) {
    const refusal = gateRefusal(request.gateOutcome);
    if (refusal !== null) return refuse(refusal);
  }

  return { allowed: true, from, to, gate, refusal: null };
};
