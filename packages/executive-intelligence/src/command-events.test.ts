import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { attentionKeyFor } from "./attention";
import {
  acknowledgeAttentionItem,
  dismissAttentionItem,
  raiseAttentionItem,
  resolveAttentionItem,
  restateAttentionItem,
} from "./attention-item";
import {
  ASSESSMENT_COMPUTED,
  ASSESSMENT_FINALIZED,
  ASSESSMENT_INVALIDATED,
  ATTENTION_ACKNOWLEDGED,
  ATTENTION_DISMISSED,
  ATTENTION_RAISED,
  ATTENTION_RESOLVED,
  ATTENTION_RESTATED,
  BRIEFING_DRAFTED,
  BRIEFING_FINDINGS_SET,
  BRIEFING_ISSUED,
  BRIEFING_REVISED,
  BRIEFING_WITHDRAWN,
  DASHBOARD_ARCHIVED,
  DASHBOARD_DEFINED,
  DASHBOARD_PANELS_SET,
  DASHBOARD_PUBLISHED,
  DASHBOARD_RENAMED,
  INDEX_DEFINED,
  INDEX_PUBLISHED,
  INDEX_RENAMED,
  INDEX_RETIRED,
  INDEX_REWEIGHTED,
  INDEX_SUPERSEDED,
  KPI_ACTIVATED,
  KPI_DEFINED,
  KPI_READING_RECORDED,
  KPI_READING_WITHDRAWN,
  KPI_RENAMED,
  KPI_RESCALED,
  KPI_RETARGETED,
  KPI_RETIRED,
  assessmentComputed,
  assessmentFinalized,
  assessmentInvalidated,
  attentionAcknowledged,
  attentionDismissed,
  attentionRaised,
  attentionResolved,
  attentionRestated,
  briefingDrafted,
  briefingFindingsSet,
  briefingIssued,
  briefingRevised,
  briefingWithdrawn,
  dashboardArchived,
  dashboardDefined,
  dashboardPanelsSet,
  dashboardPublished,
  dashboardRenamed,
  indexDefined,
  indexPublished,
  indexRenamed,
  indexRetired,
  indexReweighted,
  indexSuperseded,
  kpiActivated,
  kpiDefined,
  kpiReadingRecorded,
  kpiReadingWithdrawn,
  kpiRenamed,
  kpiRescaled,
  kpiRetargeted,
  kpiRetired,
} from "./command-events";
import type { AttentionReason, AttentionSeverity, HealthPillar } from "./command-value";
import type {
  AttentionSignal,
  AttentionSubjectKind,
  DashboardPanel,
  EvidenceCitation,
  MeasurementScale,
  PillarInput,
  PillarWeight,
  TracedReading,
} from "./command-view";
import {
  archiveDashboard,
  defineDashboard,
  publishDashboard,
  renameDashboard,
  setDashboardPanels,
} from "./dashboard";
import {
  draftBriefing,
  issueBriefing,
  reviseBriefing,
  setBriefingFindings,
  withdrawBriefing,
} from "./executive-briefing";
import {
  assessHealthIndex,
  finalizeAssessment,
  invalidateAssessment,
} from "./health-index-assessment";
import {
  defineHealthIndex,
  publishHealthIndex,
  renameHealthIndex,
  retireHealthIndex,
  reweightHealthIndex,
  supersedeHealthIndex,
} from "./health-index-definition";
import {
  activateKpi,
  defineKpi,
  renameKpi,
  retargetKpi,
  retireKpi,
  reviseKpiScale,
} from "./kpi-definition";
import { recordKpiReading, withdrawKpiReading } from "./kpi-reading";

const TENANT = "tenant-1" as TenantId;
const ORG = "org-1" as Uuid;
const SUCCESSOR = "index-def-2" as Uuid;

/**
 * Every piece of free text this domain holds, gathered in one place. Each string below is written into an
 * aggregate and must never reappear in a payload — that is what the last block of this file is for.
 */
const KPI_NAME = "Attendance rate across the whole school";
const KPI_DESCRIPTION = "Sessions attended over sessions possible, as the register reports it";
const INDEX_NAME = "Institutional health, termly";
const INDEX_DESCRIPTION = "The composition the governors agreed at the summer meeting";
const DASHBOARD_NAME = "Leadership overview";
const DASHBOARD_DESCRIPTION = "What the head teacher opens on a Monday morning";
const BRIEFING_TITLE = "Termly institutional health for the board";
const BRIEFING_NARRATIVE = "Attendance held; the finance pillar is the one to talk about";
const READING_WITHDRAWAL = "The register was reconciled after a data entry error in year 9";
const BRIEFING_WITHDRAWAL = "Circulated before the finance figures had been signed off";
const INVALIDATION_REASON = "Two pillars were computed from an extract taken before the cut-off";
const RESOLUTION_NOTE = "The finance director had already rebuilt the forecast";
const DISMISSAL_REASON = "The dip is a timetable artefact and reverses next period";

const FREE_TEXT = [
  KPI_NAME,
  KPI_DESCRIPTION,
  INDEX_NAME,
  INDEX_DESCRIPTION,
  DASHBOARD_NAME,
  DASHBOARD_DESCRIPTION,
  BRIEFING_TITLE,
  BRIEFING_NARRATIVE,
  READING_WITHDRAWAL,
  BRIEFING_WITHDRAWAL,
  INVALIDATION_REASON,
  RESOLUTION_NOTE,
  DISMISSAL_REASON,
];

const ACKNOWLEDGER = "user-3301" as Uuid;
const RESOLVER = "user-4402" as Uuid;
const DISMISSER = "user-5503" as Uuid;

const PEOPLE = [ACKNOWLEDGER, RESOLVER, DISMISSER];

/**
 * The figures that must not travel, chosen so that finding one on the wire is unambiguous. A raw measure that
 * scores to a different number, weight sets whose members share no digits with any count in a payload, and the
 * composite those weights produce — which is the figure a briefing pins and the figure a briefing may not send.
 */
const RAW_VALUE = 94.375;
const READING_SCORE = 83.75;
const CITED_VALUE = 72.375;

const scale: MeasurementScale = {
  unit: "percentage",
  polarity: "higher_is_better",
  anchors: [
    { value: 85, score: 0 },
    { value: 90, score: 50 },
    { value: 93, score: 70 },
    { value: 96, score: 100 },
  ],
};

const WEIGHTS: readonly PillarWeight[] = [
  { pillar: "academic_outcomes", weight: 0.3125 },
  { pillar: "teaching_quality", weight: 0.2375 },
  { pillar: "attendance_engagement", weight: 0.1875 },
  { pillar: "financial_health", weight: 0.125 },
  { pillar: "learner_wellbeing", weight: 0.0875 },
  { pillar: "workforce_capacity", weight: 0.05 },
];

const REWEIGHTED: readonly PillarWeight[] = [
  { pillar: "academic_outcomes", weight: 0.4125 },
  { pillar: "teaching_quality", weight: 0.2625 },
  { pillar: "attendance_engagement", weight: 0.1125 },
  { pillar: "financial_health", weight: 0.0875 },
  { pillar: "learner_wellbeing", weight: 0.0625 },
  { pillar: "workforce_capacity", weight: 0.0625 },
];

const WEIGHT_FIGURES = [...WEIGHTS, ...REWEIGHTED].map((entry) => String(entry.weight));

const cite = (ref: string): EvidenceCitation => ({
  kind: "domain_record",
  sourceDomain: "attendance",
  sourceRef: ref,
  attestedBy: null,
});

const draftKpi = defineKpi({
  tenantId: TENANT,
  organizationId: ORG,
  kpiKey: "attendance.rate",
  name: KPI_NAME,
  description: KPI_DESCRIPTION,
  pillar: "attendance_engagement",
  sourceDomain: "attendance",
  scale,
  targetScore: 80,
});

const liveKpi = activateKpi(draftKpi);
const reading = recordKpiReading(liveKpi, {
  period: 7,
  rawValue: RAW_VALUE,
  citations: [cite("register-2291")],
});
const nonsense = recordKpiReading(liveKpi, {
  period: 7,
  rawValue: 140,
  citations: [cite("register-2292")],
});
const withdrawnReading = withdrawKpiReading(reading, READING_WITHDRAWAL);

const draftIndex = defineHealthIndex({
  tenantId: TENANT,
  organizationId: ORG,
  indexKey: "institutional.health",
  name: INDEX_NAME,
  description: INDEX_DESCRIPTION,
  grain: "term",
  weights: WEIGHTS,
});

const liveIndex = publishHealthIndex(draftIndex);

const reported = (pillar: HealthPillar, score: number): PillarInput => ({
  pillar,
  score,
  kpisRead: 4,
  kpisDeclared: 5,
});

const FULL: readonly PillarInput[] = [
  reported("academic_outcomes", 80),
  reported("teaching_quality", 70),
  reported("attendance_engagement", 90),
  reported("financial_health", 60),
  reported("learner_wellbeing", 50),
  reported("workforce_capacity", 40),
];

const GROUNDED: readonly TracedReading[] = [
  { kpiKey: "attendance.rate", period: 7, citations: [cite("register-2291")] },
];

const provisional = assessHealthIndex(liveIndex, {
  period: 7,
  inputs: FULL,
  readings: GROUNDED,
});
const assessment = finalizeAssessment(provisional);

const PANELS: readonly DashboardPanel[] = [
  {
    panelKey: "index.score",
    binding: "index_score",
    requiredScope: "command:read",
    kpiKey: null,
    pillar: null,
  },
];

const WIDER_PANELS: readonly DashboardPanel[] = [
  ...PANELS,
  {
    panelKey: "attention.queue",
    binding: "attention_queue",
    requiredScope: "command:operate",
    kpiKey: null,
    pillar: null,
  },
];

const draftDashboard = defineDashboard({
  tenantId: TENANT,
  organizationId: ORG,
  dashboardKey: "leadership.overview",
  name: DASHBOARD_NAME,
  description: DASHBOARD_DESCRIPTION,
  panels: PANELS,
});

const liveDashboard = publishDashboard(draftDashboard);

const finding = (
  reason: AttentionReason,
  severity: AttentionSeverity,
  subjectKind: AttentionSubjectKind,
  subject: string,
): AttentionSignal => ({
  key: attentionKeyFor(reason, subjectKind, subject),
  reason,
  severity,
  subjectKind,
  subject,
  observed: 1,
});

const BREACH = finding("band_breach", "advisory", "pillar", "financial_health");
const WORSE = finding("band_breach", "critical", "pillar", "financial_health");
const COVERAGE = finding("coverage_gap", "urgent", "index", "");

const AUDIENCE = "command:brief";

const briefing = draftBriefing(assessment, {
  briefingKey: "board.termly",
  title: BRIEFING_TITLE,
  narrative: BRIEFING_NARRATIVE,
  audienceScope: AUDIENCE,
  findings: [BREACH],
});

const issued = issueBriefing(briefing, assessment);
const item = raiseAttentionItem(assessment, BREACH);

describe("the events a KPI definition produces", () => {
  it("names every transition on the command namespace under its own family", () => {
    expect(kpiDefined(draftKpi).type).toBe(KPI_DEFINED);
    expect(kpiRescaled(reviseKpiScale(draftKpi, scale)).type).toBe(KPI_RESCALED);
    expect(kpiRenamed(renameKpi(draftKpi, { name: KPI_NAME })).type).toBe(KPI_RENAMED);
    expect(kpiRetargeted(retargetKpi(draftKpi, null)).type).toBe(KPI_RETARGETED);
    expect(kpiActivated(liveKpi).type).toBe(KPI_ACTIVATED);
    expect(kpiRetired(retireKpi(liveKpi)).type).toBe(KPI_RETIRED);
  });

  it("carries the indicator's identity, its pillar and the domain that owns the figure", () => {
    expect(kpiDefined(draftKpi).payload).toMatchObject({
      kpiDefinitionId: draftKpi.id,
      organizationId: ORG,
      kpiKey: "attendance.rate",
      pillar: "attendance_engagement",
      sourceDomain: "attendance",
      status: "draft",
    });
  });

  it("says whether the indicator counts, so a subscriber need not parse a status", () => {
    expect(kpiDefined(draftKpi).payload.active).toBe(false);
    expect(kpiActivated(liveKpi).payload.active).toBe(true);
    expect(kpiRetired(retireKpi(liveKpi)).payload.active).toBe(false);
  });

  it("sends the unit and polarity a score has to be read against, and the anchors nowhere", () => {
    const event = kpiDefined(draftKpi);
    expect(event.payload).toMatchObject({ unit: "percentage", polarity: "higher_is_better" });
    expect(event.payload).not.toHaveProperty("scale");
    expect(event.payload).not.toHaveProperty("anchors");
  });

  it("reports the target the institution declared, and null when it declared none", () => {
    expect(kpiDefined(draftKpi).payload.targetScore).toBe(80);
    expect(kpiRetargeted(retargetKpi(draftKpi, null)).payload.targetScore).toBeNull();
  });

  it("leaves the indicator's name and description in the domain", () => {
    const wire = JSON.stringify(kpiDefined(draftKpi).payload);
    expect(wire).not.toContain(KPI_NAME);
    expect(wire).not.toContain(KPI_DESCRIPTION);
  });
});

describe("the events a KPI reading produces", () => {
  it("publishes this contract's own score and never the figure it was computed from", () => {
    const event = kpiReadingRecorded(reading);
    expect(event.type).toBe(KPI_READING_RECORDED);
    expect(event.payload).toMatchObject({
      readingId: reading.id,
      kpiDefinitionId: liveKpi.id,
      kpiKey: "attendance.rate",
      pillar: "attendance_engagement",
      period: 7,
      score: READING_SCORE,
      scoreable: true,
      withdrawn: false,
    });
    expect(event.payload).not.toHaveProperty("raw");
    expect(event.payload).not.toHaveProperty("rawValue");
    expect(event.payload).not.toHaveProperty("measurement");
    expect(JSON.stringify(event.payload)).not.toContain(String(RAW_VALUE));
  });

  it("says the standing the figure carries and counts what it stands on", () => {
    expect(kpiReadingRecorded(reading).payload).toMatchObject({
      standing: "measured",
      citationCount: 1,
    });
    expect(kpiReadingRecorded(reading).payload).not.toHaveProperty("citations");
  });

  it("reports a figure it could not score as unscoreable rather than sending a zero", () => {
    const event = kpiReadingRecorded(nonsense);
    expect(event.payload.scoreable).toBe(false);
    expect(event.payload.score).toBeNull();
  });

  it("withdraws a figure by sending the same shape with no score left on it", () => {
    const event = kpiReadingWithdrawn(withdrawnReading);
    expect(event.type).toBe(KPI_READING_WITHDRAWN);
    expect(event.payload).toMatchObject({ readingId: reading.id, withdrawn: true, score: null });
    expect(JSON.stringify(event.payload)).not.toContain(READING_WITHDRAWAL);
  });

  it("still says the figure had been scoreable, because that is a coverage fact and not a score", () => {
    expect(kpiReadingWithdrawn(withdrawnReading).payload.scoreable).toBe(true);
  });
});

describe("the events a health index definition produces", () => {
  it("names every transition on the command namespace under its own family", () => {
    expect(indexDefined(draftIndex).type).toBe(INDEX_DEFINED);
    expect(indexReweighted(reweightHealthIndex(draftIndex, REWEIGHTED)).type).toBe(
      INDEX_REWEIGHTED,
    );
    expect(indexRenamed(renameHealthIndex(draftIndex, { name: INDEX_NAME })).type).toBe(
      INDEX_RENAMED,
    );
    expect(indexPublished(liveIndex).type).toBe(INDEX_PUBLISHED);
    expect(indexSuperseded(supersedeHealthIndex(liveIndex, SUCCESSOR)).type).toBe(INDEX_SUPERSEDED);
    expect(indexRetired(retireHealthIndex(draftIndex)).type).toBe(INDEX_RETIRED);
  });

  it("says the composition changed without saying what it changed to", () => {
    const event = indexReweighted(reweightHealthIndex(draftIndex, REWEIGHTED));
    expect(event.payload.weightedPillars).toBe(REWEIGHTED.length);
    expect(event.payload).not.toHaveProperty("weights");
    const wire = JSON.stringify(event.payload);
    for (const figure of WEIGHT_FIGURES) {
      expect(wire).not.toContain(figure);
    }
  });

  it("carries the grain, without which a period ordinal means nothing", () => {
    expect(indexDefined(draftIndex).payload).toMatchObject({
      indexDefinitionId: draftIndex.id,
      indexKey: "institutional.health",
      grain: "term",
      status: "draft",
      published: false,
    });
    expect(indexPublished(liveIndex).payload.published).toBe(true);
  });

  it("names the definition that took over, and null while none has", () => {
    expect(indexDefined(draftIndex).payload.supersededById).toBeNull();
    expect(indexSuperseded(supersedeHealthIndex(liveIndex, SUCCESSOR)).payload.supersededById).toBe(
      SUCCESSOR,
    );
  });

  it("leaves the composition's name and description in the domain", () => {
    const wire = JSON.stringify(indexDefined(draftIndex).payload);
    expect(wire).not.toContain(INDEX_NAME);
    expect(wire).not.toContain(INDEX_DESCRIPTION);
  });
});

describe("the events a health index assessment produces", () => {
  it("names every transition on the command namespace under its own family", () => {
    expect(assessmentComputed(provisional).type).toBe(ASSESSMENT_COMPUTED);
    expect(assessmentFinalized(assessment).type).toBe(ASSESSMENT_FINALIZED);
    expect(assessmentInvalidated(invalidateAssessment(assessment)).type).toBe(
      ASSESSMENT_INVALIDATED,
    );
  });

  it("reports the composite, its band and the digest of the run behind it", () => {
    expect(assessmentComputed(provisional).payload).toMatchObject({
      assessmentId: provisional.id,
      indexDefinitionId: liveIndex.id,
      indexKey: "institutional.health",
      period: 7,
      grain: "term",
      value: CITED_VALUE,
      band: provisional.band,
      fingerprint: provisional.fingerprint,
      status: "provisional",
    });
  });

  it("sends the run's digest and never the run", () => {
    const event = assessmentComputed(provisional);
    expect(event.payload).not.toHaveProperty("run");
    expect(event.payload).not.toHaveProperty("weights");
    expect(event.payload).not.toHaveProperty("inputs");
    expect(event.payload.contributingPillars).toBe(WEIGHTS.length);
    expect(event.payload.omittedPillars).toBe(0);
  });

  it("carries coverage and sufficiency on every event in the series, not only the first", () => {
    for (const event of [
      assessmentComputed(provisional),
      assessmentFinalized(assessment),
      assessmentInvalidated(invalidateAssessment(assessment)),
    ]) {
      expect(event.payload.pillarCoverage).toBe(1);
      expect(event.payload.sufficient).toBe(true);
      expect(event.payload.weightRedistributed).toBe(0);
    }
  });

  it("counts what the evidence audit admitted and what it would not", () => {
    expect(assessmentComputed(provisional).payload).toMatchObject({
      readingsAdmitted: 1,
      readingsRejected: 0,
    });
    expect(assessmentComputed(provisional).payload).not.toHaveProperty("evidence");
  });

  it("says whether the number may yet be quoted, and stops saying so once it is not", () => {
    expect(assessmentComputed(provisional).payload.citable).toBe(true);
    expect(assessmentInvalidated(invalidateAssessment(assessment)).payload.citable).toBe(false);
  });

  it("leaves the invalidation's reason in the domain", () => {
    const event = assessmentInvalidated(invalidateAssessment(assessment, INVALIDATION_REASON));
    expect(event.payload.status).toBe("invalidated");
    expect(JSON.stringify(event.payload)).not.toContain(INVALIDATION_REASON);
  });
});

describe("the events a dashboard produces", () => {
  it("names every transition on the command namespace under its own family", () => {
    expect(dashboardDefined(draftDashboard).type).toBe(DASHBOARD_DEFINED);
    expect(dashboardPanelsSet(setDashboardPanels(draftDashboard, WIDER_PANELS)).type).toBe(
      DASHBOARD_PANELS_SET,
    );
    expect(dashboardRenamed(renameDashboard(draftDashboard, { name: DASHBOARD_NAME })).type).toBe(
      DASHBOARD_RENAMED,
    );
    expect(dashboardPublished(liveDashboard).type).toBe(DASHBOARD_PUBLISHED);
    expect(dashboardArchived(archiveDashboard(liveDashboard)).type).toBe(DASHBOARD_ARCHIVED);
  });

  it("counts the panels and the distinct scopes they need, and sends neither", () => {
    const event = dashboardPanelsSet(setDashboardPanels(draftDashboard, WIDER_PANELS));
    expect(event.payload).toMatchObject({
      dashboardId: draftDashboard.id,
      dashboardKey: "leadership.overview",
      panelCount: 2,
      requiredScopes: 2,
    });
    expect(event.payload).not.toHaveProperty("panels");
    const wire = JSON.stringify(event.payload);
    expect(wire).not.toContain("command:read");
    expect(wire).not.toContain("command:operate");
  });

  it("counts a scope once however many panels ask for it", () => {
    const doubled = setDashboardPanels(draftDashboard, [
      ...PANELS,
      { ...PANELS[0]!, panelKey: "index.series", binding: "index_series" },
    ]);
    expect(dashboardPanelsSet(doubled).payload).toMatchObject({
      panelCount: 2,
      requiredScopes: 1,
    });
  });

  it("says whether the dashboard is open to anybody yet", () => {
    expect(dashboardDefined(draftDashboard).payload.published).toBe(false);
    expect(dashboardPublished(liveDashboard).payload.published).toBe(true);
    expect(dashboardArchived(archiveDashboard(liveDashboard)).payload.published).toBe(false);
  });

  it("leaves the dashboard's name and description in the domain", () => {
    const wire = JSON.stringify(dashboardDefined(draftDashboard).payload);
    expect(wire).not.toContain(DASHBOARD_NAME);
    expect(wire).not.toContain(DASHBOARD_DESCRIPTION);
  });
});

describe("the events an executive briefing produces", () => {
  it("names every transition on the command namespace under its own family", () => {
    expect(briefingDrafted(briefing).type).toBe(BRIEFING_DRAFTED);
    expect(briefingRevised(reviseBriefing(briefing, { title: BRIEFING_TITLE })).type).toBe(
      BRIEFING_REVISED,
    );
    expect(briefingFindingsSet(setBriefingFindings(briefing, [COVERAGE])).type).toBe(
      BRIEFING_FINDINGS_SET,
    );
    expect(briefingIssued(issued).type).toBe(BRIEFING_ISSUED);
    expect(briefingWithdrawn(withdrawBriefing(issued, BRIEFING_WITHDRAWAL)).type).toBe(
      BRIEFING_WITHDRAWN,
    );
  });

  it("routes on the audience scope and carries no figure", () => {
    expect(briefing.cited.value).toBe(CITED_VALUE);

    const event = briefingIssued(issued);
    expect(event.payload.audienceScope).toBe(AUDIENCE);
    expect(event.payload).not.toHaveProperty("cited");
    const wire = JSON.stringify(event.payload);
    expect(wire).not.toContain(String(CITED_VALUE));
    expect(wire).not.toContain(assessment.fingerprint);
  });

  it("points at the assessment rather than repeating it", () => {
    expect(briefingDrafted(briefing).payload).toMatchObject({
      briefingId: briefing.id,
      briefingKey: "board.termly",
      assessmentId: assessment.id,
      indexKey: "institutional.health",
      period: 7,
      status: "drafting",
      issued: false,
    });
    expect(briefingIssued(issued).payload.issued).toBe(true);
  });

  it("counts what leadership was pointed at without restating any of it", () => {
    expect(briefingDrafted(briefing).payload.findingCount).toBe(1);
    expect(
      briefingFindingsSet(setBriefingFindings(briefing, [BREACH, COVERAGE])).payload,
    ).toMatchObject({ findingCount: 2 });
    expect(briefingDrafted(briefing).payload).not.toHaveProperty("findings");
  });

  it("leaves the title, the narrative and the withdrawal's reason in the domain", () => {
    const drafted = JSON.stringify(briefingDrafted(briefing).payload);
    expect(drafted).not.toContain(BRIEFING_TITLE);
    expect(drafted).not.toContain(BRIEFING_NARRATIVE);

    const taken = briefingWithdrawn(withdrawBriefing(issued, BRIEFING_WITHDRAWAL));
    expect(taken.payload.status).toBe("withdrawn");
    expect(JSON.stringify(taken.payload)).not.toContain(BRIEFING_WITHDRAWAL);
  });
});

describe("the events an attention item produces", () => {
  it("names every transition on the command namespace under its own family", () => {
    expect(attentionRaised(item).type).toBe(ATTENTION_RAISED);
    expect(attentionRestated(restateAttentionItem(item, WORSE)).type).toBe(ATTENTION_RESTATED);
    expect(attentionAcknowledged(acknowledgeAttentionItem(item, ACKNOWLEDGER)).type).toBe(
      ATTENTION_ACKNOWLEDGED,
    );
    expect(attentionResolved(resolveAttentionItem(item, RESOLVER)).type).toBe(ATTENTION_RESOLVED);
    expect(attentionDismissed(dismissAttentionItem(item, DISMISSER, DISMISSAL_REASON)).type).toBe(
      ATTENTION_DISMISSED,
    );
  });

  it("carries the finding's stable key, so two runs over the same arithmetic agree", () => {
    expect(attentionRaised(item).payload).toMatchObject({
      attentionItemId: item.id,
      assessmentId: assessment.id,
      indexKey: "institutional.health",
      period: 7,
      key: BREACH.key,
      reason: "band_breach",
      subjectKind: "pillar",
      subject: "financial_health",
      observed: 1,
    });
  });

  it("distinguishes a new finding from one that was seen again at a worse severity", () => {
    expect(attentionRaised(item).payload.severity).toBe("advisory");
    expect(attentionRestated(restateAttentionItem(item, WORSE)).payload.severity).toBe("critical");
  });

  it("says whether the finding is still somebody's to answer", () => {
    expect(attentionRaised(item).payload).toMatchObject({ status: "open", open: true });
    expect(
      attentionAcknowledged(acknowledgeAttentionItem(item, ACKNOWLEDGER)).payload,
    ).toMatchObject({ status: "acknowledged", open: true });
    expect(attentionResolved(resolveAttentionItem(item, RESOLVER)).payload).toMatchObject({
      status: "resolved",
      open: false,
    });
  });

  it("says a person picked it up without saying which person", () => {
    const picked = attentionAcknowledged(acknowledgeAttentionItem(item, ACKNOWLEDGER));
    expect(picked.payload).not.toHaveProperty("acknowledgedBy");
    expect(JSON.stringify(picked.payload)).not.toContain(ACKNOWLEDGER);

    const closed = attentionResolved(resolveAttentionItem(item, RESOLVER, RESOLUTION_NOTE));
    expect(closed.payload).not.toHaveProperty("closedBy");
    expect(closed.payload).not.toHaveProperty("closureNote");
    const wire = JSON.stringify(closed.payload);
    expect(wire).not.toContain(RESOLVER);
    expect(wire).not.toContain(RESOLUTION_NOTE);
  });

  it("leaves the dismissal's reason in the domain, compulsory though it is", () => {
    const event = attentionDismissed(dismissAttentionItem(item, DISMISSER, DISMISSAL_REASON));
    expect(event.payload).toMatchObject({ status: "dismissed", open: false });
    expect(JSON.stringify(event.payload)).not.toContain(DISMISSAL_REASON);
  });
});

describe("what never leaves this domain", () => {
  const everyEvent = (): readonly DomainEvent[] => [
    kpiDefined(draftKpi),
    kpiRescaled(reviseKpiScale(draftKpi, scale)),
    kpiRenamed(renameKpi(draftKpi, { name: KPI_NAME, description: KPI_DESCRIPTION })),
    kpiRetargeted(retargetKpi(draftKpi, 90)),
    kpiActivated(liveKpi),
    kpiRetired(retireKpi(liveKpi)),
    kpiReadingRecorded(reading),
    kpiReadingRecorded(nonsense),
    kpiReadingWithdrawn(withdrawnReading),
    indexDefined(draftIndex),
    indexReweighted(reweightHealthIndex(draftIndex, REWEIGHTED)),
    indexRenamed(
      renameHealthIndex(draftIndex, { name: INDEX_NAME, description: INDEX_DESCRIPTION }),
    ),
    indexPublished(liveIndex),
    indexSuperseded(supersedeHealthIndex(liveIndex, SUCCESSOR)),
    indexRetired(retireHealthIndex(draftIndex)),
    assessmentComputed(provisional),
    assessmentFinalized(assessment),
    assessmentInvalidated(invalidateAssessment(assessment, INVALIDATION_REASON)),
    dashboardDefined(draftDashboard),
    dashboardPanelsSet(setDashboardPanels(draftDashboard, WIDER_PANELS)),
    dashboardRenamed(
      renameDashboard(draftDashboard, {
        name: DASHBOARD_NAME,
        description: DASHBOARD_DESCRIPTION,
      }),
    ),
    dashboardPublished(liveDashboard),
    dashboardArchived(archiveDashboard(liveDashboard)),
    briefingDrafted(briefing),
    briefingRevised(
      reviseBriefing(briefing, { title: BRIEFING_TITLE, narrative: BRIEFING_NARRATIVE }),
    ),
    briefingFindingsSet(setBriefingFindings(briefing, [BREACH, COVERAGE])),
    briefingIssued(issued),
    briefingWithdrawn(withdrawBriefing(issued, BRIEFING_WITHDRAWAL)),
    attentionRaised(item),
    attentionRestated(restateAttentionItem(item, WORSE)),
    attentionAcknowledged(acknowledgeAttentionItem(item, ACKNOWLEDGER)),
    attentionResolved(resolveAttentionItem(item, RESOLVER, RESOLUTION_NOTE)),
    attentionDismissed(dismissAttentionItem(item, DISMISSER, DISMISSAL_REASON)),
  ];

  const DECLARED = [
    KPI_DEFINED,
    KPI_RESCALED,
    KPI_RENAMED,
    KPI_RETARGETED,
    KPI_ACTIVATED,
    KPI_RETIRED,
    KPI_READING_RECORDED,
    KPI_READING_WITHDRAWN,
    INDEX_DEFINED,
    INDEX_REWEIGHTED,
    INDEX_RENAMED,
    INDEX_PUBLISHED,
    INDEX_SUPERSEDED,
    INDEX_RETIRED,
    ASSESSMENT_COMPUTED,
    ASSESSMENT_FINALIZED,
    ASSESSMENT_INVALIDATED,
    DASHBOARD_DEFINED,
    DASHBOARD_PANELS_SET,
    DASHBOARD_RENAMED,
    DASHBOARD_PUBLISHED,
    DASHBOARD_ARCHIVED,
    BRIEFING_DRAFTED,
    BRIEFING_REVISED,
    BRIEFING_FINDINGS_SET,
    BRIEFING_ISSUED,
    BRIEFING_WITHDRAWN,
    ATTENTION_RAISED,
    ATTENTION_RESTATED,
    ATTENTION_ACKNOWLEDGED,
    ATTENTION_RESOLVED,
    ATTENTION_DISMISSED,
  ];

  it("puts no free text on the wire, on any event this module can produce", () => {
    const wire = JSON.stringify(everyEvent().map((event) => event.payload));
    for (const text of FREE_TEXT) {
      expect(wire).not.toContain(text);
    }
  });

  it("puts no person on the wire, on any event this module can produce", () => {
    const wire = JSON.stringify(everyEvent().map((event) => event.payload));
    for (const person of PEOPLE) {
      expect(wire).not.toContain(person);
    }
  });

  it("puts no raw measure and no weight on the wire, on any event this module can produce", () => {
    const wire = JSON.stringify(everyEvent().map((event) => event.payload));
    expect(wire).not.toContain(String(RAW_VALUE));
    for (const figure of WEIGHT_FIGURES) {
      expect(wire).not.toContain(figure);
    }
  });

  it("scopes every event to the tenant it happened in", () => {
    for (const event of everyEvent()) {
      expect(event.metadata.tenantId).toBe(TENANT);
    }
  });

  it("names every event under the command namespace", () => {
    for (const event of everyEvent()) {
      expect(event.type).toMatch(/^command\.[a-z_]+\.[a-z_]+$/);
    }
  });

  it("mints a distinct event id for every broadcast", () => {
    const events = everyEvent();
    const ids = new Set(events.map((event) => event.metadata.eventId));
    expect(ids.size).toBe(events.length);
  });

  it("produces every event this contract declares, and no other", () => {
    const produced = new Set(everyEvent().map((event) => event.type));
    expect(produced).toEqual(new Set(DECLARED));
    expect(DECLARED.length).toBe(new Set(DECLARED).size);
  });
});
