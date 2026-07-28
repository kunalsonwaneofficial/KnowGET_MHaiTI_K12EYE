import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { AssessmentStatus, HealthPillar, PeriodGrain, PerformanceBand } from "./command-value";
import type {
  IndexRun,
  IndexVerdict,
  IndexWatch,
  PillarContribution,
  PillarInput,
  PillarOmission,
  PillarWatch,
  PillarWeight,
  RecordedIndex,
  ReproductionVerdict,
  TraceVerdict,
  TracedReading,
} from "./command-view";
import {
  AssessmentAlreadyInvalidatedError,
  AssessmentNotProvisionalError,
  IndexNotPublishedError,
  InsufficientAssessmentCoverageError,
  NonOrdinalAssessmentPeriodError,
  UngroundedAssessmentError,
} from "./errors";
import {
  type HealthIndexDefinition,
  isHealthIndexPublished,
  runHealthIndex,
} from "./health-index-definition";
import { isCitable } from "./indexing";
import { fingerprintRun, reproduce } from "./reproducibility";
import { auditTrace } from "./traceability";

/**
 * A health index assessment: what the institution's composite came out at, for one period, and everything needed
 * to produce that number again.
 *
 * This is the word "reproducible" in the contract's rule, discharged. The record does not merely carry a value
 * and a promise; it carries the entire input set the value was computed from — the definition's declared weights
 * and every pillar's reported score and coverage — pinned as detached copies, plus a fingerprint of them. Six
 * months later, when a figure in a board paper or an inspection response is questioned, the answer is not a
 * recollection of how the number was produced. It is a re-run of the same engine over the same inputs.
 *
 * Pinning rather than referencing is the whole of it. An assessment that stored the id of its definition and
 * looked the weights up at audit time would reproduce whatever the definition says *today*, which is precisely
 * the question nobody asked; the reweighting that the definition aggregate goes to such lengths to make visible
 * would become invisible again at the one moment it mattered. So the weights are copied in at assessment time,
 * and the definition's own freeze rule guarantees the copy and the original agree.
 *
 * The verdict is flattened onto the record rather than nested, because these fields become columns and a
 * composite hidden inside a JSON blob cannot be sorted, filtered, or trended by a query. Two accessors put the
 * shape back for the engines that want it, and they are the only mappers, so the flattening cannot drift into
 * two different opinions about what the assessment said.
 *
 * `sufficient` is stored rather than re-derived on read. It is a judgement about whether this assessment saw
 * enough of the institution to be quotable, made against the coverage floors in force when it was computed; a
 * platform that recomputed it on read would silently unfinalize board papers the day a floor was raised, which
 * is the one direction an audit trail must never move.
 *
 * Construction never refuses on thin evidence. An assessment computed from three pillars and no admitted
 * readings is not a failure to be swallowed — it is the diagnostic that gets somebody to go and fix the feed,
 * and it is visible precisely because it exists and reads as provisional. What thin evidence *does* prevent is
 * finalization, which is where a figure stops being a working number and becomes one an institution stands
 * behind.
 */

// --- The aggregate ---------------------------------------------------------------

export interface HealthIndexAssessment {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The definition this was computed under. Records which composition, not where to look the weights up. */
  readonly indexDefinitionId: Uuid;
  /** Copied from the definition. What panels and briefings address the series by. */
  readonly indexKey: string;
  /** The ordinal this assessment sits at on the definition's grain. */
  readonly period: number;
  /** Copied from the definition, so a reader can tell what the period ordinal counts without a second lookup. */
  readonly grain: PeriodGrain;
  /**
   * The pinned input set: the definition's declared weights and the pillar reports, both detached. The record
   * that makes reproduction possible, and the reason this aggregate is worth storing at all.
   */
  readonly run: IndexRun;
  /** A digest of the pinned run. The cheap way to notice inputs moved; never a tamper control. */
  readonly fingerprint: string;
  /** `null` when nothing the definition declared could be scored — not zero, which is a real composite. */
  readonly value: number | null;
  readonly band: PerformanceBand | null;
  /** The share of declared weight that actually contributed. */
  readonly pillarCoverage: number;
  /** Whether coverage cleared the floor at the moment this was computed. Stored, never re-derived. */
  readonly sufficient: boolean;
  /** How much declared weight was renormalized across the pillars that survived. */
  readonly weightRedistributed: number;
  readonly contributions: readonly PillarContribution[];
  readonly omissions: readonly PillarOmission[];
  /** What the traceability engine made of the readings behind this assessment, at this period. */
  readonly evidence: TraceVerdict;
  readonly status: AssessmentStatus;
  readonly finalizedAt: ISODateString | null;
  readonly invalidatedAt: ISODateString | null;
  readonly invalidationReason: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface AssessHealthIndexParams {
  /** Where this assessment sits on the definition's grain. An integer ordinal; the package holds no clock. */
  readonly period: number;
  /** What each pillar reported, aggregated from its KPI readings by the caller. */
  readonly inputs: readonly PillarInput[];
  /** The readings behind those pillar scores, for the evidence audit. */
  readonly readings: readonly TracedReading[];
}

const copyWeights = (weights: readonly PillarWeight[]): readonly PillarWeight[] =>
  weights.map((entry) => ({ pillar: entry.pillar, weight: entry.weight }));

const copyInputs = (inputs: readonly PillarInput[]): readonly PillarInput[] =>
  inputs.map((entry) => ({
    pillar: entry.pillar,
    score: entry.score,
    kpisRead: entry.kpisRead,
    kpisDeclared: entry.kpisDeclared,
  }));

const touch = (
  assessment: HealthIndexAssessment,
  patch: Partial<HealthIndexAssessment>,
): HealthIndexAssessment => ({
  ...assessment,
  ...patch,
  updatedAt: nowIso(),
});

// --- Assessing -------------------------------------------------------------------

/**
 * Compute an assessment and pin everything it was computed from.
 *
 * Only a published definition may be assessed. A draft's weights are still being argued about, and a composite
 * filed under one would be a number produced by a composition the institution had not yet agreed to — worse than
 * no number, because it would sit in the same series as the real ones.
 *
 * The period is checked for being an ordinal and nothing else. This package has no calendar and deliberately
 * cannot tell whether period 7 is a term that has happened; what it can tell is that a fractional period would
 * make staleness arithmetic and series ordering meaningless, so that is what it refuses.
 *
 * The inputs are copied before they are read, so the pinned run cannot change afterwards because the caller
 * reused its array. The weights come from the definition rather than from any parameter — there is no argument
 * by which a caller could supply the weighting an assessment was filed under, because that is the one substitution
 * that would produce a composite indistinguishable from a real one.
 */
export function assessHealthIndex(
  definition: HealthIndexDefinition,
  params: AssessHealthIndexParams,
): HealthIndexAssessment {
  if (!isHealthIndexPublished(definition)) {
    throw new IndexNotPublishedError(definition.indexKey, definition.status);
  }
  if (!Number.isInteger(params.period)) {
    throw new NonOrdinalAssessmentPeriodError(params.period);
  }

  const run: IndexRun = {
    weights: copyWeights(definition.weights),
    inputs: copyInputs(params.inputs),
  };
  const verdict = runHealthIndex(definition, run.inputs);
  const now = nowIso();

  return {
    id: newUuid(),
    tenantId: definition.tenantId,
    organizationId: definition.organizationId,
    indexDefinitionId: definition.id,
    indexKey: definition.indexKey,
    period: params.period,
    grain: definition.grain,
    run,
    fingerprint: fingerprintRun(run),
    value: verdict.value,
    band: verdict.band,
    pillarCoverage: verdict.pillarCoverage,
    sufficient: verdict.sufficient,
    weightRedistributed: verdict.weightRedistributed,
    contributions: verdict.contributions,
    omissions: verdict.omissions,
    evidence: auditTrace(params.readings, params.period),
    status: "provisional",
    finalizedAt: null,
    invalidatedAt: null,
    invalidationReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Stand behind the number.
 *
 * Three guards, and their order is the argument. Status first, because finalizing something already final or
 * already invalidated is a mistake about which record is in hand rather than about the institution.
 *
 * Then **evidence before coverage**. An assessment can have excellent pillar coverage and not one reading anybody
 * can follow back to a source: every pillar reported, nothing behind any of it. Reporting the coverage fault
 * first would send an administrator off to widen a measurement that was never grounded to begin with, and the
 * traceability engine's judgement — that a figure both unsourced and old is not an old figure — would be
 * answered in the wrong order.
 *
 * Coverage last, and taken through the same predicate the indexing engine publishes rather than a floor compared
 * against here. A second comparison against the same constant is a second definition of "enough of the
 * institution", and the two would drift the first time one of them was tuned.
 */
export function finalizeAssessment(assessment: HealthIndexAssessment): HealthIndexAssessment {
  if (assessment.status !== "provisional") {
    throw new AssessmentNotProvisionalError(assessment.id, assessment.status);
  }
  if (assessment.evidence.admitted === 0) {
    throw new UngroundedAssessmentError(assessment.period);
  }
  if (!isCitable(toIndexVerdict(assessment))) {
    throw new InsufficientAssessmentCoverageError(assessment.period, assessment.pillarCoverage);
  }
  return touch(assessment, { status: "final", finalizedAt: nowIso() });
}

/**
 * Withdraw the number without erasing it.
 *
 * Reachable from `final` as well as from `provisional`, which is the point: the assessments that need
 * invalidating are exactly the ones somebody already quoted. A withdrawn reading turns up, a feed is found to
 * have been double-counting, and what has to happen is that the composite stops being citable while remaining
 * visible — because a board that was shown a figure is owed the record that it was shown it.
 *
 * The reason is free text and unenforced. What makes this event auditable is that it happened, when, and to
 * which assessment; a required reason field only guarantees that a required reason field was filled in.
 */
export function invalidateAssessment(
  assessment: HealthIndexAssessment,
  reason?: string | null,
): HealthIndexAssessment {
  if (assessment.status === "invalidated") {
    throw new AssessmentAlreadyInvalidatedError(assessment.id);
  }
  return touch(assessment, {
    status: "invalidated",
    invalidatedAt: nowIso(),
    invalidationReason: reason?.trim() || null,
  });
}

// --- Reading ---------------------------------------------------------------------

/** Whether the institution stands behind this figure. */
export const isAssessmentFinal = (assessment: HealthIndexAssessment): boolean =>
  assessment.status === "final";

/** Whether this figure has been withdrawn. Still readable, no longer quotable. */
export const isAssessmentInvalidated = (assessment: HealthIndexAssessment): boolean =>
  assessment.status === "invalidated";

/**
 * Whether finalization would succeed — the read-side of exactly the three guards
 * {@link finalizeAssessment} applies, in the same order, so a review screen can explain why the action is
 * unavailable instead of offering it and failing.
 */
export const isAssessmentFinalizable = (assessment: HealthIndexAssessment): boolean =>
  assessment.status === "provisional" &&
  assessment.evidence.admitted > 0 &&
  isCitable(toIndexVerdict(assessment));

/**
 * The stored result, back in the engine's shape.
 *
 * The one mapper out of the flattened columns, so ranking contributions by drag and testing citability run
 * against the engines that define them rather than against a reimplementation living in a service somewhere.
 */
export const toIndexVerdict = (assessment: HealthIndexAssessment): IndexVerdict => ({
  value: assessment.value,
  band: assessment.band,
  pillarCoverage: assessment.pillarCoverage,
  sufficient: assessment.sufficient,
  contributions: assessment.contributions,
  omissions: assessment.omissions,
  weightRedistributed: assessment.weightRedistributed,
});

/** What a re-run is checked against: the four facts a reproduction has to land on again. */
export const toRecordedIndex = (assessment: HealthIndexAssessment): RecordedIndex => ({
  value: assessment.value,
  band: assessment.band,
  pillarCoverage: assessment.pillarCoverage,
  fingerprint: assessment.fingerprint,
});

/**
 * Produce this assessment again and report every way the result disagreed with the record.
 *
 * Two questions from one call, which is why the run defaults to the pinned one. Called with no second argument,
 * it audits the record itself: any fault at all means the stored figure was never producible from the inputs
 * stored beside it, and that is a defect in the platform rather than a change in the institution. Called with
 * today's inputs, `inputs_changed` is expected and uninteresting — what is being asked then is how far the
 * number has moved since, and whether it crossed a band.
 */
export const reproduceAssessment = (
  assessment: HealthIndexAssessment,
  run: IndexRun = assessment.run,
): ReproductionVerdict => reproduce(toRecordedIndex(assessment), run);

/**
 * What one pillar contributed, or `null` if it did not contribute.
 *
 * `null` covers both a pillar the definition never declared and one that was declared and dropped out, because
 * neither has a score and a caller that treated the difference as arithmetic would be reporting a hole as a
 * result. The omissions carry the distinction for callers that need it.
 */
export const pillarContributionIn = (
  assessment: HealthIndexAssessment,
  pillar: HealthPillar,
): PillarContribution | null =>
  assessment.contributions.find((entry) => entry.pillar === pillar) ?? null;

/** How much of a dropped pillar was measured. Zero when the index never declared it at all. */
const omittedCoverageIn = (assessment: HealthIndexAssessment, pillar: HealthPillar): number =>
  assessment.omissions.find((entry) => entry.pillar === pillar)?.kpiCoverage ?? 0;

/**
 * What attention sees of the institution as a whole.
 *
 * The previous assessment is passed in rather than looked up; this aggregate has no directory and inventing one
 * would put a second opinion about which assessment came before inside the record.
 *
 * With no predecessor the previous coverage is `0` rather than the current value, because the alternative is a
 * first-ever assessment that appears to have held its coverage steady. Zero says what is true: there was nothing
 * before this, so nothing was covered.
 */
export const toIndexWatch = (
  assessment: HealthIndexAssessment,
  previous: HealthIndexAssessment | null,
): IndexWatch => ({
  value: assessment.value,
  pillarCoverage: assessment.pillarCoverage,
  previousValue: previous?.value ?? null,
  previousPillarCoverage: previous?.pillarCoverage ?? 0,
  standing: assessment.evidence.standing,
  previousStanding: previous?.evidence.standing ?? null,
});

/**
 * What attention sees of one pillar, with the run of periods behind it that can honestly be called a trend.
 *
 * The history is the **trailing consecutive run** of prior assessments in which this pillar actually scored:
 * walk back from the most recent, stop at the first period the pillar did not contribute to, and read forward
 * again. Everything before that gap is dropped even though it is on file.
 *
 * That is deliberate and it is the point of this function existing rather than callers mapping the array
 * themselves. A pillar that scored 80, went unmeasured for two terms, then scored 55 has not declined over three
 * periods — nobody knows what it did in between. Splicing the two ends together produces a sustained-decline
 * signal for a decline the institution never observed, and the person it reaches has no way to see that the
 * middle of the series was missing.
 *
 * `history` is oldest-first and excludes the current period, which is the shape the attention engine appends the
 * current score onto.
 */
export const toPillarWatch = (
  assessment: HealthIndexAssessment,
  pillar: HealthPillar,
  history: readonly HealthIndexAssessment[],
): PillarWatch => {
  const scores: number[] = [];
  for (const prior of [...history].reverse()) {
    const contribution = pillarContributionIn(prior, pillar);
    if (contribution === null) break;
    scores.push(contribution.score);
  }
  scores.reverse();

  const current = pillarContributionIn(assessment, pillar);
  return {
    pillar,
    score: current?.score ?? null,
    history: scores,
    kpiCoverage: current?.kpiCoverage ?? omittedCoverageIn(assessment, pillar),
  };
};
