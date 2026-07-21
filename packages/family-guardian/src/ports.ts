import type { TenantId, Uuid } from "@knowget/types";
import type { Family } from "./family";
import type { Guardian } from "./guardian";
import type { StudentGuardianRelationship } from "./student-guardian-relationship";

/**
 * Read model over the person domain (P2-D01-M02): does this person exist in the
 * tenant? Guardians and household members are always a Person; the platform links
 * identity and never depends on `@knowget/person` directly.
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node
 * (campus / institution) exist in the tenant? Families register against it.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the student-lifecycle domain (P2-D03): does this student exist in
 * the tenant? Student–guardian relationships link to a learner without duplicating
 * or depending on `@knowget/student-lifecycle` directly.
 */
export interface StudentDirectory {
  exists(tenantId: TenantId, studentId: Uuid): Promise<boolean>;
}

/** Storage contract for families. Tenant-scoped (explicit argument + RLS). */
export interface FamilyRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Family | null>;
  findByFamilyNumber(tenantId: TenantId, familyNumber: string): Promise<Family | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Family[]>;
  listByTenant(tenantId: TenantId): Promise<Family[]>;
  save(family: Family): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link FamilyRepository} — the default for tests and bootstrap. */
export class InMemoryFamilyRepository implements FamilyRepository {
  private readonly byId = new Map<string, Family>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Family | null> {
    const family = this.byId.get(id);
    return family && family.tenantId === tenantId ? family : null;
  }

  async findByFamilyNumber(tenantId: TenantId, familyNumber: string): Promise<Family | null> {
    return (
      [...this.byId.values()].find(
        (f) => f.tenantId === tenantId && f.familyNumber === familyNumber,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Family[]> {
    return [...this.byId.values()].filter(
      (f) => f.tenantId === tenantId && f.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Family[]> {
    return [...this.byId.values()].filter((f) => f.tenantId === tenantId);
  }

  async save(family: Family): Promise<void> {
    this.byId.set(family.id, family);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const family = this.byId.get(id);
    if (family && family.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for guardians. Tenant-scoped (explicit argument + RLS). */
export interface GuardianRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Guardian | null>;
  findByPersonAndOrganization(
    tenantId: TenantId,
    personId: Uuid,
    organizationId: Uuid,
  ): Promise<Guardian | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Guardian[]>;
  listByPerson(tenantId: TenantId, personId: Uuid): Promise<Guardian[]>;
  listByTenant(tenantId: TenantId): Promise<Guardian[]>;
  save(guardian: Guardian): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link GuardianRepository} — the default for tests and bootstrap. */
export class InMemoryGuardianRepository implements GuardianRepository {
  private readonly byId = new Map<string, Guardian>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Guardian | null> {
    const guardian = this.byId.get(id);
    return guardian && guardian.tenantId === tenantId ? guardian : null;
  }

  async findByPersonAndOrganization(
    tenantId: TenantId,
    personId: Uuid,
    organizationId: Uuid,
  ): Promise<Guardian | null> {
    return (
      [...this.byId.values()].find(
        (g) =>
          g.tenantId === tenantId && g.personId === personId && g.organizationId === organizationId,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Guardian[]> {
    return [...this.byId.values()].filter(
      (g) => g.tenantId === tenantId && g.organizationId === organizationId,
    );
  }

  async listByPerson(tenantId: TenantId, personId: Uuid): Promise<Guardian[]> {
    return [...this.byId.values()].filter(
      (g) => g.tenantId === tenantId && g.personId === personId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Guardian[]> {
    return [...this.byId.values()].filter((g) => g.tenantId === tenantId);
  }

  async save(guardian: Guardian): Promise<void> {
    this.byId.set(guardian.id, guardian);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const guardian = this.byId.get(id);
    if (guardian && guardian.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for student–guardian relationships. Tenant-scoped. */
export interface StudentGuardianRelationshipRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<StudentGuardianRelationship | null>;
  findActive(
    tenantId: TenantId,
    studentId: Uuid,
    guardianId: Uuid,
  ): Promise<StudentGuardianRelationship | null>;
  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<StudentGuardianRelationship[]>;
  listByGuardian(tenantId: TenantId, guardianId: Uuid): Promise<StudentGuardianRelationship[]>;
  listByTenant(tenantId: TenantId): Promise<StudentGuardianRelationship[]>;
  save(relationship: StudentGuardianRelationship): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link StudentGuardianRelationshipRepository} — the default for tests. */
export class InMemoryStudentGuardianRelationshipRepository implements StudentGuardianRelationshipRepository {
  private readonly byId = new Map<string, StudentGuardianRelationship>();

  async findById(tenantId: TenantId, id: Uuid): Promise<StudentGuardianRelationship | null> {
    const relationship = this.byId.get(id);
    return relationship && relationship.tenantId === tenantId ? relationship : null;
  }

  async findActive(
    tenantId: TenantId,
    studentId: Uuid,
    guardianId: Uuid,
  ): Promise<StudentGuardianRelationship | null> {
    return (
      [...this.byId.values()].find(
        (r) =>
          r.tenantId === tenantId &&
          r.studentId === studentId &&
          r.guardianId === guardianId &&
          r.status === "active",
      ) ?? null
    );
  }

  async listByStudent(tenantId: TenantId, studentId: Uuid): Promise<StudentGuardianRelationship[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.studentId === studentId,
    );
  }

  async listByGuardian(
    tenantId: TenantId,
    guardianId: Uuid,
  ): Promise<StudentGuardianRelationship[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.guardianId === guardianId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<StudentGuardianRelationship[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(relationship: StudentGuardianRelationship): Promise<void> {
    this.byId.set(relationship.id, relationship);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const relationship = this.byId.get(id);
    if (relationship && relationship.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
