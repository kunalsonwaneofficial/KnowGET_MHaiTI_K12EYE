import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();
const finite = z.number().finite();

/**
 * A reporting period, and the one primitive worth spelling out. Periods are ordinals on a grid the institution
 * declares — not dates — because nothing in this domain holds a clock: staleness, trend and sustained-decline
 * are all subtraction between two integers. A calendar value arriving here would have to be interpreted onto
 * that grid, and interpreting it is a reporting decision this layer has no standing to make. Negative ordinals
 * are admissible, because an institution numbering backwards from an established origin is ordinary.
 */
const periodIndex = z.number().int();

const healthPillar = z.enum([
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
]);
const measureUnit = z.enum([
  "count",
  "ratio",
  "percentage",
  "currency_minor",
  "days",
  "score",
  "rate_per_thousand",
]);
const metricPolarity = z.enum(["higher_is_better", "lower_is_better", "on_target"]);
const periodGrain = z.enum(["day", "week", "month", "term", "quarter", "year"]);
const evidenceKind = z.enum([
  "domain_record",
  "assessment_result",
  "audit_finding",
  "forecast_run",
  "decision_record",
  "knowledge_assertion",
  "manual_return",
]);
const panelBinding = z.enum([
  "kpi_reading",
  "kpi_series",
  "pillar_score",
  "index_score",
  "index_series",
  "attention_queue",
  "coverage_report",
]);
const attentionSeverity = z.enum(["informational", "advisory", "urgent", "critical"]);
const attentionReason = z.enum([
  "band_breach",
  "band_fall",
  "sustained_decline",
  "target_miss",
  "index_drop",
  "coverage_gap",
  "evidence_stale",
  "standing_weakened",
]);
const attentionSubjectKind = z.enum(["index", "pillar", "kpi"]);

// --- KPI definitions (command:manage) --------------------------------------------

/**
 * The ladder that turns a raw measurement into a comparable score. Anchors are carried whole rather than
 * patched, because a scale is one statement about what good looks like: between two edits to a ladder the
 * declared thresholds would be a mixture of the old view and the new one, and any reading normalized in that
 * window would carry a score the institution never actually adopted.
 */
const measurementScale = z.object({
  unit: measureUnit,
  polarity: metricPolarity,
  anchors: z.array(z.object({ value: finite, score: finite })),
});

export const defineKpiSchema = z.object({
  organizationId: uuid,
  kpiKey: nonEmpty,
  name: nonEmpty,
  description: nullableText.optional(),
  pillar: healthPillar,
  sourceDomain: nonEmpty,
  scale: measurementScale,
  targetScore: finite.nullable().optional(),
});

export const reviseKpiScaleSchema = z.object({ scale: measurementScale });

export const renameKpiSchema = z.object({
  name: nonEmpty,
  description: nullableText.optional(),
});

/**
 * Explicitly nullable rather than optional, and required rather than either. Clearing a target is a decision an
 * institution makes about an indicator, so it has to be sayable; an omitted field would make "no target" and
 * "leave the target alone" the same request, and a retarget that silently left the old figure standing would
 * report an indicator as missing a target it had already abandoned.
 */
export const retargetKpiSchema = z.object({ targetScore: finite.nullable() });

// --- KPI readings (command:measure) ----------------------------------------------

/**
 * One citation as the wire carries it. `attestedBy` defaults to null rather than being optional so the shape
 * reaching the domain is exactly the shape the domain declares — the aggregate decides which kinds must name an
 * attestor, and a missing field being a different thing from an absent attestor would put that decision here.
 */
const evidenceCitation = z.object({
  kind: evidenceKind,
  sourceDomain: nonEmpty,
  sourceRef: nonEmpty,
  attestedBy: nullableText.default(null),
});

/**
 * Citations are required and the array is not defaulted, which is the contract's third clause arriving at the
 * transport boundary. A reading with no evidence is refused rather than recorded as unsourced, because a
 * dashboard whose numbers are *usually* traceable teaches its readers to stop checking which ones are.
 */
export const recordKpiReadingSchema = z.object({
  kpiDefinitionId: uuid,
  period: periodIndex,
  rawValue: finite,
  citations: z.array(evidenceCitation),
});

/**
 * A withdrawal reason is compulsory, unlike every other reason in this domain. Withdrawing a reading
 * retroactively edits history an assessment already consumed and a briefing may already have pinned, so the
 * record has to say why on its own — a reader reconstructing a restated quarter cannot ask the person who did it.
 */
export const withdrawKpiReadingSchema = z.object({ reason: nonEmpty });

// --- Health index definitions (command:manage) -----------------------------------

const pillarWeight = z.object({ pillar: healthPillar, weight: finite });

export const defineHealthIndexSchema = z.object({
  organizationId: uuid,
  indexKey: nonEmpty,
  name: nonEmpty,
  description: nullableText.optional(),
  grain: periodGrain,
  weights: z.array(pillarWeight),
});

/**
 * The whole weight set, never one pillar of it. Weights sum to a declared total, so a per-pillar route would
 * leave the composition invalid between two calls, and an assessment computed in that window would be scored
 * against a composition the institution never held.
 */
export const reweightHealthIndexSchema = z.object({ weights: z.array(pillarWeight) });

export const renameHealthIndexSchema = z.object({
  name: nonEmpty,
  description: nullableText.optional(),
});

export const supersedeHealthIndexSchema = z.object({ successorId: uuid });

export const recomposeHealthIndexSchema = z.object({ weights: z.array(pillarWeight) });

// --- Health index assessments (command:operate) ----------------------------------

/**
 * An assessment names the index by key and not by id. The published definition for that key is what the
 * institution is currently measuring itself under, and resolving it at compute time is what makes the recorded
 * definition id an answer rather than a caller's assertion — a caller who could pin the definition could score
 * a period against a composition that was superseded before the period began.
 */
export const assessHealthIndexSchema = z.object({
  indexKey: nonEmpty,
  period: periodIndex,
});

/**
 * A reason is optional here and compulsory on a reading withdrawal, and the asymmetry is deliberate. An
 * invalidated assessment keeps its inputs and its fingerprint, so the record can still show what it computed and
 * why it no longer reproduces; a withdrawn reading leaves nothing behind that explains itself.
 */
export const invalidateAssessmentSchema = z.object({
  reason: nullableText.optional(),
});

// --- Dashboards (command:manage) -------------------------------------------------

/**
 * One panel as the wire carries it. `kpiKey` and `pillar` default to null rather than being optional because
 * the binding decides which of them a panel needs, and the domain refuses a set where a binding and its subject
 * disagree — an absent field and an explicit null being different things would move that judgement here.
 *
 * `requiredScope` is drawn from the institution's own vocabulary rather than from the five scopes gating these
 * routes. A panel may require `finance:read`; the domain compares it against what the principal holds without
 * knowing where either came from.
 */
const dashboardPanel = z.object({
  panelKey: nonEmpty,
  binding: panelBinding,
  requiredScope: nonEmpty,
  kpiKey: nullableText.default(null),
  pillar: healthPillar.nullable().default(null),
});

export const defineDashboardSchema = z.object({
  organizationId: uuid,
  dashboardKey: nonEmpty,
  name: nonEmpty,
  description: nullableText.optional(),
  panels: z.array(dashboardPanel),
});

export const setDashboardPanelsSchema = z.object({ panels: z.array(dashboardPanel) });

export const renameDashboardSchema = z.object({
  name: nonEmpty,
  description: nullableText.optional(),
});

/**
 * The author's composition check, against a scope set they choose rather than the one they hold. Carried in a
 * body rather than a path because these are institution-defined strings and a list in a URL would have to be
 * delimited by some character no scope may contain — a constraint on the institution's vocabulary imposed for
 * the convenience of a route.
 */
export const composeDashboardSchema = z.object({ grantedScopes: z.array(nonEmpty) });

// --- Executive briefings (command:brief) -----------------------------------------

/** One finding as the wire carries it, in the same shape the sweep produces from an assessment. */
const attentionSignal = z.object({
  key: nonEmpty,
  reason: attentionReason,
  severity: attentionSeverity,
  subjectKind: attentionSubjectKind,
  subject: nonEmpty,
  observed: finite.nullable().default(null),
});

/**
 * Nothing about the figure is restated here. The briefing is drafted against an assessment id and pins that
 * assessment's recorded index itself, so a board pack cannot quietly disagree with the arithmetic it claims to
 * be reporting.
 */
export const draftBriefingSchema = z.object({
  assessmentId: uuid,
  briefingKey: nonEmpty,
  title: nonEmpty,
  narrative: nullableText.optional(),
  audienceScope: nonEmpty,
  findings: z.array(attentionSignal),
});

export const reviseBriefingSchema = z.object({
  title: nonEmpty,
  narrative: nullableText.optional(),
});

export const setBriefingFindingsSchema = z.object({ findings: z.array(attentionSignal) });

export const withdrawBriefingSchema = z.object({ reason: nullableText.optional() });

// --- Attention items (command:operate) -------------------------------------------

export const sweepAttentionSchema = z.object({ assessmentId: uuid });

/**
 * Raising a finding by hand, beside the ones the sweep derives. The assessment is named because an item is a
 * finding *about a computed period* rather than a free-standing note — an item with no assessment behind it
 * would be a task list wearing a governance queue's clothes.
 */
export const raiseAttentionSchema = z.object({
  assessmentId: uuid,
  signal: attentionSignal,
});

export const restateAttentionSchema = z.object({ signal: attentionSignal });

export const resolveAttentionSchema = z.object({ note: nullableText.optional() });

/**
 * A dismissal reason is compulsory. Dismissing is the one closure that says the institution looked at a finding
 * and decided it did not matter, and the whole reason this queue refuses deletion is so that judgement stays on
 * the record with a reason and a name attached to it.
 */
export const dismissAttentionSchema = z.object({ reason: nonEmpty });
