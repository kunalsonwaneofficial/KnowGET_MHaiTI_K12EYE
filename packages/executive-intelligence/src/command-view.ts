import type { HealthPillar, MeasureUnit, MetricPolarity, PerformanceBand } from "./command-value";

/**
 * The shapes the engines of Executive Intelligence, Governance & Institutional Command (P2-D29) read and
 * return. These are structures, not records: nothing here has an identity, a tenant or a lifecycle, and nothing
 * here is stored. The aggregates assemble persisted state out of these; the engines only ever compute over them.
 *
 * The separation is what keeps every engine in this package pure and testable without a database, and it is
 * also what keeps the arithmetic honest. A scoring function that took a `KpiReading` row would be tempted to
 * consult the reading's status, its author, or its tenant's preferences; one that takes a scale and a number
 * can only do arithmetic, and arithmetic is the only thing that reproduces.
 */

// --- Measurement -----------------------------------------------------------------

/**
 * One point on a KPI's declared scale: a raw measure and the normalized score it is worth.
 *
 * Anchors are how an institution says what *good* means for an indicator without the platform ever having an
 * opinion about it. A school that considers 96% attendance exemplary and one that considers 92% exemplary both
 * describe themselves with anchors, and both end up on the same normalized scale — which is the only reason two
 * schools' health indices can be compared at all.
 */
export interface ScoreAnchor {
  /** The raw measure, in the KPI's declared unit. */
  readonly value: number;
  /** What that measure is worth on the normalized scale. */
  readonly score: number;
}

/**
 * A KPI's full scoring scale: the unit its measures arrive in, which way is good, and the anchors between which
 * scores are interpolated.
 *
 * Anchors are always ordered ascending by raw {@link ScoreAnchor.value}, whatever the polarity. It is the
 * *scores* that run the other way for a `lower_is_better` indicator, not the values, so a reader of a stored
 * scale never has to work out which end is which.
 */
export interface MeasurementScale {
  readonly unit: MeasureUnit;
  readonly polarity: MetricPolarity;
  readonly anchors: readonly ScoreAnchor[];
}

/** One thing wrong with a declared scale, and the anchor it is wrong at when that is meaningful. */
export interface ScaleIssue {
  readonly code: string;
  /** The offending anchor's index, or `null` when the issue is a property of the whole scale. */
  readonly anchorIndex: number | null;
}

/** The result of inspecting a declared scale. Every issue, not the first one. */
export interface ScaleVerdict {
  readonly usable: boolean;
  readonly issues: readonly ScaleIssue[];
}

/**
 * What happened at the ends of the scale when a raw measure was normalized.
 *
 * Worth reporting rather than swallowing. A measure clamped above means the institution has outrun the scale it
 * declared — genuinely good news, and also a signal that the scale has stopped discriminating and should be
 * re-anchored. A measure clamped below means the same in the other direction, and the score it produced is a
 * floor rather than a measurement.
 */
export type ClampOutcome = "none" | "below" | "above";

/** Why a raw measure could not be scored at all. */
export type UnscoreableReason = "inadmissible_value" | "unusable_scale";

/**
 * A scored measure, or an explicit refusal to score one.
 *
 * A discriminated union rather than a score with a validity flag beside it, because the flag would be ignored.
 * There is no `score` field to read on the unscoreable branch, so a caller cannot average in a fabricated zero
 * for a reading that could not be scored — the compiler stops them, which is the whole point of modelling it
 * this way.
 */
export type Measurement =
  | {
      readonly scoreable: true;
      readonly raw: number;
      readonly score: number;
      readonly band: PerformanceBand;
      readonly clamp: ClampOutcome;
    }
  | {
      readonly scoreable: false;
      readonly raw: number;
      readonly reason: UnscoreableReason;
    };

// --- Bands and movement ----------------------------------------------------------

/** Which way a band moved between two periods. */
export type BandDirection = "improved" | "held" | "declined";

/**
 * A change of band between two periods.
 *
 * `steps` is signed and counts band positions, so a fall of two is distinguishable from a fall of one without a
 * caller comparing ranks itself. This is what attention is raised on: a *fall* between bands, not a state,
 * because a pillar that has sat at `at_risk` for a year is a known condition and a pillar that fell to `healthy`
 * from `exemplary` last term is news.
 */
export interface BandMovement {
  readonly from: PerformanceBand;
  readonly to: PerformanceBand;
  /** Positive when the band improved, negative when it fell, zero when it held. */
  readonly steps: number;
  readonly direction: BandDirection;
}

/**
 * What a run of consecutive scores says about direction.
 *
 * `decliningRun` counts the falls at the *end* of the series, not the worst run anywhere in it: a decline that
 * ended two terms ago is history, and a briefing that led with it would be describing a problem somebody has
 * already fixed.
 */
export interface TrendVerdict {
  /** How many scores were supplied. */
  readonly periods: number;
  /** Consecutive period-over-period falls ending at the most recent score. */
  readonly decliningRun: number;
  /** Whether that run has reached the sustained-decline threshold. */
  readonly sustainedDecline: boolean;
  /** Last score minus first, rounded. `0` when there is nothing to compare. */
  readonly netChange: number;
}

// --- Weighting -------------------------------------------------------------------

/**
 * One pillar's declared share of an index.
 *
 * The single place an institution's own priorities enter the composite. A trust that weighs financial health at
 * a fifth and one that weighs it at a twentieth are making a statement about themselves, and the index is
 * supposed to carry it — which is why the weights are declared data on the definition rather than a platform
 * default that nobody chose and nobody can point at afterwards.
 */
export interface PillarWeight {
  readonly pillar: HealthPillar;
  readonly weight: number;
}

/** One thing wrong with a declared weight set, and the pillar it is wrong at when that is meaningful. */
export interface WeightIssue {
  readonly code: string;
  /** The offending pillar, or `null` when the issue is a property of the whole set. */
  readonly pillar: HealthPillar | null;
}

/** The result of inspecting a declared weight set. Every issue, not the first one. */
export interface WeightVerdict {
  readonly usable: boolean;
  readonly issues: readonly WeightIssue[];
}

// --- Indexing --------------------------------------------------------------------

/**
 * What one pillar brought to an assessment: its score, and how much of itself it managed to measure.
 *
 * The coverage counts travel with the score rather than beside it because they are the only thing that
 * distinguishes a pillar which is genuinely doing badly from one which barely reported. Those two look identical
 * on a dashboard and demand opposite responses, and a shape that let a caller take the score without the counts
 * would make it easy to confuse them exactly once per assessment.
 */
export interface PillarInput {
  readonly pillar: HealthPillar;
  /** The pillar's normalized score, aggregated from its KPI readings by the caller. */
  readonly score: number;
  /** How many of the pillar's declared KPIs had a current reading. */
  readonly kpisRead: number;
  /** How many KPIs the pillar declares. */
  readonly kpisDeclared: number;
}

/** Why a declared pillar contributed nothing to an index. */
export type PillarExclusion = "kpi_coverage" | "unscoreable" | "not_weighted";

/**
 * A pillar that counted, and exactly how much it counted for.
 *
 * `effectiveWeight` differing from `declaredWeight` is the visible trace of a pillar elsewhere in the index
 * having dropped out: the survivors' weights are renormalized over what remains, so an institution reading its
 * own index can see that finance counted for a quarter this term rather than the fifth it was declared at, and
 * why. Hiding that renormalization is how a composite quietly changes meaning between two periods that look
 * comparable.
 */
export interface PillarContribution {
  readonly pillar: HealthPillar;
  readonly score: number;
  readonly band: PerformanceBand;
  /** What the definition declared this pillar at. */
  readonly declaredWeight: number;
  /** What it actually counted for, after renormalizing over the pillars that contributed. */
  readonly effectiveWeight: number;
  /** The fraction of the pillar's declared KPIs that had a current reading. */
  readonly kpiCoverage: number;
  /**
   * Index points this pillar accounts for. The shares of an assessment sum to its value, to within the rounding
   * of the individual shares — which is what lets a reader take a composite apart without recomputing it.
   */
  readonly share: number;
  /** Index points lost to this pillar falling short of a perfect score. What ranks attention. */
  readonly shortfall: number;
}

/** A declared pillar that contributed nothing, and why. */
export interface PillarOmission {
  readonly pillar: HealthPillar;
  readonly reason: PillarExclusion;
  /** The weight that had to be redistributed because of the omission. */
  readonly declaredWeight: number;
  readonly kpiCoverage: number;
}

/**
 * A computed Institutional Health Index, with the whole of its own derivation attached.
 *
 * Every field below the value exists so that the value never has to be taken on trust. A reader can see which
 * pillars were in it, what each counted for after renormalization, how much of the institution went unmeasured,
 * and whether the result cleared the coverage floor at all — which is what makes the number citable in a
 * governance setting rather than merely produced.
 *
 * `value` is `null` when no pillar contributed. There is no index of nothing, and a zero would read as an
 * institution in crisis rather than one that did not report.
 */
export interface IndexVerdict {
  /** The composite, or `null` when nothing contributed. */
  readonly value: number | null;
  readonly band: PerformanceBand | null;
  /** Contributing pillars over declared pillars. */
  readonly pillarCoverage: number;
  /** Whether coverage cleared the floor. A `false` here does not void the value — it un-finalizes it. */
  readonly sufficient: boolean;
  /** Contributing pillars, ordered as the weight set declared them. */
  readonly contributions: readonly PillarContribution[];
  /** Declared pillars that contributed nothing, with the reason each was left out. */
  readonly omissions: readonly PillarOmission[];
  /** How much declared weight had to be redistributed across the survivors. `0` for a complete assessment. */
  readonly weightRedistributed: number;
}
