import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { substitutionAssigned } from "./academic-scheduling-events";
import {
  ResourceNotFoundError,
  ScheduleSlotNotFoundError,
  SubstitutionNotFoundError,
  TeacherNotFoundForSchedulingError,
} from "./errors";
import type {
  ResourceRepository,
  ScheduleSlotRepository,
  SubstitutionRepository,
  TeacherDirectory,
} from "./ports";
import {
  cancelSubstitution,
  completeSubstitution,
  createSubstitution,
  type Substitution,
  type SubstitutionType,
} from "./substitution";

export interface SubstitutionServiceDeps {
  readonly repository: SubstitutionRepository;
  readonly slots: ScheduleSlotRepository;
  readonly teachers: TeacherDirectory;
  readonly resources: ResourceRepository;
  readonly events?: Pick<EventBus, "publish">;
}

export interface AssignSubstitutionInput {
  readonly tenantId: TenantId;
  readonly scheduleSlotId: Uuid;
  readonly substitutionType: SubstitutionType;
  readonly originalId: Uuid;
  readonly replacementId: Uuid;
  readonly reason?: string | null;
  readonly date?: string | null;
}

/**
 * Application service for substitutions. Records a tracked, auditable override of a schedule
 * slot's teacher or venue: the slot must exist (its organization is derived from it), and
 * both the original and replacement are validated by kind — teachers through the teacher
 * directory, venues as live resources. Publishes {@link substitutionAssigned} on assignment.
 */
export class SubstitutionService {
  private readonly repository: SubstitutionRepository;
  private readonly slots: ScheduleSlotRepository;
  private readonly teachers: TeacherDirectory;
  private readonly resources: ResourceRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: SubstitutionServiceDeps) {
    this.repository = deps.repository;
    this.slots = deps.slots;
    this.teachers = deps.teachers;
    this.resources = deps.resources;
    this.events = deps.events;
  }

  async assign(input: AssignSubstitutionInput): Promise<Substitution> {
    const slot = await this.slots.findById(input.tenantId, input.scheduleSlotId);
    if (!slot) {
      throw new ScheduleSlotNotFoundError(input.scheduleSlotId);
    }
    await this.assertParticipant(input.tenantId, input.substitutionType, input.originalId);
    await this.assertParticipant(input.tenantId, input.substitutionType, input.replacementId);
    const substitution = createSubstitution({ ...input, organizationId: slot.organizationId });
    await this.repository.save(substitution);
    await this.emit(substitutionAssigned(substitution));
    return substitution;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<Substitution> {
    const substitution = cancelSubstitution(await this.require(tenantId, id));
    await this.repository.save(substitution);
    return substitution;
  }

  async complete(tenantId: TenantId, id: Uuid): Promise<Substitution> {
    const substitution = completeSubstitution(await this.require(tenantId, id));
    await this.repository.save(substitution);
    return substitution;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Substitution> {
    return this.require(tenantId, id);
  }

  async listForSlot(tenantId: TenantId, scheduleSlotId: Uuid): Promise<Substitution[]> {
    return this.repository.listBySlot(tenantId, scheduleSlotId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Substitution[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async assertParticipant(
    tenantId: TenantId,
    type: SubstitutionType,
    id: Uuid,
  ): Promise<void> {
    if (type === "teacher") {
      if (!(await this.teachers.exists(tenantId, id))) {
        throw new TeacherNotFoundForSchedulingError(id);
      }
      return;
    }
    if (!(await this.resources.findById(tenantId, id))) {
      throw new ResourceNotFoundError(id);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Substitution> {
    const substitution = await this.repository.findById(tenantId, id);
    if (!substitution) {
      throw new SubstitutionNotFoundError(id);
    }
    return substitution;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
