import type {
  AttentionReason,
  AttentionSeverity,
  EvidenceKind,
  HealthPillar,
  MeasureUnit,
  MetricPolarity,
  PanelBinding,
  PerformanceBand,
  ReadingStanding,
} from "./command-value";

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

// --- Evidence and traceability -----------------------------------------------------

/**
 * One record a reading stands on.
 *
 * A citation points outward and never inward: `sourceDomain` and `sourceRef` address a row this package does not
 * own and will not reproduce. That is deliberate — the moment executive intelligence copies the number it is
 * citing, the copy and the original start to disagree and the citation becomes decoration.
 */
export interface EvidenceCitation {
  readonly kind: EvidenceKind;
  /** Which operational domain holds the cited record. Normalized. */
  readonly sourceDomain: string;
  /** The cited record's identifier inside that domain. Opaque here, and never dereferenced by this package. */
  readonly sourceRef: string;
  /** Who stands behind the figure, for the kinds that require it. `null` for the kinds that do not. */
  readonly attestedBy: string | null;
}

/** One thing wrong with a set of citations, and the citation it is wrong at when that is meaningful. */
export interface EvidenceIssue {
  readonly code: string;
  /** The offending citation's index, or `null` when the issue is a property of the whole set. */
  readonly citationIndex: number | null;
}

/**
 * The result of inspecting the evidence behind a reading.
 *
 * `standing` is `null` whenever the evidence did not pass. A standing is the weakest of what was cited, and
 * reading one off a set containing a broken citation would be answering "how firm is this number" with a
 * calculation that skipped the part that was wrong.
 */
export interface EvidenceVerdict {
  readonly usable: boolean;
  readonly standing: ReadingStanding | null;
  readonly issues: readonly EvidenceIssue[];
}

/**
 * A reading as the traceability engine sees it: what was measured, when, and what it rests on.
 *
 * Deliberately without the measured value. Whether a reading may be counted is a question about its evidence and
 * its period, and an engine that could also see the number would eventually be asked to let a plausible figure
 * through on thin evidence because it looked about right.
 */
export interface TracedReading {
  readonly kpiKey: string;
  /** The period ordinal the reading was taken at. */
  readonly period: number;
  readonly citations: readonly EvidenceCitation[];
}

/**
 * Whether a reading may count toward an assessment, and if not, which kind of not.
 *
 * Three refusals rather than one, because each sends somebody somewhere different: `stale` means go and collect
 * a fresher figure, `out_of_period` means the reading is filed against a period this assessment cannot count
 * from and somebody's grid arithmetic is wrong, and `untraceable` means stop and find out where the number came
 * from. Collapsing them into "rejected" would make the commonest response to all three be to re-enter the
 * number.
 */
export type ReadingAdmission = "admitted" | "stale" | "out_of_period" | "untraceable";

/** What became of one reading when an assessment went looking for it. */
export interface ReadingAudit {
  readonly kpiKey: string;
  readonly period: number;
  readonly admission: ReadingAdmission;
  /** The standing the reading's evidence confers, or `null` when the evidence did not pass. */
  readonly standing: ReadingStanding | null;
  /** Periods between the reading and the assessment. Negative for a reading ahead of the assessment. */
  readonly age: number;
}

/**
 * What an assessment's whole evidence base amounts to.
 *
 * `standing` is the weakest across the *admitted* readings only. A stale or untraceable reading contributed
 * nothing to the arithmetic, and letting it drag the assessment's standing down would punish an institution for
 * the readings it correctly declined to use.
 */
export interface TraceVerdict {
  readonly standing: ReadingStanding | null;
  readonly audits: readonly ReadingAudit[];
  readonly admitted: number;
  readonly stale: number;
  readonly outOfPeriod: number;
  readonly untraceable: number;
  /**
   * How the admitted readings divide by standing.
   *
   * Counts rather than a single "share resting on somebody's word", because which standing is the interesting
   * one depends on who is reading: a finance briefing cares that a figure is projected, an inspection response
   * cares that it is attested, and picking one of those here would have decided for both.
   */
  readonly standingCounts: Readonly<Record<ReadingStanding, number>>;
}

// --- Reproducibility ---------------------------------------------------------------

/**
 * Everything the index arithmetic reads: a weight set and what the pillars reported.
 *
 * Exactly the inputs and nothing else — no period, no author, no timestamp. That exactness is the property the
 * fingerprint depends on: because the run is the arithmetic's whole input, two runs that fingerprint differently
 * differ somewhere the value could depend on, and a value that matches across a fingerprint mismatch is a
 * coincidence rather than a reproduction.
 */
export interface IndexRun {
  readonly weights: readonly PillarWeight[];
  readonly inputs: readonly PillarInput[];
}

/** An index as it was stored: the result, and the fingerprint of the run that produced it. */
export interface RecordedIndex {
  readonly value: number | null;
  readonly band: PerformanceBand | null;
  readonly pillarCoverage: number;
  readonly fingerprint: string;
}

/** A way in which a re-run failed to agree with the record. */
export type ReproductionFault = "inputs_changed" | "value_drift" | "band_drift" | "coverage_drift";

/**
 * The result of re-running an index against what was recorded.
 *
 * `inputsMatch` and the value comparison are reported separately on purpose, because they answer two different
 * questions with the same call. Re-run against the pinned inputs and a disagreement means the record is wrong.
 * Re-run against today's inputs and `inputs_changed` is expected — what matters then is `drift`, and whether the
 * institution moved.
 */
export interface ReproductionVerdict {
  /** True only when nothing diverged at all: same inputs, same value, same band, same coverage. */
  readonly reproduced: boolean;
  readonly inputsMatch: boolean;
  readonly recordedFingerprint: string;
  readonly recomputedFingerprint: string;
  readonly recordedValue: number | null;
  readonly recomputedValue: number | null;
  /** Recomputed minus recorded, or `null` when either side has no value to compare. */
  readonly drift: number | null;
  readonly faults: readonly ReproductionFault[];
}

// --- Dashboard composition ---------------------------------------------------------

/**
 * What a binding needs naming before it can be resolved.
 *
 * A property of the binding rather than of the panel, so a `pillar_score` panel cannot be authored without a
 * pillar and a `coverage_report` panel cannot be authored with one. The alternative — a panel carrying whichever
 * subject fields its author happened to fill in — composes into a tile that silently resolves to nothing, and a
 * dashboard that quietly shows nothing is the failure this whole contract is trying to avoid.
 */
export type PanelSubject = "kpi" | "pillar" | "none";

/**
 * One panel as a dashboard declares it: what it is about, and which scope reaches it.
 *
 * There is no position, no size, no order field. Panels are composed in declaration order and nothing else, and
 * the absence of a coordinate is what makes omission safe: a composed dashboard with positions in it would show
 * gaps where the panels a viewer may not see used to be, which tells every viewer the shape of what they are
 * missing just as loudly as a tile marked "restricted" would.
 */
export interface DashboardPanel {
  readonly panelKey: string;
  readonly binding: PanelBinding;
  /** The permission scope a viewer must hold. Compared by exact string after normalization. */
  readonly requiredScope: string;
  /** The KPI a kpi-bound panel is about. `null` for every other binding. */
  readonly kpiKey: string | null;
  /** The pillar a pillar-bound panel is about. `null` for every other binding. */
  readonly pillar: HealthPillar | null;
}

/** One thing wrong with a dashboard's declared panels, and the panel it is wrong at when that is meaningful. */
export interface PanelIssue {
  readonly code: string;
  /** The offending panel's index, or `null` when the issue is a property of the whole set. */
  readonly panelIndex: number | null;
}

/** The result of inspecting a dashboard's declared panels. Every issue, not the first one. */
export interface PanelSetVerdict {
  readonly usable: boolean;
  readonly issues: readonly PanelIssue[];
}

// --- Attention ---------------------------------------------------------------------

/** What an attention signal is about. */
export type AttentionSubjectKind = "index" | "pillar" | "kpi";

/**
 * One thing asking to be looked at.
 *
 * Carries no wording. There is no title, no message, no recommendation — a reason code, a severity and a
 * subject, and the presentation contract turns those into a sentence in whatever language the reader has
 * configured. A domain package that emitted "Financial health has fallen two bands" would have quietly become
 * the platform's copywriter, and every translation of it would then be a schema migration.
 */
export interface AttentionSignal {
  /** Stable within one assessment, so raising the same finding twice is idempotent rather than duplicated. */
  readonly key: string;
  readonly reason: AttentionReason;
  readonly severity: AttentionSeverity;
  readonly subjectKind: AttentionSubjectKind;
  /** The pillar or KPI key this is about. Empty for an index-level signal, which has no subject but itself. */
  readonly subject: string;
  /**
   * The quantity this reason was raised on, in whatever that reason measures — a signed index movement, a band
   * step count, a coverage ratio, a shortfall in normalized points — or `null` where the reason has no number
   * behind it. Not comparable across reasons and never to be summed across signals.
   */
  readonly observed: number | null;
}

/**
 * The index at two consecutive periods, as attention sees it.
 *
 * Carries measurements and never their classifications: no band, no sufficiency flag, no "is this a drop". The
 * engine bands what it is given, so a caller cannot hand in a band that disagrees with the value it came from —
 * the same reason standing is derived from evidence rather than declared by an author.
 */
export interface IndexWatch {
  readonly value: number | null;
  readonly pillarCoverage: number;
  readonly previousValue: number | null;
  /** The previous period's coverage, which decides whether the two periods may be compared at all. */
  readonly previousPillarCoverage: number;
  readonly standing: ReadingStanding | null;
  readonly previousStanding: ReadingStanding | null;
}

/**
 * One pillar's current score and the run behind it.
 *
 * `history` is oldest first and excludes `score`, so a caller cannot accidentally count the current period
 * twice when asking whether the pillar is declining.
 */
export interface PillarWatch {
  readonly pillar: HealthPillar;
  /** This period's score, or `null` when the pillar did not produce one. */
  readonly score: number | null;
  /** Preceding consecutive scores, oldest first, not including `score`. */
  readonly history: readonly number[];
  readonly kpiCoverage: number;
}

/**
 * One KPI reading, as attention sees it.
 *
 * Exists only for a KPI that actually has a reading. A declared KPI nobody measured is not a reading in a poor
 * state, it is a hole in the pillar's coverage, and it is raised there.
 */
export interface KpiWatch {
  readonly kpiKey: string;
  readonly score: number | null;
  /** The normalized score the institution declared as this KPI's target, or `null` when it declares none. */
  readonly targetScore: number | null;
  /** What the traceability engine decided about this reading. Attention re-derives none of it. */
  readonly admission: ReadingAdmission;
}
