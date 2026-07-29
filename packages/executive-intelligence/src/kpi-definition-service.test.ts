import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  KPI_ACTIVATED,
  KPI_DEFINED,
  KPI_RENAMED,
  KPI_RESCALED,
  KPI_RETARGETED,
  KPI_RETIRED,
} from "./command-events";
import type { MeasurementScale } from "./command-view";
import {
  DuplicateKpiKeyError,
  KpiDefinitionNotFoundError,
  OrganizationNotFoundForCommandError,
} from "./errors";
import { type DefineKpiParams, activateKpi, defineKpi, retireKpi } from "./kpi-definition";
import { KpiDefinitionService } from "./kpi-definition-service";
import {
  InMemoryKpiDefinitionRepository,
  type KpiDefinitionRepository,
  type OrganizationDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org1" as Uuid;
const ABSENT = "org-nowhere" as Uuid;
const MISSING = "kpi-nowhere" as Uuid;

const scale: MeasurementScale = {
  unit: "percentage",
  polarity: "higher_is_better",
  anchors: [
    { value: 85, score: 0 },
    { value: 90, score: 50 },
    { value: 96, score: 100 },
  ],
};

const params = (overrides: Partial<DefineKpiParams> = {}): DefineKpiParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  kpiKey: "attendance.rate",
  name: "Attendance rate",
  pillar: "attendance_engagement",
  sourceDomain: "attendance",
  scale,
  targetScore: 80,
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

class StubDirectory implements OrganizationDirectory {
  readonly asked: Uuid[] = [];
  private readonly known: readonly Uuid[];

  constructor(known: readonly Uuid[] = [ORG]) {
    this.known = known;
  }

  async exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean> {
    this.asked.push(organizationId);
    return tenantId === TENANT && this.known.includes(organizationId);
  }
}

interface Harness {
  readonly service: KpiDefinitionService;
  readonly repository: KpiDefinitionRepository;
  readonly organizations: StubDirectory;
  readonly events: Recorder;
}

const harness = (known: readonly Uuid[] = [ORG]): Harness => {
  const repository = new InMemoryKpiDefinitionRepository();
  const organizations = new StubDirectory(known);
  const events = new Recorder();
  return {
    service: new KpiDefinitionService({ repository, organizations, events }),
    repository,
    organizations,
    events,
  };
};

describe("declaring an indicator", () => {
  it("stores the definition and announces it", async () => {
    const { service, repository, events } = harness();

    const definition = await service.define(params());

    expect(definition.kpiKey).toBe("attendance.rate");
    expect(definition.status).toBe("draft");
    expect(await repository.findById(TENANT, definition.id)).toEqual(definition);
    expect(events.types).toEqual([KPI_DEFINED]);
  });

  it("checks the institution exists through the directory port", async () => {
    const { service, organizations } = harness();

    await service.define(params());

    expect(organizations.asked).toEqual([ORG]);
  });

  it("refuses an organization the directory does not know, and stores nothing", async () => {
    const { service, repository, events } = harness();

    let thrown: unknown;
    try {
      await service.define(params({ organizationId: ABSENT }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(OrganizationNotFoundForCommandError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(events.published).toEqual([]);
  });

  it("refuses a key another definition already answers to", async () => {
    const { service, repository, events } = harness();
    await service.define(params());

    let thrown: unknown;
    try {
      await service.define(params({ name: "Attendance, again" }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DuplicateKpiKeyError);
    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect(events.types).toEqual([KPI_DEFINED]);
  });

  it("compares the normalized key rather than the string the caller typed", async () => {
    const { service } = harness();
    await service.define(params({ kpiKey: "  Attendance.Rate  " }));

    let thrown: unknown;
    try {
      await service.define(params({ kpiKey: "attendance.rate" }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DuplicateKpiKeyError);
  });

  it("holds a key a retired definition still owns", async () => {
    const { service, repository } = harness();
    const held = retireKpi(activateKpi(defineKpi(params())));
    await repository.save(held);

    let thrown: unknown;
    try {
      await service.define(params());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DuplicateKpiKeyError);
  });

  it("refuses a malformed request before touching the store or the directory", async () => {
    const { service, repository, organizations, events } = harness();

    let thrown: unknown;
    try {
      await service.define(params({ kpiKey: "   " }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(organizations.asked).toEqual([]);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(events.published).toEqual([]);
  });

  it("lets a sibling institution declare the same key nowhere, because keys are tenant-wide", async () => {
    const { service } = harness([ORG, "org2" as Uuid]);
    await service.define(params());

    let thrown: unknown;
    try {
      await service.define(params({ organizationId: "org2" as Uuid }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DuplicateKpiKeyError);
  });
});

describe("moving what a draft indicator says about itself", () => {
  it("re-anchors the scale and announces it", async () => {
    const { service, repository, events } = harness();
    const definition = await service.define(params());

    const next = await service.reviseScale(TENANT, definition.id, {
      ...scale,
      polarity: "lower_is_better",
    });

    expect(next.scale.polarity).toBe("lower_is_better");
    expect(await repository.findById(TENANT, definition.id)).toEqual(next);
    expect(events.types).toEqual([KPI_DEFINED, KPI_RESCALED]);
  });

  it("renames without moving the key", async () => {
    const { service, events } = harness();
    const definition = await service.define(params());

    const next = await service.rename(TENANT, definition.id, {
      name: "Daily attendance rate",
      description: "Sessions attended over sessions possible",
    });

    expect(next.name).toBe("Daily attendance rate");
    expect(next.kpiKey).toBe(definition.kpiKey);
    expect(events.types).toEqual([KPI_DEFINED, KPI_RENAMED]);
  });

  it("moves the target the institution is aiming at, and clears it with null", async () => {
    const { service, events } = harness();
    const definition = await service.define(params());

    expect((await service.retarget(TENANT, definition.id, 90)).targetScore).toBe(90);
    expect((await service.retarget(TENANT, definition.id, null)).targetScore).toBeNull();
    expect(events.types).toEqual([KPI_DEFINED, KPI_RETARGETED, KPI_RETARGETED]);
  });

  it("surfaces the aggregate's refusal to rescale an indicator in service", async () => {
    const { service, repository } = harness();
    const definition = await service.define(params());
    const live = await service.activate(TENANT, definition.id);

    let thrown: unknown;
    try {
      await service.reviseScale(TENANT, definition.id, { ...scale, unit: "count" });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(await repository.findById(TENANT, definition.id)).toEqual(live);
  });
});

describe("putting an indicator into service and taking it out", () => {
  it("activates and announces it", async () => {
    const { service, repository, events } = harness();
    const definition = await service.define(params());

    const next = await service.activate(TENANT, definition.id);

    expect(next.status).toBe("active");
    expect(await repository.listActive(TENANT, ORG)).toEqual([next]);
    expect(events.types).toEqual([KPI_DEFINED, KPI_ACTIVATED]);
  });

  it("retires without removing the definition its readings were scored against", async () => {
    const { service, repository, events } = harness();
    const definition = await service.define(params());
    await service.activate(TENANT, definition.id);

    const next = await service.retire(TENANT, definition.id);

    expect(next.status).toBe("retired");
    expect(await repository.listActive(TENANT, ORG)).toEqual([]);
    expect(await repository.findById(TENANT, definition.id)).toEqual(next);
    expect(events.types).toEqual([KPI_DEFINED, KPI_ACTIVATED, KPI_RETIRED]);
  });

  it("preserves the moment the indicator was declared across every transition", async () => {
    const { service } = harness();
    const definition = await service.define(params());

    const retired = await service.retire(
      TENANT,
      (await service.activate(TENANT, definition.id)).id,
    );

    expect(retired.createdAt).toBe(definition.createdAt);
  });
});

describe("reading indicators back", () => {
  it("answers a 404 naming the id nobody holds", async () => {
    const { service } = harness();

    let thrown: unknown;
    try {
      await service.get(TENANT, MISSING);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(KpiDefinitionNotFoundError);
    expect((thrown as Error).message).toContain(MISSING);
  });

  it("resolves by key, and the refusal names the normalized form rather than what was typed", async () => {
    const { service } = harness();
    const definition = await service.define(params());

    expect(await service.getByKey(TENANT, "  ATTENDANCE.RATE ")).toEqual(definition);

    let thrown: unknown;
    try {
      await service.getByKey(TENANT, "  Finance.Surplus ");
    } catch (error) {
      thrown = error;
    }

    expect((thrown as Error).message).toContain("finance.surplus");
  });

  it("does not serve another tenant's definition", async () => {
    const { service } = harness();
    const definition = await service.define(params());

    let thrown: unknown;
    try {
      await service.get(OTHER, definition.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(KpiDefinitionNotFoundError);
  });

  it("lists what the institution currently measures, and everything it has ever declared", async () => {
    const { service } = harness();
    const live = await service.define(params());
    await service.activate(TENANT, live.id);
    await service.define(params({ kpiKey: "finance.surplus", name: "Surplus" }));

    expect(await service.listActive(TENANT, ORG)).toHaveLength(1);
    expect(await service.list(TENANT)).toHaveLength(2);
  });
});

describe("announcing without a bus", () => {
  it("works with no event bus wired at all", async () => {
    const repository = new InMemoryKpiDefinitionRepository();
    const service = new KpiDefinitionService({
      repository,
      organizations: new StubDirectory(),
    });

    const definition = await service.activate(TENANT, (await service.define(params())).id);

    expect(definition.status).toBe("active");
    expect(await repository.findById(TENANT, definition.id)).toEqual(definition);
  });
});
