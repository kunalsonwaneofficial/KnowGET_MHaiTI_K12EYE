import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateInitiativeKeyError,
  ImprovementInitiativeNotFoundError,
  ImprovementSignalNotFoundError,
  OrganizationNotFoundForEvolutionError,
  PersonNotFoundForEvolutionError,
} from "./errors";
import {
  initiativeAdopted,
  initiativeApproved,
  initiativePilotStarted,
  initiativeProposed,
  initiativeReclassified,
  initiativeRejected,
  initiativeRestated,
  initiativeReviewStarted,
  initiativeSubmitted,
  initiativeWithdrawn,
} from "./evolution-events";
import {
  type ChangeClass,
  type GateOutcome,
  type GovernanceGate,
  normalizeKey,
} from "./evolution-value";
import { currentGate } from "./governance-decision";
import {
  type ImprovementInitiative,
  type ProposeInitiativeParams,
  adoptInitiative,
  approveInitiative,
  proposeInitiative,
  reclassifyInitiative,
  rejectInitiative,
  reviseInitiativeSummary,
  startInitiativePilot,
  startInitiativeReview,
  submitInitiative,
  withdrawInitiative,
} from "./improvement-initiative";
import type {
  GovernanceDecisionRepository,
  ImprovementInitiativeRepository,
  ImprovementSignalRepository,
  OrganizationDirectory,
  PersonDirectory,
} from "./ports";

/**
 * Application service for improvement initiatives — proposed changes, and the record of what became of them.
 *
 * The interesting work here is **fetching the gate outcome the aggregate demands**. {@link
 * ImprovementInitiative} refuses to advance to `approved` or `adopted` without a satisfied gate, and it takes
 * that outcome as an argument precisely so it cannot look it up, decide it, or be talked out of needing it.
 * Somebody has to do the looking up, and it is this service: it loads the open gate for the initiative at the
 * gate the transition requires, and hands the aggregate whatever it finds — including `null` when no gate was
 * ever convened, which the aggregate then refuses by its own error.
 *
 * That indirection is the whole of *evolution always requires human governance* as executable code. There is no
 * parameter on either method by which a caller supplies its own outcome, no privileged path that skips the
 * lookup, and no flag. A caller who wants an approval must first convene a gate and persuade the number of
 * people the change class demands.
 *
 * The **originating signals are checked, and only at proposal**. A proposal claiming to address four signals is
 * a claim governors read and weigh, and one of the four pointing at nothing makes the count a fiction. The
 * signals are not required to be *accepted*: an initiative may perfectly well be raised against a signal still
 * in triage, and requiring acceptance first would make the pipeline serial in a way real improvement work is
 * not. What is required is that they exist, in this tenant.
 *
 * Nothing here enacts anything. {@link ImprovementInitiativeService.adopt} writes a status and publishes an
 * event, and that is the entire physical consequence of an institution adopting a change through this platform.
 * The contract that owns the thing being changed is what changes it.
 */
export interface ImprovementInitiativeServiceDeps {
  readonly repository: ImprovementInitiativeRepository;
  readonly decisions: GovernanceDecisionRepository;
  readonly signals: ImprovementSignalRepository;
  readonly organizations: OrganizationDirectory;
  readonly people: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class ImprovementInitiativeService {
  private readonly repository: ImprovementInitiativeRepository;
  private readonly decisions: GovernanceDecisionRepository;
  private readonly signals: ImprovementSignalRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly people: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ImprovementInitiativeServiceDeps) {
    this.repository = deps.repository;
    this.decisions = deps.decisions;
    this.signals = deps.signals;
    this.organizations = deps.organizations;
    this.people = deps.people;
    this.events = deps.events;
  }

  // --- Proposing -------------------------------------------------------------------

  /** Put a change forward, against the signals it answers and under a key nothing else holds. */
  async propose(params: ProposeInitiativeParams): Promise<ImprovementInitiative> {
    const initiative = proposeInitiative(params);
    await this.requireOrganization(params.tenantId, params.organizationId);
    await this.requireKeyFree(params.tenantId, initiative.initiativeKey);
    await this.requirePerson(params.tenantId, params.proposedBy, "proposer of the initiative");
    await this.requireOrigins(params.tenantId, initiative.originatingSignalIds);
    await this.repository.save(initiative);
    await this.emit(initiativeProposed(initiative));
    return initiative;
  }

  /** Rewrite what is being proposed. Permitted while it is still being argued about, and never after. */
  async restate(tenantId: TenantId, id: Uuid, summary: string): Promise<ImprovementInitiative> {
    return this.transition(tenantId, id, reviseInitiativeSummary, initiativeRestated, summary);
  }

  /** Change how big a change this is. Draft only — the class decides the quorum it will face. */
  async reclassify(
    tenantId: TenantId,
    id: Uuid,
    changeClass: ChangeClass,
  ): Promise<ImprovementInitiative> {
    return this.transition(tenantId, id, reclassifyInitiative, initiativeReclassified, changeClass);
  }

  // --- Lifecycle -------------------------------------------------------------------

  /** Put the proposal forward for review. The moment the class, and the quorum it implies, stop moving. */
  async submit(tenantId: TenantId, id: Uuid): Promise<ImprovementInitiative> {
    return this.transition(tenantId, id, submitInitiative, initiativeSubmitted);
  }

  /** Record that the institution has started considering this. */
  async startReview(tenantId: TenantId, id: Uuid): Promise<ImprovementInitiative> {
    return this.transition(tenantId, id, startInitiativeReview, initiativeReviewStarted);
  }

  /**
   * Approve the change, on the strength of an approval gate this service goes and reads.
   *
   * The outcome is fetched rather than supplied, and a missing gate produces `null` rather than an optimistic
   * default. Everything the aggregate does with it — refusing a pending gate, refusing a refused one, refusing
   * the absence of one — happens on the other side of that call and cannot be reached around from here.
   */
  async approve(tenantId: TenantId, id: Uuid): Promise<ImprovementInitiative> {
    const initiative = await this.require(tenantId, id);
    const outcome = await this.gateOutcome(tenantId, id, "approval");
    return this.record(approveInitiative(initiative, outcome), initiativeApproved);
  }

  /** Close the file on a change the institution is not making. No gate is required to say no. */
  async reject(tenantId: TenantId, id: Uuid, actor: Uuid | null): Promise<ImprovementInitiative> {
    await this.requireActor(tenantId, actor, "person rejecting the initiative");
    return this.transition(tenantId, id, rejectInitiative, initiativeRejected, actor);
  }

  /** Start the pilot, from a period on the institution's own grid. */
  async startPilot(
    tenantId: TenantId,
    id: Uuid,
    startPeriod: number,
  ): Promise<ImprovementInitiative> {
    return this.transition(tenantId, id, startInitiativePilot, initiativePilotStarted, startPeriod);
  }

  /**
   * Adopt the change: this is now how the institution works.
   *
   * The pilot-exit gate is read the same way the approval gate is, and the pilot's length is checked by the
   * aggregate against the period named here. Then nothing else happens — adoption is a record, not an act.
   */
  async adopt(
    tenantId: TenantId,
    id: Uuid,
    asOfPeriod: number,
    actor: Uuid | null,
  ): Promise<ImprovementInitiative> {
    const initiative = await this.require(tenantId, id);
    await this.requireActor(tenantId, actor, "person adopting the initiative");
    const outcome = await this.gateOutcome(tenantId, id, "pilot_exit");
    return this.record(adoptInitiative(initiative, outcome, asOfPeriod, actor), initiativeAdopted);
  }

  /** Withdraw the proposal, with the reason that is the only compulsory free text on an initiative. */
  async withdraw(
    tenantId: TenantId,
    id: Uuid,
    actor: Uuid | null,
    reason: string,
  ): Promise<ImprovementInitiative> {
    await this.requireActor(tenantId, actor, "person withdrawing the initiative");
    return this.transition(tenantId, id, withdrawInitiative, initiativeWithdrawn, actor, reason);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One initiative, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<ImprovementInitiative> {
    return this.require(tenantId, id);
  }

  /** One initiative by key, or a 404 naming the normalized form that was actually searched for. */
  async getByKey(tenantId: TenantId, initiativeKey: string): Promise<ImprovementInitiative> {
    const wanted = normalizeKey(initiativeKey);
    const initiative = await this.repository.findByKey(tenantId, wanted);
    if (!initiative) {
      throw new ImprovementInitiativeNotFoundError(wanted);
    }
    return initiative;
  }

  /** The change pipeline — everything proposed and not yet settled. */
  async listOpen(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<readonly ImprovementInitiative[]> {
    return this.repository.listOpen(tenantId, organizationId);
  }

  /** Every change the institution has adopted. What an adoption review is opened against. */
  async listAdopted(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<readonly ImprovementInitiative[]> {
    return this.repository.listAdopted(tenantId, organizationId);
  }

  /** Every initiative in the tenant, settled ones included. */
  async list(tenantId: TenantId): Promise<readonly ImprovementInitiative[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The initiative under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<ImprovementInitiative> {
    const initiative = await this.repository.findById(tenantId, id);
    if (!initiative) {
      throw new ImprovementInitiativeNotFoundError(id);
    }
    return initiative;
  }

  /** The institution this initiative hangs off, checked through the directory port. */
  private async requireOrganization(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForEvolutionError(organizationId);
    }
  }

  /**
   * No other initiative already answers to this key.
   *
   * Tenant-wide, and settled initiatives count. *We already tried that* is only answerable if the key of the
   * change that was withdrawn two years ago still collides with the one being put again today.
   */
  private async requireKeyFree(tenantId: TenantId, initiativeKey: string): Promise<void> {
    if (await this.repository.findByKey(tenantId, initiativeKey)) {
      throw new DuplicateInitiativeKeyError(initiativeKey);
    }
  }

  /** Every named origin is a signal that exists in this tenant. */
  private async requireOrigins(tenantId: TenantId, signalIds: readonly Uuid[]): Promise<void> {
    for (const signalId of signalIds) {
      if (!(await this.signals.findById(tenantId, signalId))) {
        throw new ImprovementSignalNotFoundError(signalId);
      }
    }
  }

  /** An actor, when one is named. `null` records an automated step and decides nothing. */
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

  /**
   * What the gate in front of this transition currently says, or `null` if none was ever convened.
   *
   * The whole decision trail is loaded and {@link currentGate} picks from it, rather than asking the store for
   * an *open* gate: open means unsettled, and a satisfied gate is settled — reading the transition's evidence
   * that way would make an approved change permanently unapprovable, and the failure would look like an
   * ungoverned initiative rather than like a bug.
   *
   * The absence comes back as `null` rather than being raised here, so the refusal the caller receives is the
   * aggregate's own — one error for *no gate*, one for *a pending gate*, one for *a refused gate* — rather than
   * a directory-shaped 404 that says nothing about what to do next.
   */
  private async gateOutcome(
    tenantId: TenantId,
    initiativeId: Uuid,
    gate: GovernanceGate,
  ): Promise<GateOutcome | null> {
    const trail = await this.decisions.listByInitiative(tenantId, initiativeId);
    const decision = currentGate(trail, gate);
    return decision ? decision.outcome : null;
  }

  /** Store an already-transitioned initiative and announce it. */
  private async record(
    next: ImprovementInitiative,
    announce: (initiative: ImprovementInitiative) => DomainEvent,
  ): Promise<ImprovementInitiative> {
    await this.repository.save(next);
    await this.emit(announce(next));
    return next;
  }

  /** Load, run a guarded pure transition, store, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (initiative: ImprovementInitiative, ...args: TArgs) => ImprovementInitiative,
    announce: (initiative: ImprovementInitiative) => DomainEvent,
    ...args: TArgs
  ): Promise<ImprovementInitiative> {
    return this.record(move(await this.require(tenantId, id), ...args), announce);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
