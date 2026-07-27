import {
  IMPACT_BANDS,
  RISK_LEVELS,
  clampConfidence,
  impactRank,
  isOpenRecommendationStatus,
  isWithinAutoExecutionRisk,
} from "./decision-value";
import type {
  DecisionBacklog,
  KeyCount,
  RankedRecommendation,
  RecommendationPriorityView,
} from "./decision-view";

/**
 * The prioritization engine — what an administrator should look at first, and why.
 *
 * The weight here is **descriptive and declared**, never predictive. It is built from three things a person can
 * check for themselves: how far the recommendation reaches (`impactBand`), how well the evidence holds it up
 * (`confidence`, which the evidence engine derived from the weakest link in the chain), and how close the
 * window is to closing (`expiresAt`). Each weight is an exported constant, so "why is this at the top?" has an
 * arithmetic answer rather than a model to trust. Predictive intelligence is a later contract; a sort order an
 * administrator can audit is what belongs here.
 *
 * Risk is deliberately *not* in the score. A high-risk recommendation is not more urgent than a low-risk one —
 * it is more consequential, which is a different question and one the autonomy gate already answers by sending
 * it to a person. Scoring risk upward would push exactly the decisions that need care to the top of a queue
 * people work through quickly, and scoring it downward would bury them. It is reported alongside the score
 * instead, where a person reads it before deciding rather than after being sorted by it.
 *
 * A lapsed recommendation ranks last whatever its score. It is still listed — an administrator needs to see
 * what went unanswered — but nothing is served by putting an expired item above a live one.
 *
 * The engine is clock-free: every function takes the moment to judge against as `asOf`, and one it cannot read
 * yields nothing rather than a guess, exactly as the orchestration engine does with an unreadable SLA moment.
 */

const MS_PER_HOUR = 3_600_000;

/** Points contributed by reach, per band above `individual`. Four bands, so 0–75. */
export const IMPACT_SCORE_WEIGHT = 25;

/** Points contributed per point of evidence confidence. Confidence is 0–100, so 0–50. */
export const CONFIDENCE_SCORE_WEIGHT = 0.5;

/** Points contributed by a closing window, at most. 0–25. */
export const URGENCY_SCORE_WEIGHT = 25;

/** How far ahead a closing window starts to register. Beyond this, expiry contributes nothing. */
export const URGENCY_HORIZON_HOURS = 72;

/** Whole hours until a recommendation lapses at the given moment; null when it does not lapse. */
export function hoursUntil(expiresAt: string | null, asOf: string): number | null {
  if (expiresAt === null) {
    return null;
  }
  const at = Date.parse(asOf);
  const expiry = Date.parse(expiresAt);
  if (Number.isNaN(at) || Number.isNaN(expiry)) {
    return null;
  }
  return Math.floor((expiry - at) / MS_PER_HOUR);
}

/** Whether a recommendation's window has already closed at the given moment. */
export function isExpiredRecommendation(
  recommendation: RecommendationPriorityView,
  asOf: string,
): boolean {
  const { expiresAt } = recommendation;
  if (expiresAt === null) {
    return false;
  }
  const at = Date.parse(asOf);
  const expiry = Date.parse(expiresAt);
  return !Number.isNaN(at) && !Number.isNaN(expiry) && expiry <= at;
}

/**
 * How much a closing window contributes, from 0 (no expiry, or further off than the horizon) to 1 (closed or
 * closing now). Linear across the horizon, so the arithmetic stays inspectable.
 */
function urgency(hoursRemaining: number | null): number {
  if (hoursRemaining === null) {
    return 0;
  }
  if (hoursRemaining <= 0) {
    return 1;
  }
  if (hoursRemaining >= URGENCY_HORIZON_HOURS) {
    return 0;
  }
  return (URGENCY_HORIZON_HOURS - hoursRemaining) / URGENCY_HORIZON_HOURS;
}

/**
 * The declared weight of a recommendation at a given moment, 0–150, to two decimals. Reach, then evidence, then
 * how little time is left — and nothing else.
 */
export function priorityScore(recommendation: RecommendationPriorityView, asOf: string): number {
  const reach = impactRank(recommendation.impactBand) * IMPACT_SCORE_WEIGHT;
  const evidence = clampConfidence(recommendation.confidence) * CONFIDENCE_SCORE_WEIGHT;
  const window = urgency(hoursUntil(recommendation.expiresAt, asOf)) * URGENCY_SCORE_WEIGHT;
  return Math.round((reach + evidence + window) * 100) / 100;
}

/** Order the queue: live before lapsed, then heaviest first, then by id so the order never wobbles. */
const byPriority = (a: RankedRecommendation, b: RankedRecommendation): number =>
  Number(a.expired) - Number(b.expired) || b.score - a.score || a.id.localeCompare(b.id);

/**
 * Rank the recommendations still awaiting an answer. Only `proposed` recommendations are ranked — one that has
 * been accepted, rejected, superseded or withdrawn is not waiting for anybody.
 *
 * A moment that cannot be read yields an empty ranking rather than a ranking computed against an imagined
 * clock.
 */
export function rankRecommendations(
  recommendations: readonly RecommendationPriorityView[],
  asOf: string,
): readonly RankedRecommendation[] {
  if (Number.isNaN(Date.parse(asOf))) {
    return [];
  }

  return recommendations
    .filter((recommendation) => isOpenRecommendationStatus(recommendation.status))
    .map((recommendation) => ({
      id: recommendation.id,
      score: priorityScore(recommendation, asOf),
      impactBand: recommendation.impactBand,
      riskLevel: recommendation.riskLevel,
      confidence: clampConfidence(recommendation.confidence),
      hoursRemaining: hoursUntil(recommendation.expiresAt, asOf),
      expired: isExpiredRecommendation(recommendation, asOf),
    }))
    .sort(byPriority);
}

/** The heaviest few, for a dashboard that has room for a few. A limit of zero or less yields nothing. */
export const topRecommendations = (
  recommendations: readonly RecommendationPriorityView[],
  asOf: string,
  limit: number,
): readonly RankedRecommendation[] =>
  limit <= 0 ? [] : rankRecommendations(recommendations, asOf).slice(0, limit);

/**
 * The open recommendations whose risk puts them beyond anything that could ever run unattended. This is the
 * same ceiling the autonomy engine reads — the queue and the gate cannot disagree about what needs a person.
 */
export const humanGatedRecommendations = (
  recommendations: readonly RecommendationPriorityView[],
): readonly RecommendationPriorityView[] =>
  recommendations.filter(
    (recommendation) =>
      isOpenRecommendationStatus(recommendation.status) &&
      !isWithinAutoExecutionRisk(recommendation.riskLevel),
  );

/** Count a fixed vocabulary, keeping every member so a chart axis stays stable across refreshes. */
const countOver = <T extends string>(
  keys: readonly T[],
  values: readonly T[],
): readonly KeyCount[] =>
  keys.map((key) => ({ key, count: values.filter((value) => value === key).length }));

/**
 * A descriptive picture of what is waiting to be decided: how much is live, how much lapsed unanswered, how it
 * spreads across reach and risk, how much of it cannot be automated at all, and the ranked queue itself.
 *
 * `openCount` counts what is genuinely still answerable; a `proposed` recommendation whose window has closed is
 * counted as expired instead, and the reach and risk spreads describe the live population only — an
 * administrator planning their morning is looking at what they can still act on.
 */
export function summarizeBacklog(
  recommendations: readonly RecommendationPriorityView[],
  asOf: string,
): DecisionBacklog {
  const ranked = rankRecommendations(recommendations, asOf);
  const live = ranked.filter((entry) => !entry.expired);

  return {
    openCount: live.length,
    expiredCount: ranked.length - live.length,
    byImpact: countOver(
      IMPACT_BANDS,
      live.map((entry) => entry.impactBand),
    ),
    byRisk: countOver(
      RISK_LEVELS,
      live.map((entry) => entry.riskLevel),
    ),
    humanGatedCount: live.filter((entry) => !isWithinAutoExecutionRisk(entry.riskLevel)).length,
    ranked,
  };
}
