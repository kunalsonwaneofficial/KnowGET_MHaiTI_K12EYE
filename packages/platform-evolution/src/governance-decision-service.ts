import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateOpenGateError,
  GovernanceDecisionNotFoundError,
  ImprovementCycleNotFoundError,
  ImprovementInitiativeNotFoundError,
  OrganizationNotFoundForEvolutionError,
  PersonNotFoundForEvolutionError,
} from "./errors";
import { ballotCast, gateConvoked, gateRefused, gateSatisfied } from "./evolution-events";
import type { ChangeClass, GovernanceGate } from "./evolution-value";
import {
  type CastBallotParams,
  type ConvokeGateParams,
  type GovernanceDecision,
  castBallot,
  convokeGate,
  currentGate,
  isDecisionSatisfied,
  isDecisionSettled,
} from "./governance-decision";
import type { ImprovementInitiative } from "./improvement-initiative";
import type {
  GovernanceDecisionRepository,
  ImprovementCycleRepository,
  ImprovementInitiativeRepository,
  OrganizationDirectory,
  PersonDirectory,
} from "./ports";

/**
 * Application service for governance decisions — the minutes of every gate this contract puts in front of a
 * change.
 *
 * Three rules live here, and each of them is a rule the aggregate could not have held.
 *
 * **One open gate per initiative per gate name.** Two concurrent approval gates on one initiative would let a
 * proposer who did not like the first answer convene a second and cite whichever satisfied, which is the exact
 * failure the quorum rule exists to prevent. The store is asked before the record is written; the aggregate
 * holds one decision and has no way to see the other.
 *
 * **The change class is copied from the subject, not from the caller.** {@link ConvokeGateParams} carries a
 * class because the aggregate needs one to derive the quorum, and this service refuses to convene a gate whose
 * class disagrees with the initiative's own — a gate convened at `minor` against a `policy` change would face a
 * smaller quorum than the institution decided that change deserves, and the resulting minute would read as
 * perfectly regular. The initiative is loaded and its class is what is used.
 *
 * **Three of the four gates stand in front of an initiative; `cycle_closure` stands in front of a cycle.** The
 * subject is addressed through one field either way, and which kind of record it names is decided by the gate.
 * A closure gate has no initiative to copy a class from, so there the caller's declared class stands — the one
 * place in this contract where a class is taken on trust. What bounds it is that the class only moves the
 * quorum, the floor of {@link MIN_REQUIRED_DECIDERS} holds regardless, and the proposer still may not decide:
 * the cheapest closure a caller can arrange is one other real person agreeing the round is finished. That the
 * cycle exists is checked, because a closure gate addressed to nothing would satisfy in perfect isolation and
 * the cycle it was supposedly about would still be sitting open.
 *
 * **Everybody named is real.** The proposer, whoever convened the gate, and every decider. This is the check
 * this whole contract turns on: a quorum is a count of distinct people and the proposer-may-not-decide rule is a
 * comparison between names, and both of those hold perfectly against identifiers that resolve to nobody. The
 * gate would satisfy, the arithmetic would be correct, and the institution would hold a minute recording
 * agreement from people who do not exist — a record that is worse than a missing one, because it survives being
 * looked at.
 *
 * Which event a ballot produces is decided **after** the aggregate has counted, never before. Every ballot
 * publishes {@link ballotCast}; a ballot that settled the gate publishes the settling event as well, satisfied
 * or refused according to what the record now says. Nothing here decides an outcome — it reads the one the
 * governance engine derived and announces it.
 */
export interface GovernanceDecisionServiceDeps {
  readonly repository: GovernanceDecisionRepository;
  readonly initiatives: ImprovementInitiativeRepository;
  readonly cycles: ImprovementCycleRepository;
  readonly organizations: OrganizationDirectory;
  readonly people: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class GovernanceDecisionService {
  private readonly repository: GovernanceDecisionRepository;
  private readonly initiatives: ImprovementInitiativeRepository;
  private readonly cycles: ImprovementCycleRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly people: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: GovernanceDecisionServiceDeps) {
    this.repository = deps.repository;
    this.initiatives = deps.initiatives;
    this.cycles = deps.cycles;
    this.organizations = deps.organizations;
    this.people = deps.people;
    this.events = deps.events;
  }

  // --- Convening -------------------------------------------------------------------

  /**
   * Open a gate in front of a change, at the class its subject actually carries.
   *
   * The subject is loaded first because its class overrides whatever the caller sent, and the gate the
   * aggregate is built with has to be the one that will be stored. Then the organization, then the absence of a
   * competing gate, then the people.
   */
  async convoke(params: ConvokeGateParams): Promise<GovernanceDecision> {
    const decision = convokeGate({ ...params, changeClass: await this.subjectClass(params) });
    await this.requireOrganization(params.tenantId, params.organizationId);
    await this.requireGateFree(params.tenantId, params.initiativeId, params.gate);
    await this.requirePerson(params.tenantId, params.proposedBy, "proposer of the change");
    await this.requireActor(params.tenantId, params.convokedBy, "person convening the gate");
    await this.repository.save(decision);
    await this.emit(gateConvoked(decision));
    return decision;
  }

  // --- Deciding --------------------------------------------------------------------

  /**
   * Record one person's decision, and announce the gate's standing if this ballot settled it.
   *
   * The decider is checked against the directory before the aggregate is asked, so a name that resolves to
   * nobody never reaches the count. Everything after that — the proposer's own ballot, a second ballot from the
   * same person, a ballot at a gate that closed last week, a conditional approval with no conditions — is the
   * aggregate's to refuse.
   */
  async cast(tenantId: TenantId, id: Uuid, params: CastBallotParams): Promise<GovernanceDecision> {
    await this.requirePerson(tenantId, params.deciderId, "decider on the gate");
    const next = castBallot(await this.require(tenantId, id), params);
    await this.repository.save(next);
    await this.emit(ballotCast(next));
    if (isDecisionSettled(next)) {
      await this.emit(isDecisionSatisfied(next) ? gateSatisfied(next) : gateRefused(next));
    }
    return next;
  }

  // --- Reading ---------------------------------------------------------------------

  /** One decision, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<GovernanceDecision> {
    return this.require(tenantId, id);
  }

  /**
   * The current gate of this name in front of this initiative, or `null`.
   *
   * Nullable rather than a refusal, because the absence is a legitimate and common answer: most initiatives
   * never face a reversion gate at all, and *nobody has been asked yet* is exactly what a caller checking
   * whether a change can advance needs to be told. Settled gates answer here too, and that is why this reads the
   * trail through {@link currentGate} rather than asking the store for an open one — a caller asking what stands
   * at `approval` wants the decision the institution took, not silence because it has already been taken.
   */
  async findGate(
    tenantId: TenantId,
    initiativeId: Uuid,
    gate: GovernanceGate,
  ): Promise<GovernanceDecision | null> {
    return currentGate(await this.repository.listByInitiative(tenantId, initiativeId), gate);
  }

  /** Every gate this initiative has faced, which together are its governance history. */
  async listByInitiative(
    tenantId: TenantId,
    initiativeId: Uuid,
  ): Promise<readonly GovernanceDecision[]> {
    return this.repository.listByInitiative(tenantId, initiativeId);
  }

  /** Every decision in the tenant. */
  async list(tenantId: TenantId): Promise<readonly GovernanceDecision[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The decision under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<GovernanceDecision> {
    const decision = await this.repository.findById(tenantId, id);
    if (!decision) {
      throw new GovernanceDecisionNotFoundError(id);
    }
    return decision;
  }

  /**
   * The class this gate will be decided at, read off whatever the gate stands in front of.
   *
   * For `approval`, `pilot_exit` and `reversion` that is the initiative, and its class wins outright. For
   * `cycle_closure` the subject is an improvement cycle, which has no class of its own — a round is not a
   * proposed change and carries no blast radius to inherit — so the caller's declared class stands and the
   * existence of the cycle is what gets checked instead. That is a weaker rule than the other three gates get,
   * stated plainly here rather than hidden: it is bounded by the decider floor and the proposer-may-not-decide
   * rule, both of which hold at every class.
   */
  private async subjectClass(params: ConvokeGateParams): Promise<ChangeClass> {
    if (params.gate === "cycle_closure") {
      await this.requireCycle(params.tenantId, params.initiativeId);
      return params.changeClass;
    }
    const initiative = await this.requireInitiative(params.tenantId, params.initiativeId);
    return initiative.changeClass;
  }

  /** The initiative this gate stands in front of, whose change class the gate inherits. */
  private async requireInitiative(
    tenantId: TenantId,
    initiativeId: Uuid,
  ): Promise<ImprovementInitiative> {
    const initiative = await this.initiatives.findById(tenantId, initiativeId);
    if (!initiative) {
      throw new ImprovementInitiativeNotFoundError(initiativeId);
    }
    return initiative;
  }

  /** The improvement cycle a closure gate stands in front of. Existence only; there is no class to copy. */
  private async requireCycle(tenantId: TenantId, cycleId: Uuid): Promise<void> {
    if (!(await this.cycles.findById(tenantId, cycleId))) {
      throw new ImprovementCycleNotFoundError(cycleId);
    }
  }

  /** The institution this decision hangs off, checked through the directory port. */
  private async requireOrganization(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForEvolutionError(organizationId);
    }
  }

  /**
   * No gate of this name is already open in front of this initiative.
   *
   * A settled gate does not block a new one, and that is deliberate rather than an oversight: an initiative
   * refused at approval, reworked and put again faces a fresh gate, and the refused minute stays alongside it.
   * What is refused is two gates open at once, where the answer to *what did the institution decide* would
   * depend on which record the reader happened to open.
   *
   * `findOpenGate` already excludes settled gates by contract; the second condition restates that rule here so
   * that an adapter which read *open* as *latest* would still be refused rather than quietly locking every
   * initiative out of a second gate it is entitled to.
   */
  private async requireGateFree(
    tenantId: TenantId,
    initiativeId: Uuid,
    gate: GovernanceGate,
  ): Promise<void> {
    const open = await this.repository.findOpenGate(tenantId, initiativeId, gate);
    if (open && !isDecisionSettled(open)) {
      throw new DuplicateOpenGateError(initiativeId, gate);
    }
  }

  /** An actor, when one is named. `null` records a gate opened by an automated step. */
  private async requireActor(
    tenantId: TenantId,
    personId: Uuid | null,
    role: string,
  ): Promise<void> {
    if (personId === null) return;
    await this.requirePerson(tenantId, personId, role);
  }

  /** One person, checked against the directory. */
  private async requirePerson(tenantId: TenantId, personId: Uuid, role: string): Promise<void> {
    if (!(await this.people.exists(tenantId, personId))) {
      throw new PersonNotFoundForEvolutionError(personId, role);
    }
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
