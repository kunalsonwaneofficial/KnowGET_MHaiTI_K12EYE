import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { EmergencyAuthorizations } from "./emergency-authorization";
import {
  archiveEmergencyContact,
  type EmergencyContact,
  type RecordAttemptParams,
  recordContactAttempt,
  type RegisterEmergencyContactParams,
  registerEmergencyContact,
  setAuthorizations,
  setEmergencyAvailability,
  setPhone,
  setPriority,
  setRelationshipLabel,
} from "./emergency-contact";
import {
  DuplicateEmergencyPriorityError,
  EmergencyContactNotFoundError,
  OrganizationNotFoundForFamilyError,
  PersonNotFoundForFamilyError,
  StudentNotFoundForFamilyError,
} from "./errors";
import { emergencyContactUpdated } from "./family-guardian-events";
import type {
  EmergencyContactRepository,
  OrganizationDirectory,
  PersonDirectory,
  StudentDirectory,
} from "./ports";

export interface EmergencyContactServiceDeps {
  readonly repository: EmergencyContactRepository;
  readonly persons: PersonDirectory;
  readonly organizations: OrganizationDirectory;
  readonly students: StudentDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for a learner's prioritized emergency contacts. Registers a
 * contact against a validated organization, Person and student, enforcing a **unique
 * priority per student** (the emergency hierarchy). Manages authorized actions and an
 * append-only contact history, and lists a student's contacts in priority order.
 * Publishes `family.emergency_contact.updated` on registration and on priority or
 * authorization changes.
 */
export class EmergencyContactService {
  private readonly repository: EmergencyContactRepository;
  private readonly persons: PersonDirectory;
  private readonly organizations: OrganizationDirectory;
  private readonly students: StudentDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: EmergencyContactServiceDeps) {
    this.repository = deps.repository;
    this.persons = deps.persons;
    this.organizations = deps.organizations;
    this.students = deps.students;
    this.events = deps.events;
  }

  async register(input: RegisterEmergencyContactParams): Promise<EmergencyContact> {
    await this.assertOrganizationExists(input.tenantId, input.organizationId);
    await this.assertPersonExists(input.tenantId, input.personId);
    await this.assertStudentExists(input.tenantId, input.studentId);
    await this.assertPriorityFree(input.tenantId, input.studentId, input.priority);
    const contact = registerEmergencyContact(input);
    await this.repository.save(contact);
    await this.emit(emergencyContactUpdated(contact));
    return contact;
  }

  async setPriority(tenantId: TenantId, id: Uuid, priority: number): Promise<EmergencyContact> {
    const contact = await this.require(tenantId, id);
    await this.assertPriorityFree(tenantId, contact.studentId, priority, contact.id);
    const updated = setPriority(contact, priority);
    await this.repository.save(updated);
    await this.emit(emergencyContactUpdated(updated));
    return updated;
  }

  async setAuthorizations(
    tenantId: TenantId,
    id: Uuid,
    patch: Partial<EmergencyAuthorizations>,
  ): Promise<EmergencyContact> {
    const updated = setAuthorizations(await this.require(tenantId, id), patch);
    await this.repository.save(updated);
    await this.emit(emergencyContactUpdated(updated));
    return updated;
  }

  async setRelationshipLabel(
    tenantId: TenantId,
    id: Uuid,
    label: string,
  ): Promise<EmergencyContact> {
    return this.mutate(tenantId, id, (c) => setRelationshipLabel(c, label));
  }

  async setPhone(tenantId: TenantId, id: Uuid, phone: string | null): Promise<EmergencyContact> {
    return this.mutate(tenantId, id, (c) => setPhone(c, phone));
  }

  async setAvailability(
    tenantId: TenantId,
    id: Uuid,
    note: string | null,
  ): Promise<EmergencyContact> {
    return this.mutate(tenantId, id, (c) => setEmergencyAvailability(c, note));
  }

  async recordContactAttempt(
    tenantId: TenantId,
    id: Uuid,
    params: RecordAttemptParams,
  ): Promise<EmergencyContact> {
    return this.mutate(tenantId, id, (c) => recordContactAttempt(c, params));
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<EmergencyContact> {
    return this.mutate(tenantId, id, archiveEmergencyContact);
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<EmergencyContact> {
    return this.require(tenantId, id);
  }

  /** A student's emergency contacts, ordered by priority (1 first) — the hierarchy. */
  async listForStudent(tenantId: TenantId, studentId: Uuid): Promise<EmergencyContact[]> {
    const contacts = await this.repository.listByStudent(tenantId, studentId);
    return [...contacts].sort((a, b) => a.priority - b.priority);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<EmergencyContact[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async list(tenantId: TenantId): Promise<EmergencyContact[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (contact: EmergencyContact) => EmergencyContact,
  ): Promise<EmergencyContact> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async assertOrganizationExists(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForFamilyError(organizationId);
    }
  }

  private async assertPersonExists(tenantId: TenantId, personId: Uuid): Promise<void> {
    if (!(await this.persons.exists(tenantId, personId))) {
      throw new PersonNotFoundForFamilyError(personId);
    }
  }

  private async assertStudentExists(tenantId: TenantId, studentId: Uuid): Promise<void> {
    if (!(await this.students.exists(tenantId, studentId))) {
      throw new StudentNotFoundForFamilyError(studentId);
    }
  }

  private async assertPriorityFree(
    tenantId: TenantId,
    studentId: Uuid,
    priority: number,
    excludeId?: Uuid,
  ): Promise<void> {
    const contacts = await this.repository.listByStudent(tenantId, studentId);
    if (
      contacts.some((c) => c.id !== excludeId && c.status === "active" && c.priority === priority)
    ) {
      throw new DuplicateEmergencyPriorityError(studentId, priority);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<EmergencyContact> {
    const contact = await this.repository.findById(tenantId, id);
    if (!contact) {
      throw new EmergencyContactNotFoundError(id);
    }
    return contact;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
