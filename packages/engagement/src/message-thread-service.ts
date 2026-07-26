import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  addThreadParticipant,
  archiveThread,
  closeThread,
  type CreateMessageThreadParams,
  createMessageThread,
  type MessageThread,
  reopenThread,
} from "./message-thread";
import {
  threadArchived,
  threadClosed,
  threadOpened,
  threadParticipantAdded,
  threadReopened,
} from "./engagement-events";
import {
  MessageThreadNotFoundError,
  OrganizationNotFoundForEngagementError,
  PersonNotFoundForEngagementError,
} from "./errors";
import type { MessageThreadRepository, OrganizationDirectory, PersonDirectory } from "./ports";

export interface MessageThreadServiceDeps {
  readonly repository: MessageThreadRepository;
  readonly organizations: OrganizationDirectory;
  readonly persons: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for message threads — the conversations. Opens a thread (validating the organization
 * and that every participant Person exists, with at least two distinct participants), adds a participant,
 * and drives `open ↔ closed → archived`, publishing the thread events. Messages are posted through the
 * message service against an open thread.
 */
export class MessageThreadService {
  private readonly repository: MessageThreadRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly persons: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: MessageThreadServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.persons = deps.persons;
    this.events = deps.events;
  }

  async open(input: CreateMessageThreadParams): Promise<MessageThread> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForEngagementError(input.organizationId);
    }
    for (const personId of new Set(input.participantPersonIds)) {
      await this.requirePerson(input.tenantId, personId);
    }
    const thread = createMessageThread(input);
    await this.repository.save(thread);
    await this.emit(threadOpened(thread));
    return thread;
  }

  async addParticipant(tenantId: TenantId, id: Uuid, personId: Uuid): Promise<MessageThread> {
    await this.requirePerson(tenantId, personId);
    const thread = await this.require(tenantId, id);
    const updated = addThreadParticipant(thread, personId);
    // Already a participant ⇒ the aggregate returns the same reference; skip the save and the spurious event.
    if (updated !== thread) {
      await this.repository.save(updated);
      await this.emit(threadParticipantAdded(updated));
    }
    return updated;
  }

  async close(tenantId: TenantId, id: Uuid): Promise<MessageThread> {
    const updated = closeThread(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(threadClosed(updated));
    return updated;
  }

  async reopen(tenantId: TenantId, id: Uuid): Promise<MessageThread> {
    const updated = reopenThread(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(threadReopened(updated));
    return updated;
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<MessageThread> {
    const updated = archiveThread(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(threadArchived(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<MessageThread> {
    return this.require(tenantId, id);
  }

  async listForParticipant(tenantId: TenantId, personId: Uuid): Promise<MessageThread[]> {
    return this.repository.listByParticipant(tenantId, personId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<MessageThread[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<MessageThread> {
    const thread = await this.repository.findById(tenantId, id);
    if (!thread) {
      throw new MessageThreadNotFoundError(id);
    }
    return thread;
  }

  private async requirePerson(tenantId: TenantId, personId: Uuid): Promise<void> {
    if (!(await this.persons.exists(tenantId, personId))) {
      throw new PersonNotFoundForEngagementError(personId);
    }
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
