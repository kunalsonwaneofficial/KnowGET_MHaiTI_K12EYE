import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateInitiativeKeyError,
  EmptyWithdrawalReasonError,
  GovernanceGateNotConvenedError,
  GovernanceGatePendingError,
  GovernanceGateRefusedError,
  ImprovementInitiativeNotFoundError,
  ImprovementSignalNotFoundError,
  InitiativeNotDraftError,
  OrganizationNotFoundForEvolutionError,
  PersonNotFoundForEvolutionError,
  PilotTooShortError,
} from "./errors";
import {
  INITIATIVE_ADOPTED,
  INITIATIVE_APPROVED,
  INITIATIVE_PILOT_STARTED,
  INITIATIVE_PROPOSED,
  INITIATIVE_RECLASSIFIED,
  INITIATIVE_REJECTED,
  INITIATIVE_RESTATED,
  INITIATIVE_REVIEW_STARTED,
  INITIATIVE_SUBMITTED,
  INITIATIVE_WITHDRAWN,
} from "./evolution-events";
import type { DecisionVerdict, GovernanceGate } from "./evolution-value";
import { type GovernanceDecision, castBallot, convokeGate } from "./governance-decision";
import type { ProposeInitiativeParams } from "./improvement-initiative";
import { ImprovementInitiativeService } from "./improvement-initiative-service";
import { raiseSignal } from "./improvement-signal";
import {
  type GovernanceDecisionRepository,
  type ImprovementInitiativeRepository,
  type ImprovementSignalRepository,
  InMemoryGovernanceDecisionRepository,
  InMemoryImprovementInitiativeRepository,
  InMemoryImprovementSignalRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";

const TENANT = "11111111-1111-4111-8111-111111111111" as TenantId;
const OTHER = "22222222-2222-4222-8222-222222222222" as TenantId;
const ORG = "33333333-3333-4333-8333-333333333333" as Uuid;
const ABSENT_ORG = "3a3a3a3a-3a3a-4a3a-8a3a-3a3a3a3a3a3a" as Uuid;
const PROPOSER = "44444444-4444-4444-8444-444444444444" as Uuid;
const CONVENER = "55555555-5555-4555-8555-555555555555" as Uuid;
const DECIDER = "66666666-6666-4666-8666-666666666666" as Uuid;
const MISSING = "99999999-9999-4999-8999-999999999999" as Uuid;
const ABSENT_SIGNAL = "88888888-8888-4888-8888-888888888888" as Uuid;

const KEY = "academic.marking-turnaround";
const SUMMARY = "Move marking turnaround to two weeks across the whole of key stage three.";
const REVISED = "Move marking turnaround to two weeks in the two largest year groups first.";
const RATIONALE = "The two-week turnaround is achievable at the current marking load.";
const WITHDRAWAL = "The timetable review already answers this and reports in March.";

/** The period the fixtures pilot from. A pilot must run at least one period, so adoption lands later. */
const PILOT_START = 4;

const params = (overrides: Partial<ProposeInitiativeParams> = {}): ProposeInitiativeParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  initiativeKey: KEY,
  changeClass: "clarification",
  summary: SUMMARY,
  originatingSignalIds: [],
  proposedBy: PROPOSER,
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
  private readonly known: readonly Uuid[] = [PROPOSER, CONVENER, DECIDER];

  async exists(tenantId: TenantId, personId: Uuid): Promise<boolean> {
    this.asked.push(personId);
    return tenantId === TENANT && this.known.includes(personId);
  }
}

interface Harness {
  readonly service: ImprovementInitiativeService;
  readonly repository: ImprovementInitiativeRepository;
  readonly decisions: GovernanceDecisionRepository;
  readonly signals: ImprovementSignalRepository;
  readonly organizations: StubOrganizations;
  readonly people: StubPeople;
  readonly events: Recorder;
}

const harness = (): Harness => {
  const repository = new InMemoryImprovementInitiativeRepository();
  const decisions = new InMemoryGovernanceDecisionRepository();
  const signals = new InMemoryImprovementSignalRepository();
  const organizations = new StubOrganizations();
  const people = new StubPeople();
  const events = new Recorder();
  return {
    service: new ImprovementInitiativeService({
      repository,
      decisions,
      signals,
      organizations,
      people,
      events,
    }),
    repository,
    decisions,
    signals,
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

/** A signal in the store, so an initiative may honestly claim to answer it. */
const seedSignal = async (h: Harness, signalKey: string): Promise<Uuid> => {
  const signal = raiseSignal({
    tenantId: TENANT,
    organizationId: ORG,
    signalKey,
    source: "operational_review",
    summary: "Marking turnaround has been over three weeks since the autumn term began.",
    citations: [
      {
        kind: "domain_record",
        sourceDomain: "teaching-learning",
        sourceRef: "review-7",
        attestedBy: null,
      },
    ],
    raisedBy: PROPOSER,
  });
  await h.signals.save(signal);
  return signal.id;
};

/** Open a gate of this name in front of this initiative, unanswered. */
const convene = async (
  h: Harness,
  initiativeId: Uuid,
  gate: GovernanceGate,
): Promise<GovernanceDecision> => {
  const decision = convokeGate({
    tenantId: TENANT,
    organizationId: ORG,
    initiativeId,
    gate,
    changeClass: "clarification",
    proposedBy: PROPOSER,
    convokedBy: CONVENER,
  });
  await h.decisions.save(decision);
  return decision;
};

/** Answer a convened gate. A `clarification` change needs one decider, so a single ballot settles it. */
const answer = async (
  h: Harness,
  decision: GovernanceDecision,
  verdict: DecisionVerdict,
): Promise<GovernanceDecision> => {
  const next = castBallot(decision, {
    deciderId: DECIDER,
    verdict,
    rationale: RATIONALE,
    conditions: [],
  });
  await h.decisions.save(next);
  return next;
};

/** A gate of this name, convened and satisfied — what an initiative needs in order to advance past it. */
const satisfied = async (h: Harness, initiativeId: Uuid, gate: GovernanceGate): Promise<void> => {
  await answer(h, await convene(h, initiativeId, gate), "approved");
};

/** An initiative walked as far as review, which is where the approval gate stands. */
const underReview = async (h: Harness): Promise<Uuid> => {
  const initiative = await h.service.propose(params());
  await h.service.submit(TENANT, initiative.id);
  await h.service.startReview(TENANT, initiative.id);
  return initiative.id;
};

/** An initiative approved and piloting, which is where the pilot-exit gate stands. */
const piloting = async (h: Harness): Promise<Uuid> => {
  const id = await underReview(h);
  await satisfied(h, id, "approval");
  await h.service.approve(TENANT, id);
  await h.service.startPilot(TENANT, id, PILOT_START);
  return id;
};

describe("proposing a change", () => {
  it("stores the proposal as a draft and announces it", async () => {
    const { service, repository, events } = harness();

    const initiative = await service.propose(params());

    expect(initiative.status).toBe("draft");
    expect(initiative.initiativeKey).toBe(KEY);
    expect(await repository.findById(TENANT, initiative.id)).toEqual(initiative);
    expect(events.types).toEqual([INITIATIVE_PROPOSED]);
  });

  it("checks the institution through the directory", async () => {
    const { service, organizations } = harness();

    const thrown = await refusalOf(() => service.propose(params({ organizationId: ABSENT_ORG })));

    expect(thrown).toBeInstanceOf(OrganizationNotFoundForEvolutionError);
    expect(organizations.asked).toEqual([ABSENT_ORG]);
  });

  it("checks the proposer through the directory", async () => {
    const { service, people } = harness();

    const thrown = await refusalOf(() => service.propose(params({ proposedBy: MISSING })));

    expect(thrown).toBeInstanceOf(PersonNotFoundForEvolutionError);
    expect(people.asked).toEqual([MISSING]);
  });

  it("refuses a key another initiative holds, and a withdrawn one still holds it", async () => {
    const { service } = harness();
    const initiative = await service.propose(params());
    await service.withdraw(TENANT, initiative.id, PROPOSER, WITHDRAWAL);

    const thrown = await refusalOf(() => service.propose(params()));

    expect(thrown).toBeInstanceOf(DuplicateInitiativeKeyError);
  });

  it("refuses a key spelled differently, because the key it stores is normalized", async () => {
    const { service } = harness();
    await service.propose(params());

    const thrown = await refusalOf(() =>
      service.propose(params({ initiativeKey: "  ACADEMIC.MARKING-TURNAROUND  " })),
    );

    expect(thrown).toBeInstanceOf(DuplicateInitiativeKeyError);
  });

  it("walks every named origin and refuses the one that points at nothing", async () => {
    const h = harness();
    const origin = await seedSignal(h, KEY);

    const thrown = await refusalOf(() =>
      h.service.propose(params({ originatingSignalIds: [origin, ABSENT_SIGNAL] })),
    );

    expect(thrown).toBeInstanceOf(ImprovementSignalNotFoundError);
    expect(thrown).toMatchObject({ details: { id: ABSENT_SIGNAL } });
  });

  it("admits an origin still in triage, because improvement work is not serial", async () => {
    const h = harness();
    const origin = await seedSignal(h, KEY);

    const initiative = await h.service.propose(params({ originatingSignalIds: [origin] }));

    expect(initiative.originatingSignalIds).toEqual([origin]);
  });

  it("admits a proposal that answers no signal at all", async () => {
    const { service } = harness();

    const initiative = await service.propose(params({ originatingSignalIds: [] }));

    expect(initiative.originatingSignalIds).toEqual([]);
  });

  it("stores nothing and announces nothing when a check refuses", async () => {
    const { service, repository, events } = harness();

    await refusalOf(() => service.propose(params({ organizationId: ABSENT_ORG })));

    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(events.published).toEqual([]);
  });
});

describe("moving a change through review", () => {
  it("restates and reclassifies a draft, announcing each", async () => {
    const { service, events } = harness();
    const initiative = await service.propose(params());

    await service.restate(TENANT, initiative.id, REVISED);
    const reclassified = await service.reclassify(TENANT, initiative.id, "policy");

    expect(reclassified.summary).toBe(REVISED);
    expect(reclassified.changeClass).toBe("policy");
    expect(events.types).toEqual([
      INITIATIVE_PROPOSED,
      INITIATIVE_RESTATED,
      INITIATIVE_RECLASSIFIED,
    ]);
  });

  it("submits and starts review, storing each step as it announces it", async () => {
    const h = harness();
    const initiative = await h.service.propose(params());

    await h.service.submit(TENANT, initiative.id);
    const reviewing = await h.service.startReview(TENANT, initiative.id);

    expect(reviewing.status).toBe("under_review");
    expect(await h.repository.findById(TENANT, initiative.id)).toEqual(reviewing);
    expect(h.events.types).toEqual([
      INITIATIVE_PROPOSED,
      INITIATIVE_SUBMITTED,
      INITIATIVE_REVIEW_STARTED,
    ]);
  });

  it("lets the aggregate refuse a reclassification once the class has been fixed", async () => {
    const { service } = harness();
    const initiative = await service.propose(params());
    await service.submit(TENANT, initiative.id);

    const thrown = await refusalOf(() => service.reclassify(TENANT, initiative.id, "policy"));

    expect(thrown).toBeInstanceOf(InitiativeNotDraftError);
  });

  it("refuses to move an initiative this tenant cannot see", async () => {
    const { service } = harness();
    const initiative = await service.propose(params());

    const thrown = await refusalOf(() => service.submit(OTHER, initiative.id));

    expect(thrown).toBeInstanceOf(ImprovementInitiativeNotFoundError);
  });
});

describe("the approval gate", () => {
  it("refuses an approval when no gate was ever convened", async () => {
    const h = harness();
    const id = await underReview(h);

    const thrown = await refusalOf(() => h.service.approve(TENANT, id));

    expect(thrown).toBeInstanceOf(GovernanceGateNotConvenedError);
  });

  it("refuses an approval while the gate is still being answered", async () => {
    const h = harness();
    const id = await underReview(h);
    await convene(h, id, "approval");

    const thrown = await refusalOf(() => h.service.approve(TENANT, id));

    expect(thrown).toBeInstanceOf(GovernanceGatePendingError);
  });

  it("refuses an approval the gate refused", async () => {
    const h = harness();
    const id = await underReview(h);
    await answer(h, await convene(h, id, "approval"), "rejected");

    const thrown = await refusalOf(() => h.service.approve(TENANT, id));

    expect(thrown).toBeInstanceOf(GovernanceGateRefusedError);
  });

  it("approves on a satisfied gate and announces it", async () => {
    const h = harness();
    const id = await underReview(h);
    await satisfied(h, id, "approval");

    const approved = await h.service.approve(TENANT, id);

    expect(approved.status).toBe("approved");
    expect(approved.approvedAt).not.toBeNull();
    expect(h.events.types.at(-1)).toBe(INITIATIVE_APPROVED);
  });

  it("reads the whole trail, so a gate that has already settled still counts", async () => {
    const h = harness();
    const id = await underReview(h);
    await satisfied(h, id, "approval");

    expect(await h.decisions.findOpenGate(TENANT, id, "approval")).toBeNull();
    expect((await h.service.approve(TENANT, id)).status).toBe("approved");
  });

  it("will not read a gate of another name as this one", async () => {
    const h = harness();
    const id = await underReview(h);
    await satisfied(h, id, "pilot_exit");

    const thrown = await refusalOf(() => h.service.approve(TENANT, id));

    expect(thrown).toBeInstanceOf(GovernanceGateNotConvenedError);
  });

  it("reads the reconvened gate rather than the refusal it replaced", async () => {
    const h = harness();
    const id = await underReview(h);
    await answer(h, await convene(h, id, "approval"), "rejected");
    await convene(h, id, "approval");

    const thrown = await refusalOf(() => h.service.approve(TENANT, id));

    expect(thrown).toBeInstanceOf(GovernanceGatePendingError);
  });

  it("leaves the initiative exactly where it was when the gate refuses", async () => {
    const h = harness();
    const id = await underReview(h);
    await answer(h, await convene(h, id, "approval"), "rejected");

    await refusalOf(() => h.service.approve(TENANT, id));

    expect((await h.service.get(TENANT, id)).status).toBe("under_review");
    expect(h.events.types).not.toContain(INITIATIVE_APPROVED);
  });
});

describe("piloting and adoption", () => {
  it("starts the pilot from a period on the institution's own grid", async () => {
    const h = harness();
    const id = await piloting(h);

    const initiative = await h.service.get(TENANT, id);

    expect(initiative.status).toBe("piloting");
    expect(initiative.pilotStartedPeriod).toBe(PILOT_START);
    expect(h.events.types.at(-1)).toBe(INITIATIVE_PILOT_STARTED);
  });

  it("refuses adoption when no pilot-exit gate was convened", async () => {
    const h = harness();
    const id = await piloting(h);

    const thrown = await refusalOf(() => h.service.adopt(TENANT, id, PILOT_START + 1, PROPOSER));

    expect(thrown).toBeInstanceOf(GovernanceGateNotConvenedError);
  });

  it("will not accept the approval gate that got the change this far", async () => {
    const h = harness();
    const id = await piloting(h);

    const thrown = await refusalOf(() => h.service.adopt(TENANT, id, PILOT_START + 1, PROPOSER));

    expect(thrown).toMatchObject({ details: { gate: "pilot_exit" } });
  });

  it("refuses adoption in the period the pilot started, gate or no gate", async () => {
    const h = harness();
    const id = await piloting(h);
    await satisfied(h, id, "pilot_exit");

    const thrown = await refusalOf(() => h.service.adopt(TENANT, id, PILOT_START, PROPOSER));

    expect(thrown).toBeInstanceOf(PilotTooShortError);
  });

  it("adopts on a satisfied pilot-exit gate and announces it", async () => {
    const h = harness();
    const id = await piloting(h);
    await satisfied(h, id, "pilot_exit");

    const adopted = await h.service.adopt(TENANT, id, PILOT_START + 1, PROPOSER);

    expect(adopted.status).toBe("adopted");
    expect(adopted.settledBy).toBe(PROPOSER);
    expect(h.events.types.at(-1)).toBe(INITIATIVE_ADOPTED);
  });

  it("checks the adopting actor through the directory before it reads the gate", async () => {
    const h = harness();
    const id = await piloting(h);
    await satisfied(h, id, "pilot_exit");

    const thrown = await refusalOf(() => h.service.adopt(TENANT, id, PILOT_START + 1, MISSING));

    expect(thrown).toBeInstanceOf(PersonNotFoundForEvolutionError);
  });

  it("lets an automated step record the adoption, which decides nothing", async () => {
    const h = harness();
    const id = await piloting(h);
    await satisfied(h, id, "pilot_exit");

    const adopted = await h.service.adopt(TENANT, id, PILOT_START + 1, null);

    expect(adopted.settledBy).toBeNull();
  });
});

describe("endings that need no gate", () => {
  it("rejects without consulting any gate at all", async () => {
    const h = harness();
    const id = await underReview(h);

    const rejected = await h.service.reject(TENANT, id, PROPOSER);

    expect(rejected.status).toBe("rejected");
    expect(await h.decisions.listByInitiative(TENANT, id)).toEqual([]);
    expect(h.events.types.at(-1)).toBe(INITIATIVE_REJECTED);
  });

  it("withdraws with the reason that is the only compulsory free text on an initiative", async () => {
    const h = harness();
    const id = await underReview(h);

    const withdrawn = await h.service.withdraw(TENANT, id, PROPOSER, WITHDRAWAL);

    expect(withdrawn.status).toBe("withdrawn");
    expect(withdrawn.withdrawalReason).toBe(WITHDRAWAL);
    expect(h.events.types.at(-1)).toBe(INITIATIVE_WITHDRAWN);
  });

  it("refuses a withdrawal that gives no reason", async () => {
    const h = harness();
    const id = await underReview(h);

    const thrown = await refusalOf(() => h.service.withdraw(TENANT, id, PROPOSER, "   "));

    expect(thrown).toBeInstanceOf(EmptyWithdrawalReasonError);
  });

  it("checks the withdrawing actor through the directory", async () => {
    const h = harness();
    const id = await underReview(h);

    const thrown = await refusalOf(() => h.service.withdraw(TENANT, id, MISSING, WITHDRAWAL));

    expect(thrown).toBeInstanceOf(PersonNotFoundForEvolutionError);
  });
});

describe("reading the pipeline", () => {
  it("reads one initiative, and cannot be asked for one from another tenant", async () => {
    const { service } = harness();
    const initiative = await service.propose(params());

    expect(await service.get(TENANT, initiative.id)).toEqual(initiative);
    expect(await refusalOf(() => service.get(OTHER, initiative.id))).toBeInstanceOf(
      ImprovementInitiativeNotFoundError,
    );
  });

  it("reads by key, naming the normalized form it actually searched for", async () => {
    const { service } = harness();
    const initiative = await service.propose(params());

    expect(await service.getByKey(TENANT, "  ACADEMIC.MARKING-TURNAROUND  ")).toEqual(initiative);
    expect(await refusalOf(() => service.getByKey(TENANT, "Academic.Nothing"))).toMatchObject({
      details: { id: "academic.nothing" },
    });
  });

  it("separates what is in flight from what the institution actually changed", async () => {
    const h = harness();
    const adoptedId = await piloting(h);
    await satisfied(h, adoptedId, "pilot_exit");
    await h.service.adopt(TENANT, adoptedId, PILOT_START + 1, PROPOSER);
    const open = await h.service.propose(params({ initiativeKey: "academic.homework-load" }));

    expect((await h.service.listOpen(TENANT, ORG)).map((i) => i.id)).toEqual([open.id]);
    expect((await h.service.listAdopted(TENANT, ORG)).map((i) => i.id)).toEqual([adoptedId]);
  });

  it("lists everything in the tenant, settled ones included", async () => {
    const { service } = harness();
    const initiative = await service.propose(params());
    await service.withdraw(TENANT, initiative.id, PROPOSER, WITHDRAWAL);

    expect(await service.list(TENANT)).toHaveLength(1);
    expect(await service.list(OTHER)).toEqual([]);
  });
});

describe("what the service will not do", () => {
  const methods = (): string[] =>
    Object.getOwnPropertyNames(ImprovementInitiativeService.prototype);

  it("has no method that enacts, deploys, releases or rolls anything back", () => {
    for (const verb of ["apply", "deploy", "enact", "execute", "release", "rollback", "rollout"]) {
      expect(methods()).not.toContain(verb);
    }
  });

  it("has no method that removes an initiative from the record", () => {
    for (const verb of ["archive", "delete", "destroy", "purge", "remove"]) {
      expect(methods()).not.toContain(verb);
    }
  });

  it("takes no gate outcome from its caller on either governed transition", () => {
    expect(ImprovementInitiativeService.prototype.approve).toHaveLength(2);
    expect(ImprovementInitiativeService.prototype.adopt).toHaveLength(4);
  });

  it("runs without an event bus, because announcing is not what makes the record true", async () => {
    const service = new ImprovementInitiativeService({
      repository: new InMemoryImprovementInitiativeRepository(),
      decisions: new InMemoryGovernanceDecisionRepository(),
      signals: new InMemoryImprovementSignalRepository(),
      organizations: new StubOrganizations(),
      people: new StubPeople(),
    });

    expect((await service.propose(params())).status).toBe("draft");
  });
});
