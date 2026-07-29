import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateSignalKeyError,
  EvidenceRecordNotFoundError,
  ImprovementSignalNotFoundError,
  OrganizationNotFoundForEvolutionError,
  PersonNotFoundForEvolutionError,
} from "./errors";
import {
  SIGNAL_ACCEPTED,
  SIGNAL_CORROBORATED,
  SIGNAL_DECLINED,
  SIGNAL_MERGED,
  SIGNAL_RAISED,
  SIGNAL_RESTATED,
  SIGNAL_TRIAGED,
} from "./evolution-events";
import type { EvidenceCitation } from "./evolution-view";
import {
  type RaiseSignalParams,
  declineSignal,
  raiseSignal,
  triageSignal,
} from "./improvement-signal";
import { ImprovementSignalService } from "./improvement-signal-service";
import {
  type EvidenceRecordDirectory,
  type ImprovementSignalRepository,
  InMemoryImprovementSignalRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";

const TENANT = "11111111-1111-4111-8111-111111111111" as TenantId;
const OTHER = "22222222-2222-4222-8222-222222222222" as TenantId;
const ORG = "33333333-3333-4333-8333-333333333333" as Uuid;
const ABSENT_ORG = "3a3a3a3a-3a3a-4a3a-8a3a-3a3a3a3a3a3a" as Uuid;
const RAISER = "44444444-4444-4444-8444-444444444444" as Uuid;
const WITNESS = "55555555-5555-4555-8555-555555555555" as Uuid;
const TRIAGER = "66666666-6666-4666-8666-666666666666" as Uuid;
const STRANGER = "77777777-7777-4777-8777-777777777777" as Uuid;
const MISSING = "99999999-9999-4999-8999-999999999999" as Uuid;

const SUMMARY = "Marking turnaround has been over three weeks since the autumn term began.";
const REVISED = "Marking turnaround is over three weeks in the two largest year groups.";
const REASON = "The timetable review already answers this and reports in March.";

const CITED = "incident-4021";
const UNRESOLVABLE = "incident-nowhere";

const citation = (sourceRef: string = CITED): EvidenceCitation => ({
  kind: "domain_record",
  sourceDomain: "teaching-learning",
  sourceRef,
  attestedBy: null,
});

const params = (overrides: Partial<RaiseSignalParams> = {}): RaiseSignalParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  signalKey: "academic.marking-turnaround",
  source: "stakeholder_feedback",
  summary: SUMMARY,
  citations: [citation()],
  raisedBy: RAISER,
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
  private readonly known: readonly Uuid[] = [RAISER, WITNESS, TRIAGER];

  async exists(tenantId: TenantId, personId: Uuid): Promise<boolean> {
    this.asked.push(personId);
    return tenantId === TENANT && this.known.includes(personId);
  }
}

class StubEvidence implements EvidenceRecordDirectory {
  readonly asked: string[] = [];

  async exists(tenantId: TenantId, cited: EvidenceCitation): Promise<boolean> {
    this.asked.push(cited.sourceRef);
    return tenantId === TENANT && cited.sourceRef !== UNRESOLVABLE;
  }
}

interface Harness {
  readonly service: ImprovementSignalService;
  readonly repository: ImprovementSignalRepository;
  readonly organizations: StubOrganizations;
  readonly people: StubPeople;
  readonly evidence: StubEvidence;
  readonly events: Recorder;
}

const harness = (): Harness => {
  const repository = new InMemoryImprovementSignalRepository();
  const organizations = new StubOrganizations();
  const people = new StubPeople();
  const evidence = new StubEvidence();
  const events = new Recorder();
  return {
    service: new ImprovementSignalService({
      repository,
      organizations,
      people,
      evidence,
      events,
    }),
    repository,
    organizations,
    people,
    evidence,
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

describe("raising a signal", () => {
  it("stores the signal and announces it", async () => {
    const { service, repository, events } = harness();

    const signal = await service.raise(params());

    expect(signal.signalKey).toBe("academic.marking-turnaround");
    expect(signal.status).toBe("raised");
    expect(await repository.findById(TENANT, signal.id)).toEqual(signal);
    expect(events.types).toEqual([SIGNAL_RAISED]);
  });

  it("checks the institution, the raiser and every cited record", async () => {
    const { service, organizations, people, evidence } = harness();

    await service.raise(params({ citations: [citation(), citation("audit-99")] }));

    expect(organizations.asked).toEqual([ORG]);
    expect(people.asked).toEqual([RAISER]);
    expect(evidence.asked).toEqual([CITED, "audit-99"]);
  });

  it("refuses an organization the directory does not know, and stores nothing", async () => {
    const { service, repository, events } = harness();

    const thrown = await refusalOf(() => service.raise(params({ organizationId: ABSENT_ORG })));

    expect(thrown).toBeInstanceOf(OrganizationNotFoundForEvolutionError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(events.published).toEqual([]);
  });

  it("refuses a raiser the directory does not know", async () => {
    const { service, repository } = harness();

    const thrown = await refusalOf(() => service.raise(params({ raisedBy: STRANGER })));

    expect(thrown).toBeInstanceOf(PersonNotFoundForEvolutionError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
  });

  it("permits an anonymous raising, and asks the directory about nobody", async () => {
    const { service, people } = harness();

    const signal = await service.raise(params({ raisedBy: null }));

    expect(signal.raisedBy).toBeNull();
    expect(people.asked).toEqual([]);
  });

  it("refuses a citation that resolves to nothing, and stores nothing", async () => {
    const { service, repository, events } = harness();

    const thrown = await refusalOf(() =>
      service.raise(params({ citations: [citation(UNRESOLVABLE)] })),
    );

    expect(thrown).toBeInstanceOf(EvidenceRecordNotFoundError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(events.published).toEqual([]);
  });

  it("stops at the first unresolvable citation rather than walking the rest", async () => {
    const { service, evidence } = harness();

    await refusalOf(() =>
      service.raise(params({ citations: [citation(UNRESOLVABLE), citation("audit-99")] })),
    );

    expect(evidence.asked).toEqual([UNRESOLVABLE]);
  });

  it("refuses a key another signal already answers to", async () => {
    const { service, repository, events } = harness();
    await service.raise(params());

    const thrown = await refusalOf(() => service.raise(params({ summary: REVISED })));

    expect(thrown).toBeInstanceOf(DuplicateSignalKeyError);
    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect(events.types).toEqual([SIGNAL_RAISED]);
  });

  it("compares the normalized key rather than the string the caller typed", async () => {
    const { service } = harness();
    await service.raise(params({ signalKey: "  Academic.Marking-Turnaround  " }));

    const thrown = await refusalOf(() => service.raise(params()));

    expect(thrown).toBeInstanceOf(DuplicateSignalKeyError);
  });

  it("holds a key a declined signal still owns, which is how recurrence is answered", async () => {
    const { service, repository } = harness();
    const held = declineSignal(triageSignal(raiseSignal(params()), TRIAGER), TRIAGER, REASON);
    await repository.save(held);

    const thrown = await refusalOf(() => service.raise(params()));

    expect(thrown).toBeInstanceOf(DuplicateSignalKeyError);
  });

  it("refuses a malformed request without touching the store or the directories", async () => {
    const { service, organizations, evidence } = harness();

    const thrown = await refusalOf(() => service.raise(params({ summary: "Too short" })));

    expect(thrown).not.toBeNull();
    expect(organizations.asked).toEqual([]);
    expect(evidence.asked).toEqual([]);
  });
});

describe("restating and corroborating", () => {
  it("restates the summary and announces it", async () => {
    const { service, events } = harness();
    const signal = await service.raise(params());

    const restated = await service.restate(TENANT, signal.id, REVISED);

    expect(restated.summary).toBe(REVISED);
    expect(events.types).toEqual([SIGNAL_RAISED, SIGNAL_RESTATED]);
  });

  it("corroborates from another person and lets the priority follow", async () => {
    const { service, events } = harness();
    const signal = await service.raise(params());

    const corroborated = await service.corroborate(TENANT, signal.id, {
      raisedBy: WITNESS,
      source: "stakeholder_feedback",
    });

    expect(corroborated.corroboration).toBe(2);
    expect(corroborated.priority).toBe("elevated");
    expect(events.types).toEqual([SIGNAL_RAISED, SIGNAL_CORROBORATED]);
  });

  it("refuses an account from somebody the directory does not know", async () => {
    const { service, events } = harness();
    const signal = await service.raise(params());

    const thrown = await refusalOf(() =>
      service.corroborate(TENANT, signal.id, {
        raisedBy: STRANGER,
        source: "incident",
      }),
    );

    expect(thrown).toBeInstanceOf(PersonNotFoundForEvolutionError);
    expect(events.types).toEqual([SIGNAL_RAISED]);
  });

  it("refuses an account whose raiser is not even uuid-shaped, without asking the directory", async () => {
    const { service, people } = harness();
    const signal = await service.raise(params());
    people.asked.length = 0;

    const thrown = await refusalOf(() =>
      service.corroborate(TENANT, signal.id, {
        raisedBy: "whoever was in the meeting",
        source: "operational_review",
      }),
    );

    expect(thrown).toBeInstanceOf(PersonNotFoundForEvolutionError);
    expect(people.asked).toEqual([]);
  });

  it("accepts an anonymous account, which corroborates nothing and asks nobody", async () => {
    const { service, people } = harness();
    const signal = await service.raise(params());
    people.asked.length = 0;

    const corroborated = await service.corroborate(TENANT, signal.id, {
      raisedBy: "",
      source: "stakeholder_feedback",
    });

    expect(corroborated.unattributed).toBe(1);
    expect(corroborated.corroboration).toBe(1);
    expect(people.asked).toEqual([]);
  });
});

describe("disposal", () => {
  it("triages, then accepts, announcing each", async () => {
    const { service, events } = harness();
    const signal = await service.raise(params());

    await service.triage(TENANT, signal.id, TRIAGER);
    const accepted = await service.accept(TENANT, signal.id, TRIAGER);

    expect(accepted.status).toBe("accepted");
    expect(events.types).toEqual([SIGNAL_RAISED, SIGNAL_TRIAGED, SIGNAL_ACCEPTED]);
  });

  it("declines with a reason, and keeps the reason in the domain", async () => {
    const { service, events } = harness();
    const signal = await service.raise(params());
    await service.triage(TENANT, signal.id, TRIAGER);

    const declined = await service.decline(TENANT, signal.id, TRIAGER, REASON);

    expect(declined.status).toBe("declined");
    expect(declined.declineReason).toBe(REASON);
    expect(events.types.at(-1)).toBe(SIGNAL_DECLINED);
    expect(JSON.stringify(events.published)).not.toContain(REASON);
  });

  it("refuses a disposal by somebody the directory does not know", async () => {
    const { service, events } = harness();
    const signal = await service.raise(params());

    const thrown = await refusalOf(() => service.triage(TENANT, signal.id, STRANGER));

    expect(thrown).toBeInstanceOf(PersonNotFoundForEvolutionError);
    expect(events.types).toEqual([SIGNAL_RAISED]);
  });

  it("merges into a signal that exists, and announces it", async () => {
    const { service, events } = harness();
    const target = await service.raise(params({ signalKey: "academic.marking-load" }));
    const signal = await service.raise(params());
    await service.triage(TENANT, signal.id, TRIAGER);

    const merged = await service.merge(TENANT, signal.id, target.id, TRIAGER);

    expect(merged.status).toBe("merged");
    expect(merged.mergedIntoSignalId).toBe(target.id);
    expect(events.types.at(-1)).toBe(SIGNAL_MERGED);
  });

  it("refuses a merge into a signal that is not there, and settles nothing", async () => {
    const { service, repository } = harness();
    const signal = await service.raise(params());
    await service.triage(TENANT, signal.id, TRIAGER);

    const thrown = await refusalOf(() => service.merge(TENANT, signal.id, MISSING, TRIAGER));

    expect(thrown).toBeInstanceOf(ImprovementSignalNotFoundError);
    expect((await repository.findById(TENANT, signal.id))?.status).toBe("triaged");
  });

  it("refuses a merge into a signal held by another tenant", async () => {
    const { service, repository } = harness();
    const elsewhere = raiseSignal(params({ tenantId: OTHER, signalKey: "academic.other" }));
    await repository.save(elsewhere);
    const signal = await service.raise(params());
    await service.triage(TENANT, signal.id, TRIAGER);

    const thrown = await refusalOf(() => service.merge(TENANT, signal.id, elsewhere.id, TRIAGER));

    expect(thrown).toBeInstanceOf(ImprovementSignalNotFoundError);
  });
});

describe("reading the queue", () => {
  it("returns one signal by id, or refuses with a 404 naming it", async () => {
    const { service } = harness();
    const signal = await service.raise(params());

    expect(await service.get(TENANT, signal.id)).toEqual(signal);

    const thrown = await refusalOf(() => service.get(TENANT, MISSING));

    expect(thrown).toBeInstanceOf(ImprovementSignalNotFoundError);
  });

  it("finds a signal by key, and refuses under the normalized form it searched for", async () => {
    const { service } = harness();
    const signal = await service.raise(params());

    expect(await service.getByKey(TENANT, "  ACADEMIC.marking-turnaround ")).toEqual(signal);

    const thrown = await refusalOf(() => service.getByKey(TENANT, "  Academic.Nothing "));

    expect(thrown).toBeInstanceOf(ImprovementSignalNotFoundError);
    expect((thrown as ImprovementSignalNotFoundError).details).toMatchObject({
      id: "academic.nothing",
    });
  });

  it("lists the open queue, leaving settled signals out of it", async () => {
    const { service } = harness();
    const open = await service.raise(params());
    const closed = await service.raise(params({ signalKey: "academic.marking-load" }));
    await service.triage(TENANT, closed.id, TRIAGER);
    await service.accept(TENANT, closed.id, TRIAGER);

    const queue = await service.listOpen(TENANT, ORG);

    expect(queue.map((signal) => signal.id)).toEqual([open.id]);
    expect(await service.list(TENANT)).toHaveLength(2);
  });

  it("never answers across a tenant boundary", async () => {
    const { service } = harness();
    const signal = await service.raise(params());

    const thrown = await refusalOf(() => service.get(OTHER, signal.id));

    expect(thrown).toBeInstanceOf(ImprovementSignalNotFoundError);
    expect(await service.list(OTHER)).toEqual([]);
  });
});

describe("what the service will not do", () => {
  it("publishes nothing when no bus is wired", async () => {
    const repository = new InMemoryImprovementSignalRepository();
    const service = new ImprovementSignalService({
      repository,
      organizations: new StubOrganizations(),
      people: new StubPeople(),
      evidence: new StubEvidence(),
    });

    const signal = await service.raise(params());

    expect(await repository.findById(TENANT, signal.id)).toEqual(signal);
  });

  it("offers no way to remove a signal, however it was disposed of", () => {
    const { service } = harness();

    expect(service).not.toHaveProperty("remove");
    expect(service).not.toHaveProperty("delete");
    expect(service).not.toHaveProperty("purge");
  });

  it("offers no way to reopen a settled signal", () => {
    const { service } = harness();

    expect(service).not.toHaveProperty("reopen");
    expect(service).not.toHaveProperty("unsettle");
  });
});
