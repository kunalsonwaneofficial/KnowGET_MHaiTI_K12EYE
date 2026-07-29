import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  AssessmentNotPublishableError,
  AssessmentPublishedError,
  DuplicateAssessmentKeyError,
  MaturityAssessmentNotFoundError,
  OrganizationNotFoundForEvolutionError,
  PersonNotFoundForEvolutionError,
  RepeatAreaReadingError,
  ScoreOffScaleError,
  UnknownCapabilityAreaError,
  UnusableWeightingError,
  UnweightedAreaError,
} from "./errors";
import { AREA_ASSESSED, ASSESSMENT_OPENED, ASSESSMENT_PUBLISHED } from "./evolution-events";
import { CAPABILITY_AREAS, CAPABILITY_AREA_COUNT, MIN_AREA_COVERAGE } from "./evolution-value";
import type { AreaWeight } from "./evolution-view";
import type { MaturityAssessment, OpenAssessmentParams } from "./maturity-assessment";
import { MaturityAssessmentService } from "./maturity-assessment-service";
import {
  InMemoryMaturityAssessmentRepository,
  type MaturityAssessmentRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";

const TENANT = "11111111-1111-4111-8111-111111111111" as TenantId;
const OTHER = "22222222-2222-4222-8222-222222222222" as TenantId;
const ORG = "33333333-3333-4333-8333-333333333333" as Uuid;
const ABSENT_ORG = "3a3a3a3a-3a3a-4a3a-8a3a-3a3a3a3a3a3a" as Uuid;
const ASSESSOR = "44444444-4444-4444-8444-444444444444" as Uuid;
const HEAD = "55555555-5555-4555-8555-555555555555" as Uuid;
const STRANGER = "77777777-7777-4777-8777-777777777777" as Uuid;
const MISSING = "99999999-9999-4999-8999-999999999999" as Uuid;

const KEY = "maturity-2026";
const SECOND_KEY = "maturity-2026-external";
const THIRD_KEY = "maturity-2027";

/** An even weighting across all ten areas: inside the per-area band, and summing to one. */
const EVENLY: readonly AreaWeight[] = CAPABILITY_AREAS.map((area) => ({
  area,
  weight: 1 / CAPABILITY_AREA_COUNT,
}));

/** Six areas an institution decided were the ones that matter. Six of ten is still six of ten. */
const SIX: readonly AreaWeight[] = CAPABILITY_AREAS.slice(0, 6).map((area, position) => ({
  area,
  weight: position === 0 ? 0.5 : 0.1,
}));

const params = (overrides: Partial<OpenAssessmentParams> = {}): OpenAssessmentParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  assessmentKey: KEY,
  period: 12,
  weights: EVENLY,
  openedBy: ASSESSOR,
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

class StubOrganizations implements OrganizationDirectory {
  readonly asked: Uuid[] = [];

  async exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean> {
    this.asked.push(organizationId);
    return tenantId === TENANT && organizationId === ORG;
  }
}

class StubPeople implements PersonDirectory {
  readonly asked: Uuid[] = [];
  private readonly known: readonly Uuid[] = [ASSESSOR, HEAD];

  async exists(tenantId: TenantId, personId: Uuid): Promise<boolean> {
    this.asked.push(personId);
    return tenantId === TENANT && this.known.includes(personId);
  }
}

interface Harness {
  readonly service: MaturityAssessmentService;
  readonly repository: MaturityAssessmentRepository;
  readonly organizations: StubOrganizations;
  readonly people: StubPeople;
  readonly events: Recorder;
}

const harness = (): Harness => {
  const repository = new InMemoryMaturityAssessmentRepository();
  const organizations = new StubOrganizations();
  const people = new StubPeople();
  const events = new Recorder();
  return {
    service: new MaturityAssessmentService({ repository, organizations, people, events }),
    repository,
    organizations,
    people,
    events,
  };
};

/** The house thrown-error idiom, with the awaiting kept out of the assertions. */
const refusalOf = async (act: () => Promise<unknown>): Promise<unknown> => {
  try {
    await act();
  } catch (error) {
    return error;
  }
  return null;
};

/** Read the first `count` areas at one score, each on a single piece of evidence. */
const readAreas = async (
  h: Harness,
  id: Uuid,
  count: number,
  score = 3,
): Promise<MaturityAssessment> => {
  let assessment = await h.service.get(TENANT, id);
  for (const area of CAPABILITY_AREAS.slice(0, count)) {
    assessment = await h.service.assess(TENANT, id, { area, score, evidenceCount: 1 });
  }
  return assessment;
};

/** An assessment read across seven of the ten areas, which is exactly the coverage floor. */
const publishable = async (
  h: Harness,
  overrides: Partial<OpenAssessmentParams> = {},
): Promise<MaturityAssessment> => {
  const opened = await h.service.open(params(overrides));
  return readAreas(h, opened.id, 7);
};

describe("opening an assessment", () => {
  it("stores an unread draft and announces it", async () => {
    const { service, repository, events } = harness();

    const assessment = await service.open(params());

    expect(assessment.assessmentKey).toBe(KEY);
    expect(assessment.publishedAt).toBeNull();
    expect(assessment.areas).toEqual([]);
    expect(assessment.areasReported).toBe(0);
    expect(assessment.coverage).toBe(0);
    expect(assessment.publishable).toBe(false);
    expect(await repository.findById(TENANT, assessment.id)).toEqual(assessment);
    expect(events.types).toEqual([ASSESSMENT_OPENED]);
  });

  it("stores the weighting the engine resolved rather than the one it was handed", async () => {
    const { service } = harness();

    const assessment = await service.open(params({ weights: SIX }));

    expect(assessment.weights).toHaveLength(6);
    expect(assessment.weights.map((entry) => entry.weight)).toEqual([0.5, 0.1, 0.1, 0.1, 0.1, 0.1]);
  });

  it("normalizes the key, so one series is addressed one way", async () => {
    const { service } = harness();

    const assessment = await service.open(params({ assessmentKey: "  Maturity-2026  " }));

    expect(assessment.assessmentKey).toBe(KEY);
  });

  it("checks the institution and the person opening it", async () => {
    const { service, organizations, people } = harness();

    await service.open(params());

    expect(organizations.asked).toEqual([ORG]);
    expect(people.asked).toEqual([ASSESSOR]);
  });

  it("refuses an organization the directory does not know, and stores nothing", async () => {
    const { service, repository, events } = harness();

    const thrown = await refusalOf(() => service.open(params({ organizationId: ABSENT_ORG })));

    expect(thrown).toBeInstanceOf(OrganizationNotFoundForEvolutionError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(events.published).toEqual([]);
  });

  it("refuses a person the directory does not know", async () => {
    const { service, repository } = harness();

    const thrown = await refusalOf(() => service.open(params({ openedBy: STRANGER })));

    expect(thrown).toBeInstanceOf(PersonNotFoundForEvolutionError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
  });

  it("refuses an unusable weighting before it asks the directory anything", async () => {
    const { service, organizations, people } = harness();

    const thrown = await refusalOf(() => service.open(params({ weights: [] })));

    expect(thrown).toBeInstanceOf(UnusableWeightingError);
    expect((thrown as UnusableWeightingError).details).toMatchObject({
      assessmentKey: KEY,
      issues: ["no_weights"],
    });
    expect(organizations.asked).toEqual([]);
    expect(people.asked).toEqual([]);
  });

  it("refuses a key another assessment already answers to", async () => {
    const { service, repository } = harness();
    await service.open(params());

    const thrown = await refusalOf(() => service.open(params({ period: 13 })));

    expect(thrown).toBeInstanceOf(DuplicateAssessmentKeyError);
    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
  });

  it("refuses a key a published assessment answers to, because the series is what a key is for", async () => {
    const h = harness();
    const assessment = await publishable(h);
    await h.service.publish(TENANT, assessment.id, HEAD);

    const thrown = await refusalOf(() => h.service.open(params({ period: 13 })));

    expect(thrown).toBeInstanceOf(DuplicateAssessmentKeyError);
  });

  it("opens a second assessment for one period, because a period can hold two honest readings", async () => {
    const { service } = harness();
    await service.open(params());

    const external = await service.open(params({ assessmentKey: SECOND_KEY }));

    expect(external.period).toBe(12);
    expect(await service.list(TENANT)).toHaveLength(2);
  });
});

describe("recording a reading", () => {
  it("announces the area the aggregate stored rather than the spelling that came in", async () => {
    const h = harness();
    const assessment = await h.service.open(params());

    await h.service.assess(TENANT, assessment.id, {
      area: "  Governance_And_Leadership  ",
      score: 4,
      evidenceCount: 3,
    });

    expect(h.events.types).toEqual([ASSESSMENT_OPENED, AREA_ASSESSED]);
    expect(h.events.published[1]?.payload).toMatchObject({
      area: "governance_and_leadership",
      evidenceCount: 3,
    });
  });

  it("re-runs the engine over every stored reading rather than nudging the index", async () => {
    const h = harness();
    const opened = await h.service.open(params());
    await h.service.assess(TENANT, opened.id, {
      area: "governance_and_leadership",
      score: 2,
      evidenceCount: 1,
    });

    const assessment = await h.service.assess(TENANT, opened.id, {
      area: "academic_practice",
      score: 4,
      evidenceCount: 1,
    });

    expect(assessment.index).toBe(3);
    expect(assessment.areasReported).toBe(2);
  });

  it("stores a reading nobody had evidence for, and does not let it raise coverage", async () => {
    const h = harness();
    const opened = await h.service.open(params());

    const assessment = await h.service.assess(TENANT, opened.id, {
      area: "learner_support",
      score: 5,
      evidenceCount: 0,
    });

    expect(assessment.areas).toHaveLength(1);
    expect(assessment.areas[0]?.reported).toBe(false);
    expect(assessment.areasReported).toBe(0);
    expect(assessment.coverage).toBe(0);
  });

  it("refuses a second reading for one area", async () => {
    const h = harness();
    const opened = await h.service.open(params());
    await readAreas(h, opened.id, 1);

    const thrown = await refusalOf(() =>
      h.service.assess(TENANT, opened.id, {
        area: "governance_and_leadership",
        score: 5,
        evidenceCount: 9,
      }),
    );

    expect(thrown).toBeInstanceOf(RepeatAreaReadingError);
    expect((await h.service.get(TENANT, opened.id)).areas).toHaveLength(1);
  });

  it("refuses an area that is not one of the ten", async () => {
    const h = harness();
    const opened = await h.service.open(params());

    const thrown = await refusalOf(() =>
      h.service.assess(TENANT, opened.id, { area: "morale", score: 3, evidenceCount: 2 }),
    );

    expect(thrown).toBeInstanceOf(UnknownCapabilityAreaError);
  });

  it("refuses an area this assessment gave no weight", async () => {
    const h = harness();
    const opened = await h.service.open(params({ weights: SIX }));

    const thrown = await refusalOf(() =>
      h.service.assess(TENANT, opened.id, {
        area: CAPABILITY_AREAS[6],
        score: 3,
        evidenceCount: 2,
      }),
    );

    expect(thrown).toBeInstanceOf(UnweightedAreaError);
  });

  it("refuses a score off the scale, and stores nothing", async () => {
    const h = harness();
    const opened = await h.service.open(params());

    const thrown = await refusalOf(() =>
      h.service.assess(TENANT, opened.id, {
        area: "staff_capability",
        score: 6,
        evidenceCount: 2,
      }),
    );

    expect(thrown).toBeInstanceOf(ScoreOffScaleError);
    expect((await h.service.get(TENANT, opened.id)).areas).toEqual([]);
    expect(h.events.types).toEqual([ASSESSMENT_OPENED]);
  });

  it("refuses a reading against a published assessment", async () => {
    const h = harness();
    const assessment = await publishable(h);
    await h.service.publish(TENANT, assessment.id, HEAD);

    const thrown = await refusalOf(() =>
      h.service.assess(TENANT, assessment.id, {
        area: "stakeholder_engagement",
        score: 4,
        evidenceCount: 2,
      }),
    );

    expect(thrown).toBeInstanceOf(AssessmentPublishedError);
  });

  it("404s on an assessment this tenant cannot see", async () => {
    const { service } = harness();

    const thrown = await refusalOf(() =>
      service.assess(TENANT, MISSING, {
        area: "operational_process",
        score: 3,
        evidenceCount: 1,
      }),
    );

    expect(thrown).toBeInstanceOf(MaturityAssessmentNotFoundError);
    expect((thrown as MaturityAssessmentNotFoundError).details).toMatchObject({ id: MISSING });
  });
});

describe("publishing the index", () => {
  it("publishes once the institution has read enough of itself", async () => {
    const h = harness();
    const assessment = await publishable(h);

    const published = await h.service.publish(TENANT, assessment.id, HEAD);

    expect(published.publishedAt).not.toBeNull();
    expect(published.publishedBy).toBe(HEAD);
    expect(published.coverage).toBe(0.7);
    expect(h.events.types.at(-1)).toBe(ASSESSMENT_PUBLISHED);
    expect(h.events.published.at(-1)?.payload).toMatchObject({
      index: published.index,
      level: published.level,
      published: true,
    });
  });

  it("withholds the number until publication, while letting coverage travel throughout", async () => {
    const h = harness();
    await publishable(h);

    for (const event of h.events.published) {
      expect(event.payload).toMatchObject({ index: null, level: null });
    }
    expect(h.events.published.at(-1)?.payload).toMatchObject({ coverage: 0.7, publishable: true });
  });

  it("refuses to publish below the coverage floor, naming the coverage it had", async () => {
    const h = harness();
    const opened = await h.service.open(params());
    await readAreas(h, opened.id, 6);

    const thrown = await refusalOf(() => h.service.publish(TENANT, opened.id, HEAD));

    expect(thrown).toBeInstanceOf(AssessmentNotPublishableError);
    expect((thrown as AssessmentNotPublishableError).details).toMatchObject({
      id: opened.id,
      coverage: 0.6,
      required: MIN_AREA_COVERAGE,
    });
  });

  it("refuses to publish an assessment that measured nothing", async () => {
    const h = harness();
    const opened = await h.service.open(params());

    const thrown = await refusalOf(() => h.service.publish(TENANT, opened.id, HEAD));

    expect(thrown).toBeInstanceOf(AssessmentNotPublishableError);
    expect((await h.service.get(TENANT, opened.id)).publishedAt).toBeNull();
  });

  it("refuses to publish an assessment twice", async () => {
    const h = harness();
    const assessment = await publishable(h);
    await h.service.publish(TENANT, assessment.id, HEAD);

    const thrown = await refusalOf(() => h.service.publish(TENANT, assessment.id, HEAD));

    expect(thrown).toBeInstanceOf(AssessmentPublishedError);
  });

  it("checks the person standing behind the number before it looks for the assessment", async () => {
    const { service } = harness();

    const thrown = await refusalOf(() => service.publish(TENANT, MISSING, STRANGER));

    expect(thrown).toBeInstanceOf(PersonNotFoundForEvolutionError);
  });

  it("counts coverage against the whole institution, not against the weighting declared", async () => {
    const h = harness();
    const opened = await h.service.open(params({ weights: SIX }));
    const read = await readAreas(h, opened.id, 6);

    expect(read.areasReported).toBe(6);
    expect(read.coverage).toBe(0.6);
    expect(read.publishable).toBe(false);
    expect(await refusalOf(() => h.service.publish(TENANT, opened.id, HEAD))).toBeInstanceOf(
      AssessmentNotPublishableError,
    );
  });
});

describe("reading the record", () => {
  it("finds an assessment by the key it was actually stored under", async () => {
    const { service } = harness();
    const assessment = await service.open(params({ assessmentKey: "  Maturity-2026  " }));

    expect(await service.getByKey(TENANT, "  MATURITY-2026 ")).toEqual(assessment);
  });

  it("404s on a key nothing answers to, naming the form it searched for", async () => {
    const { service } = harness();

    const thrown = await refusalOf(() => service.getByKey(TENANT, "  Maturity-2099 "));

    expect(thrown).toBeInstanceOf(MaturityAssessmentNotFoundError);
    expect((thrown as MaturityAssessmentNotFoundError).details).toMatchObject({
      id: "maturity-2099",
    });
  });

  it("lists the published series in period order", async () => {
    const h = harness();
    const early = await publishable(h, { assessmentKey: KEY, period: 12 });
    const draft = await h.service.open(params({ assessmentKey: SECOND_KEY, period: 13 }));
    const late = await publishable(h, { assessmentKey: THIRD_KEY, period: 14 });
    await h.service.publish(TENANT, late.id, HEAD);
    await h.service.publish(TENANT, early.id, HEAD);

    const series = await h.service.listPublished(TENANT, ORG);

    expect(series.map((assessment) => assessment.period)).toEqual([12, 14]);
    expect(series.map((assessment) => assessment.id)).not.toContain(draft.id);
  });

  it("lists drafts and published assessments alike for the tenant", async () => {
    const h = harness();
    await publishable(h);
    await h.service.open(params({ assessmentKey: SECOND_KEY }));

    expect(await h.service.list(TENANT)).toHaveLength(2);
    expect(await h.service.listPublished(TENANT, ORG)).toEqual([]);
  });

  it("never answers across a tenant boundary", async () => {
    const { service } = harness();
    const assessment = await service.open(params());

    expect(await refusalOf(() => service.get(OTHER, assessment.id))).toBeInstanceOf(
      MaturityAssessmentNotFoundError,
    );
    expect(await service.list(OTHER)).toEqual([]);
  });
});

describe("what the service will not do", () => {
  const methods = (): string[] => Object.getOwnPropertyNames(MaturityAssessmentService.prototype);

  it("has no method that moves a published index", () => {
    for (const verb of ["amend", "correct", "reopen", "restate", "revise", "unpublish"]) {
      expect(methods()).not.toContain(verb);
    }
  });

  it("has no method that acts on what the assessment found", () => {
    for (const verb of ["apply", "deploy", "enact", "execute", "remediate", "rollout"]) {
      expect(methods()).not.toContain(verb);
    }
  });

  it("has no method that removes an assessment from the series", () => {
    for (const verb of ["archive", "delete", "destroy", "purge", "remove"]) {
      expect(methods()).not.toContain(verb);
    }
  });

  it("runs without an event bus, because announcing is not what makes the index true", async () => {
    const repository = new InMemoryMaturityAssessmentRepository();
    const service = new MaturityAssessmentService({
      repository,
      organizations: new StubOrganizations(),
      people: new StubPeople(),
    });

    const assessment = await service.open(params());

    expect(await repository.findById(TENANT, assessment.id)).toEqual(assessment);
  });
});
