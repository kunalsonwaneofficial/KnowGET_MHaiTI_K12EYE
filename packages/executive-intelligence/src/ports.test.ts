import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { attentionKeyFor } from "./attention";
import {
  acknowledgeAttentionItem,
  dismissAttentionItem,
  raiseAttentionItem,
  resolveAttentionItem,
} from "./attention-item";
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
import { type Dashboard, archiveDashboard, defineDashboard, publishDashboard } from "./dashboard";
import {
  type ExecutiveBriefing,
  draftBriefing,
  issueBriefing,
  withdrawBriefing,
} from "./executive-briefing";
import {
  type HealthIndexAssessment,
  assessHealthIndex,
  finalizeAssessment,
  invalidateAssessment,
} from "./health-index-assessment";
import {
  type HealthIndexDefinition,
  defineHealthIndex,
  publishHealthIndex,
  supersedeHealthIndex,
} from "./health-index-definition";
import { type KpiDefinition, activateKpi, defineKpi, retireKpi } from "./kpi-definition";
import { type KpiReading, recordKpiReading, withdrawKpiReading } from "./kpi-reading";
import {
  InMemoryAttentionItemRepository,
  InMemoryDashboardRepository,
  InMemoryExecutiveBriefingRepository,
  InMemoryHealthIndexAssessmentRepository,
  InMemoryHealthIndexDefinitionRepository,
  InMemoryKpiDefinitionRepository,
  InMemoryKpiReadingRepository,
} from "./ports";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org1" as Uuid;
const SIBLING = "org2" as Uuid;
const ACTOR = "user-1" as Uuid;
const SUCCESSOR = "def-2" as Uuid;

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

const cite = (ref: string): EvidenceCitation => ({
  kind: "domain_record",
  sourceDomain: "attendance",
  sourceRef: ref,
  attestedBy: null,
});

const kpi = (
  tenantId: TenantId = TENANT,
  kpiKey = "attendance.rate",
  organizationId: Uuid = ORG,
): KpiDefinition =>
  activateKpi(
    defineKpi({
      tenantId,
      organizationId,
      kpiKey,
      name: "Attendance rate",
      pillar: "attendance_engagement",
      sourceDomain: "attendance",
      scale,
      targetScore: 80,
    }),
  );

const reading = (definition: KpiDefinition, period: number, rawValue = 94): KpiReading =>
  recordKpiReading(definition, { period, rawValue, citations: [cite(`rec-${period}`)] });

const WEIGHTS: readonly PillarWeight[] = [
  { pillar: "academic_outcomes", weight: 0.25 },
  { pillar: "teaching_quality", weight: 0.2 },
  { pillar: "attendance_engagement", weight: 0.2 },
  { pillar: "financial_health", weight: 0.15 },
  { pillar: "learner_wellbeing", weight: 0.1 },
  { pillar: "workforce_capacity", weight: 0.1 },
];

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
  { kpiKey: "attendance.rate", period: 7, citations: [cite("attendance.rate")] },
];

const index = (
  tenantId: TenantId = TENANT,
  indexKey = "institutional.health",
): HealthIndexDefinition =>
  defineHealthIndex({
    tenantId,
    organizationId: ORG,
    indexKey,
    name: "Institutional health",
    grain: "term",
    weights: WEIGHTS,
  });

const assessment = (
  period = 7,
  tenantId: TenantId = TENANT,
  indexKey = "institutional.health",
): HealthIndexAssessment =>
  assessHealthIndex(publishHealthIndex(index(tenantId, indexKey)), {
    period,
    inputs: FULL,
    readings: GROUNDED.map((entry) => ({ ...entry, period })),
  });

const finalized = (
  period = 7,
  tenantId: TenantId = TENANT,
  indexKey = "institutional.health",
): HealthIndexAssessment => finalizeAssessment(assessment(period, tenantId, indexKey));

const PANELS: readonly DashboardPanel[] = [
  {
    panelKey: "index.score",
    binding: "index_score",
    requiredScope: "command:read",
    kpiKey: null,
    pillar: null,
  },
];

const dashboard = (
  tenantId: TenantId = TENANT,
  dashboardKey = "leadership.overview",
  organizationId: Uuid = ORG,
): Dashboard =>
  defineDashboard({
    tenantId,
    organizationId,
    dashboardKey,
    name: "Leadership overview",
    panels: PANELS,
  });

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
const COVERAGE = finding("coverage_gap", "urgent", "index", "");

const briefing = (source: HealthIndexAssessment, briefingKey = "board.termly"): ExecutiveBriefing =>
  draftBriefing(source, {
    briefingKey,
    title: "Termly institutional health",
    audienceScope: "command:brief",
    findings: [BREACH],
  });

describe("KPI definition storage", () => {
  it("returns nothing for another tenant's definition", async () => {
    const repository = new InMemoryKpiDefinitionRepository();
    const mine = kpi();
    await repository.save(mine);

    expect(await repository.findById(TENANT, mine.id)).toEqual(mine);
    expect(await repository.findById(OTHER, mine.id)).toBeNull();
  });

  it("finds a definition by the key everything else addresses it through", async () => {
    const repository = new InMemoryKpiDefinitionRepository();
    await repository.save(kpi());

    expect((await repository.findByKey(TENANT, "attendance.rate"))?.kpiKey).toBe("attendance.rate");
    expect(await repository.findByKey(TENANT, "attendance.punctuality")).toBeNull();
    expect(await repository.findByKey(OTHER, "attendance.rate")).toBeNull();
  });

  it("counts only active indicators as what a pillar declares", async () => {
    const repository = new InMemoryKpiDefinitionRepository();
    const drafted = defineKpi({
      tenantId: TENANT,
      organizationId: ORG,
      kpiKey: "attendance.punctuality",
      name: "Punctuality",
      pillar: "attendance_engagement",
      sourceDomain: "attendance",
      scale,
      targetScore: null,
    });
    await repository.save(kpi());
    await repository.save(drafted);
    await repository.save(retireKpi(kpi(TENANT, "attendance.retired")));

    const active = await repository.listActive(TENANT, ORG);
    expect(active.map((entry) => entry.kpiKey)).toEqual(["attendance.rate"]);
  });

  it("keeps one organization's indicators out of another's denominator", async () => {
    const repository = new InMemoryKpiDefinitionRepository();
    await repository.save(kpi());
    await repository.save(kpi(TENANT, "finance.days", SIBLING));

    expect(await repository.listActive(TENANT, ORG)).toHaveLength(1);
    expect(await repository.listActive(TENANT, SIBLING)).toHaveLength(1);
  });

  it("replaces a definition in place rather than accumulating versions of it", async () => {
    const repository = new InMemoryKpiDefinitionRepository();
    const active = kpi();
    await repository.save(active);
    await repository.save(retireKpi(active));

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect((await repository.findById(TENANT, active.id))?.status).toBe("retired");
  });

  it("lists a tenant's definitions and nobody else's", async () => {
    const repository = new InMemoryKpiDefinitionRepository();
    await repository.save(kpi());
    await repository.save(kpi(OTHER));

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect(await repository.listByTenant(OTHER)).toHaveLength(1);
  });
});

describe("KPI reading storage", () => {
  it("returns nothing for another tenant's reading", async () => {
    const repository = new InMemoryKpiReadingRepository();
    const recorded = reading(kpi(), 7);
    await repository.save(recorded);

    expect(await repository.findById(TENANT, recorded.id)).toEqual(recorded);
    expect(await repository.findById(OTHER, recorded.id)).toBeNull();
  });

  it("finds the standing reading an indicator filed at a period", async () => {
    const repository = new InMemoryKpiReadingRepository();
    const definition = kpi();
    await repository.save(reading(definition, 7));

    const found = await repository.findByKpiAndPeriod(TENANT, definition.id, 7);
    expect(found?.period).toBe(7);
    expect(await repository.findByKpiAndPeriod(TENANT, definition.id, 6)).toBeNull();
  });

  it("stops finding a reading the institution withdrew", async () => {
    const repository = new InMemoryKpiReadingRepository();
    const definition = kpi();
    const recorded = reading(definition, 7);
    await repository.save(withdrawKpiReading(recorded, "double counted"));

    expect(await repository.findByKpiAndPeriod(TENANT, definition.id, 7)).toBeNull();
    expect(await repository.findById(TENANT, recorded.id)).not.toBeNull();
  });

  it("takes the most recent period as an indicator's current figure", async () => {
    const repository = new InMemoryKpiReadingRepository();
    const definition = kpi();
    await repository.save(reading(definition, 5));
    await repository.save(reading(definition, 7));
    await repository.save(reading(definition, 6));

    const latest = await repository.listLatestPerKpi(TENANT, ORG);
    expect(latest).toHaveLength(1);
    expect(latest[0]?.period).toBe(7);
  });

  it("hands an old reading to the engine rather than deciding staleness itself", async () => {
    const repository = new InMemoryKpiReadingRepository();
    await repository.save(reading(kpi(), 1));

    const latest = await repository.listLatestPerKpi(TENANT, ORG);
    expect(latest.map((entry) => entry.period)).toEqual([1]);
  });

  it("leaves a withdrawn reading out of what an assessment would count", async () => {
    const repository = new InMemoryKpiReadingRepository();
    const definition = kpi();
    const stale = reading(definition, 5);
    await repository.save(stale);
    await repository.save(withdrawKpiReading(reading(definition, 7), "double counted"));

    const latest = await repository.listLatestPerKpi(TENANT, ORG);
    expect(latest.map((entry) => entry.id)).toEqual([stale.id]);
  });

  it("returns one current figure for each indicator that has one", async () => {
    const repository = new InMemoryKpiReadingRepository();
    const attendance = kpi();
    const finance = kpi(TENANT, "finance.days");
    await repository.save(reading(attendance, 7));
    await repository.save(reading(finance, 7));

    expect(await repository.listLatestPerKpi(TENANT, ORG)).toHaveLength(2);
  });

  it("returns one indicator's whole series oldest first", async () => {
    const repository = new InMemoryKpiReadingRepository();
    const definition = kpi();
    await repository.save(reading(definition, 7));
    await repository.save(reading(definition, 5));
    await repository.save(withdrawKpiReading(reading(definition, 6), "double counted"));

    const series = await repository.listByKpi(TENANT, definition.id);
    expect(series.map((entry) => entry.period)).toEqual([5, 6, 7]);
  });

  it("replaces a reading in place when it is withdrawn", async () => {
    const repository = new InMemoryKpiReadingRepository();
    const recorded = reading(kpi(), 7);
    await repository.save(recorded);
    await repository.save(withdrawKpiReading(recorded, "double counted"));

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
  });
});

describe("health index definition storage", () => {
  it("returns nothing for another tenant's definition", async () => {
    const repository = new InMemoryHealthIndexDefinitionRepository();
    const mine = index();
    await repository.save(mine);

    expect(await repository.findById(TENANT, mine.id)).toEqual(mine);
    expect(await repository.findById(OTHER, mine.id)).toBeNull();
  });

  it("answers which composition an institution is currently measuring itself under", async () => {
    const repository = new InMemoryHealthIndexDefinitionRepository();
    const published = publishHealthIndex(index());
    await repository.save(supersedeHealthIndex(published, SUCCESSOR));
    await repository.save(publishHealthIndex(index()));

    const current = await repository.findPublishedByKey(TENANT, "institutional.health");
    expect(current?.status).toBe("published");
    expect(current?.supersededById).toBeNull();
  });

  it("has no published composition while the institution is still drafting one", async () => {
    const repository = new InMemoryHealthIndexDefinitionRepository();
    await repository.save(index());

    expect(await repository.findPublishedByKey(TENANT, "institutional.health")).toBeNull();
  });

  it("returns every composition a series has ever been measured under", async () => {
    const repository = new InMemoryHealthIndexDefinitionRepository();
    await repository.save(supersedeHealthIndex(publishHealthIndex(index()), SUCCESSOR));
    await repository.save(publishHealthIndex(index()));
    await repository.save(publishHealthIndex(index(TENANT, "safeguarding.health")));

    expect(await repository.listByKey(TENANT, "institutional.health")).toHaveLength(2);
    expect(await repository.listByKey(TENANT, "safeguarding.health")).toHaveLength(1);
  });

  it("keeps a superseded composition readable, because assessments still point at it", async () => {
    const repository = new InMemoryHealthIndexDefinitionRepository();
    const published = publishHealthIndex(index());
    await repository.save(supersedeHealthIndex(published, SUCCESSOR));

    const still = await repository.findById(TENANT, published.id);
    expect(still?.status).toBe("superseded");
    expect(still?.weights).toEqual(WEIGHTS);
  });

  it("lists a tenant's definitions and nobody else's", async () => {
    const repository = new InMemoryHealthIndexDefinitionRepository();
    await repository.save(index());
    await repository.save(index(OTHER));

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect(await repository.listByTenant(OTHER)).toHaveLength(1);
  });
});

describe("health index assessment storage", () => {
  it("returns nothing for another tenant's assessment", async () => {
    const repository = new InMemoryHealthIndexAssessmentRepository();
    const mine = assessment();
    await repository.save(mine);

    expect(await repository.findById(TENANT, mine.id)).toEqual(mine);
    expect(await repository.findById(OTHER, mine.id)).toBeNull();
  });

  it("finds the assessment a series filed at a period", async () => {
    const repository = new InMemoryHealthIndexAssessmentRepository();
    await repository.save(assessment(7));

    expect((await repository.findByIndexAndPeriod(TENANT, "institutional.health", 7))?.period).toBe(
      7,
    );
    expect(await repository.findByIndexAndPeriod(TENANT, "institutional.health", 6)).toBeNull();
  });

  it("returns the periods behind one, oldest first", async () => {
    const repository = new InMemoryHealthIndexAssessmentRepository();
    await repository.save(assessment(7));
    await repository.save(assessment(4));
    await repository.save(assessment(6));
    await repository.save(assessment(5));

    const history = await repository.listBeforePeriod(TENANT, "institutional.health", 7);
    expect(history.map((entry) => entry.period)).toEqual([4, 5, 6]);
  });

  it("gives the previous period and the run behind it from one read", async () => {
    const repository = new InMemoryHealthIndexAssessmentRepository();
    await repository.save(assessment(5));
    await repository.save(assessment(6));
    await repository.save(assessment(7));

    const history = await repository.listBeforePeriod(TENANT, "institutional.health", 7);
    expect(history[history.length - 1]?.period).toBe(6);
    expect(history.map((entry) => entry.period)).toEqual([5, 6]);
  });

  it("does not count the period being assessed as part of its own history", async () => {
    const repository = new InMemoryHealthIndexAssessmentRepository();
    await repository.save(assessment(7));

    expect(await repository.listBeforePeriod(TENANT, "institutional.health", 7)).toEqual([]);
  });

  it("leaves an invalidated assessment out of the run a decline is measured on", async () => {
    const repository = new InMemoryHealthIndexAssessmentRepository();
    const broken = assessment(5);
    await repository.save(invalidateAssessment(broken, "readings withdrawn"));
    await repository.save(assessment(6));

    const history = await repository.listBeforePeriod(TENANT, "institutional.health", 7);
    expect(history.map((entry) => entry.period)).toEqual([6]);
    expect(await repository.findById(TENANT, broken.id)).not.toBeNull();
  });

  it("keeps two series' histories apart", async () => {
    const repository = new InMemoryHealthIndexAssessmentRepository();
    await repository.save(assessment(5));
    await repository.save(assessment(5, TENANT, "safeguarding.health"));

    expect(await repository.listBeforePeriod(TENANT, "institutional.health", 7)).toHaveLength(1);
    expect(await repository.listBeforePeriod(TENANT, "safeguarding.health", 7)).toHaveLength(1);
  });

  it("lists a tenant's assessments and nobody else's", async () => {
    const repository = new InMemoryHealthIndexAssessmentRepository();
    await repository.save(assessment(7));
    await repository.save(assessment(7, OTHER));

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect(await repository.listByTenant(OTHER)).toHaveLength(1);
  });
});

describe("dashboard storage", () => {
  it("returns nothing for another tenant's dashboard", async () => {
    const repository = new InMemoryDashboardRepository();
    const mine = dashboard();
    await repository.save(mine);

    expect(await repository.findById(TENANT, mine.id)).toEqual(mine);
    expect(await repository.findById(OTHER, mine.id)).toBeNull();
  });

  it("finds a dashboard by the key a saved link resolves through", async () => {
    const repository = new InMemoryDashboardRepository();
    await repository.save(dashboard());

    expect((await repository.findByKey(TENANT, "leadership.overview"))?.name).toBe(
      "Leadership overview",
    );
    expect(await repository.findByKey(OTHER, "leadership.overview")).toBeNull();
  });

  it("offers only what a viewer could actually open", async () => {
    const repository = new InMemoryDashboardRepository();
    await repository.save(publishDashboard(dashboard()));
    await repository.save(dashboard(TENANT, "leadership.draft"));
    await repository.save(archiveDashboard(publishDashboard(dashboard(TENANT, "leadership.old"))));

    const open = await repository.listPublished(TENANT, ORG);
    expect(open.map((entry) => entry.dashboardKey)).toEqual(["leadership.overview"]);
  });

  it("keeps one organization's dashboards off another's list", async () => {
    const repository = new InMemoryDashboardRepository();
    await repository.save(publishDashboard(dashboard()));
    await repository.save(publishDashboard(dashboard(TENANT, "site.overview", SIBLING)));

    expect(await repository.listPublished(TENANT, ORG)).toHaveLength(1);
    expect(await repository.listPublished(TENANT, SIBLING)).toHaveLength(1);
  });

  it("keeps an archived dashboard readable, because what was looked at is worth knowing", async () => {
    const repository = new InMemoryDashboardRepository();
    const published = publishDashboard(dashboard());
    await repository.save(archiveDashboard(published));

    const still = await repository.findById(TENANT, published.id);
    expect(still?.status).toBe("archived");
    expect(still?.panels).toEqual(PANELS);
  });

  it("lists a tenant's dashboards and nobody else's", async () => {
    const repository = new InMemoryDashboardRepository();
    await repository.save(dashboard());
    await repository.save(dashboard(OTHER));

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect(await repository.listByTenant(OTHER)).toHaveLength(1);
  });
});

describe("executive briefing storage", () => {
  it("returns nothing for another tenant's briefing", async () => {
    const repository = new InMemoryExecutiveBriefingRepository();
    const mine = briefing(finalized());
    await repository.save(mine);

    expect(await repository.findById(TENANT, mine.id)).toEqual(mine);
    expect(await repository.findById(OTHER, mine.id)).toBeNull();
  });

  it("finds a briefing by its key", async () => {
    const repository = new InMemoryExecutiveBriefingRepository();
    await repository.save(briefing(finalized()));

    expect((await repository.findByKey(TENANT, "board.termly"))?.title).toBe(
      "Termly institutional health",
    );
    expect(await repository.findByKey(OTHER, "board.termly")).toBeNull();
  });

  it("offers only what the institution currently stands behind", async () => {
    const repository = new InMemoryExecutiveBriefingRepository();
    const source = finalized();
    await repository.save(issueBriefing(briefing(source), source));
    await repository.save(briefing(source, "board.draft"));
    const old = issueBriefing(briefing(source, "board.old"), source);
    await repository.save(withdrawBriefing(old, "wrong"));

    const issued = await repository.listIssued(TENANT, ORG);
    expect(issued.map((entry) => entry.briefingKey)).toEqual(["board.termly"]);
  });

  it("keeps a withdrawn briefing resolvable, so a board minute citing it still lands", async () => {
    const repository = new InMemoryExecutiveBriefingRepository();
    const source = finalized();
    const issued = issueBriefing(briefing(source), source);
    await repository.save(withdrawBriefing(issued, "figures restated"));

    const still = await repository.findById(TENANT, issued.id);
    expect(still?.status).toBe("withdrawn");
    expect(still?.withdrawalReason).toBe("figures restated");
  });

  it("finds every briefing that cited one figure", async () => {
    const repository = new InMemoryExecutiveBriefingRepository();
    const source = finalized();
    await repository.save(briefing(source));
    await repository.save(briefing(source, "board.summary"));
    await repository.save(briefing(finalized(6), "board.previous"));

    expect(await repository.listByAssessment(TENANT, source.id)).toHaveLength(2);
  });

  it("lists a tenant's briefings and nobody else's", async () => {
    const repository = new InMemoryExecutiveBriefingRepository();
    await repository.save(briefing(finalized()));
    await repository.save(briefing(finalized(7, OTHER)));

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect(await repository.listByTenant(OTHER)).toHaveLength(1);
  });
});

describe("attention item storage", () => {
  it("returns nothing for another tenant's item", async () => {
    const repository = new InMemoryAttentionItemRepository();
    const mine = raiseAttentionItem(assessment(), BREACH);
    await repository.save(mine);

    expect(await repository.findById(TENANT, mine.id)).toEqual(mine);
    expect(await repository.findById(OTHER, mine.id)).toBeNull();
  });

  it("finds an item by the compound identity that makes raising it twice idempotent", async () => {
    const repository = new InMemoryAttentionItemRepository();
    const source = assessment();
    await repository.save(raiseAttentionItem(source, BREACH));

    expect((await repository.findByAssessmentAndKey(TENANT, source.id, BREACH.key))?.reason).toBe(
      "band_breach",
    );
    expect(await repository.findByAssessmentAndKey(TENANT, source.id, COVERAGE.key)).toBeNull();
  });

  it("does not confuse the same finding raised by two periods", async () => {
    const repository = new InMemoryAttentionItemRepository();
    const seventh = assessment(7);
    const sixth = assessment(6);
    await repository.save(raiseAttentionItem(seventh, BREACH));
    await repository.save(raiseAttentionItem(sixth, BREACH));

    expect((await repository.findByAssessmentAndKey(TENANT, seventh.id, BREACH.key))?.period).toBe(
      7,
    );
    expect((await repository.findByAssessmentAndKey(TENANT, sixth.id, BREACH.key))?.period).toBe(6);
  });

  it("returns everything one period's arithmetic raised", async () => {
    const repository = new InMemoryAttentionItemRepository();
    const source = assessment();
    await repository.save(raiseAttentionItem(source, BREACH));
    await repository.save(raiseAttentionItem(source, COVERAGE));
    await repository.save(raiseAttentionItem(assessment(6), BREACH));

    expect(await repository.listByAssessment(TENANT, source.id)).toHaveLength(2);
  });

  it("leaves an acknowledged item in the queue, because it is still asking for something", async () => {
    const repository = new InMemoryAttentionItemRepository();
    const raised = raiseAttentionItem(assessment(), BREACH);
    await repository.save(acknowledgeAttentionItem(raised, ACTOR));

    const queue = await repository.listOpen(TENANT, ORG);
    expect(queue.map((entry) => entry.status)).toEqual(["acknowledged"]);
  });

  it("takes a resolved or dismissed item out of the queue", async () => {
    const repository = new InMemoryAttentionItemRepository();
    const source = assessment();
    await repository.save(resolveAttentionItem(raiseAttentionItem(source, BREACH), ACTOR));
    await repository.save(
      dismissAttentionItem(raiseAttentionItem(source, COVERAGE), ACTOR, "known and accepted"),
    );

    expect(await repository.listOpen(TENANT, ORG)).toEqual([]);
  });

  it("keeps a dismissed finding readable with the judgement that closed it", async () => {
    const repository = new InMemoryAttentionItemRepository();
    const raised = raiseAttentionItem(assessment(), BREACH);
    await repository.save(dismissAttentionItem(raised, ACTOR, "known and accepted"));

    const still = await repository.findById(TENANT, raised.id);
    expect(still?.status).toBe("dismissed");
    expect(still?.closureNote).toBe("known and accepted");
  });

  it("replaces an item in place as it moves through the queue", async () => {
    const repository = new InMemoryAttentionItemRepository();
    const raised = raiseAttentionItem(assessment(), BREACH);
    await repository.save(raised);
    await repository.save(acknowledgeAttentionItem(raised, ACTOR));

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
  });

  it("lists a tenant's items and nobody else's", async () => {
    const repository = new InMemoryAttentionItemRepository();
    await repository.save(raiseAttentionItem(assessment(), BREACH));
    await repository.save(raiseAttentionItem(assessment(7, OTHER), BREACH));

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect(await repository.listByTenant(OTHER)).toHaveLength(1);
  });
});

describe("what no repository in this contract offers", () => {
  const repositories = [
    new InMemoryKpiDefinitionRepository(),
    new InMemoryKpiReadingRepository(),
    new InMemoryHealthIndexDefinitionRepository(),
    new InMemoryHealthIndexAssessmentRepository(),
    new InMemoryDashboardRepository(),
    new InMemoryExecutiveBriefingRepository(),
    new InMemoryAttentionItemRepository(),
  ];

  it("gives nobody a way to delete a measurement, a finding or a judgement", () => {
    for (const repository of repositories) {
      expect(repository).not.toHaveProperty("remove");
      expect(Object.getPrototypeOf(repository)).not.toHaveProperty("remove");
    }
  });
});
