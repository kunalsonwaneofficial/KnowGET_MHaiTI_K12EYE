import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { OpenReviewParams, RecordBenefitParams } from "./adoption-review";
import { AdoptionReviewService } from "./adoption-review-service";
import {
  AdoptionReviewNotFoundError,
  BenefitAlreadyObservedError,
  BenefitNotClaimedError,
  DuplicateAdoptionReviewError,
  IncoherentBenefitClaimError,
  InitiativeNotAdoptedError,
  OrganizationNotFoundForEvolutionError,
  PersonNotFoundForEvolutionError,
  RepeatBenefitClaimError,
  ReviewConcludedError,
} from "./errors";
import {
  BENEFIT_CLAIMED,
  BENEFIT_OBSERVED,
  REVIEW_CONCLUDED,
  REVIEW_OPENED,
} from "./evolution-events";
import {
  type ImprovementInitiative,
  type ProposeInitiativeParams,
  adoptInitiative,
  approveInitiative,
  proposeInitiative,
  startInitiativePilot,
  startInitiativeReview,
  submitInitiative,
  withdrawInitiative,
} from "./improvement-initiative";
import {
  type AdoptionReviewRepository,
  InMemoryAdoptionReviewRepository,
  InMemoryImprovementInitiativeRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";

const TENANT = "11111111-1111-4111-8111-111111111111" as TenantId;
const OTHER = "22222222-2222-4222-8222-222222222222" as TenantId;
const ORG = "33333333-3333-4333-8333-333333333333" as Uuid;
const ABSENT_ORG = "3a3a3a3a-3a3a-4a3a-8a3a-3a3a3a3a3a3a" as Uuid;
const PROPOSER = "44444444-4444-4444-8444-444444444444" as Uuid;
const REVIEWER = "55555555-5555-4555-8555-555555555555" as Uuid;
const STRANGER = "77777777-7777-4777-8777-777777777777" as Uuid;
const MISSING = "99999999-9999-4999-8999-999999999999" as Uuid;

const KEY = "academic.marking-window";
const ABANDONED_KEY = "academic.marking-triage";
const SUMMARY = "Move marking moderation out of the fortnight the reports are written in.";

/** The period the fixture pilots from. A pilot must run a whole period, so adoption lands after it. */
const PILOT_START = 4;
const REVIEW_PERIOD = 8;
const LATER_PERIOD = 12;

const ATTENDANCE = "attendance.rate";
const TURNAROUND = "marking.turnaround-days";

const proposal = (overrides: Partial<ProposeInitiativeParams> = {}): ProposeInitiativeParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  initiativeKey: KEY,
  changeClass: "process",
  summary: SUMMARY,
  originatingSignalIds: [],
  proposedBy: PROPOSER,
  ...overrides,
});

/** An initiative walked the whole way to `adopted`, which is the only state a review may open against. */
const adopted = (overrides: Partial<ProposeInitiativeParams> = {}): ImprovementInitiative => {
  const submitted = submitInitiative(proposeInitiative(proposal(overrides)));
  const approved = approveInitiative(startInitiativeReview(submitted), "satisfied");
  const piloting = startInitiativePilot(approved, PILOT_START);
  return adoptInitiative(piloting, "satisfied", PILOT_START + 1, PROPOSER);
};

const ADOPTED = adopted();
const WITHDRAWN = withdrawInitiative(
  proposeInitiative(proposal({ initiativeKey: ABANDONED_KEY })),
  PROPOSER,
  "Superseded by the timetable change.",
);

const INITIATIVE = ADOPTED.id;

const params = (overrides: Partial<OpenReviewParams> = {}): OpenReviewParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  initiativeId: INITIATIVE,
  reviewPeriod: REVIEW_PERIOD,
  openedBy: REVIEWER,
  ...overrides,
});

/** A benefit promising four points of attendance. Four points is also what the shortfall bands divide. */
const attendance = (overrides: Partial<RecordBenefitParams> = {}): RecordBenefitParams => ({
  measureKey: ATTENDANCE,
  direction: "increase",
  baseline: 88,
  target: 92,
  ...overrides,
});

/** A benefit pointing the other way, so that a verdict cannot be read off the arithmetic alone. */
const turnaround: RecordBenefitParams = {
  measureKey: TURNAROUND,
  direction: "decrease",
  baseline: 10,
  target: 6,
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

class StubOrganizations implements OrganizationDirectory {
  readonly asked: Uuid[] = [];

  async exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean> {
    this.asked.push(organizationId);
    return tenantId === TENANT && organizationId === ORG;
  }
}

class StubPeople implements PersonDirectory {
  readonly asked: Uuid[] = [];
  private readonly known: readonly Uuid[] = [PROPOSER, REVIEWER];

  async exists(tenantId: TenantId, personId: Uuid): Promise<boolean> {
    this.asked.push(personId);
    return tenantId === TENANT && this.known.includes(personId);
  }
}

interface Harness {
  readonly service: AdoptionReviewService;
  readonly repository: AdoptionReviewRepository;
  readonly initiatives: InMemoryImprovementInitiativeRepository;
  readonly organizations: StubOrganizations;
  readonly people: StubPeople;
  readonly events: Recorder;
}

const harness = (): Harness => {
  const repository = new InMemoryAdoptionReviewRepository();
  const initiatives = new InMemoryImprovementInitiativeRepository();
  const organizations = new StubOrganizations();
  const people = new StubPeople();
  const events = new Recorder();
  return {
    service: new AdoptionReviewService({
      repository,
      initiatives,
      organizations,
      people,
      events,
    }),
    repository,
    initiatives,
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

/** A harness holding the adopted change every review here is a review of. */
const seeded = async (): Promise<Harness> => {
  const h = harness();
  await h.initiatives.save(ADOPTED);
  return h;
};

/** A review opened against that change, at the interval the fixtures use. */
const openReviewAt = async (h: Harness, reviewPeriod = REVIEW_PERIOD): Promise<Uuid> => {
  const review = await h.service.open(params({ reviewPeriod }));
  return review.id;
};

describe("opening a review", () => {
  it("stores an open review that has measured nothing, and announces it", async () => {
    const h = await seeded();

    const review = await h.service.open(params());

    expect(review.initiativeId).toBe(INITIATIVE);
    expect(review.reviewPeriod).toBe(REVIEW_PERIOD);
    expect(review.benefits).toEqual([]);
    expect(review.verdict).toBe("inconclusive");
    expect(review.worstBand).toBeNull();
    expect(review.concludedAt).toBeNull();
    expect(await h.repository.findById(TENANT, review.id)).toEqual(review);
    expect(h.events.types).toEqual([REVIEW_OPENED]);
  });

  it("checks the institution and the person opening it", async () => {
    const h = await seeded();

    await h.service.open(params());

    expect(h.organizations.asked).toEqual([ORG]);
    expect(h.people.asked).toEqual([REVIEWER]);
  });

  it("refuses an organization the directory does not know, and stores nothing", async () => {
    const h = await seeded();

    const thrown = await refusalOf(() => h.service.open(params({ organizationId: ABSENT_ORG })));

    expect(thrown).toBeInstanceOf(OrganizationNotFoundForEvolutionError);
    expect(await h.repository.listByTenant(TENANT)).toEqual([]);
    expect(h.events.published).toEqual([]);
  });

  it("refuses a person the directory does not know", async () => {
    const h = await seeded();

    const thrown = await refusalOf(() => h.service.open(params({ openedBy: STRANGER })));

    expect(thrown).toBeInstanceOf(PersonNotFoundForEvolutionError);
    expect(await h.repository.listByTenant(TENANT)).toEqual([]);
  });

  it("refuses an initiative nobody can find, and says which one", async () => {
    const h = await seeded();

    const thrown = await refusalOf(() => h.service.open(params({ initiativeId: MISSING })));

    expect(thrown).toBeInstanceOf(InitiativeNotAdoptedError);
    expect((thrown as InitiativeNotAdoptedError).details).toMatchObject({
      initiativeId: MISSING,
      status: "unknown",
    });
  });

  it("refuses a change the institution withdrew, naming the status that stopped it", async () => {
    const h = await seeded();
    await h.initiatives.save(WITHDRAWN);

    const thrown = await refusalOf(() => h.service.open(params({ initiativeId: WITHDRAWN.id })));

    expect(thrown).toBeInstanceOf(InitiativeNotAdoptedError);
    expect((thrown as InitiativeNotAdoptedError).details).toMatchObject({ status: "withdrawn" });
  });

  it("reads the change before it reads the person, because that is the more useful refusal", async () => {
    const h = await seeded();

    const thrown = await refusalOf(() =>
      h.service.open(params({ initiativeId: MISSING, openedBy: STRANGER })),
    );

    expect(thrown).toBeInstanceOf(InitiativeNotAdoptedError);
  });

  it("refuses a second review of one change at one interval", async () => {
    const h = await seeded();
    await openReviewAt(h);

    const thrown = await refusalOf(() => h.service.open(params()));

    expect(thrown).toBeInstanceOf(DuplicateAdoptionReviewError);
    expect((thrown as DuplicateAdoptionReviewError).details).toMatchObject({
      initiativeId: INITIATIVE,
      reviewPeriod: REVIEW_PERIOD,
    });
    expect(await h.repository.listByTenant(TENANT)).toHaveLength(1);
  });

  it("opens a second review of one change at a later interval", async () => {
    const h = await seeded();
    await openReviewAt(h);

    const later = await h.service.open(params({ reviewPeriod: LATER_PERIOD }));

    expect(later.reviewPeriod).toBe(LATER_PERIOD);
    expect(await h.service.listByInitiative(TENANT, INITIATIVE)).toHaveLength(2);
  });
});

describe("claiming and observing benefits", () => {
  it("stores the claim unobserved and announces the promise it makes", async () => {
    const h = await seeded();
    const id = await openReviewAt(h);

    const review = await h.service.claim(TENANT, id, attendance());

    expect(review.benefits[0]?.promised).toBe(4);
    expect(review.benefits[0]?.observed).toBeNull();
    expect(review.benefitsClaimed).toBe(1);
    expect(review.benefitsMeasured).toBe(0);
    expect(h.events.types).toEqual([REVIEW_OPENED, BENEFIT_CLAIMED]);
    expect(h.events.published[1]?.payload).toMatchObject({
      measureKey: ATTENDANCE,
      direction: "increase",
      band: null,
      observed: false,
    });
  });

  it("announces the measure key the aggregate stored rather than the one that came in", async () => {
    const h = await seeded();
    const id = await openReviewAt(h);

    await h.service.claim(TENANT, id, attendance({ measureKey: "  Attendance.Rate  " }));

    expect(h.events.published[1]?.payload).toMatchObject({ measureKey: ATTENDANCE });
  });

  it("lands an observation and re-derives the verdict from it", async () => {
    const h = await seeded();
    const id = await openReviewAt(h);
    await h.service.claim(TENANT, id, attendance());

    const review = await h.service.observe(TENANT, id, ATTENDANCE, 92);

    expect(review.benefits[0]?.band).toBe("met");
    expect(review.benefitsMeasured).toBe(1);
    expect(review.verdict).toBe("sustained");
    expect(h.events.published.at(-1)?.payload).toMatchObject({
      measureKey: ATTENDANCE,
      ratio: 1,
      band: "met",
      observed: true,
    });
  });

  it("announces the benefit it found by key rather than the one claimed last", async () => {
    const h = await seeded();
    const id = await openReviewAt(h);
    await h.service.claim(TENANT, id, attendance());
    await h.service.claim(TENANT, id, turnaround);

    await h.service.observe(TENANT, id, "  Attendance.Rate ", 93);

    expect(h.events.types.at(-1)).toBe(BENEFIT_OBSERVED);
    expect(h.events.published.at(-1)?.payload).toMatchObject({
      measureKey: ATTENDANCE,
      band: "exceeded",
    });
  });

  it("lets the severest measured benefit decide the verdict", async () => {
    const h = await seeded();
    const id = await openReviewAt(h);
    await h.service.claim(TENANT, id, attendance());
    await h.service.claim(TENANT, id, turnaround);
    await h.service.observe(TENANT, id, ATTENDANCE, 93);

    const review = await h.service.observe(TENANT, id, TURNAROUND, 9);

    expect(review.worstBand).toBe("missed");
    expect(review.verdict).toBe("revert");
    expect(review.benefitsMeasured).toBe(2);
  });

  it("refuses a claim that promised no movement at all", async () => {
    const h = await seeded();
    const id = await openReviewAt(h);

    const thrown = await refusalOf(() => h.service.claim(TENANT, id, attendance({ target: 88 })));

    expect(thrown).toBeInstanceOf(IncoherentBenefitClaimError);
    expect((await h.service.get(TENANT, id)).benefits).toEqual([]);
  });

  it("refuses a second claim for one measure", async () => {
    const h = await seeded();
    const id = await openReviewAt(h);
    await h.service.claim(TENANT, id, attendance());

    const thrown = await refusalOf(() => h.service.claim(TENANT, id, attendance({ target: 95 })));

    expect(thrown).toBeInstanceOf(RepeatBenefitClaimError);
    expect((await h.service.get(TENANT, id)).benefits).toHaveLength(1);
  });

  it("refuses an observation against a measure nobody claimed", async () => {
    const h = await seeded();
    const id = await openReviewAt(h);

    const thrown = await refusalOf(() => h.service.observe(TENANT, id, TURNAROUND, 7));

    expect(thrown).toBeInstanceOf(BenefitNotClaimedError);
  });

  it("refuses a second observation of one measure", async () => {
    const h = await seeded();
    const id = await openReviewAt(h);
    await h.service.claim(TENANT, id, attendance());
    await h.service.observe(TENANT, id, ATTENDANCE, 92);

    const thrown = await refusalOf(() => h.service.observe(TENANT, id, ATTENDANCE, 90));

    expect(thrown).toBeInstanceOf(BenefitAlreadyObservedError);
  });

  it("404s on a review this tenant cannot see", async () => {
    const h = await seeded();

    const thrown = await refusalOf(() => h.service.claim(TENANT, MISSING, attendance()));

    expect(thrown).toBeInstanceOf(AdoptionReviewNotFoundError);
    expect((thrown as AdoptionReviewNotFoundError).details).toMatchObject({ id: MISSING });
  });
});

describe("concluding the review", () => {
  it("concludes on the running verdict and announces it", async () => {
    const h = await seeded();
    const id = await openReviewAt(h);
    await h.service.claim(TENANT, id, turnaround);
    await h.service.observe(TENANT, id, TURNAROUND, 8);

    const review = await h.service.conclude(TENANT, id, REVIEWER);

    expect(review.concludedBy).toBe(REVIEWER);
    expect(review.verdict).toBe("adjust");
    expect(h.events.types.at(-1)).toBe(REVIEW_CONCLUDED);
    expect(h.events.published.at(-1)?.payload).toMatchObject({
      verdict: "adjust",
      worstBand: "shortfall",
      concluded: true,
    });
  });

  it("concludes a review that measured nothing, because inconclusive is a finding", async () => {
    const h = await seeded();
    const id = await openReviewAt(h);
    await h.service.claim(TENANT, id, attendance());
    await h.service.claim(TENANT, id, turnaround);

    const review = await h.service.conclude(TENANT, id, REVIEWER);

    expect(review.verdict).toBe("inconclusive");
    expect(review.benefitsClaimed).toBe(2);
    expect(review.benefitsMeasured).toBe(0);
  });

  it("refuses to conclude a review twice", async () => {
    const h = await seeded();
    const id = await openReviewAt(h);
    await h.service.conclude(TENANT, id, REVIEWER);

    const thrown = await refusalOf(() => h.service.conclude(TENANT, id, REVIEWER));

    expect(thrown).toBeInstanceOf(ReviewConcludedError);
  });

  it("refuses a claim landed after the verdict settled", async () => {
    const h = await seeded();
    const id = await openReviewAt(h);
    await h.service.conclude(TENANT, id, REVIEWER);

    const thrown = await refusalOf(() => h.service.claim(TENANT, id, attendance()));

    expect(thrown).toBeInstanceOf(ReviewConcludedError);
  });

  it("checks the person concluding before it looks for the review", async () => {
    const h = await seeded();

    const thrown = await refusalOf(() => h.service.conclude(TENANT, MISSING, STRANGER));

    expect(thrown).toBeInstanceOf(PersonNotFoundForEvolutionError);
  });
});

describe("reading the record", () => {
  it("lists the realization trail for one change in period order", async () => {
    const h = await seeded();
    await openReviewAt(h, LATER_PERIOD);
    await openReviewAt(h, REVIEW_PERIOD);

    const trail = await h.service.listByInitiative(TENANT, INITIATIVE);

    expect(trail.map((review) => review.reviewPeriod)).toEqual([REVIEW_PERIOD, LATER_PERIOD]);
  });

  it("lists open and concluded reviews alike for the tenant", async () => {
    const h = await seeded();
    const settled = await openReviewAt(h);
    await openReviewAt(h, LATER_PERIOD);
    await h.service.conclude(TENANT, settled, REVIEWER);

    expect(await h.service.list(TENANT)).toHaveLength(2);
  });

  it("never answers across a tenant boundary", async () => {
    const h = await seeded();
    const id = await openReviewAt(h);

    expect(await refusalOf(() => h.service.get(OTHER, id))).toBeInstanceOf(
      AdoptionReviewNotFoundError,
    );
    expect(await h.service.list(OTHER)).toEqual([]);
  });
});

describe("what the service will not do", () => {
  const methods = (): string[] => Object.getOwnPropertyNames(AdoptionReviewService.prototype);

  it("has no method that undoes the change it reviewed", () => {
    for (const verb of ["reverse", "revert", "rollback", "unadopt", "undo"]) {
      expect(methods()).not.toContain(verb);
    }
  });

  it("has no method that acts on the verdict", () => {
    for (const verb of ["apply", "deploy", "enact", "execute", "release", "rollout"]) {
      expect(methods()).not.toContain(verb);
    }
  });

  it("has no method that removes a review from the record", () => {
    for (const verb of ["archive", "delete", "destroy", "purge", "remove"]) {
      expect(methods()).not.toContain(verb);
    }
  });

  it("runs without an event bus, because announcing is not what makes the verdict true", async () => {
    const repository = new InMemoryAdoptionReviewRepository();
    const initiatives = new InMemoryImprovementInitiativeRepository();
    await initiatives.save(ADOPTED);
    const service = new AdoptionReviewService({
      repository,
      initiatives,
      organizations: new StubOrganizations(),
      people: new StubPeople(),
    });

    const review = await service.open(params());

    expect(await repository.findById(TENANT, review.id)).toEqual(review);
  });
});
