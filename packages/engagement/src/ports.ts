import type { TenantId, Uuid } from "@knowget/types";
import type { AcknowledgementReceipt } from "./acknowledgement";
import type { Announcement } from "./announcement";
import type { Audience } from "./audience";
import type { MessageThread } from "./message-thread";

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

/**
 * Storage contract for acknowledgement receipts — an append-only log. Tenant-scoped (explicit argument +
 * RLS). There is no `remove`: receipts are immutable facts. `findByAnnouncementAndPerson` backs the
 * one-per-(announcement, person) guard; `countByAnnouncement` is the announcement's acknowledged count.
 */
export interface AcknowledgementRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AcknowledgementReceipt | null>;
  findByAnnouncementAndPerson(
    tenantId: TenantId,
    announcementId: Uuid,
    personId: Uuid,
  ): Promise<AcknowledgementReceipt | null>;
  listByAnnouncement(tenantId: TenantId, announcementId: Uuid): Promise<AcknowledgementReceipt[]>;
  countByAnnouncement(tenantId: TenantId, announcementId: Uuid): Promise<number>;
  listByTenant(tenantId: TenantId): Promise<AcknowledgementReceipt[]>;
  save(receipt: AcknowledgementReceipt): Promise<void>;
}

/** In-memory {@link AcknowledgementRepository} — the default for tests and bootstrap. */
export class InMemoryAcknowledgementRepository implements AcknowledgementRepository {
  private readonly byId = new Map<string, AcknowledgementReceipt>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AcknowledgementReceipt | null> {
    const receipt = this.byId.get(id);
    return receipt && receipt.tenantId === tenantId ? receipt : null;
  }

  async findByAnnouncementAndPerson(
    tenantId: TenantId,
    announcementId: Uuid,
    personId: Uuid,
  ): Promise<AcknowledgementReceipt | null> {
    return (
      [...this.byId.values()].find(
        (r) =>
          r.tenantId === tenantId && r.announcementId === announcementId && r.personId === personId,
      ) ?? null
    );
  }

  async listByAnnouncement(
    tenantId: TenantId,
    announcementId: Uuid,
  ): Promise<AcknowledgementReceipt[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.announcementId === announcementId,
    );
  }

  async countByAnnouncement(tenantId: TenantId, announcementId: Uuid): Promise<number> {
    return (await this.listByAnnouncement(tenantId, announcementId)).length;
  }

  async listByTenant(tenantId: TenantId): Promise<AcknowledgementReceipt[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(receipt: AcknowledgementReceipt): Promise<void> {
    this.byId.set(receipt.id, receipt);
  }
}

/**
 * Storage contract for message threads. Tenant-scoped (explicit argument + RLS). `listByParticipant` returns
 * the threads a person takes part in.
 */
export interface MessageThreadRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<MessageThread | null>;
  listByParticipant(tenantId: TenantId, personId: Uuid): Promise<MessageThread[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<MessageThread[]>;
  listByTenant(tenantId: TenantId): Promise<MessageThread[]>;
  save(thread: MessageThread): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link MessageThreadRepository} — the default for tests and bootstrap. */
export class InMemoryMessageThreadRepository implements MessageThreadRepository {
  private readonly byId = new Map<string, MessageThread>();

  async findById(tenantId: TenantId, id: Uuid): Promise<MessageThread | null> {
    const thread = this.byId.get(id);
    return thread && thread.tenantId === tenantId ? thread : null;
  }

  async listByParticipant(tenantId: TenantId, personId: Uuid): Promise<MessageThread[]> {
    return [...this.byId.values()].filter(
      (t) => t.tenantId === tenantId && t.participantPersonIds.includes(personId),
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<MessageThread[]> {
    return [...this.byId.values()].filter(
      (t) => t.tenantId === tenantId && t.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<MessageThread[]> {
    return [...this.byId.values()].filter((t) => t.tenantId === tenantId);
  }

  async save(thread: MessageThread): Promise<void> {
    this.byId.set(thread.id, thread);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const thread = this.byId.get(id);
    if (thread && thread.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
