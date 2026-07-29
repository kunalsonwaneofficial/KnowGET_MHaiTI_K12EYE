import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateCycleKeyError,
  ImprovementCycleNotFoundError,
  OrganizationNotFoundForEvolutionError,
  PersonNotFoundForEvolutionError,
} from "./errors";
import {
  cycleAbandoned,
  cycleClosed,
  cycleExecutionStarted,
  cycleOpened,
  cycleRescheduled,
  cycleRestated,
  cycleReviewStarted,
} from "./evolution-events";
import { type GateOutcome, normalizeKey } from "./evolution-value";
import { currentGate } from "./governance-decision";
import {
  type ImprovementCycle,
  type OpenCycleParams,
  abandonCycle,
  closeCycle,
  openCycle,
  rescheduleCycle,
  reviseCycleIntent,
  startCycleExecution,
  startCycleReview,
} from "./improvement-cycle";
import type {
  GovernanceDecisionRepository,
  ImprovementCycleRepository,
  LessonRepository,
  OrganizationDirectory,
  PersonDirectory,
} from "./ports";

/**
 * Application service for improvement cycles — the rounds an institution runs, and how each of them ended.
 *
 * Two things the aggregate takes as arguments are fetched here rather than accepted from the caller, and both
 * are the point of the contract rather than plumbing.
 *
 * **The lesson count is counted.** {@link closeCycle} takes `lessonsRecorded` as a number and refuses a round
 * that concluded nothing, and the number it is given comes from {@link LessonRepository.listByOrigin} against
 * this cycle's own key — not from a parameter, and not from a running total the cycle kept. A caller cannot
 * close an empty round by claiming three lessons, because there is nowhere to make the claim. What gets counted
 * is what a reader would find later by following the same origin reference, which is the only count that stays
 * true.
 *
 * **The closure gate is read.** A cycle reaching `closed` needs a `cycle_closure` gate that convened and said
 * yes, and this service loads the decision trail addressed to the cycle's own id and hands the aggregate
 * whatever it finds — `null` included, which the aggregate refuses by its own error. That is *evolution always
 * requires human governance* applied to the institution's own improvement machinery: the round that decides
 * whether the institution is improving cannot sign its own closure.
 *
 * **Abandonment takes no gate, deliberately.** A round that did not get where it meant to is admitted, not
 * negotiated. Requiring a quorum to say so would guarantee the honest ending is the expensive one and the whole
 * programme silently accumulates cycles stuck in `executing`, which is the failure this contract exists to make
 * visible. What abandonment costs instead is the reason, and the reason is compulsory.
 *
 * The key is checked free tenant-wide at opening, including against settled cycles: a cycle key is what its
 * lessons cite as their origin, so reusing one would silently merge two rounds' conclusions into a single trail
 * that reads as one very productive year.
 */
export interface ImprovementCycleServiceDeps {
  readonly repository: ImprovementCycleRepository;
  readonly decisions: GovernanceDecisionRepository;
  readonly lessons: LessonRepository;
  readonly organizations: OrganizationDirectory;
  readonly people: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class ImprovementCycleService {
  private readonly repository: ImprovementCycleRepository;
  private readonly decisions: GovernanceDecisionRepository;
  private readonly lessons: LessonRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly people: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ImprovementCycleServiceDeps) {
    this.repository = deps.repository;
    this.decisions = deps.decisions;
    this.lessons = deps.lessons;
    this.organizations = deps.organizations;
    this.people = deps.people;
    this.events = deps.events;
  }

  // --- Planning --------------------------------------------------------------------

  /** Open a round, over a span of the institution's own periods, under a key nothing else holds. */
  async open(params: OpenCycleParams): Promise<ImprovementCycle> {
    const cycle = openCycle(params);
    await this.requireOrganization(params.tenantId, params.organizationId);
    await this.requireKeyFree(params.tenantId, cycle.cycleKey);
    await this.requirePerson(params.tenantId, params.openedBy, "person opening the cycle");
    await this.repository.save(cycle);
    await this.emit(cycleOpened(cycle));
    return cycle;
  }

  /** Rewrite what the round is for. Permitted while it is still being planned or run, never after. */
  async restate(tenantId: TenantId, id: Uuid, intent: string): Promise<ImprovementCycle> {
    return this.transition(tenantId, id, reviseCycleIntent, cycleRestated, intent);
  }

  /** Move the span, while the round has not yet started. Afterwards it is fixed by the aggregate. */
  async reschedule(
    tenantId: TenantId,
    id: Uuid,
    startPeriod: number,
    endPeriod: number,
  ): Promise<ImprovementCycle> {
    return this.transition(tenantId, id, rescheduleCycle, cycleRescheduled, startPeriod, endPeriod);
  }

  // --- Lifecycle -------------------------------------------------------------------

  /** Start the work. */
  async startExecution(tenantId: TenantId, id: Uuid): Promise<ImprovementCycle> {
    return this.transition(tenantId, id, startCycleExecution, cycleExecutionStarted);
  }

  /** Start looking back at what the round achieved. */
  async startReview(tenantId: TenantId, id: Uuid): Promise<ImprovementCycle> {
    return this.transition(tenantId, id, startCycleReview, cycleReviewStarted);
  }

  /**
   * Close the round, on a counted set of lessons and a closure gate this service goes and reads.
   *
   * Neither the count nor the outcome is a parameter. The lessons are counted against the cycle's own key
   * through the origin index, and the gate is read off the decision trail addressed to the cycle's own id; a
   * round that concluded nothing and a round nobody agreed was finished both fail here, each with the
   * aggregate's own error naming which of the two it was.
   */
  async close(tenantId: TenantId, id: Uuid, actor: Uuid | null): Promise<ImprovementCycle> {
    const cycle = await this.require(tenantId, id);
    await this.requireActor(tenantId, actor, "person closing the cycle");
    const lessons = await this.lessonsRecorded(tenantId, cycle);
    const outcome = await this.closureOutcome(tenantId, cycle.id);
    return this.record(closeCycle(cycle, outcome, lessons, actor), cycleClosed);
  }

  /** Abandon the round, with the reason that is the only compulsory free text on a cycle. */
  async abandon(
    tenantId: TenantId,
    id: Uuid,
    actor: Uuid | null,
    reason: string,
  ): Promise<ImprovementCycle> {
    await this.requireActor(tenantId, actor, "person abandoning the cycle");
    return this.transition(tenantId, id, abandonCycle, cycleAbandoned, actor, reason);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One cycle, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<ImprovementCycle> {
    return this.require(tenantId, id);
  }

  /** One cycle by key, or a 404 naming the normalized form that was actually searched for. */
  async getByKey(tenantId: TenantId, cycleKey: string): Promise<ImprovementCycle> {
    const wanted = normalizeKey(cycleKey);
    const cycle = await this.repository.findByKey(tenantId, wanted);
    if (!cycle) {
      throw new ImprovementCycleNotFoundError(wanted);
    }
    return cycle;
  }

  /** The rounds still going somewhere, in span order — the read that stops one sitting for a year. */
  async listOpen(tenantId: TenantId, organizationId: Uuid): Promise<readonly ImprovementCycle[]> {
    return this.repository.listOpen(tenantId, organizationId);
  }

  /** Every cycle in the tenant, abandoned rounds included. */
  async list(tenantId: TenantId): Promise<readonly ImprovementCycle[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The cycle under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<ImprovementCycle> {
    const cycle = await this.repository.findById(tenantId, id);
    if (!cycle) {
      throw new ImprovementCycleNotFoundError(id);
    }
    return cycle;
  }

  /** The institution this round belongs to, checked through the directory port. */
  private async requireOrganization(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForEvolutionError(organizationId);
    }
  }

  /**
   * No other cycle already answers to this key.
   *
   * Tenant-wide, and settled cycles count. A cycle key is the origin reference its retrospective lessons carry,
   * so a second round wearing a finished round's key would file its conclusions into the first one's trail.
   */
  private async requireKeyFree(tenantId: TenantId, cycleKey: string): Promise<void> {
    if (await this.repository.findByKey(tenantId, cycleKey)) {
      throw new DuplicateCycleKeyError(cycleKey);
    }
  }

  /** An actor, when one is named. `null` records an ending nobody put their name to. */
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
   * How many lessons this round actually filed, counted at the moment of closure.
   *
   * Lessons drawn from a retrospective cite origin `cycle_retrospective` and carry the cycle's key as their
   * origin reference, so the count is a read of the lesson store rather than a number the cycle has been
   * keeping. That matters after the fact: the figure stamped on a closed cycle is one anybody can reproduce
   * from the lesson rows, and a total the aggregate had incremented would be a second answer to the same
   * question — the one that would end up in the report on the day the two disagreed.
   */
  private async lessonsRecorded(tenantId: TenantId, cycle: ImprovementCycle): Promise<number> {
    const filed = await this.lessons.listByOrigin(tenantId, "cycle_retrospective", cycle.cycleKey);
    return filed.length;
  }

  /**
   * What the closure gate on this round currently says, or `null` if none was ever convened.
   *
   * The gate is addressed by the cycle's own id, and the whole trail is loaded so that {@link currentGate} can
   * pick the settled decision rather than only an open one — reading it as *open* would make an agreed closure
   * permanently unreachable, and the failure would look like an ungoverned programme rather than like a bug.
   */
  private async closureOutcome(tenantId: TenantId, cycleId: Uuid): Promise<GateOutcome | null> {
    const trail = await this.decisions.listByInitiative(tenantId, cycleId);
    const decision = currentGate(trail, "cycle_closure");
    return decision ? decision.outcome : null;
  }

  /** Store an already-transitioned cycle and announce it. */
  private async record(
    next: ImprovementCycle,
    announce: (cycle: ImprovementCycle) => DomainEvent,
  ): Promise<ImprovementCycle> {
    await this.repository.save(next);
    await this.emit(announce(next));
    return next;
  }

  /** Load, run a guarded pure transition, store, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (cycle: ImprovementCycle, ...args: TArgs) => ImprovementCycle,
    announce: (cycle: ImprovementCycle) => DomainEvent,
    ...args: TArgs
  ): Promise<ImprovementCycle> {
    return this.record(move(await this.require(tenantId, id), ...args), announce);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
