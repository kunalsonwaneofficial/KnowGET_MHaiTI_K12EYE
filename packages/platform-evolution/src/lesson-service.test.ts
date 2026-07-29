import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateLessonKeyError,
  InvalidRetentionProgressionError,
  LessonAlreadyInRetentionError,
  LessonNotFoundError,
  LessonRetentionSettledError,
  LessonSupersedesItselfError,
  MemoryCommitmentUnresolvedError,
  NoSupersedingLessonError,
  OrganizationNotFoundForEvolutionError,
  PersonNotFoundForEvolutionError,
} from "./errors";
import {
  LESSON_RECORDED,
  LESSON_RETAINED,
  LESSON_REVISED,
  LESSON_SUPERSEDED,
} from "./evolution-events";
import { type Lesson, type RecordLessonParams, recordLesson } from "./lesson";
import { LessonService } from "./lesson-service";
import {
  InMemoryLessonRepository,
  type InstitutionalMemoryDirectory,
  type LessonRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";

const TENANT = "11111111-1111-4111-8111-111111111111" as TenantId;
const OTHER = "22222222-2222-4222-8222-222222222222" as TenantId;
const ORG = "33333333-3333-4333-8333-333333333333" as Uuid;
const ABSENT_ORG = "3a3a3a3a-3a3a-4a3a-8a3a-3a3a3a3a3a3a" as Uuid;
const AUTHOR = "44444444-4444-4444-8444-444444444444" as Uuid;
const STRANGER = "77777777-7777-4777-8777-777777777777" as Uuid;
const MISSING = "99999999-9999-4999-8999-999999999999" as Uuid;

const KEY = "academic.marking-turnaround";
const SUCCESSOR = "academic.marking-window";
const CYCLE = "cycle-2026-t1";

const STATEMENT =
  "Marking turnaround slips whenever a moderation window overlaps a reporting deadline.";
const REVISED =
  "Marking turnaround slips whenever moderation and reporting land in the same fortnight.";

const params = (overrides: Partial<RecordLessonParams> = {}): RecordLessonParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  lessonKey: KEY,
  statement: STATEMENT,
  category: "process",
  origin: "cycle_retrospective",
  originRef: CYCLE,
  applicability: ["academic_practice"],
  recordedBy: AUTHOR,
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
  private readonly known: readonly Uuid[] = [AUTHOR];

  async exists(tenantId: TenantId, personId: Uuid): Promise<boolean> {
    this.asked.push(personId);
    return tenantId === TENANT && this.known.includes(personId);
  }
}

/** The knowledge graph, standing in. Commitments resolve only for keys somebody explicitly committed. */
class StubMemory implements InstitutionalMemoryDirectory {
  readonly asked: string[] = [];
  private readonly committed = new Set<string>();

  commit(organizationId: Uuid, lessonKey: string): void {
    this.committed.add(`${organizationId}:${lessonKey}`);
  }

  async commitmentResolved(
    tenantId: TenantId,
    organizationId: Uuid,
    lessonKey: string,
  ): Promise<boolean> {
    this.asked.push(`${organizationId}:${lessonKey}`);
    return tenantId === TENANT && this.committed.has(`${organizationId}:${lessonKey}`);
  }
}

interface Harness {
  readonly service: LessonService;
  readonly repository: LessonRepository;
  readonly memory: StubMemory;
  readonly organizations: StubOrganizations;
  readonly people: StubPeople;
  readonly events: Recorder;
}

const harness = (): Harness => {
  const repository = new InMemoryLessonRepository();
  const memory = new StubMemory();
  const organizations = new StubOrganizations();
  const people = new StubPeople();
  const events = new Recorder();
  return {
    service: new LessonService({ repository, memory, organizations, people, events }),
    repository,
    memory,
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

/**
 * A lesson committed to the graph and moved into memory, which is the only state supersession starts from.
 *
 * The commitment is registered against the lesson's own organization and key, because that pair is what the
 * service asks the graph about and a helper that committed anything looser would let a test pass on a
 * commitment the real directory would never have matched.
 */
const retained = async (
  h: Harness,
  overrides: Partial<RecordLessonParams> = {},
): Promise<Lesson> => {
  const lesson = await h.service.record(params(overrides));
  h.memory.commit(lesson.organizationId, lesson.lessonKey);
  return h.service.retain(TENANT, lesson.id, 4);
};

describe("recording a lesson", () => {
  it("stores the lesson provisional and announces it", async () => {
    const { service, repository, events } = harness();

    const lesson = await service.record(params());

    expect(lesson.lessonKey).toBe(KEY);
    expect(lesson.retention).toBe("provisional");
    expect(lesson.retainedAt).toBeNull();
    expect(await repository.findById(TENANT, lesson.id)).toEqual(lesson);
    expect(events.types).toEqual([LESSON_RECORDED]);
  });

  it("checks the institution and the author", async () => {
    const { service, organizations, people } = harness();

    await service.record(params());

    expect(organizations.asked).toEqual([ORG]);
    expect(people.asked).toEqual([AUTHOR]);
  });

  it("refuses an organization the directory does not know, and stores nothing", async () => {
    const { service, repository, events } = harness();

    const thrown = await refusalOf(() => service.record(params({ organizationId: ABSENT_ORG })));

    expect(thrown).toBeInstanceOf(OrganizationNotFoundForEvolutionError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(events.published).toEqual([]);
  });

  it("refuses an author the directory does not know", async () => {
    const { service, repository } = harness();

    const thrown = await refusalOf(() => service.record(params({ recordedBy: STRANGER })));

    expect(thrown).toBeInstanceOf(PersonNotFoundForEvolutionError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
  });

  it("permits a lesson nobody signed, drawn by an automated review step", async () => {
    const { service, people } = harness();

    const lesson = await service.record(params({ recordedBy: null }));

    expect(lesson.recordedBy).toBeNull();
    expect(people.asked).toEqual([]);
  });

  it("refuses a key another lesson already answers to", async () => {
    const { service, repository, events } = harness();
    await service.record(params());

    const thrown = await refusalOf(() => service.record(params({ statement: REVISED })));

    expect(thrown).toBeInstanceOf(DuplicateLessonKeyError);
    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect(events.types).toEqual([LESSON_RECORDED]);
  });

  it("compares the normalized key rather than the string the caller typed", async () => {
    const { service } = harness();
    await service.record(params({ lessonKey: "  Academic.Marking-Turnaround  " }));

    const thrown = await refusalOf(() => service.record(params()));

    expect(thrown).toBeInstanceOf(DuplicateLessonKeyError);
  });

  it("holds a key a superseded lesson still owns, because the old citation must still land", async () => {
    const h = harness();
    const first = await retained(h);
    const successor = await h.service.record(params({ lessonKey: SUCCESSOR }));
    await h.service.supersede(TENANT, first.id, successor.lessonKey);

    const thrown = await refusalOf(() => h.service.record(params()));

    expect(thrown).toBeInstanceOf(DuplicateLessonKeyError);
    expect(h.memory.asked).toEqual([`${ORG}:${KEY}`]);
  });

  it("refuses a malformed request without touching the store or the directories", async () => {
    const { service, repository, organizations } = harness();

    const thrown = await refusalOf(() => service.record(params({ statement: "Too short" })));

    expect(thrown).not.toBeNull();
    expect(organizations.asked).toEqual([]);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
  });

  it("revises the statement while it is provisional, and announces it", async () => {
    const { service, events } = harness();
    const lesson = await service.record(params());

    const revised = await service.revise(TENANT, lesson.id, REVISED, ["operational_process"]);

    expect(revised.statement).toBe(REVISED);
    expect(revised.areas).toEqual(["operational_process"]);
    expect(events.types).toEqual([LESSON_RECORDED, LESSON_REVISED]);
  });
});

describe("retaining a lesson", () => {
  it("asks the knowledge graph about this lesson's own key and organization", async () => {
    const { service, memory } = harness();
    const lesson = await service.record(params());
    memory.commit(ORG, KEY);

    await service.retain(TENANT, lesson.id, 4);

    expect(memory.asked).toEqual([`${ORG}:${KEY}`]);
  });

  it("retains the lesson when the commitment resolved, and announces it", async () => {
    const { service, repository, memory, events } = harness();
    const lesson = await service.record(params());
    memory.commit(ORG, KEY);

    const retained = await service.retain(TENANT, lesson.id, 4);

    expect(retained.retention).toBe("retained");
    expect(retained.retainedAtPeriod).toBe(4);
    expect(retained.retainedAt).not.toBeNull();
    expect(await repository.findById(TENANT, lesson.id)).toEqual(retained);
    expect(events.types).toEqual([LESSON_RECORDED, LESSON_RETAINED]);
  });

  it("refuses retention when nothing was committed, and leaves the lesson provisional", async () => {
    const { service, repository, events } = harness();
    const lesson = await service.record(params());

    const thrown = await refusalOf(() => service.retain(TENANT, lesson.id, 4));

    expect(thrown).toBeInstanceOf(MemoryCommitmentUnresolvedError);
    expect((await repository.findById(TENANT, lesson.id))?.retention).toBe("provisional");
    expect(events.types).toEqual([LESSON_RECORDED]);
  });

  it("takes no argument by which a caller could answer the commitment question itself", async () => {
    const { service } = harness();
    const lesson = await service.record(params());

    expect(service.retain.length).toBe(3);
    expect(await refusalOf(() => service.retain(TENANT, lesson.id, 4))).toBeInstanceOf(
      MemoryCommitmentUnresolvedError,
    );
  });

  it("cannot be satisfied by a commitment made in another organization", async () => {
    const { service, memory } = harness();
    const lesson = await service.record(params());
    memory.commit(ABSENT_ORG, KEY);

    const thrown = await refusalOf(() => service.retain(TENANT, lesson.id, 4));

    expect(thrown).toBeInstanceOf(MemoryCommitmentUnresolvedError);
  });

  it("cannot be satisfied by a commitment against a different lesson's key", async () => {
    const { service, memory } = harness();
    const lesson = await service.record(params());
    memory.commit(ORG, SUCCESSOR);

    const thrown = await refusalOf(() => service.retain(TENANT, lesson.id, 4));

    expect(thrown).toBeInstanceOf(MemoryCommitmentUnresolvedError);
  });

  it("refuses to retain a lesson that is not there, without asking the graph", async () => {
    const { service, memory } = harness();

    const thrown = await refusalOf(() => service.retain(TENANT, MISSING, 4));

    expect(thrown).toBeInstanceOf(LessonNotFoundError);
    expect(memory.asked).toEqual([]);
  });

  it("refuses to retain a lesson already in memory, rather than restamping the period", async () => {
    const h = harness();
    const lesson = await retained(h);

    const thrown = await refusalOf(() => h.service.retain(TENANT, lesson.id, 9));

    expect(thrown).toBeInstanceOf(LessonAlreadyInRetentionError);
    expect((await h.service.get(TENANT, lesson.id)).retainedAtPeriod).toBe(4);
  });

  it("refuses to retain a superseded lesson, because history does not reopen", async () => {
    const h = harness();
    const first = await retained(h);
    await h.service.record(params({ lessonKey: SUCCESSOR }));
    await h.service.supersede(TENANT, first.id, SUCCESSOR);

    const thrown = await refusalOf(() => h.service.retain(TENANT, first.id, 9));

    expect(thrown).toBeInstanceOf(LessonRetentionSettledError);
  });
});

describe("superseding a lesson", () => {
  it("supersedes into a lesson that exists, and announces it", async () => {
    const h = harness();
    const first = await retained(h);
    await h.service.record(params({ lessonKey: SUCCESSOR }));

    const superseded = await h.service.supersede(TENANT, first.id, SUCCESSOR);

    expect(superseded.retention).toBe("superseded");
    expect(superseded.supersedingLessonKey).toBe(SUCCESSOR);
    expect(superseded.supersededAt).not.toBeNull();
    expect(h.events.types.at(-1)).toBe(LESSON_SUPERSEDED);
  });

  it("refuses to supersede a conclusion the institution never committed", async () => {
    const h = harness();
    const first = await h.service.record(params());
    await h.service.record(params({ lessonKey: SUCCESSOR }));

    const thrown = await refusalOf(() => h.service.supersede(TENANT, first.id, SUCCESSOR));

    expect(thrown).toBeInstanceOf(InvalidRetentionProgressionError);
    expect((thrown as InvalidRetentionProgressionError).details).toMatchObject({
      from: "provisional",
      to: "superseded",
    });
    expect(h.events.types).toEqual([LESSON_RECORDED, LESSON_RECORDED]);
  });

  it("refuses a successor nobody wrote, and leaves the lesson readable", async () => {
    const h = harness();
    const first = await retained(h);

    const thrown = await refusalOf(() => h.service.supersede(TENANT, first.id, SUCCESSOR));

    expect(thrown).toBeInstanceOf(LessonNotFoundError);
    expect((await h.repository.findById(TENANT, first.id))?.retention).toBe("retained");
  });

  it("resolves the successor before it weighs whether the move is even legal", async () => {
    const h = harness();
    const first = await h.service.record(params());

    const thrown = await refusalOf(() => h.service.supersede(TENANT, first.id, SUCCESSOR));

    expect(thrown).toBeInstanceOf(LessonNotFoundError);
  });

  it("refuses a successor held by another tenant", async () => {
    const h = harness();
    await h.repository.save(recordLesson(params({ tenantId: OTHER, lessonKey: SUCCESSOR })));
    const first = await retained(h);

    const thrown = await refusalOf(() => h.service.supersede(TENANT, first.id, SUCCESSOR));

    expect(thrown).toBeInstanceOf(LessonNotFoundError);
  });

  it("resolves the successor under its normalized key", async () => {
    const h = harness();
    const first = await retained(h);
    await h.service.record(params({ lessonKey: SUCCESSOR }));

    const superseded = await h.service.supersede(TENANT, first.id, `  ${SUCCESSOR.toUpperCase()} `);

    expect(superseded.supersedingLessonKey).toBe(SUCCESSOR);
  });

  it("lets the aggregate refuse a supersession that names nothing at all", async () => {
    const h = harness();
    const first = await retained(h);

    const thrown = await refusalOf(() => h.service.supersede(TENANT, first.id, "   "));

    expect(thrown).toBeInstanceOf(NoSupersedingLessonError);
  });

  it("refuses a lesson that names itself as its own replacement", async () => {
    const h = harness();
    const first = await retained(h);

    const thrown = await refusalOf(() => h.service.supersede(TENANT, first.id, KEY));

    expect(thrown).toBeInstanceOf(LessonSupersedesItselfError);
  });
});

describe("reading the record", () => {
  it("returns one lesson by id, or refuses with a 404 naming it", async () => {
    const { service } = harness();
    const lesson = await service.record(params());

    expect(await service.get(TENANT, lesson.id)).toEqual(lesson);
    expect(await refusalOf(() => service.get(TENANT, MISSING))).toBeInstanceOf(LessonNotFoundError);
  });

  it("finds a lesson by key, and refuses under the normalized form it searched for", async () => {
    const { service } = harness();
    const lesson = await service.record(params());

    expect(await service.getByKey(TENANT, "  ACADEMIC.marking-turnaround ")).toEqual(lesson);

    const thrown = await refusalOf(() => service.getByKey(TENANT, "  Academic.Nothing "));

    expect(thrown).toBeInstanceOf(LessonNotFoundError);
    expect((thrown as LessonNotFoundError).details).toMatchObject({ id: "academic.nothing" });
  });

  it("lists what one cycle taught the institution", async () => {
    const { service } = harness();
    await service.record(params());
    await service.record(params({ lessonKey: SUCCESSOR, originRef: "cycle-2026-t2" }));

    const filed = await service.listByOrigin(TENANT, "cycle_retrospective", CYCLE);

    expect(filed.map((lesson) => lesson.lessonKey)).toEqual([KEY]);
  });

  it("reports the gap between what was concluded and what was remembered", async () => {
    const { service, memory } = harness();
    const kept = await service.record(params());
    await service.record(params({ lessonKey: SUCCESSOR }));
    memory.commit(ORG, KEY);
    await service.retain(TENANT, kept.id, 4);

    expect(await service.listRetained(TENANT, ORG)).toHaveLength(1);
    expect(await service.list(TENANT)).toHaveLength(2);
  });

  it("never answers across a tenant boundary", async () => {
    const { service } = harness();
    const lesson = await service.record(params());

    expect(await refusalOf(() => service.get(OTHER, lesson.id))).toBeInstanceOf(
      LessonNotFoundError,
    );
    expect(await service.list(OTHER)).toEqual([]);
  });
});

describe("what the service will not do", () => {
  const methods = (): string[] => Object.getOwnPropertyNames(LessonService.prototype);

  it("has no method that puts a lesson into memory without the graph agreeing", () => {
    for (const verb of ["commit", "confirm", "force", "keep", "remember"]) {
      expect(methods()).not.toContain(verb);
    }
  });

  it("has no method that acts on what a lesson concluded", () => {
    for (const verb of ["apply", "deploy", "enact", "execute", "release", "rollback", "rollout"]) {
      expect(methods()).not.toContain(verb);
    }
  });

  it("has no method that removes a lesson from the record", () => {
    for (const verb of ["archive", "delete", "destroy", "purge", "remove"]) {
      expect(methods()).not.toContain(verb);
    }
  });

  it("runs without an event bus, because announcing is not what makes the lesson true", async () => {
    const repository = new InMemoryLessonRepository();
    const service = new LessonService({
      repository,
      memory: new StubMemory(),
      organizations: new StubOrganizations(),
      people: new StubPeople(),
    });

    const lesson = await service.record(params());

    expect(await repository.findById(TENANT, lesson.id)).toEqual(lesson);
  });
});
