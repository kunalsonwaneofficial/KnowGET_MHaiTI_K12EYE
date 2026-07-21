import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type {
  BehaviourGoal,
  BehaviourGoalStatus,
  BehaviourIncident,
  BehaviourIncidentStatus,
  BehaviourObservation,
  RestorativeAction,
} from "./behaviour";
import {
  addRestorativeAction,
  type BehaviourRecord,
  clearImprovementPlan,
  completeRestorativeAction,
  createBehaviourRecord,
  recordObservation,
  type RecordObservationInput,
  removeBehaviourGoal,
  removeObservation,
  reportIncident,
  type ReportIncidentInput,
  setBehaviourGoal,
  setImprovementPlan,
  type SetImprovementPlanInput,
  updateBehaviourGoalStatus,
  updateIncidentStatus,
} from "./behaviour-record";
import {
  BehaviourRecordNotFoundError,
  DuplicateBehaviourRecordError,
  PersonNotFoundForWellbeingError,
  StudentNotFoundForWellbeingError,
} from "./errors";
import {
  behaviourIncidentReported,
  behaviourObservationRecorded,
} from "./learner-wellbeing-events";
import type { BehaviourRecordRepository, PersonDirectory, StudentDirectory } from "./ports";

export interface BehaviourRecordServiceDeps {
  readonly repository: BehaviourRecordRepository;
  readonly students: StudentDirectory;
  readonly persons: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateBehaviourRecordInput {
  readonly tenantId: TenantId;
  readonly studentId: Uuid;
}

/**
 * Application service for behaviour records. Creates at most one record per learner,
 * deriving the organization from the Student (P2-D03), and manages the complete,
 * auditable behaviour history — observations, incidents, restorative actions, goals and
 * the improvement plan. The recording staff member is a validated Person. Publishes
 * {@link behaviourObservationRecorded} and {@link behaviourIncidentReported}; the model
 * emphasises development over punishment.
 */
export class BehaviourRecordService {
  private readonly repository: BehaviourRecordRepository;
  private readonly students: StudentDirectory;
  private readonly persons: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: BehaviourRecordServiceDeps) {
    this.repository = deps.repository;
    this.students = deps.students;
    this.persons = deps.persons;
    this.events = deps.events;
  }

  async create(input: CreateBehaviourRecordInput): Promise<BehaviourRecord> {
    const organizationId = await this.resolveOrganization(input.tenantId, input.studentId);
    await this.assertNoRecord(input.tenantId, input.studentId);
    const record = createBehaviourRecord({
      tenantId: input.tenantId,
      organizationId,
      studentId: input.studentId,
    });
    await this.repository.save(record);
    return record;
  }

  async recordObservation(
    tenantId: TenantId,
    id: Uuid,
    input: RecordObservationInput,
  ): Promise<{ record: BehaviourRecord; observation: BehaviourObservation }> {
    await this.assertPersonExists(tenantId, input.observedBy);
    const { record, observation } = recordObservation(await this.require(tenantId, id), input);
    await this.repository.save(record);
    await this.emit(behaviourObservationRecorded(record, observation));
    return { record, observation };
  }

  async removeObservation(
    tenantId: TenantId,
    id: Uuid,
    observationId: Uuid,
  ): Promise<BehaviourRecord> {
    return this.mutate(tenantId, id, (r) => removeObservation(r, observationId));
  }

  async reportIncident(
    tenantId: TenantId,
    id: Uuid,
    input: ReportIncidentInput,
  ): Promise<{ record: BehaviourRecord; incident: BehaviourIncident }> {
    await this.assertPersonExists(tenantId, input.reportedBy);
    const { record, incident } = reportIncident(await this.require(tenantId, id), input);
    await this.repository.save(record);
    await this.emit(behaviourIncidentReported(record, incident));
    return { record, incident };
  }

  async updateIncidentStatus(
    tenantId: TenantId,
    id: Uuid,
    incidentId: Uuid,
    status: BehaviourIncidentStatus,
  ): Promise<BehaviourRecord> {
    return this.mutate(tenantId, id, (r) => updateIncidentStatus(r, incidentId, status));
  }

  async addRestorativeAction(
    tenantId: TenantId,
    id: Uuid,
    incidentId: Uuid,
    description: string,
  ): Promise<{ record: BehaviourRecord; action: RestorativeAction }> {
    const { record, action } = addRestorativeAction(
      await this.require(tenantId, id),
      incidentId,
      description,
    );
    await this.repository.save(record);
    return { record, action };
  }

  async completeRestorativeAction(
    tenantId: TenantId,
    id: Uuid,
    incidentId: Uuid,
    actionId: Uuid,
  ): Promise<BehaviourRecord> {
    return this.mutate(tenantId, id, (r) => completeRestorativeAction(r, incidentId, actionId));
  }

  async setGoal(
    tenantId: TenantId,
    id: Uuid,
    description: string,
  ): Promise<{ record: BehaviourRecord; goal: BehaviourGoal }> {
    const { record, goal } = setBehaviourGoal(await this.require(tenantId, id), description);
    await this.repository.save(record);
    return { record, goal };
  }

  async updateGoalStatus(
    tenantId: TenantId,
    id: Uuid,
    goalId: Uuid,
    status: BehaviourGoalStatus,
  ): Promise<BehaviourRecord> {
    return this.mutate(tenantId, id, (r) => updateBehaviourGoalStatus(r, goalId, status));
  }

  async removeGoal(tenantId: TenantId, id: Uuid, goalId: Uuid): Promise<BehaviourRecord> {
    return this.mutate(tenantId, id, (r) => removeBehaviourGoal(r, goalId));
  }

  async setImprovementPlan(
    tenantId: TenantId,
    id: Uuid,
    input: SetImprovementPlanInput,
  ): Promise<BehaviourRecord> {
    return this.mutate(tenantId, id, (r) => setImprovementPlan(r, input));
  }

  async clearImprovementPlan(tenantId: TenantId, id: Uuid): Promise<BehaviourRecord> {
    return this.mutate(tenantId, id, (r) => clearImprovementPlan(r));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<BehaviourRecord> {
    return this.require(tenantId, id);
  }

  async getByStudent(tenantId: TenantId, studentId: Uuid): Promise<BehaviourRecord | null> {
    return this.repository.findByStudent(tenantId, studentId);
  }

  async list(tenantId: TenantId): Promise<BehaviourRecord[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<BehaviourRecord[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (record: BehaviourRecord) => BehaviourRecord,
  ): Promise<BehaviourRecord> {
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

  private async assertNoRecord(tenantId: TenantId, studentId: Uuid): Promise<void> {
    if (await this.repository.findByStudent(tenantId, studentId)) {
      throw new DuplicateBehaviourRecordError(studentId);
    }
  }

  private async assertPersonExists(tenantId: TenantId, personId: Uuid): Promise<void> {
    if (!(await this.persons.exists(tenantId, personId))) {
      throw new PersonNotFoundForWellbeingError(personId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<BehaviourRecord> {
    const record = await this.repository.findById(tenantId, id);
    if (!record) {
      throw new BehaviourRecordNotFoundError(id);
    }
    return record;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
