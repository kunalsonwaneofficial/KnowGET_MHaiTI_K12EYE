import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  abandonGrowthPlan,
  achieveGrowthPlan,
  activateGrowthPlan,
  createGrowthPlan,
  type CreateGrowthPlanParams,
  type GrowthGoalInput,
  type GrowthPlan,
  linkRecommendation,
  recordGoalOutcome,
  setGrowthGoals,
} from "./growth-plan";
import { growthPlanAchieved, growthPlanActivated } from "./learning-intelligence-events";
import {
  GrowthPlanNotFoundError,
  OrganizationNotFoundForInsightError,
  StudentNotFoundForInsightError,
} from "./errors";
import type { GrowthPlanRepository, OrganizationDirectory, StudentDirectory } from "./ports";

export interface GrowthPlanServiceDeps {
  readonly repository: GrowthPlanRepository;
  readonly organizations: OrganizationDirectory;
  readonly students: StudentDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export type CreateGrowthPlanInput = Omit<CreateGrowthPlanParams, "tenantId"> & {
  readonly tenantId: TenantId;
};

/**
 * Application service for growth plans. Creates a plan for a validated Student in a validated
 * Organization, and drives draft → active → achieved | abandoned while recording goal outcomes and
 * tracking derived progress — the loop that turns accepted recommendations into measurable growth.
 * Publishes {@link growthPlanActivated} and {@link growthPlanAchieved}.
 */
export class GrowthPlanService {
  private readonly repository: GrowthPlanRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly students: StudentDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: GrowthPlanServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.students = deps.students;
    this.events = deps.events;
  }

  async create(input: CreateGrowthPlanInput): Promise<GrowthPlan> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForInsightError(input.organizationId);
    }
    if (!(await this.students.exists(input.tenantId, input.studentId))) {
      throw new StudentNotFoundForInsightError(input.studentId);
    }
    const plan = createGrowthPlan(input);
    await this.repository.save(plan);
    return plan;
  }

  async setGoals(
    tenantId: TenantId,
    id: Uuid,
    goals: readonly GrowthGoalInput[],
  ): Promise<GrowthPlan> {
    return this.mutate(tenantId, id, (p) => setGrowthGoals(p, goals));
  }

  async linkRecommendation(
    tenantId: TenantId,
    id: Uuid,
    recommendationId: Uuid,
  ): Promise<GrowthPlan> {
    return this.mutate(tenantId, id, (p) => linkRecommendation(p, recommendationId));
  }

  async activate(tenantId: TenantId, id: Uuid, actor: Uuid | null = null): Promise<GrowthPlan> {
    const activated = await this.mutate(tenantId, id, (p) => activateGrowthPlan(p, actor));
    await this.emit(growthPlanActivated(activated));
    return activated;
  }

  async recordGoalOutcome(
    tenantId: TenantId,
    id: Uuid,
    goalId: Uuid,
    outcome: "met" | "missed",
    note: string | null = null,
  ): Promise<GrowthPlan> {
    return this.mutate(tenantId, id, (p) => recordGoalOutcome(p, goalId, outcome, note));
  }

  async achieve(tenantId: TenantId, id: Uuid, actor: Uuid | null = null): Promise<GrowthPlan> {
    const achieved = await this.mutate(tenantId, id, (p) => achieveGrowthPlan(p, actor));
    await this.emit(growthPlanAchieved(achieved));
    return achieved;
  }

  async abandon(
    tenantId: TenantId,
    id: Uuid,
    actor: Uuid | null = null,
    note: string | null = null,
  ): Promise<GrowthPlan> {
    return this.mutate(tenantId, id, (p) => abandonGrowthPlan(p, actor, note));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<GrowthPlan> {
    return this.require(tenantId, id);
  }

  async listForStudent(tenantId: TenantId, studentId: Uuid): Promise<GrowthPlan[]> {
    return this.repository.listByStudent(tenantId, studentId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<GrowthPlan[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (plan: GrowthPlan) => GrowthPlan,
  ): Promise<GrowthPlan> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<GrowthPlan> {
    const plan = await this.repository.findById(tenantId, id);
    if (!plan) {
      throw new GrowthPlanNotFoundError(id);
    }
    return plan;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
