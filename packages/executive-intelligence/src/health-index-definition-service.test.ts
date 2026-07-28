import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  INDEX_DEFINED,
  INDEX_PUBLISHED,
  INDEX_RENAMED,
  INDEX_RETIRED,
  INDEX_REWEIGHTED,
  INDEX_SUPERSEDED,
} from "./command-events";
import type { PillarWeight } from "./command-view";
import {
  DuplicateIndexKeyError,
  HealthIndexDefinitionNotFoundError,
  IndexWeightsFrozenError,
  OrganizationNotFoundForCommandError,
  SupersessionKeyMismatchError,
  UnusableIndexWeightsError,
} from "./errors";
import type { DefineHealthIndexParams, HealthIndexDefinition } from "./health-index-definition";
import { HealthIndexDefinitionService } from "./health-index-definition-service";
import {
  type HealthIndexDefinitionRepository,
  InMemoryHealthIndexDefinitionRepository,
  type OrganizationDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org1" as Uuid;
const ABSENT = "org-nowhere" as Uuid;
const MISSING = "index-nowhere" as Uuid;

const WEIGHTS: readonly PillarWeight[] = [
  { pillar: "academic_outcomes", weight: 0.25 },
  { pillar: "teaching_quality", weight: 0.2 },
  { pillar: "attendance_engagement", weight: 0.2 },
  { pillar: "financial_health", weight: 0.15 },
  { pillar: "learner_wellbeing", weight: 0.1 },
  { pillar: "workforce_capacity", weight: 0.1 },
];

const SHIFTED: readonly PillarWeight[] = [
  { pillar: "academic_outcomes", weight: 0.3 },
  { pillar: "teaching_quality", weight: 0.2 },
  { pillar: "attendance_engagement", weight: 0.2 },
  { pillar: "financial_health", weight: 0.1 },
  { pillar: "learner_wellbeing", weight: 0.1 },
  { pillar: "workforce_capacity", weight: 0.1 },
];

/** Balanced and in band, but narrower than the platform's floor — publishable nowhere. */
const THIN: readonly PillarWeight[] = [
  { pillar: "academic_outcomes", weight: 0.3 },
  { pillar: "teaching_quality", weight: 0.2 },
  { pillar: "attendance_engagement", weight: 0.2 },
  { pillar: "financial_health", weight: 0.2 },
  { pillar: "learner_wellbeing", weight: 0.1 },
];

const params = (overrides: Partial<DefineHealthIndexParams> = {}): DefineHealthIndexParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  indexKey: "institutional.health",
  name: "Institutional health",
  description: "How the school is doing, one number",
  grain: "term",
  weights: WEIGHTS,
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
  readonly service: HealthIndexDefinitionService;
  readonly repository: HealthIndexDefinitionRepository;
  readonly organizations: StubDirectory;
  readonly events: Recorder;
}

const harness = (known: readonly Uuid[] = [ORG]): Harness => {
  const repository = new InMemoryHealthIndexDefinitionRepository();
  const organizations = new StubDirectory(known);
  const events = new Recorder();
  return {
    service: new HealthIndexDefinitionService({ repository, organizations, events }),
    repository,
    organizations,
    events,
  };
};

/** A published definition of the default series, and the harness it lives in. */
const inForce = async (): Promise<Harness & { incumbent: HealthIndexDefinition }> => {
  const built = harness();
  const draft = await built.service.define(params());
  const incumbent = await built.service.publish(TENANT, draft.id);
  return { ...built, incumbent };
};

describe("declaring a composition", () => {
  it("stores the draft and announces it", async () => {
    const { service, repository, events } = harness();

    const definition = await service.define(params());

    expect(definition.status).toBe("draft");
    expect(definition.weights).toEqual(WEIGHTS);
    expect(await repository.findById(TENANT, definition.id)).toEqual(definition);
    expect(events.types).toEqual([INDEX_DEFINED]);
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

  it("refuses a malformed request before touching the directory", async () => {
    const { service, organizations } = harness();

    let thrown: unknown;
    try {
      await service.define(params({ indexKey: "   " }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(organizations.asked).toEqual([]);
  });

  it("does not validate the weighting at declaration, so an argument in progress can be saved", async () => {
    const { service, repository } = harness();

    const definition = await service.define(params({ weights: THIN }));

    expect(definition.weights).toHaveLength(5);
    expect(await repository.findById(TENANT, definition.id)).toEqual(definition);
  });

  it("allows a second draft on a series that already has one in force", async () => {
    const { service, repository } = await inForce();

    const rival = await service.define(params({ weights: SHIFTED, name: "Next year's weighting" }));

    expect(rival.status).toBe("draft");
    expect(await repository.listByKey(TENANT, "institutional.health")).toHaveLength(2);
  });
});

describe("moving a draft's weighting and its label", () => {
  it("reweights a draft and announces it", async () => {
    const { service, repository, events } = harness();
    const definition = await service.define(params());

    const next = await service.reweight(TENANT, definition.id, SHIFTED);

    expect(next.weights).toEqual(SHIFTED);
    expect(await repository.findById(TENANT, definition.id)).toEqual(next);
    expect(events.types).toEqual([INDEX_DEFINED, INDEX_REWEIGHTED]);
  });

  it("refuses to reweight a composition in service, and leaves it as it was", async () => {
    const { service, repository, incumbent } = await inForce();

    let thrown: unknown;
    try {
      await service.reweight(TENANT, incumbent.id, SHIFTED);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(IndexWeightsFrozenError);
    expect(await repository.findById(TENANT, incumbent.id)).toEqual(incumbent);
  });

  it("renames a composition in service, because a label does not compute a value", async () => {
    const { service, events, incumbent } = await inForce();

    const next = await service.rename(TENANT, incumbent.id, { name: "Whole-school health" });

    expect(next.name).toBe("Whole-school health");
    expect(next.description).toBe(incumbent.description);
    expect(next.indexKey).toBe(incumbent.indexKey);
    expect(events.types).toEqual([INDEX_DEFINED, INDEX_PUBLISHED, INDEX_RENAMED]);
  });

  it("clears the description when the rename passes null for it", async () => {
    const { service } = harness();
    const definition = await service.define(params());

    const next = await service.rename(TENANT, definition.id, {
      name: "Institutional health",
      description: null,
    });

    expect(next.description).toBeNull();
  });
});

describe("putting a composition into service", () => {
  it("publishes and announces it, and it becomes the one in force for the series", async () => {
    const { service, repository, events } = harness();
    const definition = await service.define(params());

    const next = await service.publish(TENANT, definition.id);

    expect(next.status).toBe("published");
    expect(next.publishedAt).not.toBeNull();
    expect(await repository.findPublishedByKey(TENANT, "institutional.health")).toEqual(next);
    expect(events.types).toEqual([INDEX_DEFINED, INDEX_PUBLISHED]);
  });

  it("refuses a second composition of the same series while one is already in force", async () => {
    const { service, repository } = await inForce();
    const rival = await service.define(params({ weights: SHIFTED }));

    let thrown: unknown;
    try {
      await service.publish(TENANT, rival.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DuplicateIndexKeyError);
    expect((await repository.findById(TENANT, rival.id))?.status).toBe("draft");
  });

  it("reports re-publishing the same definition as a bad transition rather than as a duplicate", async () => {
    const { service, incumbent } = await inForce();

    let thrown: unknown;
    try {
      await service.publish(TENANT, incumbent.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(DuplicateIndexKeyError);
  });

  it("refuses a weighting narrower than the platform's floor, naming every fault at once", async () => {
    const { service, repository, events } = harness();
    const definition = await service.define(params({ weights: THIN }));

    let thrown: unknown;
    try {
      await service.publish(TENANT, definition.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnusableIndexWeightsError);
    expect((thrown as Error).message).toContain("too_few_pillars");
    expect((await repository.findById(TENANT, definition.id))?.status).toBe("draft");
    expect(events.types).toEqual([INDEX_DEFINED]);
  });

  it("lets a series be published again once the incumbent has stepped down", async () => {
    const { service, incumbent } = await inForce();
    const successor = await service.define(params({ weights: SHIFTED }));
    await service.supersede(TENANT, incumbent.id, successor.id);

    expect((await service.publish(TENANT, successor.id)).status).toBe("published");
  });
});

describe("handing one composition's job to the next", () => {
  it("records the successor and announces the supersession", async () => {
    const { service, repository, events, incumbent } = await inForce();
    const successor = await service.define(params({ weights: SHIFTED }));

    const next = await service.supersede(TENANT, incumbent.id, successor.id);

    expect(next.status).toBe("superseded");
    expect(next.supersededById).toBe(successor.id);
    expect(await repository.findPublishedByKey(TENANT, "institutional.health")).toBeNull();
    expect(events.types).toEqual([INDEX_DEFINED, INDEX_PUBLISHED, INDEX_DEFINED, INDEX_SUPERSEDED]);
  });

  it("refuses a successor belonging to a different series, and leaves the incumbent in force", async () => {
    const { service, repository, incumbent } = await inForce();
    const stranger = await service.define(params({ indexKey: "safeguarding.health" }));

    let thrown: unknown;
    try {
      await service.supersede(TENANT, incumbent.id, stranger.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SupersessionKeyMismatchError);
    expect((thrown as Error).message).toContain("safeguarding.health");
    expect(await repository.findById(TENANT, incumbent.id)).toEqual(incumbent);
  });

  it("answers a 404 about the successor nobody holds", async () => {
    const { service, incumbent } = await inForce();

    let thrown: unknown;
    try {
      await service.supersede(TENANT, incumbent.id, MISSING);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HealthIndexDefinitionNotFoundError);
    expect((thrown as Error).message).toContain(MISSING);
  });
});

describe("recomposing in one operation", () => {
  it("steps the incumbent down, publishes the reweighted successor, and announces both", async () => {
    const { service, repository, events, incumbent } = await inForce();

    const { superseded, successor } = await service.recompose(TENANT, incumbent.id, SHIFTED);

    expect(superseded.status).toBe("superseded");
    expect(superseded.supersededById).toBe(successor.id);
    expect(successor.status).toBe("published");
    expect(successor.weights).toEqual(SHIFTED);
    expect(await repository.findPublishedByKey(TENANT, "institutional.health")).toEqual(successor);
    expect(events.types).toEqual([
      INDEX_DEFINED,
      INDEX_PUBLISHED,
      INDEX_SUPERSEDED,
      INDEX_DEFINED,
      INDEX_PUBLISHED,
    ]);
  });

  it("carries the series' key, grain, name and description across unchanged", async () => {
    const { service, incumbent } = await inForce();

    const { successor } = await service.recompose(TENANT, incumbent.id, SHIFTED);

    expect(successor.indexKey).toBe(incumbent.indexKey);
    expect(successor.grain).toBe(incumbent.grain);
    expect(successor.name).toBe(incumbent.name);
    expect(successor.description).toBe(incumbent.description);
    expect(successor.id).not.toBe(incumbent.id);
  });

  it("leaves both compositions readable, so a reader can walk the reweighting", async () => {
    const { service, incumbent } = await inForce();

    const { successor } = await service.recompose(TENANT, incumbent.id, SHIFTED);
    const series = await service.listByKey(TENANT, "  INSTITUTIONAL.HEALTH ");

    expect(series).toHaveLength(2);
    expect(series.map((entry) => entry.id)).toContain(incumbent.id);
    expect(series.map((entry) => entry.id)).toContain(successor.id);
  });

  it("writes nothing when the new weighting would not survive publication", async () => {
    const { service, repository, events, incumbent } = await inForce();

    let thrown: unknown;
    try {
      await service.recompose(TENANT, incumbent.id, THIN);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnusableIndexWeightsError);
    expect(await repository.findById(TENANT, incumbent.id)).toEqual(incumbent);
    expect(await repository.listByKey(TENANT, "institutional.health")).toHaveLength(1);
    expect(events.types).toEqual([INDEX_DEFINED, INDEX_PUBLISHED]);
  });

  it("writes nothing when the incumbent was never in service to be stepped down from", async () => {
    const { service, repository, events } = harness();
    const draft = await service.define(params());

    let thrown: unknown;
    try {
      await service.recompose(TENANT, draft.id, SHIFTED);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(await repository.listByKey(TENANT, "institutional.health")).toHaveLength(1);
    expect(events.types).toEqual([INDEX_DEFINED]);
  });
});

describe("retiring a composition", () => {
  it("retires a draft, because an abandoned argument is still institutional memory", async () => {
    const { service, repository, events } = harness();
    const definition = await service.define(params());

    const next = await service.retire(TENANT, definition.id);

    expect(next.status).toBe("retired");
    expect(await repository.findById(TENANT, definition.id)).toEqual(next);
    expect(events.types).toEqual([INDEX_DEFINED, INDEX_RETIRED]);
  });

  it("retires a composition in service and takes the series out of force", async () => {
    const { service, repository, incumbent } = await inForce();

    await service.retire(TENANT, incumbent.id);

    expect(await repository.findPublishedByKey(TENANT, "institutional.health")).toBeNull();
  });

  it("refuses to retire what has already been superseded", async () => {
    const { service, incumbent } = await inForce();
    const { superseded } = await service.recompose(TENANT, incumbent.id, SHIFTED);

    let thrown: unknown;
    try {
      await service.retire(TENANT, superseded.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
  });

  it("preserves the moment the composition was declared across every transition", async () => {
    const { service, incumbent } = await inForce();

    const retired = await service.retire(TENANT, incumbent.id);

    expect(retired.createdAt).toBe(incumbent.createdAt);
  });
});

describe("reading compositions back", () => {
  it("answers a 404 naming the id nobody holds", async () => {
    const { service } = harness();

    let thrown: unknown;
    try {
      await service.get(TENANT, MISSING);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HealthIndexDefinitionNotFoundError);
    expect((thrown as Error).message).toContain(MISSING);
  });

  it("does not serve another tenant's definition", async () => {
    const { service, incumbent } = await inForce();

    let thrown: unknown;
    try {
      await service.get(OTHER, incumbent.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HealthIndexDefinitionNotFoundError);
  });

  it("resolves what is in force by the normalized key, and answers null when nothing is", async () => {
    const { service, incumbent } = await inForce();

    expect(await service.findPublished(TENANT, "  Institutional.Health ")).toEqual(incumbent);
    expect(await service.findPublished(TENANT, "safeguarding.health")).toBeNull();
  });

  it("lists a series' whole history, and everything the tenant has ever composed", async () => {
    const { service, incumbent } = await inForce();
    await service.recompose(TENANT, incumbent.id, SHIFTED);
    await service.define(params({ indexKey: "safeguarding.health", name: "Safeguarding health" }));

    expect(await service.listByKey(TENANT, "institutional.health")).toHaveLength(2);
    expect(await service.list(TENANT)).toHaveLength(3);
  });
});

describe("announcing without a bus", () => {
  it("works with no event bus wired at all", async () => {
    const repository = new InMemoryHealthIndexDefinitionRepository();
    const service = new HealthIndexDefinitionService({
      repository,
      organizations: new StubDirectory(),
    });

    const definition = await service.publish(TENANT, (await service.define(params())).id);

    expect(definition.status).toBe("published");
    expect(await repository.findById(TENANT, definition.id)).toEqual(definition);
  });
});
