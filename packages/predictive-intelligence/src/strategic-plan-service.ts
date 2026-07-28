import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicatePlanKeyError,
  OrganizationNotFoundForForecastError,
  PersonNotFoundForForecastError,
  StrategicPlanNotFoundError,
} from "./errors";
import {
  planAbandoned,
  planActivated,
  planAmended,
  planCompleted,
  planDrafted,
  planObjectivesChanged,
  planProgressRecorded,
  planReviewed,
} from "./forecast-events";
import type { OrganizationDirectory, PersonDirectory, StrategicPlanRepository } from "./ports";
import {
  type ObjectiveAmendment,
  type ObjectiveInput,
  type PlanAmendment,
  type PlanReviewParams,
  type ProgressInput,
  type StrategicPlan,
  type StrategicPlanParams,
  abandonPlan,
  activatePlan,
  addObjectives,
  amendObjective,
  amendPlan,
  completePlan,
  draftStrategicPlan,
  latestReview,
  recordProgress,
  removeObjective,
  reviewPlan,
} from "./strategic-plan";

/**
 * Application service for strategic plans — what the institution intends, measured against what happened.
 *
 * The plan is the one aggregate in this package that is not about a number the platform computed. It is about a
 * commitment: a set of objectives, each with a baseline, a target and a date, owned by named people who
 * activated it and review it. That changes what this service has to guard. The other services check that a
 * reference resolves; this one also checks that a person the record holds accountable exists, on every
 * transition that names one, because a plan activated by nobody and reviewed by nobody is a document rather
 * than a commitment.
 *
 * A plan key is unique within an organization, checked on the normalized key the aggregate produced.
 *
 * Nothing here deletes a plan, and the repository offers no removal. A plan that was abandoned is the
 * institution's record that a course was set and changed, and deleting it turns a change of course into an
 * omission — which is exactly the history a plan exists to keep.
 *
 * Review is the one operation whose announcement carries more than the plan. A review freezes the variance it
 * saw at the period it saw it, and the event carries that frozen reading rather than the plan's current one, so
 * a subscriber reading the event a month later reads what the institution actually saw rather than what the
 * figures have since become.
 */
export interface StrategicPlanServiceDeps {
  readonly repository: StrategicPlanRepository;
  readonly organizations: OrganizationDirectory;
  readonly people: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class StrategicPlanService {
  private readonly repository: StrategicPlanRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly people: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: StrategicPlanServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.people = deps.people;
    this.events = deps.events;
  }

  // --- Authoring -------------------------------------------------------------------

  /**
   * Draft a plan. It starts editable, with no readings and no reviews.
   *
   * The organization and the key are both checked before anything is written, so a refusal from either leaves
   * the store exactly as it was.
   */
  async draft(input: StrategicPlanParams): Promise<StrategicPlan> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForForecastError(input.organizationId);
    }

    const plan = draftStrategicPlan(input);
    const clash = await this.repository.findByKey(plan.tenantId, plan.organizationId, plan.planKey);
    if (clash) {
      throw new DuplicatePlanKeyError(plan.planKey);
    }

    await this.repository.save(plan);
    await this.emit(planDrafted(plan));
    return plan;
  }

  /** Restate what a plan says about itself. The objectives have their own operations. */
  async amend(tenantId: TenantId, id: Uuid, amendment: PlanAmendment): Promise<StrategicPlan> {
    return this.transition(tenantId, id, amendPlan, planAmended, amendment);
  }

  // --- Objectives ------------------------------------------------------------------

  /** Add objectives to a draft. Announced as a change to the set the plan will be measured against. */
  async addObjectives(
    tenantId: TenantId,
    id: Uuid,
    objectives: readonly ObjectiveInput[],
  ): Promise<StrategicPlan> {
    return this.transition(tenantId, id, addObjectives, planObjectivesChanged, objectives);
  }

  /** Restate one objective of a draft. Its key is its identity and is not amendable. */
  async amendObjective(
    tenantId: TenantId,
    id: Uuid,
    objectiveKey: string,
    amendment: ObjectiveAmendment,
  ): Promise<StrategicPlan> {
    return this.transition(
      tenantId,
      id,
      amendObjective,
      planObjectivesChanged,
      objectiveKey,
      amendment,
    );
  }

  /** Take an objective out of a draft. */
  async removeObjective(
    tenantId: TenantId,
    id: Uuid,
    objectiveKey: string,
  ): Promise<StrategicPlan> {
    return this.transition(tenantId, id, removeObjective, planObjectivesChanged, objectiveKey);
  }

  // --- Lifecycle -------------------------------------------------------------------

  /**
   * Commit to the plan. The objective set freezes here, because what a plan is measured against cannot move
   * while it is being measured.
   */
  async activate(
    tenantId: TenantId,
    id: Uuid,
    activatedByUserId: Uuid | null,
  ): Promise<StrategicPlan> {
    await this.requirePerson(tenantId, activatedByUserId, "person activating the plan");
    return this.transition(tenantId, id, activatePlan, planActivated, activatedByUserId);
  }

  /** Close a plan that ran its course. */
  async complete(
    tenantId: TenantId,
    id: Uuid,
    completedByUserId: Uuid | null,
  ): Promise<StrategicPlan> {
    await this.requirePerson(tenantId, completedByUserId, "person completing the plan");
    return this.transition(tenantId, id, completePlan, planCompleted, completedByUserId);
  }

  /** Close a plan the institution is no longer pursuing, on the record, with the reason it gave. */
  async abandon(
    tenantId: TenantId,
    id: Uuid,
    abandonedByUserId: Uuid | null,
    reason: string | null,
  ): Promise<StrategicPlan> {
    await this.requirePerson(tenantId, abandonedByUserId, "person abandoning the plan");
    return this.transition(tenantId, id, abandonPlan, planAbandoned, abandonedByUserId, reason);
  }

  // --- Measurement -----------------------------------------------------------------

  /** Record what actually happened against the objectives, period by period. */
  async recordProgress(
    tenantId: TenantId,
    id: Uuid,
    readings: readonly ProgressInput[],
  ): Promise<StrategicPlan> {
    return this.transition(tenantId, id, recordProgress, planProgressRecorded, readings);
  }

  /**
   * Take a review at a period: compute the variance, freeze it, and announce what was seen.
   *
   * The event carries the frozen review rather than the plan alone, which is why this is written out instead of
   * going through {@link StrategicPlanService.transition}. The review is read back from the saved plan rather
   * than rebuilt, so the event and the record cannot disagree about what the variance was.
   */
  async review(tenantId: TenantId, id: Uuid, params: PlanReviewParams): Promise<StrategicPlan> {
    await this.requirePerson(tenantId, params.reviewedByUserId, "reviewer of the plan");

    const next = reviewPlan(await this.require(tenantId, id), params);
    await this.repository.save(next);

    // Always present: `reviewPlan` appends exactly one review, so a plan that just accepted one has a latest.
    const review = latestReview(next);
    if (review) {
      await this.emit(planReviewed(next, review));
    }
    return next;
  }

  // --- Reading ---------------------------------------------------------------------

  /** One plan, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<StrategicPlan> {
    return this.require(tenantId, id);
  }

  /** The plan an organization keeps under this key, if it keeps one. */
  async findByKey(
    tenantId: TenantId,
    organizationId: Uuid,
    planKey: string,
  ): Promise<StrategicPlan | null> {
    return this.repository.findByKey(tenantId, organizationId, planKey);
  }

  /** Every plan the institution is currently operating under. The review sweep. */
  async listActive(tenantId: TenantId): Promise<readonly StrategicPlan[]> {
    return this.repository.listActive(tenantId);
  }

  /**
   * Every plan holding an objective against one metric.
   *
   * What a correction to that metric's series puts in question: a plan reviewing itself on figures that have
   * since moved, and the only way to find those plans is to ask which of them named the metric.
   */
  async listByMetric(tenantId: TenantId, metricKey: string): Promise<readonly StrategicPlan[]> {
    return this.repository.listByMetric(tenantId, metricKey);
  }

  /** Every plan an organization has set, at any status. */
  async listByOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<readonly StrategicPlan[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  /** Every plan in the tenant. */
  async list(tenantId: TenantId): Promise<readonly StrategicPlan[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The plan under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<StrategicPlan> {
    const plan = await this.repository.findById(tenantId, id);
    if (!plan) {
      throw new StrategicPlanNotFoundError(id);
    }
    return plan;
  }

  /**
   * A person the plan is about to hold accountable, checked against the directory.
   *
   * A null id passes through untouched: the aggregate refuses it with a message about anonymity, which is a
   * better answer than one about a person who does not exist, because nobody was named.
   */
  private async requirePerson(
    tenantId: TenantId,
    personId: Uuid | null,
    role: string,
  ): Promise<void> {
    if (personId === null) {
      return;
    }
    if (!(await this.people.exists(tenantId, personId))) {
      throw new PersonNotFoundForForecastError(personId, role);
    }
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (plan: StrategicPlan, ...args: TArgs) => StrategicPlan,
    announce: (plan: StrategicPlan) => DomainEvent,
    ...args: TArgs
  ): Promise<StrategicPlan> {
    const next = move(await this.require(tenantId, id), ...args);
    await this.repository.save(next);
    await this.emit(announce(next));
    return next;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
