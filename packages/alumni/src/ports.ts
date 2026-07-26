import type { TenantId, Uuid } from "@knowget/types";
import type { AlumniChapter } from "./alumni-chapter";
import type { AlumniProfile } from "./alumni-profile";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the tenant?
 * Every alumni record attaches to it; the domain links to it and never depends on `@knowget/organization`
 * directly.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the person domain (P2-D01-M02): does this person exist? An alumnus is a Person; the domain
 * links to them and never re-models them. The prospect/applicant/student/alumnus lifecycle record is Student
 * Lifecycle's (P2-D03), referenced by id.
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/**
 * Storage contract for alumni profiles — the network-membership anchor. Tenant-scoped (explicit argument +
 * RLS). `findByAlumnusPersonId` backs the one-profile-per-person rule.
 */
export interface AlumniProfileRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AlumniProfile | null>;
  findByAlumnusPersonId(tenantId: TenantId, alumnusPersonId: Uuid): Promise<AlumniProfile | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AlumniProfile[]>;
  listByTenant(tenantId: TenantId): Promise<AlumniProfile[]>;
  save(profile: AlumniProfile): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AlumniProfileRepository} — the default for tests and bootstrap. */
export class InMemoryAlumniProfileRepository implements AlumniProfileRepository {
  private readonly byId = new Map<string, AlumniProfile>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AlumniProfile | null> {
    const profile = this.byId.get(id);
    return profile && profile.tenantId === tenantId ? profile : null;
  }

  async findByAlumnusPersonId(
    tenantId: TenantId,
    alumnusPersonId: Uuid,
  ): Promise<AlumniProfile | null> {
    return (
      [...this.byId.values()].find(
        (p) => p.tenantId === tenantId && p.alumnusPersonId === alumnusPersonId,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AlumniProfile[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AlumniProfile[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(profile: AlumniProfile): Promise<void> {
    this.byId.set(profile.id, profile);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const profile = this.byId.get(id);
    if (profile && profile.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for alumni chapters. Tenant-scoped (explicit argument + RLS). */
export interface AlumniChapterRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AlumniChapter | null>;
  findByCode(tenantId: TenantId, code: string): Promise<AlumniChapter | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AlumniChapter[]>;
  listByTenant(tenantId: TenantId): Promise<AlumniChapter[]>;
  save(chapter: AlumniChapter): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AlumniChapterRepository} — the default for tests and bootstrap. */
export class InMemoryAlumniChapterRepository implements AlumniChapterRepository {
  private readonly byId = new Map<string, AlumniChapter>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AlumniChapter | null> {
    const chapter = this.byId.get(id);
    return chapter && chapter.tenantId === tenantId ? chapter : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<AlumniChapter | null> {
    return [...this.byId.values()].find((c) => c.tenantId === tenantId && c.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AlumniChapter[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AlumniChapter[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(chapter: AlumniChapter): Promise<void> {
    this.byId.set(chapter.id, chapter);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const chapter = this.byId.get(id);
    if (chapter && chapter.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
