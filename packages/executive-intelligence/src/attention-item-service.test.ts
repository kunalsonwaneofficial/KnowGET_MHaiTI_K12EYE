import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { attentionKeyFor } from "./attention";
import type { AttentionItem } from "./attention-item";
import { AttentionItemService } from "./attention-item-service";
import {
  ATTENTION_ACKNOWLEDGED,
  ATTENTION_DISMISSED,
  ATTENTION_RAISED,
  ATTENTION_RESOLVED,
  ATTENTION_RESTATED,
} from "./command-events";
import type { AttentionReason, AttentionSeverity, HealthPillar } from "./command-value";
import type {
  AttentionSignal,
  EvidenceCitation,
  MeasurementScale,
  PillarInput,
  PillarWeight,
  TracedReading,
} from "./command-view";
import {
  AttentionItemClosedError,
  AttentionItemNotFoundError,
  AttentionItemNotOpenError,
  AttentionSignalMismatchError,
  DuplicateAttentionItemError,
  EmptyDismissalReasonError,
  HealthIndexAssessmentNotFoundError,
} from "./errors";
import { type HealthIndexAssessment, assessHealthIndex } from "./health-index-assessment";
import {
  type HealthIndexDefinition,
  defineHealthIndex,
  publishHealthIndex,
} from "./health-index-definition";
import { type KpiDefinition, activateKpi, defineKpi, retireKpi } from "./kpi-definition";
import { recordKpiReading, withdrawKpiReading } from "./kpi-reading";
import {
  type AttentionItemRepository,
  type HealthIndexAssessmentRepository,
  InMemoryAttentionItemRepository,
  InMemoryHealthIndexAssessmentRepository,
  InMemoryKpiDefinitionRepository,
  InMemoryKpiReadingRepository,
  type KpiDefinitionRepository,
  type KpiReadingRepository,
} from "./ports";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org1" as Uuid;
const ACTOR = "head-of-finance" as Uuid;
const ABSENT = "assessment-nowhere" as Uuid;
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

/** The same institution measured under a different composition, for the cases about what a run pinned. */
const RECOMPOSED: readonly PillarWeight[] = WEIGHTS.map((entry) =>
  entry.pillar === "workforce_capacity"
    ? { pillar: "governance_compliance", weight: entry.weight }
    : entry,
);

const scale: MeasurementScale = {
  unit: "percentage",
  polarity: "higher_is_better",
  anchors: [
    { value: 85, score: 0 },
    { value: 90, score: 50 },
    { value: 96, score: 100 },
  ],
};

/** The score every indicator is asked to reach, and the two figures that clear it and fall short of it. */
const TARGET = 80;
const MEETING = 94;
const SHORT = 88;
/** What falling to {@link SHORT} costs against {@link TARGET}, on the normalized scale. */
const SHORTFALL = 50;

/** A pillar comfortably healthy, and one nobody could call anything but failing. */
const SOUND = 80;
const FAILING = 20;

/** The pillar the fixtures below put in trouble, and the indicator that reports on it. */
const WEAK: HealthPillar = "financial_health";
const WEAK_KPI = "finance.surplus";

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
  { kpiKey: WEAK_KPI, pillar: WEAK, sourceDomain: "financial" },
  { kpiKey: "wellbeing.index", pillar: "learner_wellbeing", sourceDomain: "wellbeing" },
  { kpiKey: "workforce.retention", pillar: "workforce_capacity", sourceDomain: "workforce" },
];

const cite = (sourceRef: string, sourceDomain: string): EvidenceCitation => ({
  kind: "domain_record",
  sourceDomain,
  sourceRef,
  attestedBy: null,
});

const composition = (weights: readonly PillarWeight[]): HealthIndexDefinition =>
  publishHealthIndex(
    defineHealthIndex({
      tenantId: TENANT,
      organizationId: ORG,
      indexKey: KEY,
      name: "Institutional health",
      grain: "term",
      weights,
    }),
  );

/** The composition every fixture below is measured under. */
const INDEX = composition(WEIGHTS);

/** Every pillar reporting soundly: the quiet institution the noisy cases are one deviation from. */
const SOUND_INPUTS: readonly PillarInput[] = WEIGHTS.map((entry) => ({
  pillar: entry.pillar,
  score: SOUND,
  kpisRead: 1,
  kpisDeclared: 1,
}));

/** That institution with one pillar's score moved. */
const inputsWith = (pillar: HealthPillar, score: number): readonly PillarInput[] =>
  SOUND_INPUTS.map((input) => (input.pillar === pillar ? { ...input, score } : input));

/** That institution with one pillar silenced: nothing read, which is how a pillar reports nothing. */
const inputsWithout = (pillar: HealthPillar): readonly PillarInput[] =>
  SOUND_INPUTS.map((input) =>
    input.pillar === pillar ? { pillar, score: 0, kpisRead: 0, kpisDeclared: 1 } : input,
  );

/** A finding in the engine's shape, keyed the way the engine keys it. */
const signal = (
  reason: AttentionReason,
  severity: AttentionSeverity,
  subject: string,
  observed: number | null,
): AttentionSignal => ({
  key: attentionKeyFor(reason, "pillar", subject),
  reason,
  severity,
  subjectKind: "pillar",
  subject,
  observed,
});

/** A finding this fixture's arithmetic never produces, for the cases about raising one by hand. */
const FINDING = signal("sustained_decline", "urgent", "teaching_quality", 3);

class Recorder {
  readonly published: DomainEvent[] = [];

  async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
  }

  get types(): string[] {
    return this.published.map((event) => event.type);
  }
}

interface Harness {
  readonly service: AttentionItemService;
  readonly repository: AttentionItemRepository;
  readonly assessments: HealthIndexAssessmentRepository;
  readonly kpis: KpiDefinitionRepository;
  readonly readings: KpiReadingRepository;
  readonly events: Recorder;
  readonly indicators: ReadonlyMap<string, KpiDefinition>;
}

const harness = async (): Promise<Harness> => {
  const repository = new InMemoryAttentionItemRepository();
  const assessments = new InMemoryHealthIndexAssessmentRepository();
  const kpis = new InMemoryKpiDefinitionRepository();
  const readings = new InMemoryKpiReadingRepository();
  const events = new Recorder();
  const indicators = new Map<string, KpiDefinition>();

  for (const declared of INDICATORS) {
    const kpi = activateKpi(
      defineKpi({
        tenantId: TENANT,
        organizationId: ORG,
        kpiKey: declared.kpiKey,
        name: declared.kpiKey,
        pillar: declared.pillar,
        sourceDomain: declared.sourceDomain,
        scale,
        targetScore: TARGET,
      }),
    );
    await kpis.save(kpi);
    indicators.set(kpi.kpiKey, kpi);
  }

  return {
    service: new AttentionItemService({ repository, assessments, kpis, readings, events }),
    repository,
    assessments,
    kpis,
    readings,
    events,
    indicators,
  };
};

/** The indicator this harness declared under a key, or a failure that names the fixture gap. */
const indicator = (built: Harness, kpiKey: string): KpiDefinition => {
  const declared = built.indicators.get(kpiKey);
  if (!declared) throw new Error(`No fixture indicator named "${kpiKey}"`);
  return declared;
};

/** File one indicator's figure for a period, and hand back the traced reading an assessment records it by. */
const file = async (
  built: Harness,
  kpiKey: string,
  period: number,
  rawValue = MEETING,
): Promise<TracedReading> => {
  const kpi = indicator(built, kpiKey);
  const citations = [cite(`${kpiKey}-${period}`, kpi.sourceDomain)];
  await built.readings.save(recordKpiReading(kpi, { period, rawValue, citations }));
  return { kpiKey, period, citations };
};

/** Compute a period's composite from what was filed against it, and store it where a sweep will find it. */
const assessed = async (
  built: Harness,
  period: number,
  inputs: readonly PillarInput[],
  readings: readonly TracedReading[],
): Promise<HealthIndexAssessment> => {
  const assessment = assessHealthIndex(INDEX, { period, inputs, readings });
  await built.assessments.save(assessment);
  return assessment;
};

/**
 * A period whose arithmetic has two things to say at two volumes: one pillar failing, and that pillar's
 * indicator short of the target it was given.
 */
const troubled = async (): Promise<Harness & { assessment: HealthIndexAssessment }> => {
  const built = await harness();
  const filed = await Promise.all(
    INDICATORS.map((declared) =>
      file(built, declared.kpiKey, PERIOD, declared.pillar === WEAK ? SHORT : MEETING),
    ),
  );
  return { ...built, assessment: await assessed(built, PERIOD, inputsWith(WEAK, FAILING), filed) };
};

/** That period already swept, so its queue is standing. */
const raised = async (): Promise<
  Harness & { assessment: HealthIndexAssessment; queue: readonly AttentionItem[] }
> => {
  const built = await troubled();
  return { ...built, queue: await built.service.sweep(TENANT, built.assessment.id) };
};

/** The finding at the top of a queue. Throws rather than answering undefined, so a test says what it meant. */
const loudest = (queue: readonly AttentionItem[]): AttentionItem => {
  const item = queue[0];
  if (!item) throw new Error("The queue is empty");
  return item;
};

/** The finding at the bottom of a queue, on the same terms. */
const quietest = (queue: readonly AttentionItem[]): AttentionItem => {
  const item = queue.at(-1);
  if (!item) throw new Error("The queue is empty");
  return item;
};

describe("sweeping a period's arithmetic onto a queue", () => {
  it("raises what the arithmetic asks for, stores each finding, and announces it", async () => {
    const { service, repository, assessment, events } = await troubled();

    const queue = await service.sweep(TENANT, assessment.id);

    expect(queue.map((item) => item.reason)).toEqual(["band_breach", "target_miss"]);
    expect(queue.map((item) => item.subject)).toEqual([WEAK, WEAK_KPI]);
    expect(queue.every((item) => item.status === "open")).toBe(true);
    expect(await repository.listByAssessment(TENANT, assessment.id)).toHaveLength(2);
    expect(events.types).toEqual([ATTENTION_RAISED, ATTENTION_RAISED]);
  });

  it("copies the series and the period onto each finding, so a queue reads without a join", async () => {
    const { service, assessment } = await troubled();

    const queue = await service.sweep(TENANT, assessment.id);

    expect(loudest(queue).assessmentId).toBe(assessment.id);
    expect(loudest(queue).indexKey).toBe(KEY);
    expect(loudest(queue).period).toBe(PERIOD);
    expect(loudest(queue).organizationId).toBe(ORG);
  });

  it("returns the queue loudest first, so a briefing pinning it leads with the worst", async () => {
    const { service, assessment } = await troubled();

    const queue = await service.sweep(TENANT, assessment.id);

    expect(queue.map((item) => item.severity)).toEqual(["urgent", "advisory"]);
  });

  it("answers a 404 for a period nobody assessed, naming it", async () => {
    const built = await harness();

    let thrown: unknown;
    try {
      await built.service.sweep(TENANT, ABSENT);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HealthIndexAssessmentNotFoundError);
    expect((thrown as Error).message).toContain(ABSENT);
  });

  it("reads the declared pillars off the pinned run rather than a later recomposition", async () => {
    const built = await harness();
    const assessment = assessHealthIndex(composition(RECOMPOSED), {
      period: PERIOD,
      inputs: RECOMPOSED.map((entry) => ({
        pillar: entry.pillar,
        score: entry.pillar === "governance_compliance" ? 0 : SOUND,
        kpisRead: entry.pillar === "governance_compliance" ? 0 : 1,
        kpisDeclared: 1,
      })),
      readings: [],
    });
    await built.assessments.save(assessment);

    const queue = await built.service.sweep(TENANT, assessment.id);

    expect(queue.map((item) => item.subject)).toEqual(["governance_compliance"]);
  });

  it("raises a coverage gap for a pillar that reported nothing, and nothing else about it", async () => {
    const built = await harness();
    const filed = await Promise.all(
      INDICATORS.map((declared) => file(built, declared.kpiKey, PERIOD)),
    );
    const assessment = await assessed(built, PERIOD, inputsWithout(WEAK), filed);

    const queue = await built.service.sweep(TENANT, assessment.id);

    expect(queue.map((item) => item.reason)).toEqual(["coverage_gap"]);
    expect(loudest(queue).severity).toBe("urgent");
    expect(loudest(queue).subject).toBe(WEAK);
  });

  it("raises nothing about an indicator the institution has since retired", async () => {
    const built = await troubled();
    await built.kpis.save(retireKpi(indicator(built, WEAK_KPI)));

    const queue = await built.service.sweep(TENANT, built.assessment.id);

    expect(queue.map((item) => item.subject)).toEqual([WEAK]);
  });

  it("resolves the figure behind an audit at the period it names, not the indicator's latest", async () => {
    const built = await troubled();
    await file(built, WEAK_KPI, PERIOD + 1, MEETING);

    const queue = await built.service.sweep(TENANT, built.assessment.id);

    expect(quietest(queue).reason).toBe("target_miss");
    expect(quietest(queue).observed).toBe(SHORTFALL);
  });

  it("raises nothing about a figure the institution has taken back since", async () => {
    const built = await troubled();
    const filed = await built.readings.findByKpiAndPeriod(
      TENANT,
      indicator(built, WEAK_KPI).id,
      PERIOD,
    );
    if (!filed) throw new Error("fixture reading missing");
    await built.readings.save(withdrawKpiReading(filed, "The ledger was reopened"));

    const queue = await built.service.sweep(TENANT, built.assessment.id);

    expect(queue.map((item) => item.reason)).toEqual(["band_breach"]);
  });
});

describe("sweeping the same period again", () => {
  it("restates what is already open rather than raising a second copy of it", async () => {
    const { service, repository, assessment, events } = await troubled();
    const first = await service.sweep(TENANT, assessment.id);

    const second = await service.sweep(TENANT, assessment.id);

    expect(second.map((item) => item.id)).toEqual(first.map((item) => item.id));
    expect(await repository.listByAssessment(TENANT, assessment.id)).toHaveLength(2);
    expect(events.types).toEqual([
      ATTENTION_RAISED,
      ATTENTION_RAISED,
      ATTENTION_RESTATED,
      ATTENTION_RESTATED,
    ]);
  });

  it("takes the fresh severity onto a finding that was already on the queue", async () => {
    const { service, assessment } = await troubled();
    const quiet = await service.raise(
      TENANT,
      assessment.id,
      signal("band_breach", "informational", WEAK, FAILING),
    );

    const queue = await service.sweep(TENANT, assessment.id);

    expect(queue).toHaveLength(2);
    expect(loudest(queue).id).toBe(quiet.id);
    expect(loudest(queue).severity).toBe("urgent");
    expect(loudest(queue).createdAt).toBe(quiet.createdAt);
  });

  it("returns a finding somebody closed untouched rather than reopening it", async () => {
    const { service, assessment, events, queue } = await raised();
    const closed = await service.resolve(
      TENANT,
      loudest(queue).id,
      ACTOR,
      "Governors approved a recovery plan",
    );

    const again = await service.sweep(TENANT, assessment.id);

    expect(again).toHaveLength(2);
    expect(loudest(again)).toEqual(closed);
    expect(events.types).toEqual([
      ATTENTION_RAISED,
      ATTENTION_RAISED,
      ATTENTION_RESOLVED,
      ATTENTION_RESTATED,
    ]);
  });

  it("leaves a finding the arithmetic no longer produces standing on the queue", async () => {
    const { service, assessment } = await raised();
    const invented = await service.raise(TENANT, assessment.id, FINDING);

    await service.sweep(TENANT, assessment.id);

    expect((await service.get(TENANT, invented.id)).status).toBe("open");
    expect(await service.listByAssessment(TENANT, assessment.id)).toHaveLength(3);
  });
});

describe("putting one finding on a queue by hand", () => {
  it("raises it against the period, stores it, and announces it", async () => {
    const { service, repository, assessment, events } = await troubled();

    const item = await service.raise(TENANT, assessment.id, FINDING);

    expect(item.status).toBe("open");
    expect(item.assessmentId).toBe(assessment.id);
    expect(item.period).toBe(PERIOD);
    expect(item.observed).toBe(FINDING.observed);
    expect(await repository.findByAssessmentAndKey(TENANT, assessment.id, item.key)).toEqual(item);
    expect(events.types).toEqual([ATTENTION_RAISED]);
  });

  it("refuses a key the period has already raised, naming both halves of the identity", async () => {
    const { service, assessment } = await troubled();
    await service.raise(TENANT, assessment.id, FINDING);

    let thrown: unknown;
    try {
      await service.raise(TENANT, assessment.id, FINDING);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DuplicateAttentionItemError);
    expect((thrown as Error).message).toContain(assessment.id);
    expect((thrown as Error).message).toContain(FINDING.key);
  });

  it("answers a 404 for a period nobody assessed, naming it", async () => {
    const built = await harness();

    let thrown: unknown;
    try {
      await built.service.raise(TENANT, ABSENT, FINDING);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HealthIndexAssessmentNotFoundError);
    expect((thrown as Error).message).toContain(ABSENT);
  });

  it("lets two periods carry the same finding, because identity is the period and the key together", async () => {
    const built = await troubled();
    const later = await assessed(built, PERIOD + 1, inputsWith(WEAK, FAILING), []);

    const first = await built.service.raise(TENANT, built.assessment.id, FINDING);
    const second = await built.service.raise(TENANT, later.id, FINDING);

    expect(second.id).not.toBe(first.id);
    expect(second.key).toBe(first.key);
    expect(second.period).toBe(PERIOD + 1);
    expect(await built.service.listByAssessment(TENANT, later.id)).toEqual([second]);
  });
});

describe("working the queue", () => {
  it("records who picked a finding up, and accepts a pickup with nobody behind it", async () => {
    const { service, queue, events } = await raised();

    const picked = await service.acknowledge(TENANT, loudest(queue).id, ACTOR);
    const automatic = await service.acknowledge(TENANT, quietest(queue).id, null);

    expect(picked.status).toBe("acknowledged");
    expect(picked.acknowledgedBy).toBe(ACTOR);
    expect(picked.acknowledgedAt).not.toBeNull();
    expect(automatic.acknowledgedBy).toBeNull();
    expect(events.types.slice(-2)).toEqual([ATTENTION_ACKNOWLEDGED, ATTENTION_ACKNOWLEDGED]);
  });

  it("refuses a second acknowledgement, so the waiting interval stays meaningful", async () => {
    const { service, queue } = await raised();
    const picked = await service.acknowledge(TENANT, loudest(queue).id, ACTOR);

    let thrown: unknown;
    try {
      await service.acknowledge(TENANT, picked.id, ACTOR);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AttentionItemNotOpenError);
  });

  it("closes a finding straight from open, without a ceremonial acknowledgement first", async () => {
    const { service, queue, events } = await raised();

    const closed = await service.resolve(
      TENANT,
      loudest(queue).id,
      ACTOR,
      "  Governors approved a recovery plan  ",
    );

    expect(closed.status).toBe("resolved");
    expect(closed.acknowledgedAt).toBeNull();
    expect(closed.closedBy).toBe(ACTOR);
    expect(closed.closureNote).toBe("Governors approved a recovery plan");
    expect(events.types.at(-1)).toBe(ATTENTION_RESOLVED);
  });

  it("keeps a resolution's note optional, because the next period corroborates it", async () => {
    const { service, queue } = await raised();

    expect((await service.resolve(TENANT, loudest(queue).id, ACTOR)).closureNote).toBeNull();
    expect(
      (await service.resolve(TENANT, quietest(queue).id, ACTOR, "   ")).closureNote,
    ).toBeNull();
  });

  it("insists on a reason for a dismissal, which is the only feedback the raising rules get", async () => {
    const { service, repository, queue, events } = await raised();

    const dismissed = await service.dismiss(
      TENANT,
      loudest(queue).id,
      ACTOR,
      "  The ledger was reopened  ",
    );

    expect(dismissed.status).toBe("dismissed");
    expect(dismissed.closureNote).toBe("The ledger was reopened");
    expect(events.types.at(-1)).toBe(ATTENTION_DISMISSED);

    let thrown: unknown;
    try {
      await service.dismiss(TENANT, quietest(queue).id, ACTOR, "   ");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EmptyDismissalReasonError);
    expect((await repository.findById(TENANT, quietest(queue).id))?.status).toBe("open");
  });

  it("refuses to work a finding somebody already closed", async () => {
    const { service, queue } = await raised();
    const closed = await service.resolve(TENANT, loudest(queue).id, ACTOR);

    let thrown: unknown;
    try {
      await service.dismiss(TENANT, closed.id, ACTOR, "Second thoughts");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AttentionItemClosedError);
    expect((await service.get(TENANT, closed.id)).closureNote).toBeNull();
  });
});

describe("restating a finding by hand", () => {
  it("moves severity and quantity onto an open finding without moving its identity", async () => {
    const { service, queue, events } = await raised();
    const item = loudest(queue);

    const next = await service.restate(TENANT, item.id, signal(item.reason, "critical", WEAK, 41));

    expect(next.id).toBe(item.id);
    expect(next.key).toBe(item.key);
    expect(next.severity).toBe("critical");
    expect(next.observed).toBe(41);
    expect(next.createdAt).toBe(item.createdAt);
    expect(events.types.at(-1)).toBe(ATTENTION_RESTATED);
  });

  it("refuses a restatement by a signal that is not this finding", async () => {
    const { service, repository, queue } = await raised();
    const item = loudest(queue);

    let thrown: unknown;
    try {
      await service.restate(TENANT, item.id, FINDING);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AttentionSignalMismatchError);
    expect((await repository.findById(TENANT, item.id))?.severity).toBe(item.severity);
  });
});

describe("reading the queue back", () => {
  it("answers one finding, or a 404, and never another tenant's", async () => {
    const { service, queue } = await raised();
    const item = loudest(queue);

    expect(await service.get(TENANT, item.id)).toEqual(item);

    let thrown: unknown;
    try {
      await service.get(OTHER, item.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AttentionItemNotFoundError);
    expect((thrown as Error).message).toContain(item.id);
  });

  it("lists what an institution is being asked to look at, loudest first, closed ones left out", async () => {
    const { service, assessment, queue } = await raised();
    await service.raise(
      TENANT,
      assessment.id,
      signal("coverage_gap", "critical", "governance_compliance", 0),
    );
    await service.resolve(TENANT, quietest(queue).id, ACTOR);

    const open = await service.listOpen(TENANT, ORG);

    expect(open.map((item) => item.severity)).toEqual(["critical", "urgent"]);
    expect(open.map((item) => item.subject)).toEqual(["governance_compliance", WEAK]);
  });

  it("lists one period's findings loudest first, the closed ones included", async () => {
    const { service, assessment, queue } = await raised();
    await service.dismiss(TENANT, loudest(queue).id, ACTOR, "The pillar is being recomposed");

    const all = await service.listByAssessment(TENANT, assessment.id);

    expect(all.map((item) => item.severity)).toEqual(["urgent", "advisory"]);
    expect(all.map((item) => item.status)).toEqual(["dismissed", "open"]);
  });

  it("lists every finding in the tenant, at any status and across periods", async () => {
    const built = await raised();
    const later = await assessed(built, PERIOD + 1, inputsWith(WEAK, FAILING), []);
    await built.service.raise(TENANT, later.id, FINDING);
    await built.service.dismiss(
      TENANT,
      loudest(built.queue).id,
      ACTOR,
      "The pillar is being recomposed",
    );

    expect(await built.service.list(TENANT)).toHaveLength(3);
    expect(await built.service.list(OTHER)).toEqual([]);
  });
});

describe("announcing without a bus", () => {
  it("works with no event bus wired at all", async () => {
    const built = await troubled();
    const service = new AttentionItemService({
      repository: built.repository,
      assessments: built.assessments,
      kpis: built.kpis,
      readings: built.readings,
    });

    const queue = await service.sweep(TENANT, built.assessment.id);
    const closed = await service.resolve(
      TENANT,
      loudest(queue).id,
      ACTOR,
      "Recovery plan approved",
    );

    expect(closed.status).toBe("resolved");
    expect(built.events.published).toEqual([]);
  });
});
