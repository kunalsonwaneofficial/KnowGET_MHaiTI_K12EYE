import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { type Message, postMessage } from "./message";
import { isThreadOpen, isThreadParticipant } from "./message-thread";
import { messagePosted } from "./engagement-events";
import {
  MessageThreadNotFoundError,
  NonParticipantAuthorError,
  ThreadNotOpenError,
} from "./errors";
import type { MessageRepository, MessageThreadRepository } from "./ports";

export interface PostMessageInput {
  readonly tenantId: TenantId;
  readonly threadId: Uuid;
  readonly authorPersonId: Uuid;
  readonly body: string;
  readonly sentAt: string;
}

export interface MessageServiceDeps {
  readonly repository: MessageRepository;
  readonly threads: MessageThreadRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for messages — the append-only entries within a thread. Posts a message (validating the
 * thread exists and is open, and that the author is a participant of it), deriving the organization from the
 * thread, and publishes the message event. Messages are immutable, so there is no update or delete.
 */
export class MessageService {
  private readonly repository: MessageRepository;
  private readonly threads: MessageThreadRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: MessageServiceDeps) {
    this.repository = deps.repository;
    this.threads = deps.threads;
    this.events = deps.events;
  }

  async post(input: PostMessageInput): Promise<Message> {
    const thread = await this.threads.findById(input.tenantId, input.threadId);
    if (!thread) {
      throw new MessageThreadNotFoundError(input.threadId);
    }
    if (!isThreadOpen(thread)) {
      throw new ThreadNotOpenError(input.threadId);
    }
    if (!isThreadParticipant(thread, input.authorPersonId)) {
      throw new NonParticipantAuthorError(input.threadId, input.authorPersonId);
    }
    const message = postMessage({
      tenantId: input.tenantId,
      organizationId: thread.organizationId,
      threadId: input.threadId,
      authorPersonId: input.authorPersonId,
      body: input.body,
      sentAt: input.sentAt,
    });
    await this.repository.save(message);
    await this.emit(messagePosted(message));
    return message;
  }

  async listForThread(tenantId: TenantId, threadId: Uuid): Promise<Message[]> {
    return this.repository.listByThread(tenantId, threadId);
  }

  async countForThread(tenantId: TenantId, threadId: Uuid): Promise<number> {
    return this.repository.countByThread(tenantId, threadId);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
