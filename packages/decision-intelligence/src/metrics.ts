import {
  AUTONOMY_DISPOSITIONS,
  DECISION_DISPOSITIONS,
  EXECUTION_OUTCOMES,
  RECOMMENDATION_STATUSES,
  isAutonomousDisposition,
  isOpenRecommendationStatus,
  isTerminalInstanceStatus,
  toRate,
} from "./decision-value";
import type {
  DecisionOperationsSummary,
  DecisionSummaryView,
  InstanceSummaryView,
  KeyCount,
  RecommendationSummaryView,
  RunSummaryView,
} from "./decision-view";

/**
 * The metrics engine — what a tenant's decision operations actually look like, in counts and rates.
 *
 * Three rates carry the weight of this contract, and they are here so that autonomy is *observable* rather than
 * merely governed. `autonomyRate` says how much the machine decided on its own; `humanGatedRate` says how much
 * stopped for a person; `acceptanceRate` says how often the people being advised agreed. Together they answer
 * the question the three rules exist to keep answerable: is the automation earning the trust it is being given,
 * or is it quietly deciding more than anyone intended?
 *
 * `acceptanceRate` is measured against *answered* recommendations, not all of them. A recommendation that
 * lapsed, was superseded or was withdrawn was never judged, and folding those into the denominator would make
 * an ignored engine look like a rejected one — or, worse, let a team improve the number by ignoring
 * recommendations faster.
 *
 * The run counts read the autonomy gate's own verdict — its `disposition` — because that is the record of what
 * the gate decided, and a count of governance decisions should come from the governance decision. The one
 * exception is compensation, which is read from `compensationState`, because a run can fail and then be put
 * back: the status records where execution stopped, the compensation state records whether the world was
 * returned to where it started. Those are different facts and the summary reports the second one.
 *
 * Every roll-up keeps the full vocabulary, including the members that scored zero, so a chart axis or an export
 * column does not appear and disappear between refreshes. Counts and rates only — never content, never a
 * projection.
 */

/** Count a fixed vocabulary, keeping every member so a chart axis stays stable across refreshes. */
const countOver = <T extends string>(
  keys: readonly T[],
  values: readonly string[],
): readonly KeyCount[] =>
  keys.map((key) => ({ key, count: values.filter((value) => value === key).length }));

/**
 * Whether a persisted disposition string is one the machine took on its own. The metrics engine reads stored
 * values rather than freshly constructed ones, so it matches against the vocabulary instead of asserting that
 * an arbitrary string belongs to it — an unrecognised value simply counts as nothing.
 */
const isAutonomous = (disposition: string): boolean =>
  DECISION_DISPOSITIONS.some((known) => known === disposition && isAutonomousDisposition(known));

/** Everything the summary is computed from. Workflows and rules contribute only their counts. */
export interface DecisionOperationsInput {
  readonly recommendations: readonly RecommendationSummaryView[];
  readonly decisions: readonly DecisionSummaryView[];
  readonly instances: readonly InstanceSummaryView[];
  readonly runs: readonly RunSummaryView[];
  readonly workflowCount: number;
  readonly ruleCount: number;
}

/** Recommendations by status, in the vocabulary's own order, zeros included. */
export const recommendationStatusCounts = (
  recommendations: readonly RecommendationSummaryView[],
): readonly KeyCount[] =>
  countOver(
    RECOMMENDATION_STATUSES,
    recommendations.map((recommendation) => recommendation.status),
  );

/** Automation runs by the verdict the autonomy gate reached, zeros included. */
export const runDispositionCounts = (runs: readonly RunSummaryView[]): readonly KeyCount[] =>
  countOver(
    AUTONOMY_DISPOSITIONS,
    runs.map((run) => run.disposition),
  );

/** Decisions by how far execution got, zeros included. */
export const executionOutcomeCounts = (
  decisions: readonly DecisionSummaryView[],
): readonly KeyCount[] =>
  countOver(
    EXECUTION_OUTCOMES,
    decisions.map((decision) => decision.executionOutcome),
  );

/**
 * The recommendations somebody actually judged — accepted or rejected. A lapsed, superseded or withdrawn
 * recommendation was never answered and is not counted here; see the note in the module comment.
 */
export const answeredRecommendationCount = (
  recommendations: readonly RecommendationSummaryView[],
): number =>
  recommendations.filter(
    (recommendation) =>
      recommendation.status === "accepted" || recommendation.status === "rejected",
  ).length;

/** Accepted as a percent of answered. Zero when nothing has been answered — not an assumed agreement. */
export function acceptanceRate(recommendations: readonly RecommendationSummaryView[]): number {
  const accepted = recommendations.filter(
    (recommendation) => recommendation.status === "accepted",
  ).length;
  return toRate(accepted, answeredRecommendationCount(recommendations));
}

/** Decisions the machine took on its own, as a percent of all decisions. The number governance watches. */
export const autonomyRate = (decisions: readonly DecisionSummaryView[]): number =>
  toRate(
    decisions.filter((decision) => isAutonomous(decision.disposition)).length,
    decisions.length,
  );

/** Runs the gate sent to a person, as a percent of all runs. The mirror of {@link autonomyRate}. */
export const humanGatedRate = (runs: readonly RunSummaryView[]): number =>
  toRate(runs.filter((run) => run.disposition === "requires_approval").length, runs.length);

/**
 * A descriptive picture of a tenant's decision operations: what was recommended, how much the machine decided
 * on its own, how much stopped for a person, how much was refused outright, and how much had to be undone.
 */
export function summarizeDecisionOperations(
  input: DecisionOperationsInput,
): DecisionOperationsSummary {
  const { recommendations, decisions, instances, runs, workflowCount, ruleCount } = input;
  const autonomousDecisionCount = decisions.filter((decision) =>
    isAutonomous(decision.disposition),
  ).length;

  return {
    recommendationCount: recommendations.length,
    openRecommendationCount: recommendations.filter((recommendation) =>
      isOpenRecommendationStatus(recommendation.status),
    ).length,
    recommendationsByStatus: recommendationStatusCounts(recommendations),
    decisionCount: decisions.length,
    autonomousDecisionCount,
    humanDecisionCount: decisions.length - autonomousDecisionCount,
    workflowCount,
    instanceCount: instances.length,
    runningInstanceCount: instances.filter((instance) => !isTerminalInstanceStatus(instance.status))
      .length,
    ruleCount,
    runCount: runs.length,
    runsByDisposition: runDispositionCounts(runs),
    blockedRunCount: runs.filter((run) => run.disposition === "blocked").length,
    compensatedRunCount: runs.filter((run) => run.compensationState === "compensated").length,
    acceptanceRate: acceptanceRate(recommendations),
    autonomyRate: autonomyRate(decisions),
    humanGatedRate: humanGatedRate(runs),
  };
}
