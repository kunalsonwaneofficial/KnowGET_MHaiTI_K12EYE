import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  ASSESSMENT_COMPUTED,
  ASSESSMENT_FINALIZED,
  ASSESSMENT_INVALIDATED,
} from "./command-events";
import type { HealthPillar } from "./command-value";
import type { EvidenceCitation, MeasurementScale, PillarWeight } from "./command-view";
import {
  AssessmentAlreadyInvalidatedError,
  AssessmentNotProvisionalError,
  DuplicateAssessmentError,
  HealthIndexAssessmentNotFoundError,
  InsufficientAssessmentCoverageError,
  NoPublishedIndexError,
  UngroundedAssessmentError,
} from "./errors";
import { HealthIndexAssessmentService } from "./health-index-assessment-service";
import {
  type DefineHealthIndexParams,
  defineHealthIndex,
  publishHealthIndex,
} from "./health-index-definition";
import { type KpiDefinition, activateKpi, defineKpi, retireKpi } from "./kpi-definition";
import { recordKpiReading, withdrawKpiReading } from "./kpi-reading";
import {
  type HealthIndexAssessmentRepository,
  type HealthIndexDefinitionRepository,
  InMemoryHealthIndexAssessmentRepository,
  InMemoryHealthIndexDefinitionRepository,
  InMemoryKpiDefinitionRepository,
  InMemoryKpiReadingRepository,
  type KpiReadingRepository,
} from "./ports";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org1" as Uuid;
const SIBLING = "org2" as Uuid;
const MISSING = "assessment-nowhere" as Uuid;
const KEY = "institutional.health";
const PERIOD = 7;

const WEIGHTS: readonly PillarWeight[] = [
  { pillar: "academic_outcomes", weight: 0.25 },
  { pillar: "teaching_quality", weight: 0.2 },
  { pillar: "attendance_engagement", weight: 0.2 },
  { pillar: "financial_health", weight: 0.15 },
  { pillar: "learner_wellbeing", weight: 0.1 },
  { pillar: "workforce_capacity", weight: 0.1 },
];

const scale: MeasurementScale = {
  unit: "percentage",
  polarity: "higher_is_better",
  anchors: [
    { value: 85, score: 0 },
    { value: 90, score: 50 },
    { value: 96, score: 100 },
  ],
};

interface Indicator {
  readonly kpiKey: string;
  readonly pillar: HealthPillar;
  readonly sourceDomain: string;
}

/** One indicator per declared pillar, so a pillar's KPI coverage is all-or-nothing and easy to reason about. */
const INDICATORS: readonly Indicator[] = [
  { kpiKey: "academic.progress", pillar: "academic_outcomes", sourceDomain: "assessment" },
  { kpiKey: "teaching.observation", pillar: "teaching_quality", sourceDomain: "faculty" },
  { kpiKey: "attendance.rate", pillar: "attendance_engagement", sourceDomain: "attendance" },
  { kpiKey: "finance.surplus", pillar: "financial_health", sourceDomain: "financial" },
  { kpiKey: "wellbeing.index", pillar: "learner_wellbeing", sourceDomain: "wellbeing" },
  { kpiKey: "workforce.retention", pillar: "workforce_capacity", sourceDomain: "workforce" },
];

const ALL = INDICATORS.map((indicator) => indicator.kpiKey);

const cite = (sourceRef: string, sourceDomain: string): EvidenceCitation => ({
  kind: "domain_record",
  sourceDomain,
  sourceRef,
  attestedBy: null,
});

const indexParams = (
  overrides: Partial<DefineHealthIndexParams> = {},
): DefineHealthIndexParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  indexKey: KEY,
  name: "Institutional health",
  grain: "term",
  weights: WEIGHTS,
  ...overrides,
});

const indicatorFor = (kpiKey: string, organizationId = ORG): KpiDefinition => {
  const indicator = INDICATORS.find((entry) => entry.kpiKey === kpiKey);
  if (!indicator) throw new Error(`No fixture indicator named "${kpiKey}"`);
  return activateKpi(
    defineKpi({
      tenantId: TENANT,
      organizationId,
      kpiKey: indicator.kpiKey,
      name: indicator.kpiKey,
      pillar: indicator.pillar,
      sourceDomain: indicator.sourceDomain,
      scale,
      targetScore: 80,
    }),
  );
};

class Recorder {
  readonly published: DomainEvent[] = [];

  async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
  }

  get types(): string[] {
    return this.published.map((event) => event.type);
  }
}

/** Counts how often the institution's indicator list is walked, which is what gathering costs. */
class CountingKpis extends InMemoryKpiDefinitionRepository {
  walks = 0;

  override async listActive(tenantId: TenantId, organizationId: Uuid): Promise<KpiDefinition[]> {
    this.walks += 1;
    return super.listActive(tenantId, organizationId);
  }
}

interface Harness {
  readonly service: HealthIndexAssessmentService;
  readonly repository: HealthIndexAssessmentRepository;
  readonly definitions: HealthIndexDefinitionRepository;
  readonly kpis: CountingKpis;
  readonly readings: KpiReadingRepository;
  readonly events: Recorder;
}

const harness = (): Harness => {
  const repository = new InMemoryHealthIndexAssessmentRepository();
  const definitions = new InMemoryHealthIndexDefinitionRepository();
  const kpis = new CountingKpis();
  const readings = new InMemoryKpiReadingRepository();
  const events = new Recorder();
  return {
    service: new HealthIndexAssessmentService({ repository, definitions, kpis, readings, events }),
    repository,
    definitions,
    kpis,
    readings,
    events,
  };
};

/** File one figure against one indicator, grounded in a record of that indicator's own domain. */
const file = async (built: Harness, kpi: KpiDefinition, period: number): Promise<void> => {
  await built.readings.save(
    recordKpiReading(kpi, {
      period,
      rawValue: 94,
      citations: [cite(`${kpi.kpiKey}-${period}`, kpi.sourceDomain)],
    }),
  );
};

/**
 * An institution ready to be assessed: a composition in force, every indicator declared, and a figure filed
 * against each of the named ones at the given period.
 */
const staged = async (reporting: readonly string[] = ALL, period = PERIOD): Promise<Harness> => {
  const built = harness();
  await built.definitions.save(publishHealthIndex(defineHealthIndex(indexParams())));
  for (const indicator of INDICATORS) {
    const kpi = indicatorFor(indicator.kpiKey);
    await built.kpis.save(kpi);
    if (reporting.includes(indicator.kpiKey)) {
      await file(built, kpi, period);
    }
  }
  return built;
};

describe("computing an institution's composite", () => {
  it("computes the figure, stores it against the period, and announces it", async () => {
    const { service, repository, events } = await staged();

    const assessment = await service.assess(TENANT, KEY, PERIOD);

    expect(assessment.status).toBe("provisional");
    expect(assessment.value).not.toBeNull();
    expect(assessment.pillarCoverage).toBe(1);
    expect(await repository.findByIndexAndPeriod(TENANT, KEY, PERIOD)).toEqual(assessment);
    expect(events.types).toEqual([ASSESSMENT_COMPUTED]);
  });

  it("pins the composition it ran under, so the figure can be produced again", async () => {
    const built = await staged();
    const definition = await built.definitions.findPublishedByKey(TENANT, KEY);

    const assessment = await built.service.assess(TENANT, KEY, PERIOD);

    expect(assessment.indexDefinitionId).toBe(definition?.id);
    expect(assessment.run.weights).toEqual(WEIGHTS);
    expect(assessment.grain).toBe("term");
    expect(assessment.fingerprint).not.toBe("");
  });

  it("takes the institution off the composition rather than from the caller", async () => {
    const built = await staged();
    const stranger = indicatorFor("attendance.rate", SIBLING);
    await built.kpis.save(stranger);
    await file(built, stranger, PERIOD);

    const assessment = await built.service.assess(TENANT, KEY, PERIOD);

    expect(assessment.organizationId).toBe(ORG);
    expect(assessment.evidence.audits).toHaveLength(INDICATORS.length);
  });

  it("refuses a series with no composition in force, naming the series", async () => {
    const built = harness();
    await built.definitions.save(defineHealthIndex(indexParams()));

    let thrown: unknown;
    try {
      await built.service.assess(TENANT, KEY, PERIOD);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(NoPublishedIndexError);
    expect((thrown as Error).message).toContain(KEY);
  });

  it("resolves the series by its normalized key", async () => {
    const { service } = await staged();

    expect((await service.assess(TENANT, "  INSTITUTIONAL.Health ", PERIOD)).indexKey).toBe(KEY);
  });

  it("refuses an occupied period before walking the institution's indicators", async () => {
    const built = await staged();
    await built.service.assess(TENANT, KEY, PERIOD);

    let thrown: unknown;
    try {
      await built.service.assess(TENANT, KEY, PERIOD);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DuplicateAssessmentError);
    expect(built.kpis.walks).toBe(1);
  });

  it("counts a withdrawn figure as still occupying its period", async () => {
    const built = await staged();
    const assessment = await built.service.assess(TENANT, KEY, PERIOD);
    await built.service.invalidate(TENANT, assessment.id, "Feed was double counting");

    let thrown: unknown;
    try {
      await built.service.assess(TENANT, KEY, PERIOD);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DuplicateAssessmentError);
  });

  it("refuses a period that is not an ordinal, and stores nothing", async () => {
    const { service, repository } = await staged();

    let thrown: unknown;
    try {
      await service.assess(TENANT, KEY, 7.5);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
  });
});

describe("gathering what the composite is computed from", () => {
  it("counts an indicator that reported nothing toward its pillar's denominator", async () => {
    const { service } = await staged(["academic.progress", "teaching.observation"]);

    const assessment = await service.assess(TENANT, KEY, PERIOD);
    const silent = assessment.run.inputs.find((input) => input.pillar === "financial_health");

    expect(assessment.run.inputs).toHaveLength(INDICATORS.length);
    expect(silent?.kpisDeclared).toBe(1);
    expect(silent?.kpisRead).toBe(0);
    expect(assessment.pillarCoverage).toBeLessThan(1);
  });

  it("leaves a retired indicator's last figure out of both the roll-up and the evidence base", async () => {
    const built = await staged();
    const retired = await built.kpis.findByKey(TENANT, "wellbeing.index");
    if (!retired) throw new Error("fixture indicator missing");
    await built.kpis.save(retireKpi(retired));

    const assessment = await built.service.assess(TENANT, KEY, PERIOD);
    const keys = assessment.evidence.audits.map((audit) => audit.kpiKey);

    expect(keys).not.toContain("wellbeing.index");
    expect(assessment.run.inputs.map((input) => input.pillar)).not.toContain("learner_wellbeing");
  });

  it("takes each indicator's latest standing figure, whatever period it belongs to", async () => {
    const built = await staged([]);
    const stale = indicatorFor("attendance.rate");
    await built.kpis.save(stale);
    await file(built, stale, 4);
    await file(built, stale, 6);

    const assessment = await built.service.assess(TENANT, KEY, PERIOD);
    const audit = assessment.evidence.audits.find((entry) => entry.kpiKey === "attendance.rate");

    expect(assessment.evidence.audits).toHaveLength(1);
    expect(audit?.period).toBe(6);
    expect(audit?.age).toBe(1);
    expect(audit?.admission).toBe("admitted");
  });

  it("marks a figure older than the platform allows as stale rather than dropping it", async () => {
    const built = await staged([]);
    const ancient = indicatorFor("attendance.rate");
    await built.kpis.save(ancient);
    await file(built, ancient, 1);

    const assessment = await built.service.assess(TENANT, KEY, PERIOD);
    const audit = assessment.evidence.audits.find((entry) => entry.kpiKey === "attendance.rate");

    expect(audit?.admission).toBe("stale");
    expect(assessment.evidence.admitted).toBe(0);
    expect(assessment.evidence.stale).toBe(1);
  });

  it("does not let a withdrawn figure reach the evidence base", async () => {
    const built = await staged();
    const withdrawn = await built.readings.listByKpi(
      TENANT,
      ((await built.kpis.findByKey(TENANT, "finance.surplus")) as KpiDefinition).id,
    );
    for (const reading of withdrawn) {
      await built.readings.save(withdrawKpiReading(reading, "Ledger was reopened"));
    }

    const assessment = await built.service.assess(TENANT, KEY, PERIOD);
    const keys = assessment.evidence.audits.map((audit) => audit.kpiKey);
    const pillar = assessment.run.inputs.find((input) => input.pillar === "financial_health");

    expect(keys).not.toContain("finance.surplus");
    expect(pillar?.kpisRead).toBe(0);
  });
});

describe("standing behind a figure", () => {
  it("finalizes a grounded figure that saw enough of the institution, and announces it", async () => {
    const built = await staged();
    const assessment = await built.service.assess(TENANT, KEY, PERIOD);

    const next = await built.service.finalize(TENANT, assessment.id);

    expect(next.status).toBe("final");
    expect(next.finalizedAt).not.toBeNull();
    expect(next.createdAt).toBe(assessment.createdAt);
    expect(await built.repository.findById(TENANT, assessment.id)).toEqual(next);
    expect(built.events.types).toEqual([ASSESSMENT_COMPUTED, ASSESSMENT_FINALIZED]);
  });

  it("calls a figure nothing was filed against ungrounded rather than thin", async () => {
    const built = await staged([]);
    const assessment = await built.service.assess(TENANT, KEY, PERIOD);

    let thrown: unknown;
    try {
      await built.service.finalize(TENANT, assessment.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UngroundedAssessmentError);
    expect((await built.repository.findById(TENANT, assessment.id))?.status).toBe("provisional");
  });

  it("refuses a figure that saw too little of the institution", async () => {
    const built = await staged(["academic.progress", "teaching.observation"]);
    const assessment = await built.service.assess(TENANT, KEY, PERIOD);

    let thrown: unknown;
    try {
      await built.service.finalize(TENANT, assessment.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InsufficientAssessmentCoverageError);
    expect(assessment.evidence.admitted).toBe(2);
    expect(assessment.sufficient).toBe(false);
  });

  it("refuses to finalize what is already final", async () => {
    const built = await staged();
    const assessment = await built.service.assess(TENANT, KEY, PERIOD);
    await built.service.finalize(TENANT, assessment.id);

    let thrown: unknown;
    try {
      await built.service.finalize(TENANT, assessment.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AssessmentNotProvisionalError);
  });
});

describe("withdrawing a figure", () => {
  it("invalidates a final figure without erasing what it said, and announces it", async () => {
    const built = await staged();
    const assessment = await built.service.assess(TENANT, KEY, PERIOD);
    const final = await built.service.finalize(TENANT, assessment.id);

    const next = await built.service.invalidate(TENANT, final.id, "  A feed was double counting  ");

    expect(next.status).toBe("invalidated");
    expect(next.value).toBe(final.value);
    expect(next.invalidationReason).toBe("A feed was double counting");
    expect(built.events.types).toEqual([
      ASSESSMENT_COMPUTED,
      ASSESSMENT_FINALIZED,
      ASSESSMENT_INVALIDATED,
    ]);
  });

  it("keeps a blank reason as no reason, and works with none given at all", async () => {
    const built = await staged();
    const first = await built.service.assess(TENANT, KEY, PERIOD);
    const second = await built.service.assess(TENANT, KEY, PERIOD + 1);

    expect((await built.service.invalidate(TENANT, first.id, "   ")).invalidationReason).toBeNull();
    expect((await built.service.invalidate(TENANT, second.id)).invalidationReason).toBeNull();
  });

  it("refuses a second withdrawal of the same figure", async () => {
    const built = await staged();
    const assessment = await built.service.assess(TENANT, KEY, PERIOD);
    await built.service.invalidate(TENANT, assessment.id, "Feed was double counting");

    let thrown: unknown;
    try {
      await built.service.invalidate(TENANT, assessment.id, "Again");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AssessmentAlreadyInvalidatedError);
  });

  it("takes a withdrawn figure out of the run a later period is compared against", async () => {
    const built = await staged();
    const earlier = await built.service.assess(TENANT, KEY, PERIOD);
    await built.service.invalidate(TENANT, earlier.id, "Feed was double counting");

    expect(await built.service.history(TENANT, KEY, PERIOD + 1)).toEqual([]);
  });
});

describe("auditing the record against itself", () => {
  it("produces a stored figure again from its own pinned run, without fault", async () => {
    const built = await staged();
    const assessment = await built.service.assess(TENANT, KEY, PERIOD);

    const verdict = await built.service.verify(TENANT, assessment.id);

    expect(verdict.reproduced).toBe(true);
    expect(verdict.inputsMatch).toBe(true);
    expect(verdict.drift).toBe(0);
    expect(verdict.recomputedValue).toBe(assessment.value);
    expect(verdict.faults).toEqual([]);
  });

  it("answers a 404 for a figure nobody filed", async () => {
    const { service } = await staged();

    let thrown: unknown;
    try {
      await service.verify(TENANT, MISSING);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HealthIndexAssessmentNotFoundError);
    expect((thrown as Error).message).toContain(MISSING);
  });
});

describe("reading figures back", () => {
  it("answers one figure, or a 404, and never another tenant's", async () => {
    const { service } = await staged();
    const assessment = await service.assess(TENANT, KEY, PERIOD);

    expect(await service.get(TENANT, assessment.id)).toEqual(assessment);

    let thrown: unknown;
    try {
      await service.get(OTHER, assessment.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HealthIndexAssessmentNotFoundError);
  });

  it("resolves a period by the normalized key, and answers null for a period nobody filed", async () => {
    const { service } = await staged();
    const assessment = await service.assess(TENANT, KEY, PERIOD);

    expect(await service.findForPeriod(TENANT, " Institutional.Health  ", PERIOD)).toEqual(
      assessment,
    );
    expect(await service.findForPeriod(TENANT, KEY, PERIOD + 1)).toBeNull();
  });

  it("answers the run behind a period oldest first, stopping before the period asked about", async () => {
    const { service } = await staged();
    const first = await service.assess(TENANT, KEY, 5);
    const second = await service.assess(TENANT, KEY, 6);
    await service.assess(TENANT, KEY, 7);

    const history = await service.history(TENANT, KEY, 7);

    expect(history.map((entry) => entry.id)).toEqual([first.id, second.id]);
  });

  it("lists every figure in the tenant, withdrawn ones included", async () => {
    const { service } = await staged();
    const assessment = await service.assess(TENANT, KEY, PERIOD);
    await service.invalidate(TENANT, assessment.id, "Feed was double counting");
    await service.assess(TENANT, KEY, PERIOD + 1);

    expect(await service.list(TENANT)).toHaveLength(2);
  });
});

describe("announcing without a bus", () => {
  it("works with no event bus wired at all", async () => {
    const built = await staged();
    const service = new HealthIndexAssessmentService({
      repository: built.repository,
      definitions: built.definitions,
      kpis: built.kpis,
      readings: built.readings,
    });

    const assessment = await service.finalize(
      TENANT,
      (await service.assess(TENANT, KEY, PERIOD)).id,
    );

    expect(assessment.status).toBe("final");
    expect(built.events.published).toEqual([]);
  });
});
