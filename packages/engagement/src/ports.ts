import type { TenantId, Uuid } from "@knowget/types";
import type { Announcement } from "./announcement";
import type { Audience } from "./audience";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the tenant?
 * Every engagement record attaches to it; the domain links to it and never depends on `@knowget/organization`
 * directly.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the person domain (P2-D01-M02): does this person exist? An announcement author, a thread
 * participant and a survey respondent are Persons; the domain links to them and never re-models them. Audience
 * member ids are held opaquely and are not per-item validated (the organization is the validated anchor).
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/** Storage contract for audiences. Tenant-scoped (explicit argument + RLS). */
export interface AudienceRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Audience | null>;
  findByCode(tenantId: TenantId, code: string): Promise<Audience | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Audience[]>;
  listByTenant(tenantId: TenantId): Promise<Audience[]>;
  save(audience: Audience): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AudienceRepository} — the default for tests and bootstrap. */
export class InMemoryAudienceRepository implements AudienceRepository {
  private readonly byId = new Map<string, Audience>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Audience | null> {
    const audience = this.byId.get(id);
    return audience && audience.tenantId === tenantId ? audience : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<Audience | null> {
    return [...this.byId.values()].find((a) => a.tenantId === tenantId && a.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Audience[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Audience[]> {
    return [...this.byId.values()].filter((a) => a.tenantId === tenantId);
  }

  async save(audience: Audience): Promise<void> {
    this.byId.set(audience.id, audience);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const audience = this.byId.get(id);
    if (audience && audience.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for announcements. Tenant-scoped (explicit argument + RLS). `listPublishedByAudience`
 * returns an audience's published announcements — what the engagement engine rolls up for the profile.
 */
export interface AnnouncementRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Announcement | null>;
  listByAudience(tenantId: TenantId, audienceId: Uuid): Promise<Announcement[]>;
  listPublishedByAudience(tenantId: TenantId, audienceId: Uuid): Promise<Announcement[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Announcement[]>;
  listByTenant(tenantId: TenantId): Promise<Announcement[]>;
  save(announcement: Announcement): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AnnouncementRepository} — the default for tests and bootstrap. */
export class InMemoryAnnouncementRepository implements AnnouncementRepository {
  private readonly byId = new Map<string, Announcement>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Announcement | null> {
    const announcement = this.byId.get(id);
    return announcement && announcement.tenantId === tenantId ? announcement : null;
  }

  async listByAudience(tenantId: TenantId, audienceId: Uuid): Promise<Announcement[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.audienceId === audienceId,
    );
  }

  async listPublishedByAudience(tenantId: TenantId, audienceId: Uuid): Promise<Announcement[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.audienceId === audienceId && a.status === "published",
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Announcement[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Announcement[]> {
    return [...this.byId.values()].filter((a) => a.tenantId === tenantId);
  }

  async save(announcement: Announcement): Promise<void> {
    this.byId.set(announcement.id, announcement);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const announcement = this.byId.get(id);
    if (announcement && announcement.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
