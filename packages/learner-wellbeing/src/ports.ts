import type { TenantId, Uuid } from "@knowget/types";
import type { BehaviourRecord } from "./behaviour-record";
import type { HealthRecord } from "./health-record";
import type { WellbeingProfile } from "./wellbeing-profile";

/**
 * Read model over the student-lifecycle domain (P2-D03): the organization a student
 * belongs to, or null if the student does not exist in the tenant. Every wellbeing
 * record is about a Student and **derives its organization from the student**, so this
 * one call both validates existence and supplies the organization — the pure package
 * never depends on `@knowget/student-lifecycle`.
 */
export interface StudentDirectory {
  organizationOf(tenantId: TenantId, studentId: Uuid): Promise<Uuid | null>;
}

/**
 * Read model over the person domain (P2-D01-M02): does this person exist in the tenant?
 * Counsellors, reporters and responsible staff are Persons; the platform links to them
 * and never depends on `@knowget/person` directly.
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/** Storage contract for wellbeing profiles (one per student). Tenant-scoped. */
export interface WellbeingProfileRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<WellbeingProfile | null>;
  findByStudent(tenantId: TenantId, studentId: Uuid): Promise<WellbeingProfile | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<WellbeingProfile[]>;
  listByTenant(tenantId: TenantId): Promise<WellbeingProfile[]>;
  save(profile: WellbeingProfile): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link WellbeingProfileRepository} — the default for tests and bootstrap. */
export class InMemoryWellbeingProfileRepository implements WellbeingProfileRepository {
  private readonly byId = new Map<string, WellbeingProfile>();

  async findById(tenantId: TenantId, id: Uuid): Promise<WellbeingProfile | null> {
    const profile = this.byId.get(id);
    return profile && profile.tenantId === tenantId ? profile : null;
  }

  async findByStudent(tenantId: TenantId, studentId: Uuid): Promise<WellbeingProfile | null> {
    return (
      [...this.byId.values()].find((p) => p.tenantId === tenantId && p.studentId === studentId) ??
      null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<WellbeingProfile[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<WellbeingProfile[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(profile: WellbeingProfile): Promise<void> {
    this.byId.set(profile.id, profile);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const profile = this.byId.get(id);
    if (profile && profile.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for health records (one per student). Tenant-scoped. */
export interface HealthRecordRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<HealthRecord | null>;
  findByStudent(tenantId: TenantId, studentId: Uuid): Promise<HealthRecord | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<HealthRecord[]>;
  listByTenant(tenantId: TenantId): Promise<HealthRecord[]>;
  save(record: HealthRecord): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link HealthRecordRepository} — the default for tests and bootstrap. */
export class InMemoryHealthRecordRepository implements HealthRecordRepository {
  private readonly byId = new Map<string, HealthRecord>();

  async findById(tenantId: TenantId, id: Uuid): Promise<HealthRecord | null> {
    const record = this.byId.get(id);
    return record && record.tenantId === tenantId ? record : null;
  }

  async findByStudent(tenantId: TenantId, studentId: Uuid): Promise<HealthRecord | null> {
    return (
      [...this.byId.values()].find((r) => r.tenantId === tenantId && r.studentId === studentId) ??
      null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<HealthRecord[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<HealthRecord[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(record: HealthRecord): Promise<void> {
    this.byId.set(record.id, record);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const record = this.byId.get(id);
    if (record && record.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for behaviour records (one per student). Tenant-scoped. */
export interface BehaviourRecordRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<BehaviourRecord | null>;
  findByStudent(tenantId: TenantId, studentId: Uuid): Promise<BehaviourRecord | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<BehaviourRecord[]>;
  listByTenant(tenantId: TenantId): Promise<BehaviourRecord[]>;
  save(record: BehaviourRecord): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link BehaviourRecordRepository} — the default for tests and bootstrap. */
export class InMemoryBehaviourRecordRepository implements BehaviourRecordRepository {
  private readonly byId = new Map<string, BehaviourRecord>();

  async findById(tenantId: TenantId, id: Uuid): Promise<BehaviourRecord | null> {
    const record = this.byId.get(id);
    return record && record.tenantId === tenantId ? record : null;
  }

  async findByStudent(tenantId: TenantId, studentId: Uuid): Promise<BehaviourRecord | null> {
    return (
      [...this.byId.values()].find((r) => r.tenantId === tenantId && r.studentId === studentId) ??
      null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<BehaviourRecord[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<BehaviourRecord[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(record: BehaviourRecord): Promise<void> {
    this.byId.set(record.id, record);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const record = this.byId.get(id);
    if (record && record.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
