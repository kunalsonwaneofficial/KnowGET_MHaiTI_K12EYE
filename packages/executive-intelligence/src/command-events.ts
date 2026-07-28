import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type {
  AttentionReason,
  AttentionSeverity,
  HealthPillar,
  MeasureUnit,
  MetricPolarity,
  PerformanceBand,
  PeriodGrain,
  ReadingStanding,
} from "./command-value";
import type { AttentionSubjectKind } from "./command-view";
import type { AttentionItem } from "./attention-item";
import { isAttentionItemOpen } from "./attention-item";
import type { Dashboard } from "./dashboard";
import type { ExecutiveBriefing } from "./executive-briefing";
import type { HealthIndexAssessment } from "./health-index-assessment";
import { isAssessmentFinalizable } from "./health-index-assessment";
import type { HealthIndexDefinition } from "./health-index-definition";
import type { KpiDefinition } from "./kpi-definition";
import type { KpiReading } from "./kpi-reading";
import { isKpiReadingWithdrawn, kpiReadingScore } from "./kpi-reading";

/**
 * Domain events for executive intelligence, governance and institutional command (P2-D29), on the `command.*`
 * namespace.
 *
 * Payloads carry ids, registry keys, statuses, vocabulary terms, coverage ratios and counts. Every piece of free
 * text this domain holds stays in the domain: a KPI's `name` and `description`, an index's, a dashboard's, a
 * briefing's `title` and `narrative`, a withdrawal's `withdrawalReason`, an invalidation's `invalidationReason`
 * and an attention item's `closureNote`. So does every member of staff — `acknowledgedBy` and `closedBy` are on
 * the record, not on the wire. A subscriber that genuinely needs the person who acknowledged a finding resolves
 * it from the item id, within the tenant, deliberately.
 *
 * Three exclusions are specific to this contract and each is load-bearing.
 *
 * **A reading's raw value never travels.** The figure belongs to the domain that published it; this contract
 * cites that domain and never recomputes its number, so it has no business rebroadcasting it either. An
 * attendance rate arriving on two channels is the duplication the whole platform exists to remove, and the
 * second copy is always the one that goes stale. The normalized score does travel, because it is this
 * contract's own product and it is what a subscriber reacting to a movement actually needs.
 *
 * **A briefing's cited figure never travels.** A briefing is the one record here that declares the permission
 * scope a reader must hold, and putting its number on a broadcast channel would route around the single access
 * control the record carries. The scope, the series and the period travel — enough to route a notification to
 * whoever holds the scope, and not enough to be the briefing.
 *
 * **A weight set never travels.** A reweighting event says the composition changed, which is the routing-relevant
 * fact; what it changed to is a governance record, read deliberately by someone who will be asked to justify it.
 * An event that carried the numbers would invite a subscriber to recompute the index itself, and a second
 * implementation of the composite is exactly the fragmentation this contract was written to end.
 *
 * Two events here are not the echo of something a person asked for. {@link assessmentComputed} fires when a
 * series produced a number, and {@link attentionRaised} fires when the arithmetic noticed something worth a
 * person's time. Those are the moments an institution most needs to see and the ones nobody is sitting at a
 * screen for, so each carries the coverage, sufficiency and severity a subscriber needs to decide whether to
 * wake anybody — without needing a second call to find out whether the number was worth believing.
 */

// --- KPI definitions -------------------------------------------------------------
export const KPI_DEFINED = "command.kpi.defined";
export const KPI_RESCALED = "command.kpi.rescaled";
export const KPI_RENAMED = "command.kpi.renamed";
export const KPI_RETARGETED = "command.kpi.retargeted";
export const KPI_ACTIVATED = "command.kpi.activated";
export const KPI_RETIRED = "command.kpi.retired";

export interface KpiDefinitionEventPayload {
  readonly kpiDefinitionId: Uuid;
  readonly organizationId: Uuid;
  readonly kpiKey: string;
  readonly pillar: HealthPillar;
  /** The operational domain that publishes the figure. What a subscriber routes an ownership question to. */
  readonly sourceDomain: string;
  readonly status: string;
  /** How the raw figure is expressed, so a subscriber can interpret a score without reading the scale. */
  readonly unit: MeasureUnit;
  readonly polarity: MetricPolarity;
  /** The normalized score the institution is aiming at, or `null` when it declares none. */
  readonly targetScore: number | null;
  /** Whether this indicator currently counts toward what its pillar declares. */
  readonly active: boolean;
}

export type KpiDefinedEvent = DomainEvent<typeof KPI_DEFINED, KpiDefinitionEventPayload>;
export type KpiRescaledEvent = DomainEvent<typeof KPI_RESCALED, KpiDefinitionEventPayload>;
export type KpiRenamedEvent = DomainEvent<typeof KPI_RENAMED, KpiDefinitionEventPayload>;
export type KpiRetargetedEvent = DomainEvent<typeof KPI_RETARGETED, KpiDefinitionEventPayload>;
export type KpiActivatedEvent = DomainEvent<typeof KPI_ACTIVATED, KpiDefinitionEventPayload>;
export type KpiRetiredEvent = DomainEvent<typeof KPI_RETIRED, KpiDefinitionEventPayload>;

// The scale's anchors are absent by the same argument that keeps a weight set off the wire: they are the
// institution's declaration of what *good* means, and a subscriber holding them would be a second place the
// answer lives. The unit and polarity do travel, because without them a score of 40 cannot even be read as bad.
const kpiPayload = (definition: KpiDefinition): KpiDefinitionEventPayload => ({
  kpiDefinitionId: definition.id,
  organizationId: definition.organizationId,
  kpiKey: definition.kpiKey,
  pillar: definition.pillar,
  sourceDomain: definition.sourceDomain,
  status: definition.status,
  unit: definition.scale.unit,
  polarity: definition.scale.polarity,
  targetScore: definition.targetScore,
  active: definition.status === "active",
});

export const kpiDefined = (definition: KpiDefinition): KpiDefinedEvent =>
  createEvent(KPI_DEFINED, kpiPayload(definition), { tenantId: definition.tenantId });
export const kpiRescaled = (definition: KpiDefinition): KpiRescaledEvent =>
  createEvent(KPI_RESCALED, kpiPayload(definition), { tenantId: definition.tenantId });
export const kpiRenamed = (definition: KpiDefinition): KpiRenamedEvent =>
  createEvent(KPI_RENAMED, kpiPayload(definition), { tenantId: definition.tenantId });
export const kpiRetargeted = (definition: KpiDefinition): KpiRetargetedEvent =>
  createEvent(KPI_RETARGETED, kpiPayload(definition), { tenantId: definition.tenantId });
export const kpiActivated = (definition: KpiDefinition): KpiActivatedEvent =>
  createEvent(KPI_ACTIVATED, kpiPayload(definition), { tenantId: definition.tenantId });

/** The institution stopped measuring this. Anything still filing readings against it is a feed nobody switched off. */
export const kpiRetired = (definition: KpiDefinition): KpiRetiredEvent =>
  createEvent(KPI_RETIRED, kpiPayload(definition), { tenantId: definition.tenantId });

// --- KPI readings ----------------------------------------------------------------
export const KPI_READING_RECORDED = "command.reading.recorded";
export const KPI_READING_WITHDRAWN = "command.reading.withdrawn";

export interface KpiReadingEventPayload {
  readonly readingId: Uuid;
  readonly organizationId: Uuid;
  readonly kpiDefinitionId: Uuid;
  readonly kpiKey: string;
  readonly pillar: HealthPillar;
  readonly period: number;
  /** This contract's own normalized product, or `null` when the scale could not score the figure. */
  readonly score: number | null;
  /** False when the figure arrived but could not be scored — a coverage fact, not a bad result. */
  readonly scoreable: boolean;
  /** The weakest standing among the citations. What a subscriber weighs the figure by. */
  readonly standing: ReadingStanding;
  readonly citationCount: number;
  readonly withdrawn: boolean;
}

export type KpiReadingRecordedEvent = DomainEvent<
  typeof KPI_READING_RECORDED,
  KpiReadingEventPayload
>;
export type KpiReadingWithdrawnEvent = DomainEvent<
  typeof KPI_READING_WITHDRAWN,
  KpiReadingEventPayload
>;

// `rawValue` is deliberately absent — see the module comment. `score` is null on a withdrawn reading as well as
// an unscoreable one, because those are the two cases a pillar roll-up must treat identically and an event that
// distinguished them would invite a subscriber to keep counting a figure the institution has taken back.
const readingPayload = (reading: KpiReading): KpiReadingEventPayload => ({
  readingId: reading.id,
  organizationId: reading.organizationId,
  kpiDefinitionId: reading.kpiDefinitionId,
  kpiKey: reading.kpiKey,
  pillar: reading.pillar,
  period: reading.period,
  score: kpiReadingScore(reading),
  scoreable: reading.measurement.scoreable,
  standing: reading.standing,
  citationCount: reading.citations.length,
  withdrawn: isKpiReadingWithdrawn(reading),
});

export const kpiReadingRecorded = (reading: KpiReading): KpiReadingRecordedEvent =>
  createEvent(KPI_READING_RECORDED, readingPayload(reading), { tenantId: reading.tenantId });

/** The figure should never have counted. Anything that consumed it has to be told, which is why this is an event. */
export const kpiReadingWithdrawn = (reading: KpiReading): KpiReadingWithdrawnEvent =>
  createEvent(KPI_READING_WITHDRAWN, readingPayload(reading), { tenantId: reading.tenantId });

// --- Health index definitions ----------------------------------------------------
export const INDEX_DEFINED = "command.index.defined";
export const INDEX_REWEIGHTED = "command.index.reweighted";
export const INDEX_RENAMED = "command.index.renamed";
export const INDEX_PUBLISHED = "command.index.published";
export const INDEX_SUPERSEDED = "command.index.superseded";
export const INDEX_RETIRED = "command.index.retired";

export interface HealthIndexDefinitionEventPayload {
  readonly indexDefinitionId: Uuid;
  readonly organizationId: Uuid;
  readonly indexKey: string;
  /** The grid this series' period ordinals are counted on. Without it a period number means nothing. */
  readonly grain: PeriodGrain;
  readonly status: string;
  /** How many of the ten pillars this composition weights. The shape of the question, not the answer. */
  readonly weightedPillars: number;
  /** The definition that took over. Non-null only on a supersession. */
  readonly supersededById: Uuid | null;
  readonly published: boolean;
}

export type IndexDefinedEvent = DomainEvent<
  typeof INDEX_DEFINED,
  HealthIndexDefinitionEventPayload
>;
export type IndexReweightedEvent = DomainEvent<
  typeof INDEX_REWEIGHTED,
  HealthIndexDefinitionEventPayload
>;
export type IndexRenamedEvent = DomainEvent<
  typeof INDEX_RENAMED,
  HealthIndexDefinitionEventPayload
>;
export type IndexPublishedEvent = DomainEvent<
  typeof INDEX_PUBLISHED,
  HealthIndexDefinitionEventPayload
>;
export type IndexSupersededEvent = DomainEvent<
  typeof INDEX_SUPERSEDED,
  HealthIndexDefinitionEventPayload
>;
export type IndexRetiredEvent = DomainEvent<
  typeof INDEX_RETIRED,
  HealthIndexDefinitionEventPayload
>;

const indexPayload = (definition: HealthIndexDefinition): HealthIndexDefinitionEventPayload => ({
  indexDefinitionId: definition.id,
  organizationId: definition.organizationId,
  indexKey: definition.indexKey,
  grain: definition.grain,
  status: definition.status,
  weightedPillars: definition.weights.length,
  supersededById: definition.supersededById,
  published: definition.status === "published",
});

export const indexDefined = (definition: HealthIndexDefinition): IndexDefinedEvent =>
  createEvent(INDEX_DEFINED, indexPayload(definition), { tenantId: definition.tenantId });

/**
 * The institution changed what its pillars are worth to it.
 *
 * The most consequential thing anyone can do to a health index without touching a single reading, and the
 * reason it is its own event rather than a rename: every comparison across the join needs to know it happened.
 */
export const indexReweighted = (definition: HealthIndexDefinition): IndexReweightedEvent =>
  createEvent(INDEX_REWEIGHTED, indexPayload(definition), { tenantId: definition.tenantId });
export const indexRenamed = (definition: HealthIndexDefinition): IndexRenamedEvent =>
  createEvent(INDEX_RENAMED, indexPayload(definition), { tenantId: definition.tenantId });
export const indexPublished = (definition: HealthIndexDefinition): IndexPublishedEvent =>
  createEvent(INDEX_PUBLISHED, indexPayload(definition), { tenantId: definition.tenantId });
export const indexSuperseded = (definition: HealthIndexDefinition): IndexSupersededEvent =>
  createEvent(INDEX_SUPERSEDED, indexPayload(definition), { tenantId: definition.tenantId });
export const indexRetired = (definition: HealthIndexDefinition): IndexRetiredEvent =>
  createEvent(INDEX_RETIRED, indexPayload(definition), { tenantId: definition.tenantId });

// --- Health index assessments ----------------------------------------------------
export const ASSESSMENT_COMPUTED = "command.assessment.computed";
export const ASSESSMENT_FINALIZED = "command.assessment.finalized";
export const ASSESSMENT_INVALIDATED = "command.assessment.invalidated";

export interface HealthIndexAssessmentEventPayload {
  readonly assessmentId: Uuid;
  readonly organizationId: Uuid;
  readonly indexDefinitionId: Uuid;
  readonly indexKey: string;
  readonly period: number;
  readonly grain: PeriodGrain;
  /** The composite, or `null` when nothing the definition declared could be scored. Never a zero standing in. */
  readonly value: number | null;
  readonly band: PerformanceBand | null;
  /** The share of declared weight that actually contributed. Travels with the value, always. */
  readonly pillarCoverage: number;
  /** Whether coverage cleared the floor. A subscriber that ignores this is quoting a number it has not read. */
  readonly sufficient: boolean;
  /** How much declared weight was renormalized across the pillars that survived. */
  readonly weightRedistributed: number;
  readonly contributingPillars: number;
  readonly omittedPillars: number;
  /** How many readings the audit admitted, and how many it would not. */
  readonly readingsAdmitted: number;
  readonly readingsRejected: number;
  /** A digest of the pinned run. The cheap way for a subscriber to notice inputs moved. */
  readonly fingerprint: string;
  readonly status: string;
  /** Whether this may become the number a board paper quotes, as things stand. */
  readonly citable: boolean;
}

export type AssessmentComputedEvent = DomainEvent<
  typeof ASSESSMENT_COMPUTED,
  HealthIndexAssessmentEventPayload
>;
export type AssessmentFinalizedEvent = DomainEvent<
  typeof ASSESSMENT_FINALIZED,
  HealthIndexAssessmentEventPayload
>;
export type AssessmentInvalidatedEvent = DomainEvent<
  typeof ASSESSMENT_INVALIDATED,
  HealthIndexAssessmentEventPayload
>;

// Coverage, sufficiency and the redistributed weight travel on every assessment event rather than only on the
// one that computed it. Whether the number saw enough of the institution to be worth quoting is the question a
// subscriber asks at any moment, and making it answerable only by replaying the first event of the series would
// make the cheap question expensive — and a subscriber that finds a question expensive stops asking it.
const assessmentPayload = (
  assessment: HealthIndexAssessment,
): HealthIndexAssessmentEventPayload => ({
  assessmentId: assessment.id,
  organizationId: assessment.organizationId,
  indexDefinitionId: assessment.indexDefinitionId,
  indexKey: assessment.indexKey,
  period: assessment.period,
  grain: assessment.grain,
  value: assessment.value,
  band: assessment.band,
  pillarCoverage: assessment.pillarCoverage,
  sufficient: assessment.sufficient,
  weightRedistributed: assessment.weightRedistributed,
  contributingPillars: assessment.contributions.length,
  omittedPillars: assessment.omissions.length,
  readingsAdmitted: assessment.evidence.admitted,
  readingsRejected:
    assessment.evidence.stale + assessment.evidence.outOfPeriod + assessment.evidence.untraceable,
  fingerprint: assessment.fingerprint,
  status: assessment.status,
  citable: isAssessmentFinalizable(assessment),
});

/** A series produced a number. Nobody asked for this one directly — the period came round. */
export const assessmentComputed = (assessment: HealthIndexAssessment): AssessmentComputedEvent =>
  createEvent(ASSESSMENT_COMPUTED, assessmentPayload(assessment), {
    tenantId: assessment.tenantId,
  });
export const assessmentFinalized = (assessment: HealthIndexAssessment): AssessmentFinalizedEvent =>
  createEvent(ASSESSMENT_FINALIZED, assessmentPayload(assessment), {
    tenantId: assessment.tenantId,
  });

/**
 * The institution said the figure was wrong.
 *
 * The event every briefing, dashboard and downstream reader of a quoted number has to hear. The reason it exists
 * is that the number has already travelled: invalidating it silently would leave the platform correct and every
 * document quoting it wrong.
 */
export const assessmentInvalidated = (
  assessment: HealthIndexAssessment,
): AssessmentInvalidatedEvent =>
  createEvent(ASSESSMENT_INVALIDATED, assessmentPayload(assessment), {
    tenantId: assessment.tenantId,
  });

// --- Dashboards ------------------------------------------------------------------
export const DASHBOARD_DEFINED = "command.dashboard.defined";
export const DASHBOARD_PANELS_SET = "command.dashboard.panels_set";
export const DASHBOARD_RENAMED = "command.dashboard.renamed";
export const DASHBOARD_PUBLISHED = "command.dashboard.published";
export const DASHBOARD_ARCHIVED = "command.dashboard.archived";

export interface DashboardEventPayload {
  readonly dashboardId: Uuid;
  readonly organizationId: Uuid;
  readonly dashboardKey: string;
  readonly status: string;
  readonly panelCount: number;
  /** How many distinct permission scopes the panel set requires. What a viewer's reach is measured against. */
  readonly requiredScopes: number;
  readonly published: boolean;
}

export type DashboardDefinedEvent = DomainEvent<typeof DASHBOARD_DEFINED, DashboardEventPayload>;
export type DashboardPanelsSetEvent = DomainEvent<
  typeof DASHBOARD_PANELS_SET,
  DashboardEventPayload
>;
export type DashboardRenamedEvent = DomainEvent<typeof DASHBOARD_RENAMED, DashboardEventPayload>;
export type DashboardPublishedEvent = DomainEvent<
  typeof DASHBOARD_PUBLISHED,
  DashboardEventPayload
>;
export type DashboardArchivedEvent = DomainEvent<typeof DASHBOARD_ARCHIVED, DashboardEventPayload>;

// The panels themselves stay in the domain. A panel binds a scope to a data shape, and the set of them is a
// readable map of who is allowed to see what — useful to a subscriber only if that subscriber is building the
// second opinion about roles this contract deliberately refuses to hold.
const dashboardPayload = (dashboard: Dashboard): DashboardEventPayload => ({
  dashboardId: dashboard.id,
  organizationId: dashboard.organizationId,
  dashboardKey: dashboard.dashboardKey,
  status: dashboard.status,
  panelCount: dashboard.panels.length,
  requiredScopes: new Set(dashboard.panels.map((panel) => panel.requiredScope)).size,
  published: dashboard.status === "published",
});

export const dashboardDefined = (dashboard: Dashboard): DashboardDefinedEvent =>
  createEvent(DASHBOARD_DEFINED, dashboardPayload(dashboard), { tenantId: dashboard.tenantId });
export const dashboardPanelsSet = (dashboard: Dashboard): DashboardPanelsSetEvent =>
  createEvent(DASHBOARD_PANELS_SET, dashboardPayload(dashboard), { tenantId: dashboard.tenantId });
export const dashboardRenamed = (dashboard: Dashboard): DashboardRenamedEvent =>
  createEvent(DASHBOARD_RENAMED, dashboardPayload(dashboard), { tenantId: dashboard.tenantId });
export const dashboardPublished = (dashboard: Dashboard): DashboardPublishedEvent =>
  createEvent(DASHBOARD_PUBLISHED, dashboardPayload(dashboard), { tenantId: dashboard.tenantId });
export const dashboardArchived = (dashboard: Dashboard): DashboardArchivedEvent =>
  createEvent(DASHBOARD_ARCHIVED, dashboardPayload(dashboard), { tenantId: dashboard.tenantId });

// --- Executive briefings ---------------------------------------------------------
export const BRIEFING_DRAFTED = "command.briefing.drafted";
export const BRIEFING_REVISED = "command.briefing.revised";
export const BRIEFING_FINDINGS_SET = "command.briefing.findings_set";
export const BRIEFING_ISSUED = "command.briefing.issued";
export const BRIEFING_WITHDRAWN = "command.briefing.withdrawn";

export interface ExecutiveBriefingEventPayload {
  readonly briefingId: Uuid;
  readonly organizationId: Uuid;
  readonly briefingKey: string;
  /** The permission scope a reader must hold. The routing key for a notification, and the reason no figure travels. */
  readonly audienceScope: string;
  readonly assessmentId: Uuid;
  readonly indexKey: string;
  readonly period: number;
  readonly findingCount: number;
  readonly status: string;
  readonly issued: boolean;
}

export type BriefingDraftedEvent = DomainEvent<
  typeof BRIEFING_DRAFTED,
  ExecutiveBriefingEventPayload
>;
export type BriefingRevisedEvent = DomainEvent<
  typeof BRIEFING_REVISED,
  ExecutiveBriefingEventPayload
>;
export type BriefingFindingsSetEvent = DomainEvent<
  typeof BRIEFING_FINDINGS_SET,
  ExecutiveBriefingEventPayload
>;
export type BriefingIssuedEvent = DomainEvent<
  typeof BRIEFING_ISSUED,
  ExecutiveBriefingEventPayload
>;
export type BriefingWithdrawnEvent = DomainEvent<
  typeof BRIEFING_WITHDRAWN,
  ExecutiveBriefingEventPayload
>;

// The pinned figure is absent — see the module comment. The assessment id is present, which is not the same
// thing: resolving it means going through the repository, inside the tenant, holding whatever the reader holds.
const briefingPayload = (briefing: ExecutiveBriefing): ExecutiveBriefingEventPayload => ({
  briefingId: briefing.id,
  organizationId: briefing.organizationId,
  briefingKey: briefing.briefingKey,
  audienceScope: briefing.audienceScope,
  assessmentId: briefing.assessmentId,
  indexKey: briefing.indexKey,
  period: briefing.period,
  findingCount: briefing.findings.length,
  status: briefing.status,
  issued: briefing.status === "issued",
});

export const briefingDrafted = (briefing: ExecutiveBriefing): BriefingDraftedEvent =>
  createEvent(BRIEFING_DRAFTED, briefingPayload(briefing), { tenantId: briefing.tenantId });
export const briefingRevised = (briefing: ExecutiveBriefing): BriefingRevisedEvent =>
  createEvent(BRIEFING_REVISED, briefingPayload(briefing), { tenantId: briefing.tenantId });
export const briefingFindingsSet = (briefing: ExecutiveBriefing): BriefingFindingsSetEvent =>
  createEvent(BRIEFING_FINDINGS_SET, briefingPayload(briefing), { tenantId: briefing.tenantId });
export const briefingIssued = (briefing: ExecutiveBriefing): BriefingIssuedEvent =>
  createEvent(BRIEFING_ISSUED, briefingPayload(briefing), { tenantId: briefing.tenantId });

/**
 * The institution took a briefing back.
 *
 * Circulated documents do not un-circulate. This is the event that lets whatever distributed it say so, which is
 * the only correction available once a board has read something.
 */
export const briefingWithdrawn = (briefing: ExecutiveBriefing): BriefingWithdrawnEvent =>
  createEvent(BRIEFING_WITHDRAWN, briefingPayload(briefing), { tenantId: briefing.tenantId });

// --- Attention items -------------------------------------------------------------
export const ATTENTION_RAISED = "command.attention.raised";
export const ATTENTION_RESTATED = "command.attention.restated";
export const ATTENTION_ACKNOWLEDGED = "command.attention.acknowledged";
export const ATTENTION_RESOLVED = "command.attention.resolved";
export const ATTENTION_DISMISSED = "command.attention.dismissed";

export interface AttentionItemEventPayload {
  readonly attentionItemId: Uuid;
  readonly organizationId: Uuid;
  readonly assessmentId: Uuid;
  readonly indexKey: string;
  readonly period: number;
  /** The engine's stable identity for the finding. Two runs over the same arithmetic produce the same key. */
  readonly key: string;
  readonly reason: AttentionReason;
  readonly severity: AttentionSeverity;
  readonly subjectKind: AttentionSubjectKind;
  /** The pillar or KPI this is about. Empty for an index-level finding, which has no subject but itself. */
  readonly subject: string;
  /** The quantity the finding was last raised on, in whatever its reason measures. Never summed across items. */
  readonly observed: number | null;
  readonly status: string;
  readonly open: boolean;
}

export type AttentionRaisedEvent = DomainEvent<typeof ATTENTION_RAISED, AttentionItemEventPayload>;
export type AttentionRestatedEvent = DomainEvent<
  typeof ATTENTION_RESTATED,
  AttentionItemEventPayload
>;
export type AttentionAcknowledgedEvent = DomainEvent<
  typeof ATTENTION_ACKNOWLEDGED,
  AttentionItemEventPayload
>;
export type AttentionResolvedEvent = DomainEvent<
  typeof ATTENTION_RESOLVED,
  AttentionItemEventPayload
>;
export type AttentionDismissedEvent = DomainEvent<
  typeof ATTENTION_DISMISSED,
  AttentionItemEventPayload
>;

// `acknowledgedBy` and `closedBy` are absent. Who picked a finding up is accountability, which belongs in the
// audit trail where it is read deliberately; broadcasting it is how an operational feed becomes a way of
// noticing which member of staff is slow to answer.
const attentionPayload = (item: AttentionItem): AttentionItemEventPayload => ({
  attentionItemId: item.id,
  organizationId: item.organizationId,
  assessmentId: item.assessmentId,
  indexKey: item.indexKey,
  period: item.period,
  key: item.key,
  reason: item.reason,
  severity: item.severity,
  subjectKind: item.subjectKind,
  subject: item.subject,
  observed: item.observed,
  status: item.status,
  open: isAttentionItemOpen(item),
});

/** The arithmetic noticed something worth a person's time. Nobody asked for this one — the assessment produced it. */
export const attentionRaised = (item: AttentionItem): AttentionRaisedEvent =>
  createEvent(ATTENTION_RAISED, attentionPayload(item), { tenantId: item.tenantId });

/**
 * A standing finding was seen again, at a severity that may have moved.
 *
 * Separate from {@link attentionRaised} because a subscriber that escalates on severity has to be able to tell a
 * new problem from one that got worse, and a re-raise indistinguishable from a first raise would either page
 * somebody every period or never page them at all.
 */
export const attentionRestated = (item: AttentionItem): AttentionRestatedEvent =>
  createEvent(ATTENTION_RESTATED, attentionPayload(item), { tenantId: item.tenantId });
export const attentionAcknowledged = (item: AttentionItem): AttentionAcknowledgedEvent =>
  createEvent(ATTENTION_ACKNOWLEDGED, attentionPayload(item), { tenantId: item.tenantId });
export const attentionResolved = (item: AttentionItem): AttentionResolvedEvent =>
  createEvent(ATTENTION_RESOLVED, attentionPayload(item), { tenantId: item.tenantId });

/** Somebody judged the finding not worth acting on. A closure, and never the same thing as it having gone away. */
export const attentionDismissed = (item: AttentionItem): AttentionDismissedEvent =>
  createEvent(ATTENTION_DISMISSED, attentionPayload(item), { tenantId: item.tenantId });
