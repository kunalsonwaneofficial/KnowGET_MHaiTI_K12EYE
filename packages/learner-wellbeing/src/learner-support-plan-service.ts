import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateSupportPlanError,
  StudentNotFoundForWellbeingError,
  SupportPlanNotFoundError,
} from "./errors";
import {
  activateSupportPlan,
  addSupportGoal,
  type AddSupportGoalInput,
  archiveSupportPlan,
  createLearnerSupportPlan,
  type LearnerSupportPlan,
  recordReview,
  removeSupportGoal,
  setAcademicAccommodations,
  setBehaviourInterventions,
  setInclusionStrategies,
  setMedicalAccommodations,
  setReviewSchedule,
  type SetReviewScheduleInput,
  updateSupportGoalStatus,
} from "./learner-support-plan";
import { supportPlanUpdated } from "./learner-wellbeing-events";
import type { LearnerSupportPlanRepository, StudentDirectory } from "./ports";
import type { SupportGoal, SupportGoalStatus } from "./support-plan";

export interface LearnerSupportPlanServiceDeps {
  readonly repository: LearnerSupportPlanRepository;
  readonly students: StudentDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateLearnerSupportPlanInput {
  readonly tenantId: TenantId;
  readonly studentId: Uuid;
}

/**
 * Application service for learner support plans. Creates at most one plan per learner,
 * deriving the organization from the Student (P2-D03), and manages accommodations,
 * inclusion strategies, personalized goals and the review schedule. Publishes
 * {@link supportPlanUpdated} on every change so Student Lifecycle and Academics stay in
 * step with a learner's accommodations.
 */
export class LearnerSupportPlanService {
  private readonly repository: LearnerSupportPlanRepository;
  private readonly students: StudentDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: LearnerSupportPlanServiceDeps) {
    this.repository = deps.repository;
    this.students = deps.students;
    this.events = deps.events;
  }

  async create(input: CreateLearnerSupportPlanInput): Promise<LearnerSupportPlan> {
    const organizationId = await this.resolveOrganization(input.tenantId, input.studentId);
    await this.assertNoPlan(input.tenantId, input.studentId);
    const plan = createLearnerSupportPlan({
      tenantId: input.tenantId,
      organizationId,
      studentId: input.studentId,
    });
    await this.repository.save(plan);
    await this.emit(supportPlanUpdated(plan));
    return plan;
  }

  async setAcademicAccommodations(
    tenantId: TenantId,
    id: Uuid,
    items: readonly string[],
  ): Promise<LearnerSupportPlan> {
    return this.mutate(tenantId, id, (p) => setAcademicAccommodations(p, items));
  }

  async setMedicalAccommodations(
    tenantId: TenantId,
    id: Uuid,
    items: readonly string[],
  ): Promise<LearnerSupportPlan> {
    return this.mutate(tenantId, id, (p) => setMedicalAccommodations(p, items));
  }

  async setBehaviourInterventions(
    tenantId: TenantId,
    id: Uuid,
    items: readonly string[],
  ): Promise<LearnerSupportPlan> {
    return this.mutate(tenantId, id, (p) => setBehaviourInterventions(p, items));
  }

  async setInclusionStrategies(
    tenantId: TenantId,
    id: Uuid,
    items: readonly string[],
  ): Promise<LearnerSupportPlan> {
    return this.mutate(tenantId, id, (p) => setInclusionStrategies(p, items));
  }

  async addGoal(
    tenantId: TenantId,
    id: Uuid,
    input: AddSupportGoalInput,
  ): Promise<{ plan: LearnerSupportPlan; goal: SupportGoal }> {
    const { plan, goal } = addSupportGoal(await this.require(tenantId, id), input);
    await this.repository.save(plan);
    await this.emit(supportPlanUpdated(plan));
    return { plan, goal };
  }

  async updateGoalStatus(
    tenantId: TenantId,
    id: Uuid,
    goalId: Uuid,
    status: SupportGoalStatus,
  ): Promise<LearnerSupportPlan> {
    return this.mutate(tenantId, id, (p) => updateSupportGoalStatus(p, goalId, status));
  }

  async removeGoal(tenantId: TenantId, id: Uuid, goalId: Uuid): Promise<LearnerSupportPlan> {
    return this.mutate(tenantId, id, (p) => removeSupportGoal(p, goalId));
  }

  async setReviewSchedule(
    tenantId: TenantId,
    id: Uuid,
    input: SetReviewScheduleInput,
  ): Promise<LearnerSupportPlan> {
    return this.mutate(tenantId, id, (p) => setReviewSchedule(p, input));
  }

  async recordReview(
    tenantId: TenantId,
    id: Uuid,
    reviewedOn?: string,
  ): Promise<LearnerSupportPlan> {
    return this.mutate(tenantId, id, (p) => recordReview(p, reviewedOn));
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<LearnerSupportPlan> {
    return this.mutate(tenantId, id, (p) => archiveSupportPlan(p));
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<LearnerSupportPlan> {
    return this.mutate(tenantId, id, (p) => activateSupportPlan(p));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<LearnerSupportPlan> {
    return this.require(tenantId, id);
  }

  async getByStudent(tenantId: TenantId, studentId: Uuid): Promise<LearnerSupportPlan | null> {
    return this.repository.findByStudent(tenantId, studentId);
  }

  async list(tenantId: TenantId): Promise<LearnerSupportPlan[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<LearnerSupportPlan[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (plan: LearnerSupportPlan) => LearnerSupportPlan,
  ): Promise<LearnerSupportPlan> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(supportPlanUpdated(updated));
    return updated;
  }

  private async resolveOrganization(tenantId: TenantId, studentId: Uuid): Promise<Uuid> {
    const organizationId = await this.students.organizationOf(tenantId, studentId);
    if (!organizationId) {
      throw new StudentNotFoundForWellbeingError(studentId);
    }
    return organizationId;
  }

  private async assertNoPlan(tenantId: TenantId, studentId: Uuid): Promise<void> {
    if (await this.repository.findByStudent(tenantId, studentId)) {
      throw new DuplicateSupportPlanError(studentId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<LearnerSupportPlan> {
    const plan = await this.repository.findById(tenantId, id);
    if (!plan) {
      throw new SupportPlanNotFoundError(id);
    }
    return plan;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
