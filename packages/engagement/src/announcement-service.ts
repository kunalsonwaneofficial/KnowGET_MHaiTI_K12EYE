import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type Announcement,
  archiveAnnouncement,
  cancelAnnouncement,
  type CreateAnnouncementParams,
  createAnnouncement,
  editAnnouncementContent,
  pinAnnouncement,
  publishAnnouncement,
  scheduleAnnouncement,
  setAnnouncementCategory,
  setAnnouncementPriority,
  unpinAnnouncement,
} from "./announcement";
import { isAudienceActive } from "./audience";
import type { AnnouncementCategory, AnnouncementPriority } from "./engagement-value";
import {
  announcementArchived,
  announcementCancelled,
  announcementCategorySet,
  announcementContentEdited,
  announcementDrafted,
  announcementPinned,
  announcementPrioritySet,
  announcementPublished,
  announcementScheduled,
  announcementUnpinned,
} from "./engagement-events";
import {
  AnnouncementNotFoundError,
  AudienceNotActiveError,
  AudienceNotFoundError,
  OrganizationNotFoundForEngagementError,
  PersonNotFoundForEngagementError,
} from "./errors";
import type {
  AnnouncementRepository,
  AudienceRepository,
  OrganizationDirectory,
  PersonDirectory,
} from "./ports";

/** The draft input — the organization is derived from the target audience, not supplied. */
export type DraftAnnouncementInput = Omit<CreateAnnouncementParams, "organizationId">;

export interface AnnouncementServiceDeps {
  readonly repository: AnnouncementRepository;
  readonly audiences: AudienceRepository;
  readonly organizations: OrganizationDirectory;
  readonly persons: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for announcements. Drafts an announcement (validating an active target audience, an
 * existing author Person, and deriving the organization from the audience), edits its content/category/
 * priority before publication, schedules and publishes it, pins and unpins it while published, and archives or
 * cancels it, publishing the announcement events. Channel delivery on publication is the platform
 * notifications service's (P1-M05) — not performed here.
 */
export class AnnouncementService {
  private readonly repository: AnnouncementRepository;
  private readonly audiences: AudienceRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly persons: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AnnouncementServiceDeps) {
    this.repository = deps.repository;
    this.audiences = deps.audiences;
    this.organizations = deps.organizations;
    this.persons = deps.persons;
    this.events = deps.events;
  }

  async draft(input: DraftAnnouncementInput): Promise<Announcement> {
    const audience = await this.audiences.findById(input.tenantId, input.audienceId);
    if (!audience) {
      throw new AudienceNotFoundError(input.audienceId);
    }
    if (!isAudienceActive(audience)) {
      throw new AudienceNotActiveError(input.audienceId);
    }
    if (!(await this.organizations.exists(input.tenantId, audience.organizationId))) {
      throw new OrganizationNotFoundForEngagementError(audience.organizationId);
    }
    if (!(await this.persons.exists(input.tenantId, input.authorPersonId))) {
      throw new PersonNotFoundForEngagementError(input.authorPersonId);
    }
    const announcement = createAnnouncement({
      ...input,
      organizationId: audience.organizationId,
    });
    await this.repository.save(announcement);
    await this.emit(announcementDrafted(announcement));
    return announcement;
  }

  async editContent(
    tenantId: TenantId,
    id: Uuid,
    title: string,
    body: string,
  ): Promise<Announcement> {
    const updated = editAnnouncementContent(await this.require(tenantId, id), title, body);
    await this.repository.save(updated);
    await this.emit(announcementContentEdited(updated));
    return updated;
  }

  async setCategory(
    tenantId: TenantId,
    id: Uuid,
    category: AnnouncementCategory,
  ): Promise<Announcement> {
    const updated = setAnnouncementCategory(await this.require(tenantId, id), category);
    await this.repository.save(updated);
    await this.emit(announcementCategorySet(updated));
    return updated;
  }

  async setPriority(
    tenantId: TenantId,
    id: Uuid,
    priority: AnnouncementPriority,
  ): Promise<Announcement> {
    const updated = setAnnouncementPriority(await this.require(tenantId, id), priority);
    await this.repository.save(updated);
    await this.emit(announcementPrioritySet(updated));
    return updated;
  }

  async schedule(tenantId: TenantId, id: Uuid, scheduledFor: string): Promise<Announcement> {
    const updated = scheduleAnnouncement(await this.require(tenantId, id), scheduledFor);
    await this.repository.save(updated);
    await this.emit(announcementScheduled(updated));
    return updated;
  }

  async publish(tenantId: TenantId, id: Uuid, publishedAt: string): Promise<Announcement> {
    const updated = publishAnnouncement(await this.require(tenantId, id), publishedAt);
    await this.repository.save(updated);
    await this.emit(announcementPublished(updated));
    return updated;
  }

  async pin(tenantId: TenantId, id: Uuid): Promise<Announcement> {
    const updated = pinAnnouncement(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(announcementPinned(updated));
    return updated;
  }

  async unpin(tenantId: TenantId, id: Uuid): Promise<Announcement> {
    const updated = unpinAnnouncement(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(announcementUnpinned(updated));
    return updated;
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<Announcement> {
    const updated = archiveAnnouncement(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(announcementArchived(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<Announcement> {
    const updated = cancelAnnouncement(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(announcementCancelled(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Announcement> {
    return this.require(tenantId, id);
  }

  async listForAudience(tenantId: TenantId, audienceId: Uuid): Promise<Announcement[]> {
    return this.repository.listByAudience(tenantId, audienceId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Announcement[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Announcement> {
    const announcement = await this.repository.findById(tenantId, id);
    if (!announcement) {
      throw new AnnouncementNotFoundError(id);
    }
    return announcement;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
