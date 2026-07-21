import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateHealthRecordError,
  HealthRecordNotFoundError,
  StudentNotFoundForWellbeingError,
} from "./errors";
import {
  addChronicCondition,
  addImmunization,
  clearMedicalAlert,
  createHealthRecord,
  discontinueMedication,
  type HealthRecord,
  putAllergy,
  putMedication,
  raiseMedicalAlert,
  removeAllergy,
  setBloodGroup,
  setEmergencyPlan,
  setMedicalHistory,
} from "./health-record";
import { healthRecordCreated, medicalAlertUpdated } from "./learner-wellbeing-events";
import type {
  Allergy,
  ChronicCondition,
  Immunization,
  MedicalAlert,
  MedicalAlertSeverity,
  Medication,
} from "./medical";
import type { HealthRecordRepository, StudentDirectory } from "./ports";

export interface HealthRecordServiceDeps {
  readonly repository: HealthRecordRepository;
  readonly students: StudentDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateHealthRecordInput {
  readonly tenantId: TenantId;
  readonly studentId: Uuid;
  readonly medicalHistory?: string | null;
  readonly bloodGroup?: string | null;
}

/**
 * Application service for learner health records. Creates at most one record per learner,
 * deriving the organization from the Student (P2-D03), and manages allergies, chronic
 * conditions, immunizations, medications, the emergency plan and standing medical alerts.
 * Health data is sensitive: this service is gated behind a dedicated `health:*` permission
 * scope at the transport boundary. Publishes {@link healthRecordCreated} on creation and
 * {@link medicalAlertUpdated} whenever the standing-alert set changes.
 */
export class HealthRecordService {
  private readonly repository: HealthRecordRepository;
  private readonly students: StudentDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: HealthRecordServiceDeps) {
    this.repository = deps.repository;
    this.students = deps.students;
    this.events = deps.events;
  }

  async create(input: CreateHealthRecordInput): Promise<HealthRecord> {
    const organizationId = await this.resolveOrganization(input.tenantId, input.studentId);
    await this.assertNoRecord(input.tenantId, input.studentId);
    const record = createHealthRecord({
      tenantId: input.tenantId,
      organizationId,
      studentId: input.studentId,
      ...(input.medicalHistory !== undefined ? { medicalHistory: input.medicalHistory } : {}),
      ...(input.bloodGroup !== undefined ? { bloodGroup: input.bloodGroup } : {}),
    });
    await this.repository.save(record);
    await this.emit(healthRecordCreated(record));
    return record;
  }

  async setMedicalHistory(
    tenantId: TenantId,
    id: Uuid,
    history: string | null,
  ): Promise<HealthRecord> {
    return this.mutate(tenantId, id, (r) => setMedicalHistory(r, history));
  }

  async setBloodGroup(
    tenantId: TenantId,
    id: Uuid,
    bloodGroup: string | null,
  ): Promise<HealthRecord> {
    return this.mutate(tenantId, id, (r) => setBloodGroup(r, bloodGroup));
  }

  async setEmergencyPlan(tenantId: TenantId, id: Uuid, plan: string | null): Promise<HealthRecord> {
    return this.mutate(tenantId, id, (r) => setEmergencyPlan(r, plan));
  }

  async putAllergy(tenantId: TenantId, id: Uuid, allergy: Allergy): Promise<HealthRecord> {
    return this.mutate(tenantId, id, (r) => putAllergy(r, allergy));
  }

  async removeAllergy(tenantId: TenantId, id: Uuid, substance: string): Promise<HealthRecord> {
    return this.mutate(tenantId, id, (r) => removeAllergy(r, substance));
  }

  async addChronicCondition(
    tenantId: TenantId,
    id: Uuid,
    condition: ChronicCondition,
  ): Promise<HealthRecord> {
    return this.mutate(tenantId, id, (r) => addChronicCondition(r, condition));
  }

  async addImmunization(
    tenantId: TenantId,
    id: Uuid,
    immunization: Immunization,
  ): Promise<HealthRecord> {
    return this.mutate(tenantId, id, (r) => addImmunization(r, immunization));
  }

  async putMedication(tenantId: TenantId, id: Uuid, medication: Medication): Promise<HealthRecord> {
    return this.mutate(tenantId, id, (r) => putMedication(r, medication));
  }

  async discontinueMedication(tenantId: TenantId, id: Uuid, name: string): Promise<HealthRecord> {
    return this.mutate(tenantId, id, (r) => discontinueMedication(r, name));
  }

  async raiseMedicalAlert(
    tenantId: TenantId,
    id: Uuid,
    label: string,
    severity: MedicalAlertSeverity,
  ): Promise<{ record: HealthRecord; alert: MedicalAlert }> {
    const { record, alert } = raiseMedicalAlert(await this.require(tenantId, id), label, severity);
    await this.repository.save(record);
    await this.emit(medicalAlertUpdated(record));
    return { record, alert };
  }

  async clearMedicalAlert(tenantId: TenantId, id: Uuid, alertId: Uuid): Promise<HealthRecord> {
    const record = clearMedicalAlert(await this.require(tenantId, id), alertId);
    await this.repository.save(record);
    await this.emit(medicalAlertUpdated(record));
    return record;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<HealthRecord> {
    return this.require(tenantId, id);
  }

  async getByStudent(tenantId: TenantId, studentId: Uuid): Promise<HealthRecord | null> {
    return this.repository.findByStudent(tenantId, studentId);
  }

  async list(tenantId: TenantId): Promise<HealthRecord[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<HealthRecord[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (record: HealthRecord) => HealthRecord,
  ): Promise<HealthRecord> {
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
      throw new DuplicateHealthRecordError(studentId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<HealthRecord> {
    const record = await this.repository.findById(tenantId, id);
    if (!record) {
      throw new HealthRecordNotFoundError(id);
    }
    return record;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
