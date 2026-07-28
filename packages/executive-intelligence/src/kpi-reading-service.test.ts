import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { KPI_READING_RECORDED, KPI_READING_WITHDRAWN } from "./command-events";
import type { EvidenceCitation, MeasurementScale } from "./command-view";
import {
  DuplicateKpiReadingError,
  EvidenceRecordNotFoundError,
  KpiDefinitionNotFoundError,
  KpiReadingAlreadyWithdrawnError,
  KpiReadingNotFoundError,
} from "./errors";
import { type KpiDefinition, activateKpi, defineKpi, retireKpi } from "./kpi-definition";
import { type RecordKpiReadingParams, kpiReadingScore } from "./kpi-reading";
import { KpiReadingService } from "./kpi-reading-service";
import {
  type EvidenceRecordDirectory,
  InMemoryKpiDefinitionRepository,
  InMemoryKpiReadingRepository,
  type KpiReadingRepository,
} from "./ports";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org1" as Uuid;
const MISSING = "reading-nowhere" as Uuid;

const scale: MeasurementScale = {
  unit: "percentage",
  polarity: "higher_is_better",
  anchors: [
    { value: 85, score: 0 },
    { value: 90, score: 50 },
    { value: 96, score: 100 },
  ],
};

const cite = (sourceRef: string): EvidenceCitation => ({
  kind: "domain_record",
  sourceDomain: "attendance",
  sourceRef,
  attestedBy: null,
});

const definition = (kpiKey = "attendance.rate"): KpiDefinition =>
  activateKpi(
    defineKpi({
      tenantId: TENANT,
      organizationId: ORG,
      kpiKey,
      name: "Attendance rate",
      pillar: "attendance_engagement",
      sourceDomain: "attendance",
      scale,
      targetScore: 80,
    }),
  );

const filing = (overrides: Partial<RecordKpiReadingParams> = {}): RecordKpiReadingParams => ({
  period: 7,
  rawValue: 94,
  citations: [cite("register-7")],
  ...overrides,
});

class Recorder {
  readonly published: DomainEvent[] = [];

  async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
  }

  get types(): string[] {
    return this.published.map((event) => event.type);
  }
}

class StubEvidence implements EvidenceRecordDirectory {
  readonly seen: EvidenceCitation[] = [];
  private readonly missing: readonly string[];

  constructor(missing: readonly string[] = []) {
    this.missing = missing;
  }

  async exists(tenantId: TenantId, citation: EvidenceCitation): Promise<boolean> {
    this.seen.push(citation);
    return tenantId === TENANT && !this.missing.includes(citation.sourceRef);
  }
}

interface Harness {
  readonly service: KpiReadingService;
  readonly repository: KpiReadingRepository;
  readonly definitions: InMemoryKpiDefinitionRepository;
  readonly evidence: StubEvidence;
  readonly events: Recorder;
}

const harness = (missing: readonly string[] = []): Harness => {
  const repository = new InMemoryKpiReadingRepository();
  const definitions = new InMemoryKpiDefinitionRepository();
  const evidence = new StubEvidence(missing);
  const events = new Recorder();
  return {
    service: new KpiReadingService({ repository, definitions, evidence, events }),
    repository,
    definitions,
    evidence,
    events,
  };
};

const withDefinition = async (
  missing: readonly string[] = [],
): Promise<Harness & { kpi: KpiDefinition }> => {
  const built = harness(missing);
  const kpi = definition();
  await built.definitions.save(kpi);
  return { ...built, kpi };
};

describe("filing a figure against an indicator", () => {
  it("stores the reading and announces it", async () => {
    const { service, repository, kpi, events } = await withDefinition();

    const reading = await service.record(TENANT, kpi.id, filing());

    expect(reading.kpiKey).toBe("attendance.rate");
    expect(reading.pillar).toBe("attendance_engagement");
    expect(reading.period).toBe(7);
    expect(await repository.findById(TENANT, reading.id)).toEqual(reading);
    expect(events.types).toEqual([KPI_READING_RECORDED]);
  });

  it("takes everything but the figure off the loaded definition", async () => {
    const { service, kpi } = await withDefinition();

    const reading = await service.record(TENANT, kpi.id, filing());

    expect(reading.tenantId).toBe(kpi.tenantId);
    expect(reading.organizationId).toBe(kpi.organizationId);
    expect(reading.kpiDefinitionId).toBe(kpi.id);
    expect(kpiReadingScore(reading)).toBeGreaterThan(0);
  });

  it("answers a 404 for an indicator nobody declared, and stores nothing", async () => {
    const { service, repository, events } = harness();

    let thrown: unknown;
    try {
      await service.record(TENANT, "kpi-nowhere" as Uuid, filing());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(KpiDefinitionNotFoundError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(events.published).toEqual([]);
  });

  it("does not reach another tenant's indicator", async () => {
    const { service, kpi } = await withDefinition();

    let thrown: unknown;
    try {
      await service.record(OTHER, kpi.id, filing());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(KpiDefinitionNotFoundError);
  });

  it("refuses a period the indicator already has a standing figure for", async () => {
    const { service, repository, kpi, events } = await withDefinition();
    await service.record(TENANT, kpi.id, filing());

    let thrown: unknown;
    try {
      await service.record(TENANT, kpi.id, filing({ rawValue: 88 }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DuplicateKpiReadingError);
    expect((thrown as Error).message).toContain("attendance.rate");
    expect(await repository.listByKpi(TENANT, kpi.id)).toHaveLength(1);
    expect(events.types).toEqual([KPI_READING_RECORDED]);
  });

  it("lets a correction take the period a withdrawn figure occupied", async () => {
    const { service, kpi } = await withDefinition();
    const wrong = await service.record(TENANT, kpi.id, filing());
    await service.withdraw(TENANT, wrong.id, "Register was double counted");

    const corrected = await service.record(TENANT, kpi.id, filing({ rawValue: 88 }));

    expect(corrected.period).toBe(7);
    expect(corrected.id).not.toBe(wrong.id);
  });

  it("refuses a citation the owning domain cannot resolve, and stores nothing", async () => {
    const { service, repository, kpi, events } = await withDefinition(["register-7"]);

    let thrown: unknown;
    try {
      await service.record(TENANT, kpi.id, filing());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EvidenceRecordNotFoundError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(events.published).toEqual([]);
  });

  it("names the first citation that failed rather than an arbitrary one", async () => {
    const { service, kpi, evidence } = await withDefinition(["register-b", "register-c"]);

    let thrown: unknown;
    try {
      await service.record(
        TENANT,
        kpi.id,
        filing({ citations: [cite("register-a"), cite("register-b"), cite("register-c")] }),
      );
    } catch (error) {
      thrown = error;
    }

    expect((thrown as Error).message).toContain("register-b");
    expect(evidence.seen.map((citation) => citation.sourceRef)).toEqual([
      "register-a",
      "register-b",
    ]);
  });

  it("resolves the constructed reading's citations rather than the caller's raw strings", async () => {
    const { service, kpi, evidence } = await withDefinition();

    await service.record(TENANT, kpi.id, filing({ citations: [cite("  register-7  ")] }));

    expect(evidence.seen).toHaveLength(1);
    expect(evidence.seen[0]?.sourceRef).toBe("register-7");
  });

  it("surfaces the aggregate's refusal to file against an indicator out of service", async () => {
    const { service, definitions, repository, kpi } = await withDefinition();
    await definitions.save(retireKpi(kpi));

    let thrown: unknown;
    try {
      await service.record(TENANT, kpi.id, filing());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
  });

  it("refuses a period that is not an ordinal, before the evidence is ever resolved", async () => {
    const { service, kpi, evidence } = await withDefinition();

    let thrown: unknown;
    try {
      await service.record(TENANT, kpi.id, filing({ period: 7.5 }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(evidence.seen).toEqual([]);
  });
});

describe("withdrawing a figure", () => {
  it("marks it withdrawn without erasing it, and announces it", async () => {
    const { service, repository, kpi, events } = await withDefinition();
    const reading = await service.record(TENANT, kpi.id, filing());

    const next = await service.withdraw(TENANT, reading.id, "Register was double counted");

    expect(next.withdrawnAt).not.toBeNull();
    expect(next.withdrawalReason).toBe("Register was double counted");
    expect(next.createdAt).toBe(reading.createdAt);
    expect(await repository.findById(TENANT, reading.id)).toEqual(next);
    expect(events.types).toEqual([KPI_READING_RECORDED, KPI_READING_WITHDRAWN]);
  });

  it("takes a withdrawn figure out of the standing reads and leaves it in the tenant's record", async () => {
    const { service, repository, kpi } = await withDefinition();
    const reading = await service.record(TENANT, kpi.id, filing());
    await service.withdraw(TENANT, reading.id, "Register was double counted");

    expect(await repository.findByKpiAndPeriod(TENANT, kpi.id, 7)).toBeNull();
    expect(await repository.listLatestPerKpi(TENANT, ORG)).toEqual([]);
    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
  });

  it("answers a 404 for a reading nobody filed", async () => {
    const { service } = harness();

    let thrown: unknown;
    try {
      await service.withdraw(TENANT, MISSING, "Never existed");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(KpiReadingNotFoundError);
    expect((thrown as Error).message).toContain(MISSING);
  });

  it("keeps a blank reason as no reason rather than as whitespace", async () => {
    const { service, kpi } = await withDefinition();
    const reading = await service.record(TENANT, kpi.id, filing());

    const next = await service.withdraw(TENANT, reading.id, "   ");

    expect(next.withdrawnAt).not.toBeNull();
    expect(next.withdrawalReason).toBeNull();
  });

  it("refuses a second withdrawal, leaving the reason the first one gave", async () => {
    const { service, repository, kpi, events } = await withDefinition();
    const reading = await service.record(TENANT, kpi.id, filing());
    const withdrawn = await service.withdraw(TENANT, reading.id, "Register was double counted");

    let thrown: unknown;
    try {
      await service.withdraw(TENANT, reading.id, "Withdrawn again for good measure");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(KpiReadingAlreadyWithdrawnError);
    expect(await repository.findById(TENANT, reading.id)).toEqual(withdrawn);
    expect(events.types).toEqual([KPI_READING_RECORDED, KPI_READING_WITHDRAWN]);
  });
});

describe("reading figures back", () => {
  it("answers one reading, or a 404", async () => {
    const { service, kpi } = await withDefinition();
    const reading = await service.record(TENANT, kpi.id, filing());

    expect(await service.get(TENANT, reading.id)).toEqual(reading);

    let thrown: unknown;
    try {
      await service.get(OTHER, reading.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(KpiReadingNotFoundError);
  });

  it("answers the standing figure for a period, or null", async () => {
    const { service, kpi } = await withDefinition();
    const reading = await service.record(TENANT, kpi.id, filing());

    expect(await service.findForPeriod(TENANT, kpi.id, 7)).toEqual(reading);
    expect(await service.findForPeriod(TENANT, kpi.id, 8)).toBeNull();
  });

  it("serves one indicator's series oldest first", async () => {
    const { service, kpi } = await withDefinition();
    await service.record(TENANT, kpi.id, filing({ period: 9 }));
    await service.record(TENANT, kpi.id, filing({ period: 7 }));
    await service.record(TENANT, kpi.id, filing({ period: 8 }));

    expect((await service.listByKpi(TENANT, kpi.id)).map((entry) => entry.period)).toEqual([
      7, 8, 9,
    ]);
  });

  it("keeps a stale latest reading rather than dropping it for its age", async () => {
    const { service, definitions, kpi } = await withDefinition();
    const quiet = definition("finance.surplus");
    await definitions.save(quiet);
    await service.record(TENANT, quiet.id, filing({ period: 2 }));
    await service.record(TENANT, kpi.id, filing({ period: 9 }));

    const latest = await service.listLatest(TENANT, ORG);

    expect(latest.map((entry) => entry.period).sort()).toEqual([2, 9]);
  });

  it("lists every reading in the tenant, withdrawn ones included", async () => {
    const { service, kpi } = await withDefinition();
    const reading = await service.record(TENANT, kpi.id, filing());
    await service.withdraw(TENANT, reading.id, "Register was double counted");
    await service.record(TENANT, kpi.id, filing({ period: 8 }));

    expect(await service.list(TENANT)).toHaveLength(2);
  });
});

describe("announcing without a bus", () => {
  it("works with no event bus wired at all", async () => {
    const repository = new InMemoryKpiReadingRepository();
    const definitions = new InMemoryKpiDefinitionRepository();
    const kpi = definition();
    await definitions.save(kpi);
    const service = new KpiReadingService({
      repository,
      definitions,
      evidence: new StubEvidence(),
    });

    const reading = await service.record(TENANT, kpi.id, filing());

    expect(await repository.findById(TENANT, reading.id)).toEqual(reading);
  });
});
