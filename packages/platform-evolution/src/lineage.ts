import { isTerminalInitiativeStatus } from "./evolution-value";
import type { LineageChain, LineageGap, LineageStage, LineageVerdict } from "./evolution-view";

/**
 * The lineage engine: whether an institution can actually show how a change happened, and where the account runs
 * out.
 *
 * Every other engine in this package governs a step. This one reads the whole thing backwards and asks the
 * question an inspector, an incoming head or a governing body asks about a practice already in place: why do we
 * do it this way, who decided, and what did we learn. An institution that cannot answer those has not
 * necessarily done anything wrong — it has simply lost the account, which is the ordinary condition of almost
 * every school and the thing this contract exists to change.
 *
 * The verdict is a ladder rather than a boolean because the interesting information is *where* the account stops.
 * A change whose chain reads back to a settled decision but no lesson is in a different condition from one that
 * reads back to nothing at all: the first has a governance record and an unfinished retrospective, the second
 * has a practice nobody can source. Collapsing both into "not traceable" would tell an institution it has a
 * problem while hiding which of its two very different problems it has.
 *
 * Nothing here fetches, and nothing here judges people. The chain is assembled by the caller from records this
 * package already owns, so the same chain always produces the same verdict, and a gap is a statement about a
 * record rather than about whoever did or did not write it. That distinction matters more here than anywhere
 * else in the domain: a lineage report that read as an allocation of blame would be answered by institutions
 * writing better-looking chains rather than better ones.
 */

// --- Stages ----------------------------------------------------------------------

/**
 * The lineage stages in ascending order, from no account at all to a lesson in institutional memory.
 *
 * Frozen, and ordered deliberately: `evidence` before `signal` because something must have been noticed before
 * anybody could raise it; `decision` before `outcome` because an institution that reached an outcome without a
 * settled gate did not decide, it drifted; `memory` last because it is the only rung that closes the loop back
 * to where the next change will start.
 */
export const LINEAGE_STAGES: readonly LineageStage[] = Object.freeze<LineageStage[]>([
  "unrecorded",
  "evidence",
  "signal",
  "decision",
  "outcome",
  "memory",
]);

/**
 * How far up the ladder a stage sits. `unrecorded` is `0`.
 *
 * Exposed because callers legitimately need to compare stages — reporting which changes fall below a threshold,
 * or whether an institution's lineage improved between two periods — and comparing them by string equality is
 * how a caller ends up hard-coding the order this module already knows.
 */
export const lineageStageRank = (stage: LineageStage): number => LINEAGE_STAGES.indexOf(stage);

// --- Trace -----------------------------------------------------------------------

/** The statuses at which a signal has actually been taken up, rather than merely filed. */
const TAKEN_UP: readonly string[] = Object.freeze(["accepted", "merged"]);

/**
 * Read a change's record backwards and report how far it goes.
 *
 * The stage advances only while each rung holds, so the verdict names the first thing missing rather than the
 * best thing present. Gaps, by contrast, are collected across the whole chain including above the break: an
 * institution repairing its records should see every weakness at once rather than discovering the next one each
 * time it fixes the last.
 *
 * Two rules are worth stating because they are judgements rather than mechanics. A *refused* gate counts toward
 * `decision`, because refusing is deciding — the institution considered the change and declined it, and that is
 * a better record than most changes ever get. And a `withdrawn` or `rejected` initiative counts toward
 * `outcome`, because a change that was proposed and did not happen has an outcome; requiring adoption would
 * define lineage as something only successful changes have, which is precisely how improvement programmes end up
 * with archives full of successes and no memory of what they tried.
 *
 * `lesson_provisional` is the gap this domain cares most about. It is the one that fires on a well-run
 * institution — the retrospective happened, somebody wrote the lessons down, and nothing was ever committed to
 * the knowledge graph — and reporting it as a break in the chain rather than as a completed step is the whole
 * argument of the contract stated in one code.
 */
export const traceLineage = (chain: LineageChain): LineageVerdict => {
  const gaps: LineageGap[] = [];
  const missing = (code: string): void => {
    gaps.push({ code, linkIndex: null });
  };

  chain.signals.forEach((signal, index) => {
    if (signal.evidenceCited <= 0) gaps.push({ code: "signal_without_evidence", linkIndex: index });
  });
  chain.gates.forEach((gate, index) => {
    if (gate.outcome === "pending") gaps.push({ code: "gate_unsettled", linkIndex: index });
  });
  chain.lessons.forEach((lesson, index) => {
    if (lesson.retention === "provisional") {
      gaps.push({ code: "lesson_provisional", linkIndex: index });
    }
  });

  const evidenced = chain.signals.length > 0 && chain.signals.every((s) => s.evidenceCited > 0);
  const takenUp = chain.signals.some((s) => TAKEN_UP.includes(s.status));
  const decided = chain.gates.some((g) => g.outcome !== "pending");
  const concluded = isTerminalInitiativeStatus(chain.initiativeStatus);
  const remembered =
    chain.lessons.length > 0 && chain.lessons.every((l) => l.retention !== "provisional");

  if (chain.signals.length === 0) missing("no_signal");
  if (chain.signals.length > 0 && !takenUp) missing("signal_not_taken_up");
  if (!decided) missing("no_settled_gate");
  if (!concluded) missing("initiative_in_flight");
  if (chain.lessons.length === 0) missing("no_lesson");

  let reachedStage: LineageStage = "unrecorded";
  if (evidenced) reachedStage = "evidence";
  if (evidenced && takenUp) reachedStage = "signal";
  if (evidenced && takenUp && decided) reachedStage = "decision";
  if (evidenced && takenUp && decided && concluded) reachedStage = "outcome";
  if (evidenced && takenUp && decided && concluded && remembered) reachedStage = "memory";

  return { traceable: reachedStage === "memory", reachedStage, gaps };
};
