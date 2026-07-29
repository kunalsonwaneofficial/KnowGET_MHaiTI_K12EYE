import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  AssessmentNotPublishableError,
  AssessmentPublishedError,
  EmptyAssessmentKeyError,
  InvalidAssessmentKeyError,
  InvalidAssessmentPeriodError,
  RepeatAreaReadingError,
  ScoreOffScaleError,
  UnknownCapabilityAreaError,
  UnusableWeightingError,
  UnweightedAreaError,
} from "./errors";
import {
  type CapabilityArea,
  MAX_MATURITY_SCORE,
  MIN_AREA_COVERAGE,
  MIN_MATURITY_SCORE,
  type MaturityLevel,
  isCapabilityArea,
  isValidKey,
  isValidPeriod,
  normalizeKey,
} from "./evolution-value";
import type {
  AreaOutcome,
  AreaReading,
  AreaWeight,
  MaturityVerdict,
  ResolvedWeight,
} from "./evolution-view";
import { assessMaturity, inspectWeighting } from "./maturity";

/**
 * A maturity assessment: what the institution said about itself across ten capability areas at one point on its
 * own grid, and the single number that came out of it.
 *
 * This is the record that turns twenty-nine contracts' worth of operating into a claim about the institution, and
 * it is the one most likely to be quoted by somebody who was not in the room. A published index is what appears
 * in a board pack, an inspection response and a strategy document, usually without the coverage figure beside it.
 * Everything this aggregate refuses is aimed at the gap between what the number says and what it was computed
 * from.
 *
 * **The weighting is declared once, at the start, before anything is scored.** Weights say what the institution
 * thinks matters, and an institution that could adjust them after seeing the scores would be answering a
 * different question — *which weighting makes us look best* — with the same arithmetic and no visible difference
 * in the output. Fixing them at the open is what makes the index a measurement rather than a search.
 *
 * **Bad readings are refused at the door, and one kind is deliberately not.** An unknown area, a repeat reading
 * and an area carrying no weight are all rejected, because each of them produces a stored row that looks assessed
 * and contributes nothing. An off-scale score is rejected too, rather than clamped, because a clamped score is a
 * number the assessor did not write sitting in the place where a report will attribute it to them. But a reading
 * with no evidence behind it *is* stored, marked not-reported: an area somebody scored on impression is a real
 * thing that happened during the assessment, the engine already declines to count it, and refusing it would only
 * teach assessors to omit those areas entirely — which loses the finding that they had nothing to point at.
 *
 * **Publication is the freeze, and it is gated on coverage rather than on a quorum.** A weighted mean over three
 * of ten areas computes perfectly and describes nothing; the coverage floor forces that gap to be closed, or
 * argued about, while the number still has no audience. After publication nothing changes, because from that
 * moment the index and the readings behind it are quoted separately and any drift between them is invisible.
 *
 * **The standing is stored, and re-derived from the stored readings on every change.** The index, level, coverage
 * and reported count are the engine's answer about the areas this assessment holds — recomputed from scratch each
 * time a reading lands rather than adjusted incrementally, so there is exactly one path by which those numbers
 * come to exist.
 */

// --- The aggregate ---------------------------------------------------------------

export interface MaturityAssessment {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** What later comparisons quote when they place this assessment in a series. Immutable. */
  readonly assessmentKey: string;
  /** Where this sits on the caller's grid. What makes this index comparable to the last one. */
  readonly period: number;
  /** What the institution declared matters, before anything was scored. Immutable. */
  readonly weights: readonly ResolvedWeight[];
  /** Every area reading taken, including those the engine does not count. */
  readonly areas: readonly AreaOutcome[];
  /** Whether coverage is sufficient for the index to mean anything. Derived, never set. */
  readonly publishable: boolean;
  /** The weighted mean over the areas that reported. Derived, never set. */
  readonly index: number;
  /** The level the index sits at. Derived, never set. */
  readonly level: MaturityLevel;
  /** Reported areas as a fraction of all ten — not of the ones this assessment weighted. Derived. */
  readonly coverage: number;
  /** How many areas reported with evidence behind them. Derived, never set. */
  readonly areasReported: number;
  /** Who opened the assessment. */
  readonly openedBy: Uuid;
  /** When the index acquired an audience. `null` while the assessment is still being taken. */
  readonly publishedAt: ISODateString | null;
  /** Who published it. */
  readonly publishedBy: Uuid | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface OpenAssessmentParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly assessmentKey: string;
  readonly period: number;
  /** What the institution says matters. Declared before any area is scored, and fixed thereafter. */
  readonly weights: readonly AreaWeight[];
  readonly openedBy: Uuid;
}

export interface AreaReadingParams {
  readonly area: string;
  readonly score: number;
  /** How many pieces of evidence stand behind the score. Zero is recordable and does not count. */
  readonly evidenceCount: number;
}

// --- Opening ---------------------------------------------------------------------

/**
 * The five derived columns, flattened from the maturity engine's verdict.
 *
 * `areas` is included because the engine returns the readings normalized and resolved — area names canonical,
 * weights attached, reported-ness decided — and storing the engine's version rather than the caller's is what
 * makes the next re-derivation exact rather than approximately the same.
 */
const applyStanding = (
  verdict: MaturityVerdict,
): Pick<
  MaturityAssessment,
  "areas" | "areasReported" | "coverage" | "index" | "level" | "publishable"
> => ({
  publishable: verdict.publishable,
  index: verdict.index,
  level: verdict.level,
  coverage: verdict.coverage,
  areasReported: verdict.areasReported,
  areas: verdict.areas,
});

/**
 * The stored outcomes mapped back to the thin shape the engine takes.
 *
 * The weight is dropped on the way in and re-attached by the engine from the declared weighting, so a stored
 * reading cannot carry a weight of its own that outlives the weighting it came from.
 */
const toReadings = (areas: readonly AreaOutcome[]): readonly AreaReading[] =>
  areas.map((outcome) => ({
    area: outcome.area,
    score: outcome.score,
    evidenceCount: outcome.evidenceCount,
  }));

/**
 * Open an assessment against a declared weighting.
 *
 * The weighting is checked here and never again. An unusable one — weights that do not sum to one, an area named
 * twice, a weight outside the per-area band — is refused rather than repaired, because every repair is the
 * platform deciding what the institution thinks matters, and the resulting index would carry an opinion nobody
 * signed off. The engine reports every fault at once so that somebody fixing a weighting sees the whole of it.
 *
 * Nothing here refuses a duplicate key: this package holds no directory of its own assessments, and that rule
 * lives where identity is stored.
 */
export function openAssessment(params: OpenAssessmentParams): MaturityAssessment {
  const assessmentKey = normalizeKey(params.assessmentKey);
  if (assessmentKey.length === 0) throw new EmptyAssessmentKeyError();
  if (!isValidKey(assessmentKey)) throw new InvalidAssessmentKeyError(assessmentKey);
  if (!isValidPeriod(params.period)) throw new InvalidAssessmentPeriodError(params.period);

  const weighting = inspectWeighting(params.weights);
  if (!weighting.usable) {
    throw new UnusableWeightingError(
      assessmentKey,
      weighting.issues.map((issue) => issue.code),
    );
  }

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    assessmentKey,
    period: params.period,
    weights: weighting.weights,
    ...applyStanding(assessMaturity([], weighting.weights)),
    openedBy: params.openedBy,
    publishedAt: null,
    publishedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  assessment: MaturityAssessment,
  patch: Partial<MaturityAssessment>,
): MaturityAssessment => ({
  ...assessment,
  ...patch,
  updatedAt: nowIso(),
});

/** A published assessment is what the institution said about itself, and it stops moving. */
function requireUnpublished(assessment: MaturityAssessment): void {
  if (assessment.publishedAt !== null) throw new AssessmentPublishedError(assessment.id);
}

// --- Readings --------------------------------------------------------------------

/**
 * Record what one capability area scored.
 *
 * Four of the engine's six findings are raised here as refusals instead, and the split is the point. An unknown
 * area, a second reading for an area already read, an area this assessment gave no weight and a score off the
 * scale all produce a stored row that either does nothing or says something its author did not: the engine can
 * afford to report them and carry on, because an engine returns a verdict, but a record that stored them would
 * show an area as assessed when the index never saw it.
 *
 * The fifth finding, `insufficient_evidence`, is stored rather than refused — see the module comment. The sixth,
 * `no_area_reported`, is not a reading-level fault at all and is what {@link publishAssessment} is for.
 *
 * After the refusals the engine re-runs over every stored reading plus this one, so the standing is recomputed
 * from scratch rather than nudged. That is what keeps a correction to one area from leaving a stale index behind.
 */
export function recordAreaReading(
  assessment: MaturityAssessment,
  reading: AreaReadingParams,
): MaturityAssessment {
  requireUnpublished(assessment);

  const area = normalizeKey(reading.area);
  if (!isCapabilityArea(area)) throw new UnknownCapabilityAreaError(area);
  if (assessment.areas.some((outcome) => outcome.area === area)) {
    throw new RepeatAreaReadingError(assessment.id, area);
  }
  if (!assessment.weights.some((entry) => entry.area === area)) throw new UnweightedAreaError(area);
  if (reading.score < MIN_MATURITY_SCORE || reading.score > MAX_MATURITY_SCORE) {
    throw new ScoreOffScaleError(area, reading.score, MIN_MATURITY_SCORE, MAX_MATURITY_SCORE);
  }

  const readings: readonly AreaReading[] = [
    ...toReadings(assessment.areas),
    { area, score: reading.score, evidenceCount: reading.evidenceCount },
  ];
  return touch(assessment, applyStanding(assessMaturity(readings, assessment.weights)));
}

/**
 * Publish the index: from here it is what the institution says about itself.
 *
 * The coverage floor is checked against the standing the engine already computed rather than re-argued here,
 * which means the number a caller was shown before publishing is the number publication was decided on. An
 * assessment below the floor is not published with a warning attached, because the warning does not travel — the
 * index does, into documents where nobody will see how much of the institution it came from.
 */
export function publishAssessment(assessment: MaturityAssessment, actor: Uuid): MaturityAssessment {
  requireUnpublished(assessment);
  if (!assessment.publishable) {
    throw new AssessmentNotPublishableError(assessment.id, assessment.coverage, MIN_AREA_COVERAGE);
  }
  return touch(assessment, { publishedAt: nowIso(), publishedBy: actor });
}

// --- Reading ---------------------------------------------------------------------

/** Whether the index has an audience. */
export const isAssessmentPublished = (assessment: MaturityAssessment): boolean =>
  assessment.publishedAt !== null;

/**
 * The weighted areas nobody has scored yet. What is left to do before this can be published.
 *
 * Drawn from the declared weighting rather than from all ten areas, because an area the institution gave no
 * weight is not outstanding work — it is a decision the institution already made, and listing it as a gap would
 * have assessors chasing readings that cannot affect the index.
 */
export const assessmentUnassessedAreas = (
  assessment: MaturityAssessment,
): readonly CapabilityArea[] =>
  assessment.weights
    .filter((entry) => !assessment.areas.some((outcome) => outcome.area === entry.area))
    .map((entry) => entry.area);

/**
 * The areas somebody scored with nothing behind them.
 *
 * These are the readings that exist and do not count, and they are worth surfacing separately from the ones
 * nobody took: an area scored `4` on impression looks assessed on every screen that lists it, and the only place
 * the difference shows is here and in the coverage figure.
 */
export const assessmentUnevidencedAreas = (
  assessment: MaturityAssessment,
): readonly CapabilityArea[] =>
  assessment.areas.filter((outcome) => !outcome.reported).map((outcome) => outcome.area);
