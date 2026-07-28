/**
 * Value objects for Executive Intelligence, Governance & Institutional Command (P2-D29). These are the
 * vocabulary of the layer leadership actually reads: what an institution measures, what standing a measurement
 * has, which pillars of the institution a health score is made of, how much of the institution must have
 * reported before a score means anything, and who a given panel is composed for. They are TEXT in the store and
 * closed unions here — the grammar of institutional command is fixed even though the *catalog* (KPI keys, index
 * keys, dashboard keys, panel keys, briefing keys) is extensible, because every operational domain delivered so
 * far will bring indicators nobody has named yet and none of them may bring a new *kind* of claim.
 *
 * The contract's rule is single and total: **role-aware dashboards, a reproducible Institutional Health Index
 * across ten institutional domains, and evidence-traceable KPIs.** Five declarations here are that rule made
 * structural, and each is deliberately narrow:
 *
 * - {@link EVIDENCE_KINDS} has seven members and every one of them is answerable — a record in an operational
 *   domain, an assessment result, an audit finding, a forecast run, a decision record, a knowledge assertion,
 *   or a return a named person submitted. There is no member for a number whose origin is unknown, and no
 *   member for "computed by an earlier version of this report". A reading cannot be constructed without citing
 *   one, which is the whole of *evidence-traceable*: traceability that is checked at review is traceability that
 *   is absent from the rows nobody reviewed.
 * - {@link HEALTH_PILLARS} is a closed ten-member set, fixed at the platform and not per-tenant. An institution
 *   chooses which KPIs sit under a pillar and what they weigh; it does not get to decide that safeguarding is
 *   not part of institutional health. An index whose *pillars* were configurable would score every tenant
 *   against a different question and the number would not survive being compared to itself a year later.
 * - {@link MIN_PILLAR_COVERAGE} and {@link MIN_KPI_COVERAGE_PER_PILLAR} are single constants rather than
 *   per-tenant settings, because "an index computed off a fraction of the institution is not an index" is an
 *   honesty property of the platform and not a preference of a school. Nothing in this package can lower them.
 *   The classic abuse of a composite score is a green headline resting on the two domains that happened to file
 *   returns, and the only reliable defence is arithmetic that refuses rather than a footnote nobody opens.
 * - {@link MAX_PILLAR_WEIGHT} caps any single pillar below a majority. An "institutional health index" that is
 *   sixty per cent finance is a finance metric wearing a costume, and the failure is invisible precisely because
 *   the label still says health.
 * - {@link INDEX_PRECISION} and {@link WEIGHT_PRECISION} fix the decimal places at which derived values and
 *   declared weights are rounded. That is what makes reproduction *checkable* rather than merely intended: two
 *   computations of the same index over the same readings must agree exactly, and floating-point noise a dozen
 *   places down would otherwise report drift where there is none — and, far worse, teach a head teacher that the
 *   drift alarm is usually wrong.
 *
 * Three absences are as deliberate as the declarations.
 *
 * There is no vocabulary here for rendering. No colours, no chart types, no layout units, no pixel or grid
 * anything. A panel in this package declares what it binds to and which scope may see it; how it is drawn
 * belongs to the presentation contract (P4-D06), and the boundary is held here in the absence of the words for
 * it. {@link PANEL_BINDINGS} names data shapes, never pictures.
 *
 * There is no role catalog. Role-awareness is expressed against opaque permission scope strings granted by the
 * identity and authorization contracts, never against a list of job titles re-declared here — an executive
 * intelligence layer that maintained its own idea of who a principal is would drift from the one that actually
 * gates the requests, and the drift would be discovered as a leak. {@link normalizeScope} is the entire
 * mechanism, and composition removes what the viewer's scopes do not reach rather than blanking it in place.
 *
 * There is no governance-body vocabulary — no committees, no meetings, no resolutions, no quorum. Institutional
 * governance bodies are the platform governance contract's (P2-D02) and are referenced from here by id. This
 * package is what leadership *looks at*; it is not where leadership is constituted.
 */

// --- Keys ------------------------------------------------------------------------

/**
 * The canonical form of a registry key: trimmed and lower-cased. KPI keys, index keys, dashboard keys, panel
 * keys, briefing keys and attention keys all share one grammar, because a panel binds to a KPI by exact string
 * and a match that fails on a stray capital would silently compose an empty panel — a dashboard that quietly
 * showed nothing is worse than one that failed to load.
 */
const normalizeKey = (key: string): string => key.trim().toLowerCase();

/** Normalize a KPI key — what is being measured (`attendance.chronic_absence_rate`). */
export const normalizeKpiKey = (key: string): string => normalizeKey(key);

/** Normalize a health index definition key — one institution's declared composition of the index. */
export const normalizeIndexKey = (key: string): string => normalizeKey(key);

/** Normalize a dashboard key. */
export const normalizeDashboardKey = (key: string): string => normalizeKey(key);

/** Normalize a dashboard panel key — unique within one dashboard, and how a panel is addressed by a viewer. */
export const normalizePanelKey = (key: string): string => normalizeKey(key);

/** Normalize an executive briefing key. */
export const normalizeBriefingKey = (key: string): string => normalizeKey(key);

/** Normalize an attention item key — unique within one assessment, so a raised item is idempotent. */
export const normalizeAttentionKey = (key: string): string => normalizeKey(key);

/**
 * Normalize a source-domain name (`attendance`, `financial`, `admissions`, `workforce`). A KPI's subject is an
 * opaque reference into an operational domain, exactly as the knowledge graph's is: this domain never re-models
 * the record it is reporting on, and never recomputes an indicator the owning domain already publishes. When
 * finance says the collection rate is 94.2, executive intelligence reports 94.2 and cites finance; it does not
 * hold a second opinion about receipts.
 */
export const normalizeSourceDomain = (domain: string): string => normalizeKey(domain);

/**
 * Normalize a permission scope string.
 *
 * Scopes arrive from the authorization contract and are compared here by exact string, so the normalization is
 * the same trim-and-lower every other key gets. This function is the *entire* surface of role-awareness in this
 * package. There is no role table, no seniority ladder, no notion of "executive" as a type. A panel names the
 * scope it requires; a viewer arrives with the scopes they hold; composition keeps what matches. Anything
 * richer would be this package inventing an access model in parallel to the one that is actually enforced.
 */
export const normalizeScope = (scope: string): string => scope.trim().toLowerCase();

// --- Numeric discipline ----------------------------------------------------------

/**
 * The decimal place at which every derived value in this package is rounded — normalized KPI scores, pillar
 * scores, index values, weighted contributions, coverage ratios and period-over-period deltas alike.
 *
 * This is not cosmetic. Reproducibility is checked by recomputing an assessment from its pinned readings and
 * comparing, and IEEE-754 arithmetic over a re-read set can differ in the last representable bit for reasons
 * that have nothing to do with the institution having changed. Rounding every derived value to a fixed place
 * before it is stored or digested makes "identical" mean identical, so a drift report is always a real drift.
 * Six places is far below the resolution of any institutional measure and far above the noise floor of the
 * arithmetic here.
 */
export const INDEX_PRECISION = 6;

/**
 * The decimal place at which a declared pillar weight is rounded.
 *
 * Deliberately coarser than {@link INDEX_PRECISION}, and for a different reason. Weights must total exactly one,
 * and "exactly" has to be decidable: at six places an author who splits an index ten ways is forced to hand-
 * balance a rounding remainder they did not create and cannot see. Four places is finer than any institution
 * has ever meant to express — a pillar weighted 0.1667 against 0.1666 is a distinction without a difference —
 * and it makes the sum check pass or fail on the author's intent rather than on the last bit of a division.
 */
export const WEIGHT_PRECISION = 4;

/** Round to a given decimal place, resolving the halfway case away from zero and normalizing negative zero. */
const roundTo = (value: number, precision: number): number => {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** precision;
  const scaled = value * factor;
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
  const result = rounded / factor;
  return result === 0 ? 0 : result;
};

/**
 * Round a derived value to {@link INDEX_PRECISION}.
 *
 * The negative-zero clause inside {@link roundTo} matters more than it looks: `-0` and `0` compare equal with
 * `===` but serialize differently, so a digest over an unnormalized `-0` would report drift between two
 * computations that agree perfectly — and a delta of exactly nothing is the single most common value a
 * period-over-period comparison produces.
 */
export const roundIndexValue = (value: number): number => roundTo(value, INDEX_PRECISION);

/** Round a declared weight to {@link WEIGHT_PRECISION}. */
export const roundWeight = (weight: number): number => roundTo(weight, WEIGHT_PRECISION);

/** Whether a value is admissible as a measure at all: a finite number, and not `NaN`. */
export const isFiniteMeasure = (value: number): boolean => Number.isFinite(value);

// --- The institutional pillars ---------------------------------------------------

/**
 * The ten institutional domains the Institutional Health Index scores.
 *
 * Closed, ordered, and fixed at the platform. Each pillar is a standing question about the institution that has
 * an owning operational contract behind it, so a pillar score is always traceable to records somebody is
 * accountable for rather than to a category invented for the dashboard:
 *
 * - `academic_outcomes` — what learners actually achieved (academic structure, teaching, assessment, learning).
 * - `learner_wellbeing` — safeguarding, pastoral care, health.
 * - `attendance_engagement` — presence, participation, engagement.
 * - `teaching_quality` — instruction, observation, faculty development.
 * - `workforce_capacity` — staffing, retention, load, capability.
 * - `financial_health` — collection, liquidity, budget adherence.
 * - `operational_continuity` — transport, residential, facilities, procurement, campus safety.
 * - `family_partnership` — guardian relationships, communication, satisfaction.
 * - `admissions_growth` — enquiry, conversion, enrolment, alumni.
 * - `governance_compliance` — policy adherence, audit standing, statutory obligation.
 *
 * This set is not configurable, and that refusal carries the weight of the second clause of the contract's
 * rule. An index whose pillars a tenant could redefine would not be an *institutional* health index at all: two
 * schools would compute different questions, a group could not roll its schools up, a regulator could not read
 * two years of one school as one series, and — the failure that actually happens — an institution under
 * pressure in one pillar would quietly stop counting it. Which KPIs sit under a pillar, what they are worth,
 * and where the thresholds fall are all the institution's to declare. Whether safeguarding counts is not.
 */
export const HEALTH_PILLARS = [
  "academic_outcomes",
  "learner_wellbeing",
  "attendance_engagement",
  "teaching_quality",
  "workforce_capacity",
  "financial_health",
  "operational_continuity",
  "family_partnership",
  "admissions_growth",
  "governance_compliance",
] as const;
export type HealthPillar = (typeof HEALTH_PILLARS)[number];

/** How many pillars the index is made of. Ten, and a constant so arithmetic never re-derives it by hand. */
export const PILLAR_COUNT = HEALTH_PILLARS.length;

/** Whether a string names a pillar. The narrowing guard used wherever a pillar arrives as untrusted text. */
export const isHealthPillar = (value: string): value is HealthPillar =>
  (HEALTH_PILLARS as readonly string[]).includes(value);

// --- Measures --------------------------------------------------------------------

/**
 * The units a KPI may be expressed in.
 *
 * Closed and small, because the unit is not a label — it decides what values are admissible and how a raw
 * measure may be compared to a threshold. A percentage of 140 and a count of −3 are not unusual readings, they
 * are wrong readings, and the only place that distinction can be drawn cheaply is at construction.
 *
 * `currency_minor` is minor units (paise, cents) as an integer for the same reason every financial contract in
 * this platform uses minor units: a rupee stored as a float is a rounding error with a currency symbol.
 */
export const MEASURE_UNITS = [
  "count",
  "ratio",
  "percentage",
  "currency_minor",
  "days",
  "score",
  "rate_per_thousand",
] as const;
export type MeasureUnit = (typeof MEASURE_UNITS)[number];

/**
 * Whether a raw value is admissible in a given unit.
 *
 * The bounds are properties of the unit, not of any institution's expectations: a percentage lives in `[0, 100]`
 * because that is what percent means, and a count is a non-negative integer because a third of a student did
 * not enrol. `ratio` is deliberately unbounded above — a ratio of applications to seats is routinely greater
 * than one — and `currency_minor` is deliberately signed, because a balance can be negative and refusing that
 * would push institutions into encoding overdrafts as text.
 */
export const isMeasureAdmissible = (unit: MeasureUnit, value: number): boolean => {
  if (!isFiniteMeasure(value)) return false;
  switch (unit) {
    case "count":
      return Number.isInteger(value) && value >= 0;
    case "ratio":
      return value >= 0;
    case "percentage":
      return value >= 0 && value <= 100;
    case "currency_minor":
      return Number.isInteger(value);
    case "days":
      return value >= 0;
    case "score":
      return value >= 0 && value <= 100;
    case "rate_per_thousand":
      return value >= 0;
  }
};

/**
 * Which way is good.
 *
 * A KPI without a direction cannot be scored, and a number that cannot be scored is not a KPI — it is a
 * statistic. This is the one place the vocabulary here deliberately diverges from the forecasting contract
 * (P2-D28), which admits a `neutral` direction for quantities an institution neither wants more nor less of.
 * Forecasting a neutral quantity is perfectly sensible; putting one in a health index is not, because the index
 * has to say whether the institution is doing well and a neutral member contributes a number with no meaning to
 * a weighted average that then claims to have one.
 *
 * `on_target` covers the genuinely two-sided indicators — class size, staff-to-learner ratio, contact hours —
 * where both directions are failures and the target is a band rather than a floor.
 */
export const METRIC_POLARITIES = ["higher_is_better", "lower_is_better", "on_target"] as const;
export type MetricPolarity = (typeof METRIC_POLARITIES)[number];

/** The polarities whose scoring needs a declared target value rather than only a threshold ladder. */
export const POLARITIES_REQUIRING_TARGET: readonly MetricPolarity[] = ["on_target"];

// --- Performance bands -----------------------------------------------------------

/**
 * The bands a normalized score falls into, worst first.
 *
 * Ordered and closed. The order is load-bearing: attention is raised on a *fall* between bands, comparison
 * across pillars is by band before it is by number, and a briefing leads with the worst. An unordered set would
 * make every one of those a lookup table somebody has to keep in step.
 *
 * This vocabulary shares no token with {@link ATTENTION_SEVERITIES}, and the non-overlap is enforced by test
 * rather than left to care. The worst band is `failing` and not `critical` for exactly that reason: a band is a
 * *state* and a severity is a *claim on someone's attention*, both end up as TEXT in the store and as strings on
 * events, and a shared word between them would be conflated in every conversation that followed — "we're
 * critical" would stop having one meaning.
 */
export const PERFORMANCE_BANDS = ["failing", "at_risk", "watch", "healthy", "exemplary"] as const;
export type PerformanceBand = (typeof PERFORMANCE_BANDS)[number];

/**
 * The floor of each band on the normalized 0–100 score.
 *
 * These are platform constants, and the distinction that makes that safe is worth stating plainly: an
 * institution declares its own *thresholds* — what raw attendance rate is good attendance — and the scoring
 * engine turns a raw measure into a normalized score against those. The bands then partition the *normalized*
 * scale, which every institution shares by construction. So "healthy" means the same thing everywhere without
 * the platform ever having an opinion about what a good attendance rate is.
 */
export const BAND_FLOORS: Readonly<Record<PerformanceBand, number>> = Object.freeze({
  failing: 0,
  at_risk: 25,
  watch: 50,
  healthy: 70,
  exemplary: 90,
});

/** The lowest and highest values a normalized score may take. The scale the bands partition. */
export const MIN_NORMALIZED_SCORE = 0;
export const MAX_NORMALIZED_SCORE = 100;

/** Whether a value sits on the normalized score scale. */
export const isNormalizedScore = (value: number): boolean =>
  isFiniteMeasure(value) && value >= MIN_NORMALIZED_SCORE && value <= MAX_NORMALIZED_SCORE;

/** A band's position, worst = 0. How a fall is detected without a lookup table. */
export const bandRank = (band: PerformanceBand): number => PERFORMANCE_BANDS.indexOf(band);

/** Whether the first band is worse than the second. */
export const isWorseBand = (band: PerformanceBand, than: PerformanceBand): boolean =>
  bandRank(band) < bandRank(than);

// --- The reporting period grid ---------------------------------------------------

/**
 * The grains a reading may be taken at.
 *
 * `term` is present alongside `quarter` and is not redundant: a school's term is an academic unit of unequal
 * length that most institutional indicators are genuinely reported against, while a quarter is a financial one.
 * Collapsing them would force finance and academics onto the same grid and quietly misalign every comparison
 * across the two.
 */
export const PERIOD_GRAINS = ["day", "week", "month", "term", "quarter", "year"] as const;
export type PeriodGrain = (typeof PERIOD_GRAINS)[number];

/**
 * How many periods older than the assessment's own period a reading may be and still count toward it.
 *
 * Measured in periods rather than in elapsed time, and that is the point: periods are ordinals, so staleness is
 * decidable without a clock anywhere in this package. A reading four periods behind is the oldest that may
 * still contribute; beyond that the assessment records a coverage gap rather than silently averaging in a
 * figure from a year the institution no longer resembles.
 */
export const MAX_READING_AGE_PERIODS = 4;

/** Whether a reading's period is recent enough to contribute to an assessment at the given period ordinal. */
export const isReadingCurrent = (readingPeriod: number, assessmentPeriod: number): boolean => {
  if (!Number.isInteger(readingPeriod) || !Number.isInteger(assessmentPeriod)) return false;
  const age = assessmentPeriod - readingPeriod;
  return age >= 0 && age <= MAX_READING_AGE_PERIODS;
};

// --- Evidence --------------------------------------------------------------------

/**
 * What a KPI reading may stand on.
 *
 * Every member is answerable to a record somewhere on this platform: a row in an operational domain, a result
 * from the assessment contract, a finding from a governance audit, a run from the forecasting contract, a
 * decision from the decision-intelligence contract, an assertion in the knowledge graph, or a return a named
 * person submitted and can be asked about.
 *
 * There is deliberately no member for a number of unknown origin, and none for "carried forward from the last
 * report". "Attendance is 91%" is not a reading this package can store, and that refusal is the whole of the
 * third clause of the contract's rule: evidence-traceability is only worth something if a reading cannot exist
 * without its trace. A dashboard whose numbers are *usually* traceable teaches its readers to trust the ones
 * that are not.
 *
 * `forecast_run` is admissible on purpose and is the reason a reading carries a standing (see
 * {@link READING_STANDINGS}) — leadership legitimately plans against projections, and the honest handling is to
 * let a projected reading in while making its projected-ness impossible to lose.
 */
export const EVIDENCE_KINDS = [
  "domain_record",
  "assessment_result",
  "audit_finding",
  "forecast_run",
  "decision_record",
  "knowledge_assertion",
  "manual_return",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/**
 * The evidence kinds that must name the person who stands behind them.
 *
 * A manual return is somebody's figure or it is nobody's. Every other kind points at a record that already
 * carries its own authorship, so demanding an attestor there would record the person who ran the report rather
 * than the person accountable for the number — a worse trace that looks like a better one.
 */
export const EVIDENCE_REQUIRING_ATTESTOR: readonly EvidenceKind[] = ["manual_return"];

/**
 * The standing a reading has, which follows from the weakest evidence it cites.
 *
 * `measured` is a reading resting entirely on records of what happened. `projected` cites a forecast run —
 * defensible, still traceable, but not a fact about the past. `attested` rests on a person's return that no
 * system corroborates.
 *
 * Standing is derived and never declared, so an author cannot promote their own figure. It travels with the
 * reading into every pillar score and every index value that consumes it, which is what stops a green index
 * built entirely on attested returns from reading identically to one built on the register.
 */
export const READING_STANDINGS = ["measured", "projected", "attested"] as const;
export type ReadingStanding = (typeof READING_STANDINGS)[number];

/**
 * The standing each evidence kind confers on its own.
 *
 * A reading citing several kinds takes the weakest, because a number is only as answerable as its softest
 * support — citing the register *and* somebody's estimate does not make the estimate firmer.
 */
export const EVIDENCE_STANDING: Readonly<Record<EvidenceKind, ReadingStanding>> = Object.freeze({
  domain_record: "measured",
  assessment_result: "measured",
  audit_finding: "measured",
  decision_record: "measured",
  knowledge_assertion: "measured",
  forecast_run: "projected",
  manual_return: "attested",
});

/** Standing ordered strongest first, so "weakest of" is a position rather than a nest of conditionals. */
const STANDING_STRENGTH: readonly ReadingStanding[] = ["measured", "projected", "attested"];

/** A standing's position, strongest = 0. */
export const standingRank = (standing: ReadingStanding): number =>
  STANDING_STRENGTH.indexOf(standing);

/**
 * The standing conferred by a set of evidence kinds: the weakest of them.
 *
 * Returns `null` for an empty set rather than a default, because there is no such thing as the standing of no
 * evidence and returning `measured` for it would be the exact failure this vocabulary exists to prevent.
 */
export const weakestStanding = (kinds: readonly EvidenceKind[]): ReadingStanding | null => {
  let weakest: ReadingStanding | null = null;
  for (const kind of kinds) {
    const standing = EVIDENCE_STANDING[kind];
    if (weakest === null || standingRank(standing) > standingRank(weakest)) {
      weakest = standing;
    }
  }
  return weakest;
};

// --- Coverage and weighting ------------------------------------------------------

/**
 * The fraction of the index's pillars that must have produced a score before an assessment may be finalized.
 *
 * A single platform constant, and nothing in this package can lower it. The reasoning is the same one behind the
 * forecasting contract's horizon cap: the abuse a composite score invites is a confident headline resting on
 * whichever parts of the institution happened to report, and the only defence that survives contact with a bad
 * quarter is arithmetic that refuses. Six pillars of ten is the floor at which the number is still describing
 * the institution rather than a convenient subset of it.
 *
 * An assessment below the floor is not discarded — it is computable, readable and explicitly provisional. What
 * it may not do is become final, be cited by a briefing, or be compared to a period that met the floor.
 */
export const MIN_PILLAR_COVERAGE = 0.6;

/**
 * The fraction of a pillar's declared KPIs that must have a current reading before the pillar counts as scored.
 *
 * The companion floor, and the one that closes the obvious way around the first: an index can otherwise report
 * ten-of-ten pillar coverage while every pillar rests on one indicator out of nine. A pillar below this floor
 * contributes no score and its weight is redistributed, which shows up as a coverage gap rather than as a
 * plausible number.
 */
export const MIN_KPI_COVERAGE_PER_PILLAR = 0.5;

/** What a full set of pillar weights must total. */
export const WEIGHT_TOTAL = 1;

/**
 * The smallest weight a pillar may be declared at.
 *
 * Below one per cent a pillar is decoration: it cannot move the index by more than rounding, but it counts
 * toward coverage and it appears in the composition as though it were being watched. Forcing an institution to
 * either weigh a pillar meaningfully or leave it out of the definition keeps the declared composition honest
 * about what is actually being measured.
 */
export const MIN_PILLAR_WEIGHT = 0.01;

/**
 * The largest weight a pillar may be declared at.
 *
 * No single pillar may be half the index or more. An institutional health index that is sixty per cent finance
 * is a finance metric wearing a costume, and the failure mode is invisible from the outside because the label
 * still says health. Half is the point past which the composite stops composing.
 */
export const MAX_PILLAR_WEIGHT = 0.5;

/** Whether a declared weight sits in the admissible band, at {@link WEIGHT_PRECISION}. */
export const isWeightAdmissible = (weight: number): boolean =>
  isFiniteMeasure(weight) &&
  roundWeight(weight) >= MIN_PILLAR_WEIGHT &&
  roundWeight(weight) <= MAX_PILLAR_WEIGHT;

/**
 * Whether a set of weights totals one at {@link WEIGHT_PRECISION}.
 *
 * The comparison is on the rounded sum of rounded weights, which is what makes the check decidable: an author
 * splitting an index across seven pillars writes seven four-place numbers that total one, and the arithmetic
 * agrees with them instead of objecting about the fourteenth decimal.
 */
export const isWeightSetBalanced = (weights: readonly number[]): boolean => {
  if (weights.length === 0) return false;
  if (!weights.every(isFiniteMeasure)) return false;
  const total = weights.reduce((sum, weight) => sum + roundWeight(weight), 0);
  return roundWeight(total) === WEIGHT_TOTAL;
};

/** Coverage as a ratio, rounded to {@link INDEX_PRECISION}. `0` when nothing was expected. */
export const coverageRatio = (present: number, expected: number): number => {
  if (!Number.isInteger(present) || !Number.isInteger(expected)) return 0;
  if (expected <= 0 || present <= 0) return 0;
  return roundIndexValue(Math.min(present, expected) / expected);
};

/** Whether pillar coverage clears {@link MIN_PILLAR_COVERAGE}. */
export const isPillarCoverageSufficient = (ratio: number): boolean =>
  isFiniteMeasure(ratio) && ratio >= MIN_PILLAR_COVERAGE;

/** Whether a pillar's KPI coverage clears {@link MIN_KPI_COVERAGE_PER_PILLAR}. */
export const isKpiCoverageSufficient = (ratio: number): boolean =>
  isFiniteMeasure(ratio) && ratio >= MIN_KPI_COVERAGE_PER_PILLAR;

// --- Dashboard composition -------------------------------------------------------

/**
 * What a panel binds to.
 *
 * These name *data shapes*, never pictures. There is no `bar_chart` here and there will not be one: a panel in
 * this contract says which institutional quantity it is about and who may see it, and the presentation contract
 * (P4-D06) decides how that is drawn. Keeping the two apart is what lets a dashboard definition survive a
 * redesign, and what stops this package from acquiring an opinion about screen sizes.
 */
export const PANEL_BINDINGS = [
  "kpi_reading",
  "kpi_series",
  "pillar_score",
  "index_score",
  "index_series",
  "attention_queue",
  "coverage_report",
] as const;
export type PanelBinding = (typeof PANEL_BINDINGS)[number];

/**
 * How a panel the viewer's scopes do not reach is handled.
 *
 * There is one member, and the single-member union is the statement. A panel the viewer may not see is
 * **omitted** — it is not in the composed dashboard at all, not present-and-blanked, not greyed, not labelled
 * "restricted". Redaction leaks: a bursar who can see that the safeguarding panel exists and is hidden has
 * learned something, an empty tile with a lock icon invites a request that costs somebody a conversation, and a
 * layout that reserves space for what it will not show tells every viewer the shape of what they are missing.
 *
 * The type exists rather than the behaviour being implicit so that the day someone proposes a `redacted` mode,
 * the proposal has to be made here, in the open, against this paragraph.
 */
export const PANEL_VISIBILITY_OUTCOMES = ["omitted"] as const;
export type PanelVisibilityOutcome = (typeof PANEL_VISIBILITY_OUTCOMES)[number];

/** Whether a viewer's granted scopes reach a panel's required scope. Exact string, both sides normalized. */
export const scopeGrants = (granted: readonly string[], required: string): boolean => {
  const target = normalizeScope(required);
  return granted.some((scope) => normalizeScope(scope) === target);
};

/**
 * The largest number of panels one dashboard may declare.
 *
 * A ceiling rather than a preference. Composition resolves every panel's binding for every viewer, so an
 * unbounded dashboard is an unbounded fan-out of reads against the operational domains — and a dashboard with
 * two hundred panels is not being read anyway, it is being scrolled past.
 */
export const MAX_PANELS_PER_DASHBOARD = 40;

// --- Attention -------------------------------------------------------------------

/**
 * How loudly something is asking to be looked at.
 *
 * Four levels, ordered least first, and sharing no token with {@link PERFORMANCE_BANDS} on purpose: a band
 * describes a *state* and a severity describes a *claim on someone's attention*, and they come apart in both
 * directions. A pillar sitting steadily at `at_risk` for a year is a known condition, not an urgent one; a
 * pillar falling from `exemplary` to `healthy` in a term is not in a bad state at all and is exactly what
 * leadership wants raised.
 */
export const ATTENTION_SEVERITIES = ["informational", "advisory", "urgent", "critical"] as const;
export type AttentionSeverity = (typeof ATTENTION_SEVERITIES)[number];

/** A severity's position, least first. */
export const severityRank = (severity: AttentionSeverity): number =>
  ATTENTION_SEVERITIES.indexOf(severity);

/**
 * Why something was raised. Stable codes, safe to put on an event and safe to key an operational runbook to.
 *
 * `coverage_gap` and `evidence_stale` sit here beside the performance reasons deliberately. A dashboard that
 * raised alarms only about bad numbers would treat "we stopped measuring safeguarding" as silence, and silence
 * as health — which is the precise failure the coverage floors exist to make impossible.
 */
export const ATTENTION_REASONS = [
  "band_breach",
  "band_fall",
  "sustained_decline",
  "target_miss",
  "index_drop",
  "coverage_gap",
  "evidence_stale",
  "standing_weakened",
] as const;
export type AttentionReason = (typeof ATTENTION_REASONS)[number];

/**
 * How many consecutive falling periods constitute a sustained decline.
 *
 * Three, because two is noise in nearly every institutional series — one bad week following one good one is
 * weather — and four is late enough that the term is over before anyone is told.
 */
export const SUSTAINED_DECLINE_PERIODS = 3;

// --- Statuses --------------------------------------------------------------------

/** A KPI definition's lifecycle. Retired definitions keep their readings; the catalog stops offering them. */
export const KPI_STATUSES = ["draft", "active", "retired"] as const;
export type KpiStatus = (typeof KPI_STATUSES)[number];

/**
 * A health index definition's lifecycle.
 *
 * `superseded` exists separately from `retired` because an index definition is what an assessment pinned. When
 * an institution reweights, the old definition must stay readable exactly as it was or every assessment made
 * under it becomes an unexplainable number — so a reweight supersedes rather than edits, and the assessments
 * keep pointing at the composition that actually produced them.
 */
export const INDEX_STATUSES = ["draft", "published", "superseded", "retired"] as const;
export type IndexStatus = (typeof INDEX_STATUSES)[number];

/**
 * An assessment's standing as a record.
 *
 * `provisional` is where an assessment below the coverage floor stays, permanently — it is not a waiting room.
 * `final` is reachable only above the floor. `invalidated` is for an assessment whose pinned readings were
 * themselves withdrawn, and it is a distinct state rather than a deletion because a briefing may already cite it
 * and a citation that resolves to nothing is worse than one that resolves to a marked-invalid record.
 */
export const ASSESSMENT_STATUSES = ["provisional", "final", "invalidated"] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

/** A dashboard definition's lifecycle. */
export const DASHBOARD_STATUSES = ["draft", "published", "archived"] as const;
export type DashboardStatus = (typeof DASHBOARD_STATUSES)[number];

/**
 * A briefing's lifecycle.
 *
 * `issued` is a freeze. What a briefing said when it went to a board is what it said, and a document that
 * silently re-renders against today's numbers cannot be the basis of a decision anybody can be held to.
 * A briefing that turns out to be wrong is `withdrawn` and superseded by another; it is never edited.
 */
export const BRIEFING_STATUSES = ["drafting", "issued", "withdrawn"] as const;
export type BriefingStatus = (typeof BRIEFING_STATUSES)[number];

/** An attention item's lifecycle. `dismissed` records a judgement that it did not warrant action. */
export const ATTENTION_STATUSES = ["open", "acknowledged", "resolved", "dismissed"] as const;
export type AttentionStatus = (typeof ATTENTION_STATUSES)[number];

/** The attention statuses that close an item out of the queue. */
export const CLOSED_ATTENTION_STATUSES: readonly AttentionStatus[] = ["resolved", "dismissed"];

/** Whether an attention item is still asking for something. */
export const isAttentionOpen = (status: AttentionStatus): boolean =>
  !CLOSED_ATTENTION_STATUSES.includes(status);
