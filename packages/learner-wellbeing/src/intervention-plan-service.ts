import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateInterventionPlanError,
  InterventionPlanNotFoundError,
  PersonNotFoundForWellbeingError,
  StudentNotFoundForWellbeingError,
} from "./errors";
import type { Intervention, InterventionProgressNote } from "./intervention";
import {
  assignIntervention,
  type AssignInterventionInput,
  cancelIntervention,
  completeIntervention,
  createInterventionPlan,
  type InterventionPlan,
  recordInterventionProgress,
  type RecordProgressInput,
  setEarlyWarningTriggers,
  startIntervention,
} from "./intervention-plan";
import { interventionAssigned, interventionCompleted } from "./learner-wellbeing-events";
import type { InterventionPlanRepository, PersonDirectory, StudentDirectory } from "./ports";

export interface InterventionPlanServiceDeps {
  readonly repository: InterventionPlanRepository;
  readonly students: StudentDirectory;
  readonly persons: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateInterventionPlanInput {
  readonly tenantId: TenantId;
  readonly studentId: Uuid;
}

/**
 * Application service for intervention plans. Creates at most one plan per learner,
 * deriving the organization from the Student (P2-D03), records the early-warning triggers
 * institutions define, and drives each intervention through assignment, progress
 * monitoring and outcome evaluation. Responsible staff are validated Persons. Publishes
 * {@link interventionAssigned} and {@link interventionCompleted}.
 */
export class InterventionPlanService {
  private readonly repository: InterventionPlanRepository;
  private readonly students: StudentDirectory;
  private readonly persons: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: InterventionPlanServiceDeps) {
    this.repository = deps.repository;
    this.students = deps.students;
    this.persons = deps.persons;
    this.events = deps.events;
  }

  async create(input: CreateInterventionPlanInput): Promise<InterventionPlan> {
    const organizationId = await this.resolveOrganization(input.tenantId, input.studentId);
    await this.assertNoPlan(input.tenantId, input.studentId);
    const plan = createInterventionPlan({
      tenantId: input.tenantId,
      organizationId,
      studentId: input.studentId,
    });
    await this.repository.save(plan);
    return plan;
  }

  async setEarlyWarningTriggers(
    tenantId: TenantId,
    id: Uuid,
    triggers: readonly string[],
  ): Promise<InterventionPlan> {
    return this.mutate(tenantId, id, (p) => setEarlyWarningTriggers(p, triggers));
  }

  async assignIntervention(
    tenantId: TenantId,
    id: Uuid,
    input: AssignInterventionInput,
  ): Promise<{ plan: InterventionPlan; intervention: Intervention }> {
    await this.assertPersonExists(tenantId, input.responsibleStaff);
    const { plan, intervention } = assignIntervention(await this.require(tenantId, id), input);
    await this.repository.save(plan);
    await this.emit(interventionAssigned(plan, intervention));
    return { plan, intervention };
  }

  async startIntervention(
    tenantId: TenantId,
    id: Uuid,
    interventionId: Uuid,
  ): Promise<InterventionPlan> {
    return this.mutate(tenantId, id, (p) => startIntervention(p, interventionId));
  }

  async recordProgress(
    tenantId: TenantId,
    id: Uuid,
    interventionId: Uuid,
    input: RecordProgressInput,
  ): Promise<{ plan: InterventionPlan; note: InterventionProgressNote }> {
    await this.assertPersonExists(tenantId, input.recordedBy);
    const { plan, note } = recordInterventionProgress(
      await this.require(tenantId, id),
      interventionId,
      input,
    );
    await this.repository.save(plan);
    return { plan, note };
  }

  async completeIntervention(
    tenantId: TenantId,
    id: Uuid,
    interventionId: Uuid,
    outcome: string,
  ): Promise<{ plan: InterventionPlan; intervention: Intervention }> {
    const { plan, intervention } = completeIntervention(
      await this.require(tenantId, id),
      interventionId,
      outcome,
    );
    await this.repository.save(plan);
    await this.emit(interventionCompleted(plan, intervention));
    return { plan, intervention };
  }

  async cancelIntervention(
    tenantId: TenantId,
    id: Uuid,
    interventionId: Uuid,
  ): Promise<InterventionPlan> {
    return this.mutate(tenantId, id, (p) => cancelIntervention(p, interventionId));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<InterventionPlan> {
    return this.require(tenantId, id);
  }

  async getByStudent(tenantId: TenantId, studentId: Uuid): Promise<InterventionPlan | null> {
    return this.repository.findByStudent(tenantId, studentId);
  }

  async list(tenantId: TenantId): Promise<InterventionPlan[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<InterventionPlan[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (plan: InterventionPlan) => InterventionPlan,
  ): Promise<InterventionPlan> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
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
      throw new DuplicateInterventionPlanError(studentId);
    }
  }

  private async assertPersonExists(tenantId: TenantId, personId: Uuid): Promise<void> {
    if (!(await this.persons.exists(tenantId, personId))) {
      throw new PersonNotFoundForWellbeingError(personId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<InterventionPlan> {
    const plan = await this.repository.findById(tenantId, id);
    if (!plan) {
      throw new InterventionPlanNotFoundError(id);
    }
    return plan;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
