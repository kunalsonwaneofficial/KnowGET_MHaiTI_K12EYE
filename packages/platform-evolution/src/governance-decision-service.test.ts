import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateOpenGateError,
  GateAlreadySettledError,
  GovernanceDecisionNotFoundError,
  ImprovementInitiativeNotFoundError,
  OrganizationNotFoundForEvolutionError,
  PersonNotFoundForEvolutionError,
  ProposerMayNotDecideError,
  RepeatBallotError,
} from "./errors";
import { BALLOT_CAST, GATE_CONVOKED, GATE_REFUSED, GATE_SATISFIED } from "./evolution-events";
import { type ChangeClass, REQUIRED_DECIDERS } from "./evolution-value";
import type { CastBallotParams, ConvokeGateParams } from "./governance-decision";
import { GovernanceDecisionService } from "./governance-decision-service";
import { proposeInitiative } from "./improvement-initiative";
import {
  type GovernanceDecisionRepository,
  type ImprovementInitiativeRepository,
  InMemoryGovernanceDecisionRepository,
  InMemoryImprovementInitiativeRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";

const TENANT = "11111111-1111-4111-8111-111111111111" as TenantId;
const OTHER = "22222222-2222-4222-8222-222222222222" as TenantId;
const ORG = "33333333-3333-4333-8333-333333333333" as Uuid;
const ABSENT_ORG = "3a3a3a3a-3a3a-4a3a-8a3a-3a3a3a3a3a3a" as Uuid;
const PROPOSER = "44444444-4444-4444-8444-444444444444" as Uuid;
const CONVENER = "55555555-5555-4555-8555-555555555555" as Uuid;
const FIRST = "66666666-6666-4666-8666-666666666666" as Uuid;
const SECOND = "77777777-7777-4777-8777-777777777777" as Uuid;
const MISSING = "99999999-9999-4999-8999-999999999999" as Uuid;
const ABSENT_INITIATIVE = "88888888-8888-4888-8888-888888888888" as Uuid;

const SUMMARY = "Move marking turnaround to two weeks across the whole of key stage three.";
const RATIONALE = "The two-week turnaround is achievable at the current marking load.";

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
  private readonly known: readonly Uuid[] = [PROPOSER, CONVENER, FIRST, SECOND];

  async exists(tenantId: TenantId, personId: Uuid): Promise<boolean> {
    this.asked.push(personId);
    return tenantId === TENANT && this.known.includes(personId);
  }
}

interface Harness {
  readonly service: GovernanceDecisionService;
  readonly repository: GovernanceDecisionRepository;
  readonly initiatives: ImprovementInitiativeRepository;
  readonly organizations: StubOrganizations;
  readonly people: StubPeople;
  readonly events: Recorder;
}

const harness = (): Harness => {
  const repository = new InMemoryGovernanceDecisionRepository();
  const initiatives = new InMemoryImprovementInitiativeRepository();
  const organizations = new StubOrganizations();
  const people = new StubPeople();
  const events = new Recorder();
  return {
    service: new GovernanceDecisionService({
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

/** An initiative in the store for a gate to stand in front of, at the class it will be governed under. */
const seedInitiative = async (
  h: Harness,
  changeClass: ChangeClass = "clarification",
  initiativeKey = "academic.marking-turnaround",
): Promise<Uuid> => {
  const initiative = proposeInitiative({
    tenantId: TENANT,
    organizationId: ORG,
    initiativeKey,
    changeClass,
    summary: SUMMARY,
    originatingSignalIds: [],
    proposedBy: PROPOSER,
  });
  await h.initiatives.save(initiative);
  return initiative.id;
};

const convocation = (
  initiativeId: Uuid,
  overrides: Partial<ConvokeGateParams> = {},
): ConvokeGateParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  initiativeId,
  gate: "approval",
  changeClass: "clarification",
  proposedBy: PROPOSER,
  convokedBy: CONVENER,
  ...overrides,
});

const ballot = (deciderId: Uuid, overrides: Partial<CastBallotParams> = {}): CastBallotParams => ({
  deciderId,
  verdict: "approved",
  rationale: RATIONALE,
  conditions: [],
  ...overrides,
});

describe("convening a gate", () => {
  it("opens an unanswered gate, stores it and announces it", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h);

    const decision = await h.service.convoke(convocation(initiativeId));

    expect(decision.outcome).toBe("pending");
    expect(decision.ballots).toEqual([]);
    expect(await h.repository.findById(TENANT, decision.id)).toEqual(decision);
    expect(h.events.types).toEqual([GATE_CONVOKED]);
  });

  it("takes the change class from the initiative, not from whoever asked", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h, "policy");

    const decision = await h.service.convoke(
      convocation(initiativeId, { changeClass: "clarification" }),
    );

    expect(decision.changeClass).toBe("policy");
    expect(decision.required).toBe(REQUIRED_DECIDERS.policy);
    expect(decision.required).toBeGreaterThan(REQUIRED_DECIDERS.clarification);
  });

  it("refuses a gate in front of a change that does not exist, before asking anything else", async () => {
    const h = harness();

    const thrown = await refusalOf(() =>
      h.service.convoke(convocation(ABSENT_INITIATIVE, { organizationId: ABSENT_ORG })),
    );

    expect(thrown).toBeInstanceOf(ImprovementInitiativeNotFoundError);
    expect(h.organizations.asked).toEqual([]);
  });

  it("cannot see an initiative belonging to another tenant", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h);

    const thrown = await refusalOf(() =>
      h.service.convoke(convocation(initiativeId, { tenantId: OTHER })),
    );

    expect(thrown).toBeInstanceOf(ImprovementInitiativeNotFoundError);
  });

  it("checks the institution through the directory", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h);

    const thrown = await refusalOf(() =>
      h.service.convoke(convocation(initiativeId, { organizationId: ABSENT_ORG })),
    );

    expect(thrown).toBeInstanceOf(OrganizationNotFoundForEvolutionError);
  });

  it("refuses a second gate of the same name while the first is still open", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h);
    await h.service.convoke(convocation(initiativeId));

    const thrown = await refusalOf(() => h.service.convoke(convocation(initiativeId)));

    expect(thrown).toBeInstanceOf(DuplicateOpenGateError);
    expect(thrown).toMatchObject({ details: { gate: "approval" } });
  });

  it("permits a fresh gate once the first has been answered, and keeps both minutes", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h);
    const refused = await h.service.convoke(convocation(initiativeId));
    await h.service.cast(TENANT, refused.id, ballot(FIRST, { verdict: "rejected" }));

    const reconvened = await h.service.convoke(convocation(initiativeId));

    expect(reconvened.outcome).toBe("pending");
    expect(await h.service.listByInitiative(TENANT, initiativeId)).toHaveLength(2);
  });

  it("permits a gate of another name alongside an open one, because they ask different questions", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h);
    await h.service.convoke(convocation(initiativeId));

    const reversion = await h.service.convoke(convocation(initiativeId, { gate: "reversion" }));

    expect(reversion.gate).toBe("reversion");
    expect(await h.service.listByInitiative(TENANT, initiativeId)).toHaveLength(2);
  });

  it("checks the proposer of the change through the directory", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h);

    const thrown = await refusalOf(() =>
      h.service.convoke(convocation(initiativeId, { proposedBy: MISSING })),
    );

    expect(thrown).toBeInstanceOf(PersonNotFoundForEvolutionError);
  });

  it("checks whoever convened the gate, and lets an automated step convene one", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h);

    const thrown = await refusalOf(() =>
      h.service.convoke(convocation(initiativeId, { convokedBy: MISSING })),
    );
    const automated = await h.service.convoke(convocation(initiativeId, { convokedBy: null }));

    expect(thrown).toBeInstanceOf(PersonNotFoundForEvolutionError);
    expect(automated.convokedBy).toBeNull();
  });

  it("stores nothing and announces nothing when a check refuses", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h);

    await refusalOf(() =>
      h.service.convoke(convocation(initiativeId, { organizationId: ABSENT_ORG })),
    );

    expect(await h.service.list(TENANT)).toEqual([]);
    expect(h.events.published).toEqual([]);
  });
});

describe("casting a ballot", () => {
  it("records the ballot and announces it, leaving a gate that still needs people open", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h, "policy");
    const gate = await h.service.convoke(convocation(initiativeId));

    const next = await h.service.cast(TENANT, gate.id, ballot(FIRST));

    expect(next.outcome).toBe("pending");
    expect(next.outstanding).toBe(1);
    expect(await h.repository.findById(TENANT, gate.id)).toEqual(next);
    expect(h.events.types).toEqual([GATE_CONVOKED, BALLOT_CAST]);
  });

  it("announces the ballot and then the satisfaction, in that order", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h, "policy");
    const gate = await h.service.convoke(convocation(initiativeId));
    await h.service.cast(TENANT, gate.id, ballot(FIRST));

    const settled = await h.service.cast(TENANT, gate.id, ballot(SECOND));

    expect(settled.outcome).toBe("satisfied");
    expect(h.events.types.slice(-2)).toEqual([BALLOT_CAST, GATE_SATISFIED]);
  });

  it("announces a refusal the same way, because one refusal settles the gate", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h, "policy");
    const gate = await h.service.convoke(convocation(initiativeId));

    const settled = await h.service.cast(TENANT, gate.id, ballot(FIRST, { verdict: "rejected" }));

    expect(settled.outcome).toBe("refused");
    expect(settled.refused).toBe(true);
    expect(h.events.types.slice(-2)).toEqual([BALLOT_CAST, GATE_REFUSED]);
  });

  it("says nothing about the gate's standing while it is still open", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h, "policy");
    const gate = await h.service.convoke(convocation(initiativeId));

    await h.service.cast(TENANT, gate.id, ballot(FIRST));

    expect(h.events.types).not.toContain(GATE_SATISFIED);
    expect(h.events.types).not.toContain(GATE_REFUSED);
  });

  it("checks the decider through the directory before the aggregate is asked anything", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h);
    const gate = await h.service.convoke(convocation(initiativeId));
    await h.service.cast(TENANT, gate.id, ballot(FIRST));

    const unknown = await refusalOf(() => h.service.cast(TENANT, gate.id, ballot(MISSING)));
    const known = await refusalOf(() => h.service.cast(TENANT, gate.id, ballot(SECOND)));

    expect(unknown).toBeInstanceOf(PersonNotFoundForEvolutionError);
    expect(known).toBeInstanceOf(GateAlreadySettledError);
  });

  it("leaves the proposer's own ballot to the aggregate to refuse", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h);
    const gate = await h.service.convoke(convocation(initiativeId));

    const thrown = await refusalOf(() => h.service.cast(TENANT, gate.id, ballot(PROPOSER)));

    expect(thrown).toBeInstanceOf(ProposerMayNotDecideError);
  });

  it("leaves a second ballot from the same person to the aggregate to refuse", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h, "policy");
    const gate = await h.service.convoke(convocation(initiativeId));
    await h.service.cast(TENANT, gate.id, ballot(FIRST));

    const thrown = await refusalOf(() => h.service.cast(TENANT, gate.id, ballot(FIRST)));

    expect(thrown).toBeInstanceOf(RepeatBallotError);
  });

  it("refuses a ballot from outside the tenant without touching the record", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h);
    const gate = await h.service.convoke(convocation(initiativeId));

    const thrown = await refusalOf(() => h.service.cast(OTHER, gate.id, ballot(FIRST)));

    expect(thrown).toBeInstanceOf(PersonNotFoundForEvolutionError);
    expect((await h.service.get(TENANT, gate.id)).ballots).toEqual([]);
  });
});

describe("reading the minutes", () => {
  it("reads one decision, and cannot be asked for one from another tenant", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h);
    const gate = await h.service.convoke(convocation(initiativeId));

    expect(await h.service.get(TENANT, gate.id)).toEqual(gate);
    expect(await refusalOf(() => h.service.get(OTHER, gate.id))).toBeInstanceOf(
      GovernanceDecisionNotFoundError,
    );
  });

  it("answers with nothing when nobody has been asked", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h);

    expect(await h.service.findGate(TENANT, initiativeId, "approval")).toBeNull();
  });

  it("answers with a settled gate, which is the decision the institution took", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h);
    const gate = await h.service.convoke(convocation(initiativeId));
    await h.service.cast(TENANT, gate.id, ballot(FIRST));

    const found = await h.service.findGate(TENANT, initiativeId, "approval");

    expect(found?.id).toBe(gate.id);
    expect(found?.outcome).toBe("satisfied");
  });

  it("prefers the question still open to the answer already given", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h);
    const refused = await h.service.convoke(convocation(initiativeId));
    await h.service.cast(TENANT, refused.id, ballot(FIRST, { verdict: "rejected" }));
    const reconvened = await h.service.convoke(convocation(initiativeId));

    const found = await h.service.findGate(TENANT, initiativeId, "approval");

    expect(found?.id).toBe(reconvened.id);
    expect(found?.outcome).toBe("pending");
  });

  it("keeps the gates of other names out of it", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h);
    await h.service.convoke(convocation(initiativeId));
    const reversion = await h.service.convoke(convocation(initiativeId, { gate: "reversion" }));

    expect((await h.service.findGate(TENANT, initiativeId, "reversion"))?.id).toBe(reversion.id);
    expect(await h.service.findGate(TENANT, initiativeId, "pilot_exit")).toBeNull();
  });

  it("keeps the refusals in the trail, because passing at the third attempt is a different fact", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h);
    const refused = await h.service.convoke(convocation(initiativeId));
    await h.service.cast(TENANT, refused.id, ballot(FIRST, { verdict: "rejected" }));
    const satisfied = await h.service.convoke(convocation(initiativeId));
    await h.service.cast(TENANT, satisfied.id, ballot(SECOND));

    const trail = await h.service.listByInitiative(TENANT, initiativeId);

    expect(trail.map((decision) => decision.outcome)).toEqual(["refused", "satisfied"]);
  });

  it("lists every decision in the tenant and none from any other", async () => {
    const h = harness();
    const initiativeId = await seedInitiative(h);
    await h.service.convoke(convocation(initiativeId));

    expect(await h.service.list(TENANT)).toHaveLength(1);
    expect(await h.service.list(OTHER)).toEqual([]);
  });
});

describe("what the service will not do", () => {
  const methods = (): string[] => Object.getOwnPropertyNames(GovernanceDecisionService.prototype);

  it("has no method that settles a gate without anybody answering it", () => {
    for (const verb of ["force", "override", "refuse", "satisfy", "settle", "waive"]) {
      expect(methods()).not.toContain(verb);
    }
  });

  it("has no method that removes a decision from the record", () => {
    for (const verb of ["archive", "delete", "destroy", "purge", "remove", "retract"]) {
      expect(methods()).not.toContain(verb);
    }
  });

  it("runs without an event bus, because announcing is not what makes the minute true", async () => {
    const initiatives = new InMemoryImprovementInitiativeRepository();
    const service = new GovernanceDecisionService({
      repository: new InMemoryGovernanceDecisionRepository(),
      initiatives,
      organizations: new StubOrganizations(),
      people: new StubPeople(),
    });
    const initiative = proposeInitiative({
      tenantId: TENANT,
      organizationId: ORG,
      initiativeKey: "academic.marking-turnaround",
      changeClass: "clarification",
      summary: SUMMARY,
      originatingSignalIds: [],
      proposedBy: PROPOSER,
    });
    await initiatives.save(initiative);

    expect((await service.convoke(convocation(initiative.id))).outcome).toBe("pending");
  });
});
