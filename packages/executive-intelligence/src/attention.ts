import { bandFor, bandMovement, isBandFall, summarizeTrend } from "./banding";
import {
  ATTENTION_SEVERITIES,
  type AttentionReason,
  type AttentionSeverity,
  type PerformanceBand,
  type ReadingStanding,
  isKpiCoverageSufficient,
  isPillarCoverageSufficient,
  isWorseBand,
  normalizeAttentionKey,
  normalizeKpiKey,
  roundIndexValue,
  severityRank,
  standingRank,
} from "./command-value";
import type {
  AttentionSignal,
  AttentionSubjectKind,
  IndexWatch,
  KpiWatch,
  PillarWatch,
} from "./command-view";

/**
 * The attention engine: what an institution should look at first.
 *
 * A dashboard's real product is not its numbers, it is the allocation of a scarce quantity — the attention of
 * about six people who each have a term to spend. Every other module in this package computes a figure honestly;
 * this one decides which of those figures is allowed to interrupt somebody, and it is the module where getting it
 * wrong is most expensive in both directions. Too loud and the queue is ignored within a fortnight, after which
 * the platform has nothing at all; too quiet and a pillar reaches `failing` while a green composite sits at the
 * top of the page.
 *
 * Four rules carry that.
 *
 * **A movement is louder than a state.** A pillar that has sat at `at_risk` for a year is a known condition
 * somebody is presumably already working on; a pillar that arrived there this term is news. So arriving somewhere
 * is exactly the severity of being there, raised one level, and `critical` is reserved for a subject that has
 * just arrived in `failing` — the one event where nobody gets to finish what they were doing first.
 *
 * **A gap in the evidence outranks anything the evidence says.** A subject that did not report, reported
 * untraceably, or reported against a period the assessment cannot count from raises a coverage signal and
 * nothing else. Raising a `target_miss` on a reading the assessment has already declined to use points somebody
 * at a number instead of at the reason the number is not there, and it is the same ordering the traceability
 * engine applies when it checks evidence before currency.
 *
 * **Band signals stop at the pillar.** A KPI's own band movement is not raised, because an institution declares
 * dozens of indicators per pillar and a queue with one item per indicator is a queue nobody opens. What a KPI
 * raises is about the *reading* — that it missed the target it was given, or that its evidence has gone stale.
 * Its performance reaches leadership through the pillar score it feeds, which is what a pillar score is for.
 *
 * **Nothing is suppressed for firing alongside something else.** A pillar that is failing, fell to get there and
 * has declined for three periods raises three signals, because the three name different responses and each is
 * true. Deduplicating them would be this engine deciding which of two true things the reader cares about, and
 * {@link rankAttention} already answers that without discarding either.
 *
 * The engine emits no wording of any kind — no titles, no messages, no recommended actions. A reason code, a
 * severity, a subject and the number it was raised on. What that reads like in a briefing belongs to the
 * presentation contract, and a domain package that wrote the sentence would make every translation of it a schema
 * migration.
 */

// --- Severity --------------------------------------------------------------------

/** The band at and above which nothing is in breach. A `watch` is; a `healthy` is not. */
export const BREACH_FLOOR_BAND: PerformanceBand = "healthy";

/** Whether a band is one an institution is supposed to be doing something about. */
export const isBreachBand = (band: PerformanceBand): boolean =>
  isWorseBand(band, BREACH_FLOOR_BAND);

/**
 * How loud it is to *be* in a band.
 *
 * A standing condition, and deliberately quieter than arriving in one. Nothing here reaches `critical`: an
 * institution that has been failing a pillar since September does not need the loudest thing the platform can say
 * repeated at it every period, it needs the item to stay in the queue until somebody closes it.
 */
const stateSeverity = (band: PerformanceBand): AttentionSeverity => {
  switch (band) {
    case "failing":
      return "urgent";
    case "at_risk":
      return "advisory";
    case "watch":
    case "healthy":
    case "exemplary":
      return "informational";
  }
};

/** One level louder, or as loud as this vocabulary goes. */
const escalate = (severity: AttentionSeverity): AttentionSeverity =>
  ATTENTION_SEVERITIES[severityRank(severity) + 1] ?? "critical";

/**
 * How loud it is to have just *arrived* in a band.
 *
 * Being there, one level louder — which is the whole of the movement-beats-state rule in one line. Above the
 * breach floor there is no condition to escalate: falling from `exemplary` to `healthy` is not a bad state, it is
 * a direction, and it is raised at all only because leadership genuinely wants to hear about a school that has
 * stopped being exceptional. There is exactly one such arrival the band scale permits — `exemplary` is the
 * highest band, so nothing can fall further than a single step and still land above the floor — which is why a
 * fall from up there takes a flat `informational` rather than a depth the scale cannot produce.
 */
const arrivalSeverity = (landed: PerformanceBand): AttentionSeverity =>
  isBreachBand(landed) ? escalate(stateSeverity(landed)) : "informational";

/**
 * How loud it is that an evidence base has softened to a given standing.
 *
 * A move to `attested` says the figure now rests on somebody's word that no system corroborates, which is a
 * governance fact about the number and belongs in front of a human. A move to `projected` says the institution is
 * planning against a forecast, which is legitimate, ordinary, and worth recording rather than escalating.
 */
const standingSeverity = (standing: ReadingStanding): AttentionSeverity => {
  switch (standing) {
    case "measured":
    case "projected":
      return "informational";
    case "attested":
      return "advisory";
  }
};

// --- Signals ---------------------------------------------------------------------

/**
 * The stable identity of a finding: what it is about and why it was raised, never how bad it was.
 *
 * Severity is out of the key on purpose. A pillar that was `advisory` last week and is `urgent` this week is the
 * same finding getting worse, and a key that moved with the severity would leave the old item open beside the new
 * one — so the queue would grow a second copy of every problem that deteriorated, which is exactly the set of
 * problems somebody is still working on.
 */
export const attentionKeyFor = (
  reason: AttentionReason,
  subjectKind: AttentionSubjectKind,
  subject: string,
): string =>
  normalizeAttentionKey(
    [subjectKind, subject.trim(), reason].filter((part) => part.length > 0).join("."),
  );

const signal = (
  reason: AttentionReason,
  severity: AttentionSeverity,
  subjectKind: AttentionSubjectKind,
  subject: string,
  observed: number | null,
): AttentionSignal => ({
  key: attentionKeyFor(reason, subjectKind, subject),
  reason,
  severity,
  subjectKind,
  subject,
  observed,
});

// --- Raising ---------------------------------------------------------------------

/**
 * What the institutional health index itself is asking for.
 *
 * An index that did not clear its coverage floor raises a coverage gap and nothing else — not a band breach, not
 * a drop. That is not caution, it is the coverage floor's own rule being kept: an assessment below the floor may
 * not be finalized, cited, or compared to a period that met it, and a drop signal is a comparison. An institution
 * whose index fell four points because four pillars stopped reporting has not declined; it has stopped measuring,
 * and those are opposite instructions to whoever picks the item up.
 *
 * A fall in the value and a fall in the band are one signal rather than two. The value moving is what happened;
 * the band moving is what makes it loud. Splitting them would put the same event in the queue twice at two
 * different volumes, and the reader would have to work out that they were the same event.
 */
export const raiseForIndex = (watch: IndexWatch): readonly AttentionSignal[] => {
  if (watch.value === null || !isPillarCoverageSufficient(watch.pillarCoverage)) {
    return [signal("coverage_gap", "urgent", "index", "", watch.pillarCoverage)];
  }

  const raised: AttentionSignal[] = [];
  const band = bandFor(watch.value);

  if (isBreachBand(band)) {
    raised.push(signal("band_breach", stateSeverity(band), "index", "", watch.value));
  }

  const previous = watch.previousValue;
  if (previous !== null && isPillarCoverageSufficient(watch.previousPillarCoverage)) {
    const movement = roundIndexValue(watch.value - previous);
    if (movement < 0) {
      const bands = bandMovement(bandFor(previous), band);
      const severity = isBandFall(bands) ? arrivalSeverity(band) : "informational";
      raised.push(signal("index_drop", severity, "index", "", movement));
    }
  }

  const { standing, previousStanding } = watch;
  if (
    standing !== null &&
    previousStanding !== null &&
    standingRank(standing) > standingRank(previousStanding)
  ) {
    raised.push(signal("standing_weakened", standingSeverity(standing), "index", "", null));
  }

  return raised;
};

/**
 * What one pillar is asking for.
 *
 * A pillar that did not clear its KPI coverage floor contributed nothing to the index, so its score — if it has
 * one at all — describes a fraction of the pillar and nothing else. It raises a coverage gap alone, at `urgent`,
 * because a hole in the measurement is not a small version of a bad measurement: there is something to weigh
 * about a pillar scoring 40, and nothing to weigh about a pillar nobody measured.
 *
 * `sustained_decline` is a flat `urgent` regardless of where the pillar currently sits, and that flatness is the
 * point. The signal exists to fire *before* the band moves; making its volume depend on the band would make it
 * loudest exactly when the band signals are already shouting, and quietest in the case it was built for — a
 * pillar sliding steadily downward through `exemplary` and `healthy`, which every other signal here calls fine.
 */
export const raiseForPillar = (watch: PillarWatch): readonly AttentionSignal[] => {
  const { pillar, score } = watch;
  if (score === null || !isKpiCoverageSufficient(watch.kpiCoverage)) {
    return [signal("coverage_gap", "urgent", "pillar", pillar, watch.kpiCoverage)];
  }

  const raised: AttentionSignal[] = [];
  const band = bandFor(score);

  if (isBreachBand(band)) {
    raised.push(signal("band_breach", stateSeverity(band), "pillar", pillar, score));
  }

  const previous = watch.history[watch.history.length - 1];
  if (previous !== undefined) {
    const bands = bandMovement(bandFor(previous), band);
    if (isBandFall(bands)) {
      raised.push(signal("band_fall", arrivalSeverity(band), "pillar", pillar, bands.steps));
    }
  }

  const trend = summarizeTrend([...watch.history, score]);
  if (trend.sustainedDecline) {
    raised.push(signal("sustained_decline", "urgent", "pillar", pillar, trend.decliningRun));
  }

  return raised;
};

/**
 * What one KPI reading is asking for.
 *
 * The admission comes from the traceability engine and is not re-derived here. A stale reading raises
 * `evidence_stale` and somebody goes and collects a fresher figure; a reading that could not be traced, or that
 * was filed against a period this assessment cannot count from, raises `coverage_gap` — because a number nobody
 * can follow back contributed exactly as much as a number nobody took.
 *
 * Nothing about the reading's performance is raised unless it was admitted. A target miss on a reading the
 * assessment declined to use would send an administrator to improve a figure that is not in the index, while the
 * reason it is not in the index goes unread.
 */
export const raiseForKpi = (watch: KpiWatch): readonly AttentionSignal[] => {
  const kpiKey = normalizeKpiKey(watch.kpiKey);

  switch (watch.admission) {
    case "stale":
      return [signal("evidence_stale", "advisory", "kpi", kpiKey, null)];
    case "out_of_period":
    case "untraceable":
      return [signal("coverage_gap", "urgent", "kpi", kpiKey, null)];
    case "admitted":
      break;
  }

  const { score, targetScore } = watch;
  if (score === null || targetScore === null) return [];

  const shortfall = roundIndexValue(targetScore - score);
  if (shortfall <= 0) return [];

  return [signal("target_miss", stateSeverity(bandFor(score)), "kpi", kpiKey, shortfall)];
};

// --- Reading the queue -----------------------------------------------------------

/**
 * The signals ordered by how loudly they are asking, loudest first.
 *
 * Severity and nothing else. Ties keep the order they were raised in — the sort is stable — so an index signal
 * precedes the pillar signals that explain it and a pillar's signals stay together, which is the order somebody
 * reads a queue in anyway. Sorting within a severity by magnitude was the obvious alternative and is wrong: the
 * `observed` numbers are in different units per reason, so it would rank a coverage ratio against a band step
 * count and produce an order that looks meaningful and is not.
 */
export const rankAttention = (signals: readonly AttentionSignal[]): readonly AttentionSignal[] =>
  [...signals].sort((left, right) => severityRank(right.severity) - severityRank(left.severity));
