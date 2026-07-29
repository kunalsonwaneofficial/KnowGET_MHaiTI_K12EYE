import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  CycleClosureGateNotConvenedError,
  CycleClosureGatePendingError,
  CycleClosureGateRefusedError,
  CycleIntentFrozenError,
  CycleSpanFixedError,
  CycleWithoutLessonsError,
  DuplicateCycleKeyError,
  EmptyAbandonmentReasonError,
  ImprovementCycleNotFoundError,
  OrganizationNotFoundForEvolutionError,
  PersonNotFoundForEvolutionError,
  UnusableCycleSpanError,
} from "./errors";
import {
  CYCLE_ABANDONED,
  CYCLE_CLOSED,
  CYCLE_EXECUTION_STARTED,
  CYCLE_OPENED,
  CYCLE_RESCHEDULED,
  CYCLE_RESTATED,
  CYCLE_REVIEW_STARTED,
} from "./evolution-events";
import type { DecisionVerdict, LessonOrigin } from "./evolution-value";
import { castBallot, convokeGate } from "./governance-decision";
import { type ImprovementCycle, type OpenCycleParams } from "./improvement-cycle";
import { ImprovementCycleService } from "./improvement-cycle-service";
import { recordLesson } from "./lesson";
import {
  type GovernanceDecisionRepository,
  type ImprovementCycleRepository,
  InMemoryGovernanceDecisionRepository,
  InMemoryImprovementCycleRepository,
  InMemoryLessonRepository,
  type LessonRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";

const TENANT = "11111111-1111-4111-8111-111111111111" as TenantId;
const OTHER = "22222222-2222-4222-8222-222222222222" as TenantId;
const ORG = "33333333-3333-4333-8333-333333333333" as Uuid;
const ABSENT_ORG = "3a3a3a3a-3a3a-4a3a-8a3a-3a3a3a3a3a3a" as Uuid;
const OPENER = "44444444-4444-4444-8444-444444444444" as Uuid;
const PROPOSER = "55555555-5555-4555-8555-555555555555" as Uuid;
const DECIDER = "66666666-6666-4666-8666-666666666666" as Uuid;
const STRANGER = "77777777-7777-4777-8777-777777777777" as Uuid;
const ELSEWHERE = "88888888-8888-4888-8888-888888888888" as Uuid;
const MISSING = "99999999-9999-4999-8999-999999999999" as Uuid;

const KEY = "cycle-2026-t1";
const SECOND_KEY = "cycle-2026-t2";

const INTENT = "Shorten marking turnaround across key stage three over the spring term.";
const RESTATED = "Shorten marking turnaround across the whole school over the spring term.";
const REASON = "The moderation team was redeployed to inspection preparation in February.";
const RATIONALE = "The round did what it set out to do and the lessons are written up.";
const STATEMENT =
  "Marking turnaround slips whenever a moderation window overlaps a reporting deadline.";

const params = (overrides: Partial<OpenCycleParams> = {}): OpenCycleParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  cycleKey: KEY,
  intent: INTENT,
  startPeriod: 1,
  endPeriod: 3,
  openedBy: OPENER,
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
  private readonly known: readonly Uuid[] = [OPENER, PROPOSER, DECIDER];

  async exists(tenantId: TenantId, personId: Uuid): Promise<boolean> {
    this.asked.push(personId);
    return tenantId === TENANT && this.known.includes(personId);
  }
}

interface Harness {
  readonly service: ImprovementCycleService;
  readonly repository: ImprovementCycleRepository;
  readonly decisions: GovernanceDecisionRepository;
  readonly lessons: LessonRepository;
  readonly organizations: StubOrganizations;
  readonly people: StubPeople;
  readonly events: Recorder;
}

const harness = (): Harness => {
  const repository = new InMemoryImprovementCycleRepository();
  const decisions = new InMemoryGovernanceDecisionRepository();
  const lessons = new InMemoryLessonRepository();
  const organizations = new StubOrganizations();
  const people = new StubPeople();
  const events = new Recorder();
  return {
    service: new ImprovementCycleService({
      repository,
      decisions,
      lessons,
      organizations,
      people,
      events,
    }),
    repository,
    decisions,
    lessons,
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

/** A round taken as far as review, which is the only stage closure is decided from. */
const underReview = async (
  h: Harness,
  overrides: Partial<OpenCycleParams> = {},
): Promise<ImprovementCycle> => {
  const cycle = await h.service.open(params(overrides));
  await h.service.startExecution(TENANT, cycle.id);
  return h.service.startReview(TENANT, cycle.id);
};

/** A lesson filed against a round, which is what the closure count goes and reads. */
const fileLesson = async (
  h: Harness,
  lessonKey: string,
  originRef: string,
  origin: LessonOrigin = "cycle_retrospective",
): Promise<void> => {
  await h.lessons.save(
    recordLesson({
      tenantId: TENANT,
      organizationId: ORG,
      lessonKey,
      statement: STATEMENT,
      category: "process",
      origin,
      originRef,
      applicability: ["academic_practice"],
      recordedBy: OPENER,
    }),
  );
};

/** A closure gate standing in front of a round, unanswered. */
const convokeClosure = async (h: Harness, cycleId: Uuid): Promise<Uuid> => {
  const decision = convokeGate({
    tenantId: TENANT,
    organizationId: ORG,
    initiativeId: cycleId,
    gate: "cycle_closure",
    changeClass: "clarification",
    proposedBy: PROPOSER,
    convokedBy: OPENER,
  });
  await h.decisions.save(decision);
  return decision.id;
};

/** A closure gate that somebody other than the proposer has answered, either way. */
const settleClosure = async (
  h: Harness,
  cycleId: Uuid,
  verdict: DecisionVerdict = "approved",
): Promise<void> => {
  const id = await convokeClosure(h, cycleId);
  const convoked = await h.decisions.findById(TENANT, id);
  await h.decisions.save(
    castBallot(convoked!, { deciderId: DECIDER, verdict, rationale: RATIONALE, conditions: [] }),
  );
};

describe("opening a cycle", () => {
  it("stores the round in planning and announces it", async () => {
    const { service, repository, events } = harness();

    const cycle = await service.open(params());

    expect(cycle.stage).toBe("planning");
    expect(cycle.periods).toBe(3);
    expect(cycle.lessonsRecorded).toBe(0);
    expect(cycle.settledAt).toBeNull();
    expect(await repository.findById(TENANT, cycle.id)).toEqual(cycle);
    expect(events.types).toEqual([CYCLE_OPENED]);
  });

  it("checks the institution and whoever opened the round", async () => {
    const { service, organizations, people } = harness();

    await service.open(params());

    expect(organizations.asked).toEqual([ORG]);
    expect(people.asked).toEqual([OPENER]);
  });

  it("refuses an organization the directory does not know, and stores nothing", async () => {
    const { service, repository, events } = harness();

    const thrown = await refusalOf(() => service.open(params({ organizationId: ABSENT_ORG })));

    expect(thrown).toBeInstanceOf(OrganizationNotFoundForEvolutionError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(events.published).toEqual([]);
  });

  it("refuses an opener the directory does not know", async () => {
    const { service, repository } = harness();

    const thrown = await refusalOf(() => service.open(params({ openedBy: STRANGER })));

    expect(thrown).toBeInstanceOf(PersonNotFoundForEvolutionError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
  });

  it("refuses a key another round already answers to", async () => {
    const { service, repository } = harness();
    await service.open(params());

    const thrown = await refusalOf(() => service.open(params({ intent: RESTATED })));

    expect(thrown).toBeInstanceOf(DuplicateCycleKeyError);
    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
  });

  it("holds a key an abandoned round still owns, because its lessons still cite it", async () => {
    const { service } = harness();
    const first = await service.open(params());
    await service.abandon(TENANT, first.id, OPENER, REASON);

    const thrown = await refusalOf(() => service.open(params()));

    expect(thrown).toBeInstanceOf(DuplicateCycleKeyError);
  });

  it("compares the normalized key rather than the string the caller typed", async () => {
    const { service } = harness();
    await service.open(params({ cycleKey: "  Cycle-2026-T1  " }));

    const thrown = await refusalOf(() => service.open(params()));

    expect(thrown).toBeInstanceOf(DuplicateCycleKeyError);
  });

  it("refuses a span that runs backwards without touching the store or the directories", async () => {
    const { service, repository, organizations } = harness();

    const thrown = await refusalOf(() => service.open(params({ startPeriod: 5, endPeriod: 2 })));

    expect(thrown).toBeInstanceOf(UnusableCycleSpanError);
    expect(organizations.asked).toEqual([]);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
  });
});

describe("planning the round", () => {
  it("rewrites what the round is for, and announces it", async () => {
    const { service, events } = harness();
    const cycle = await service.open(params());

    const restated = await service.restate(TENANT, cycle.id, RESTATED);

    expect(restated.intent).toBe(RESTATED);
    expect(events.types).toEqual([CYCLE_OPENED, CYCLE_RESTATED]);
  });

  it("still rewrites the intent once the work has started", async () => {
    const { service } = harness();
    const cycle = await service.open(params());
    await service.startExecution(TENANT, cycle.id);

    const restated = await service.restate(TENANT, cycle.id, RESTATED);

    expect(restated.intent).toBe(RESTATED);
  });

  it("refuses to rewrite the intent once the round is being looked back at", async () => {
    const h = harness();
    const cycle = await underReview(h);

    const thrown = await refusalOf(() => h.service.restate(TENANT, cycle.id, RESTATED));

    expect(thrown).toBeInstanceOf(CycleIntentFrozenError);
  });

  it("moves the span while the round has not started, and recounts the periods", async () => {
    const { service, events } = harness();
    const cycle = await service.open(params());

    const moved = await service.reschedule(TENANT, cycle.id, 4, 9);

    expect(moved.startPeriod).toBe(4);
    expect(moved.endPeriod).toBe(9);
    expect(moved.periods).toBe(6);
    expect(events.types.at(-1)).toBe(CYCLE_RESCHEDULED);
  });

  it("refuses to move the span once the round is running", async () => {
    const { service, repository } = harness();
    const cycle = await service.open(params());
    await service.startExecution(TENANT, cycle.id);

    const thrown = await refusalOf(() => service.reschedule(TENANT, cycle.id, 4, 9));

    expect(thrown).toBeInstanceOf(CycleSpanFixedError);
    expect((await repository.findById(TENANT, cycle.id))?.startPeriod).toBe(1);
  });
});

describe("running the round", () => {
  it("starts the work and then the review, announcing each", async () => {
    const h = harness();
    const cycle = await underReview(h);

    expect(cycle.stage).toBe("reviewing");
    expect(cycle.executionStartedAt).not.toBeNull();
    expect(cycle.reviewStartedAt).not.toBeNull();
    expect(h.events.types).toEqual([CYCLE_OPENED, CYCLE_EXECUTION_STARTED, CYCLE_REVIEW_STARTED]);
  });

  it("refuses to move a round that is not there", async () => {
    const { service } = harness();

    const thrown = await refusalOf(() => service.startExecution(TENANT, MISSING));

    expect(thrown).toBeInstanceOf(ImprovementCycleNotFoundError);
  });

  it("cannot move a round belonging to another tenant", async () => {
    const { service } = harness();
    const cycle = await service.open(params());

    const thrown = await refusalOf(() => service.startExecution(OTHER, cycle.id));

    expect(thrown).toBeInstanceOf(ImprovementCycleNotFoundError);
  });
});

describe("closing the round", () => {
  it("closes on counted lessons and an agreed gate, and announces it", async () => {
    const h = harness();
    const cycle = await underReview(h);
    await fileLesson(h, "academic.marking-turnaround", KEY);
    await fileLesson(h, "academic.moderation-window", KEY);
    await settleClosure(h, cycle.id);

    const closed = await h.service.close(TENANT, cycle.id, OPENER);

    expect(closed.stage).toBe("closed");
    expect(closed.lessonsRecorded).toBe(2);
    expect(closed.settledBy).toBe(OPENER);
    expect(closed.settledAt).not.toBeNull();
    expect(h.events.types.at(-1)).toBe(CYCLE_CLOSED);
  });

  it("takes no argument by which a caller could state the count or the outcome", async () => {
    const h = harness();

    expect(h.service.close.length).toBe(3);
  });

  it("counts only the lessons that cite this round", async () => {
    const h = harness();
    const cycle = await underReview(h);
    await fileLesson(h, "academic.marking-turnaround", KEY);
    await fileLesson(h, "academic.moderation-window", SECOND_KEY);
    await settleClosure(h, cycle.id);

    const closed = await h.service.close(TENANT, cycle.id, OPENER);

    expect(closed.lessonsRecorded).toBe(1);
  });

  it("counts retrospective lessons only, not everything that names the round", async () => {
    const h = harness();
    const cycle = await underReview(h);
    await fileLesson(h, "academic.marking-turnaround", KEY, "incident_review");

    const thrown = await refusalOf(() => h.service.close(TENANT, cycle.id, OPENER));

    expect(thrown).toBeInstanceOf(CycleWithoutLessonsError);
  });

  it("refuses a round that concluded nothing, however the gate answered", async () => {
    const h = harness();
    const cycle = await underReview(h);
    await settleClosure(h, cycle.id);

    const thrown = await refusalOf(() => h.service.close(TENANT, cycle.id, OPENER));

    expect(thrown).toBeInstanceOf(CycleWithoutLessonsError);
    expect((await h.repository.findById(TENANT, cycle.id))?.stage).toBe("reviewing");
  });

  it("refuses a round nobody was asked to agree was finished", async () => {
    const h = harness();
    const cycle = await underReview(h);
    await fileLesson(h, "academic.marking-turnaround", KEY);

    const thrown = await refusalOf(() => h.service.close(TENANT, cycle.id, OPENER));

    expect(thrown).toBeInstanceOf(CycleClosureGateNotConvenedError);
  });

  it("refuses while the closure gate is still being decided", async () => {
    const h = harness();
    const cycle = await underReview(h);
    await fileLesson(h, "academic.marking-turnaround", KEY);
    await convokeClosure(h, cycle.id);

    const thrown = await refusalOf(() => h.service.close(TENANT, cycle.id, OPENER));

    expect(thrown).toBeInstanceOf(CycleClosureGatePendingError);
  });

  it("refuses a round the gate turned down, and leaves it under review", async () => {
    const h = harness();
    const cycle = await underReview(h);
    await fileLesson(h, "academic.marking-turnaround", KEY);
    await settleClosure(h, cycle.id, "rejected");

    const thrown = await refusalOf(() => h.service.close(TENANT, cycle.id, OPENER));

    expect(thrown).toBeInstanceOf(CycleClosureGateRefusedError);
    expect((await h.repository.findById(TENANT, cycle.id))?.stage).toBe("reviewing");
  });

  it("reads the gate addressed to this round rather than to another", async () => {
    const h = harness();
    const cycle = await underReview(h);
    await fileLesson(h, "academic.marking-turnaround", KEY);
    await settleClosure(h, ELSEWHERE);

    const thrown = await refusalOf(() => h.service.close(TENANT, cycle.id, OPENER));

    expect(thrown).toBeInstanceOf(CycleClosureGateNotConvenedError);
  });

  it("reads a gate that has already settled, which no open-gate read would find", async () => {
    const h = harness();
    const cycle = await underReview(h);
    await fileLesson(h, "academic.marking-turnaround", KEY);
    await settleClosure(h, cycle.id);

    expect(await h.decisions.findOpenGate(TENANT, cycle.id, "cycle_closure")).toBeNull();
    expect((await h.service.close(TENANT, cycle.id, OPENER)).stage).toBe("closed");
  });

  it("permits a closure nobody put their name to", async () => {
    const h = harness();
    const cycle = await underReview(h);
    await fileLesson(h, "academic.marking-turnaround", KEY);
    await settleClosure(h, cycle.id);

    const closed = await h.service.close(TENANT, cycle.id, null);

    expect(closed.settledBy).toBeNull();
    expect(h.people.asked).toEqual([OPENER]);
  });

  it("refuses a closer the directory does not know", async () => {
    const h = harness();
    const cycle = await underReview(h);
    await fileLesson(h, "academic.marking-turnaround", KEY);
    await settleClosure(h, cycle.id);

    const thrown = await refusalOf(() => h.service.close(TENANT, cycle.id, STRANGER));

    expect(thrown).toBeInstanceOf(PersonNotFoundForEvolutionError);
    expect((await h.repository.findById(TENANT, cycle.id))?.stage).toBe("reviewing");
  });
});

describe("abandoning the round", () => {
  it("admits the ending with a reason and no gate at all, and announces it", async () => {
    const h = harness();
    const cycle = await h.service.open(params());
    await h.service.startExecution(TENANT, cycle.id);

    const abandoned = await h.service.abandon(TENANT, cycle.id, OPENER, REASON);

    expect(abandoned.stage).toBe("abandoned");
    expect(abandoned.abandonmentReason).toBe(REASON);
    expect(abandoned.settledBy).toBe(OPENER);
    expect(await h.decisions.listByTenant(TENANT)).toEqual([]);
    expect(h.events.types.at(-1)).toBe(CYCLE_ABANDONED);
  });

  it("admits a round that concluded nothing, which closing would refuse", async () => {
    const h = harness();
    const cycle = await underReview(h);

    const abandoned = await h.service.abandon(TENANT, cycle.id, OPENER, REASON);

    expect(abandoned.stage).toBe("abandoned");
    expect(abandoned.lessonsRecorded).toBe(0);
  });

  it("refuses an ending with no reason, and leaves the round where it was", async () => {
    const h = harness();
    const cycle = await h.service.open(params());

    const thrown = await refusalOf(() => h.service.abandon(TENANT, cycle.id, OPENER, "   "));

    expect(thrown).toBeInstanceOf(EmptyAbandonmentReasonError);
    expect((await h.repository.findById(TENANT, cycle.id))?.stage).toBe("planning");
  });

  it("permits an ending nobody put their name to", async () => {
    const h = harness();
    const cycle = await h.service.open(params());

    const abandoned = await h.service.abandon(TENANT, cycle.id, null, REASON);

    expect(abandoned.settledBy).toBeNull();
    expect(h.people.asked).toEqual([OPENER]);
  });

  it("refuses an abandoner the directory does not know", async () => {
    const h = harness();
    const cycle = await h.service.open(params());

    const thrown = await refusalOf(() => h.service.abandon(TENANT, cycle.id, STRANGER, REASON));

    expect(thrown).toBeInstanceOf(PersonNotFoundForEvolutionError);
    expect((await h.repository.findById(TENANT, cycle.id))?.stage).toBe("planning");
  });
});

describe("reading the record", () => {
  it("returns one cycle by id, or refuses with a 404 naming it", async () => {
    const { service } = harness();
    const cycle = await service.open(params());

    expect(await service.get(TENANT, cycle.id)).toEqual(cycle);
    expect(await refusalOf(() => service.get(TENANT, MISSING))).toBeInstanceOf(
      ImprovementCycleNotFoundError,
    );
  });

  it("finds a cycle by key, and refuses under the normalized form it searched for", async () => {
    const { service } = harness();
    const cycle = await service.open(params());

    expect(await service.getByKey(TENANT, "  CYCLE-2026-T1 ")).toEqual(cycle);

    const thrown = await refusalOf(() => service.getByKey(TENANT, "  Cycle-Nothing "));

    expect(thrown).toBeInstanceOf(ImprovementCycleNotFoundError);
    expect((thrown as ImprovementCycleNotFoundError).details).toMatchObject({
      id: "cycle-nothing",
    });
  });

  it("lists the rounds still going, in span order", async () => {
    const h = harness();
    const late = await h.service.open(
      params({ cycleKey: SECOND_KEY, startPeriod: 7, endPeriod: 9 }),
    );
    const early = await h.service.open(params());
    const stopped = await h.service.open(
      params({ cycleKey: "cycle-2026-t3", startPeriod: 4, endPeriod: 6 }),
    );
    await h.service.abandon(TENANT, stopped.id, OPENER, REASON);

    const open = await h.service.listOpen(TENANT, ORG);

    expect(open.map((cycle) => cycle.id)).toEqual([early.id, late.id]);
    expect(await h.service.list(TENANT)).toHaveLength(3);
  });

  it("never answers across a tenant boundary", async () => {
    const { service } = harness();
    const cycle = await service.open(params());

    expect(await refusalOf(() => service.get(OTHER, cycle.id))).toBeInstanceOf(
      ImprovementCycleNotFoundError,
    );
    expect(await service.list(OTHER)).toEqual([]);
  });
});

describe("what the service will not do", () => {
  const methods = (): string[] => Object.getOwnPropertyNames(ImprovementCycleService.prototype);

  it("has no method that closes a round without the gate and the lessons", () => {
    for (const verb of ["complete", "conclude", "finish", "force", "settle"]) {
      expect(methods()).not.toContain(verb);
    }
  });

  it("has no method that acts on what the round concluded", () => {
    for (const verb of ["apply", "deploy", "enact", "execute", "release", "rollback", "rollout"]) {
      expect(methods()).not.toContain(verb);
    }
  });

  it("has no method that removes a round from the record", () => {
    for (const verb of ["archive", "delete", "destroy", "purge", "remove"]) {
      expect(methods()).not.toContain(verb);
    }
  });

  it("runs without an event bus, because announcing is not what closes the round", async () => {
    const repository = new InMemoryImprovementCycleRepository();
    const service = new ImprovementCycleService({
      repository,
      decisions: new InMemoryGovernanceDecisionRepository(),
      lessons: new InMemoryLessonRepository(),
      organizations: new StubOrganizations(),
      people: new StubPeople(),
    });

    const cycle = await service.open(params());

    expect(await repository.findById(TENANT, cycle.id)).toEqual(cycle);
  });
});
