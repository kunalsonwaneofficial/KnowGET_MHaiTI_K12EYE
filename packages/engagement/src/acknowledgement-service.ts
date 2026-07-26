import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { type AcknowledgementReceipt, recordAcknowledgement } from "./acknowledgement";
import { isAnnouncementPublished } from "./announcement";
import { acknowledgementRecorded } from "./engagement-events";
import {
  AnnouncementNotFoundError,
  AnnouncementNotPublishedError,
  DuplicateAcknowledgementError,
  PersonNotFoundForEngagementError,
} from "./errors";
import type { AcknowledgementRepository, AnnouncementRepository, PersonDirectory } from "./ports";

export interface RecordAcknowledgementInput {
  readonly tenantId: TenantId;
  readonly announcementId: Uuid;
  readonly personId: Uuid;
  readonly acknowledgedAt: string;
}

export interface AcknowledgementServiceDeps {
  readonly repository: AcknowledgementRepository;
  readonly announcements: AnnouncementRepository;
  readonly persons: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for acknowledgement receipts — the append-only read/confirm log behind an
 * announcement's reach. Records a receipt (validating the announcement is published, the person exists, and
 * that they have not already acknowledged it — receipts are one per (announcement, person)), deriving the
 * organization from the announcement, and publishes the acknowledgement event. Receipts are immutable, so
 * there is no update or delete.
 */
export class AcknowledgementService {
  private readonly repository: AcknowledgementRepository;
  private readonly announcements: AnnouncementRepository;
  private readonly persons: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AcknowledgementServiceDeps) {
    this.repository = deps.repository;
    this.announcements = deps.announcements;
    this.persons = deps.persons;
    this.events = deps.events;
  }

  async record(input: RecordAcknowledgementInput): Promise<AcknowledgementReceipt> {
    const announcement = await this.announcements.findById(input.tenantId, input.announcementId);
    if (!announcement) {
      throw new AnnouncementNotFoundError(input.announcementId);
    }
    if (!isAnnouncementPublished(announcement)) {
      throw new AnnouncementNotPublishedError(input.announcementId);
    }
    if (!(await this.persons.exists(input.tenantId, input.personId))) {
      throw new PersonNotFoundForEngagementError(input.personId);
    }
    if (
      await this.repository.findByAnnouncementAndPerson(
        input.tenantId,
        input.announcementId,
        input.personId,
      )
    ) {
      throw new DuplicateAcknowledgementError(input.announcementId, input.personId);
    }
    const receipt = recordAcknowledgement({
      tenantId: input.tenantId,
      organizationId: announcement.organizationId,
      announcementId: input.announcementId,
      personId: input.personId,
      acknowledgedAt: input.acknowledgedAt,
    });
    await this.repository.save(receipt);
    await this.emit(acknowledgementRecorded(receipt));
    return receipt;
  }

  async listForAnnouncement(
    tenantId: TenantId,
    announcementId: Uuid,
  ): Promise<AcknowledgementReceipt[]> {
    return this.repository.listByAnnouncement(tenantId, announcementId);
  }

  async countForAnnouncement(tenantId: TenantId, announcementId: Uuid): Promise<number> {
    return this.repository.countByAnnouncement(tenantId, announcementId);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
