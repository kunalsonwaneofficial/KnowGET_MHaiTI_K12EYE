import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  CustodyValidationError,
  DuplicateRelationshipError,
  GuardianArchivedError,
  GuardianNotFoundError,
  RelationshipNotFoundError,
  StudentNotFoundForFamilyError,
} from "./errors";
import {
  guardianAssigned,
  guardianRemoved,
  pickupAuthorizationChanged,
} from "./family-guardian-events";
import { type Guardian, hasLegalAuthority } from "./guardian";
import type {
  GuardianRepository,
  StudentDirectory,
  StudentGuardianRelationshipRepository,
} from "./ports";
import type { StudentGuardianRelationshipType } from "./relationship-type";
import type { ResponsibilityProfile } from "./responsibility";
import {
  endRelationship,
  linkGuardianToStudent,
  setEmergencyPriority,
  setMedicalAuthorization,
  setPickupAuthorization,
  setRelationshipType,
  type StudentGuardianRelationship,
  updateResponsibilities,
} from "./student-guardian-relationship";

export interface StudentGuardianRelationshipServiceDeps {
  readonly repository: StudentGuardianRelationshipRepository;
  readonly guardians: GuardianRepository;
  readonly students: StudentDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface LinkGuardianInput {
  readonly tenantId: TenantId;
  readonly studentId: Uuid;
  readonly guardianId: Uuid;
  readonly relationshipType: StudentGuardianRelationshipType;
  readonly responsibilities?: Partial<ResponsibilityProfile>;
  readonly emergencyPriority?: number | null;
  readonly effectiveFrom?: string | null;
}

/**
 * Application service for student–guardian relationships. Links a validated learner to
 * a validated, non-archived guardian (deriving the relationship's organization from the
 * guardian), enforcing **custody validation** — legal responsibility requires the
 * guardian to hold legal authority — and rejecting a duplicate active link. A student
 * may have many guardians and a guardian many students. Publishes
 * `family.guardian.assigned`, `family.guardian.removed` and
 * `family.pickup_authorization.changed`.
 */
export class StudentGuardianRelationshipService {
  private readonly repository: StudentGuardianRelationshipRepository;
  private readonly guardians: GuardianRepository;
  private readonly students: StudentDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: StudentGuardianRelationshipServiceDeps) {
    this.repository = deps.repository;
    this.guardians = deps.guardians;
    this.students = deps.students;
    this.events = deps.events;
  }

  async link(input: LinkGuardianInput): Promise<StudentGuardianRelationship> {
    const guardian = await this.requireGuardian(input.tenantId, input.guardianId);
    if (guardian.status === "archived") {
      throw new GuardianArchivedError(guardian.id);
    }
    await this.assertStudentExists(input.tenantId, input.studentId);
    if (input.responsibilities?.legal === true && !hasLegalAuthority(guardian)) {
      throw new CustodyValidationError(guardian.id);
    }
    await this.assertNoActiveLink(input.tenantId, input.studentId, input.guardianId);
    const relationship = linkGuardianToStudent({
      ...input,
      organizationId: guardian.organizationId,
    });
    await this.repository.save(relationship);
    await this.emit(guardianAssigned(relationship));
    return relationship;
  }

  async setRelationshipType(
    tenantId: TenantId,
    id: Uuid,
    relationshipType: StudentGuardianRelationshipType,
  ): Promise<StudentGuardianRelationship> {
    return this.mutate(tenantId, id, (r) => setRelationshipType(r, relationshipType));
  }

  async updateResponsibilities(
    tenantId: TenantId,
    id: Uuid,
    patch: Partial<ResponsibilityProfile>,
  ): Promise<StudentGuardianRelationship> {
    const relationship = await this.require(tenantId, id);
    if (patch.legal === true) {
      const guardian = await this.requireGuardian(tenantId, relationship.guardianId);
      if (!hasLegalAuthority(guardian)) {
        throw new CustodyValidationError(guardian.id);
      }
    }
    const updated = updateResponsibilities(relationship, patch);
    await this.repository.save(updated);
    return updated;
  }

  async setPickupAuthorization(
    tenantId: TenantId,
    id: Uuid,
    authorized: boolean,
  ): Promise<StudentGuardianRelationship> {
    const updated = setPickupAuthorization(await this.require(tenantId, id), authorized);
    await this.repository.save(updated);
    await this.emit(pickupAuthorizationChanged(updated));
    return updated;
  }

  async setMedicalAuthorization(
    tenantId: TenantId,
    id: Uuid,
    authorized: boolean,
  ): Promise<StudentGuardianRelationship> {
    return this.mutate(tenantId, id, (r) => setMedicalAuthorization(r, authorized));
  }

  async setEmergencyPriority(
    tenantId: TenantId,
    id: Uuid,
    priority: number | null,
  ): Promise<StudentGuardianRelationship> {
    return this.mutate(tenantId, id, (r) => setEmergencyPriority(r, priority));
  }

  async end(
    tenantId: TenantId,
    id: Uuid,
    effectiveTo?: string | null,
  ): Promise<StudentGuardianRelationship> {
    const updated = endRelationship(await this.require(tenantId, id), effectiveTo);
    await this.repository.save(updated);
    await this.emit(guardianRemoved(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<StudentGuardianRelationship> {
    return this.require(tenantId, id);
  }

  async listForStudent(
    tenantId: TenantId,
    studentId: Uuid,
  ): Promise<StudentGuardianRelationship[]> {
    return this.repository.listByStudent(tenantId, studentId);
  }

  async listForGuardian(
    tenantId: TenantId,
    guardianId: Uuid,
  ): Promise<StudentGuardianRelationship[]> {
    return this.repository.listByGuardian(tenantId, guardianId);
  }

  async list(tenantId: TenantId): Promise<StudentGuardianRelationship[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (relationship: StudentGuardianRelationship) => StudentGuardianRelationship,
  ): Promise<StudentGuardianRelationship> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async requireGuardian(tenantId: TenantId, guardianId: Uuid): Promise<Guardian> {
    const guardian = await this.guardians.findById(tenantId, guardianId);
    if (!guardian) {
      throw new GuardianNotFoundError(guardianId);
    }
    return guardian;
  }

  private async assertStudentExists(tenantId: TenantId, studentId: Uuid): Promise<void> {
    if (!(await this.students.exists(tenantId, studentId))) {
      throw new StudentNotFoundForFamilyError(studentId);
    }
  }

  private async assertNoActiveLink(
    tenantId: TenantId,
    studentId: Uuid,
    guardianId: Uuid,
  ): Promise<void> {
    if (await this.repository.findActive(tenantId, studentId, guardianId)) {
      throw new DuplicateRelationshipError(studentId, guardianId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<StudentGuardianRelationship> {
    const relationship = await this.repository.findById(tenantId, id);
    if (!relationship) {
      throw new RelationshipNotFoundError(id);
    }
    return relationship;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
