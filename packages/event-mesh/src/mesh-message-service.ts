import type { EventBus } from "@knowget/events";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateSequenceError,
  EventStreamNotFoundError,
  EventTypeNotAcceptedError,
  EventTypeNotPublishableError,
  MeshMessageImmutableError,
  MeshMessageNotFoundError,
  StreamNotPublishableError,
  UnknownEventTypeError,
} from "./errors";
import {
  type EventStream,
  isEventStreamPublishable,
  streamAcceptsEventType,
  streamPartitioning,
} from "./event-stream";
import { messagePayloadForgotten } from "./mesh-events";
import {
  type MeshMessage,
  forgetMeshMessagePayload,
  meshMessagePayload,
  recordMeshMessage,
} from "./mesh-message";
import { isEventTypePublishable, normalizeKey } from "./mesh-value";
import type { MeshEnvelope } from "./mesh-view";
import type {
  EventStreamRepository,
  EventTypeDefinitionRepository,
  MeshMessageRepository,
} from "./ports";
import { retentionCutoff } from "./retention";

/** One completed envelope, offered to the stream it names, with as much of its body as that stream keeps. */
export interface RecordMessageRequest {
  /** The envelope as {@link completeEnvelope} produced it: the tenant, the stream and both instants. */
  readonly envelope: MeshEnvelope;
  /** A digest of the body. Required by every stream that keeps one, discarded by the streams that do not. */
  readonly payloadDigest?: string;
  /** The body itself, kept only where the stream retains payloads in full and dropped everywhere else. */
  readonly payload?: unknown;
}

/**
 * Application service for mesh messages — the record of what was published, where it landed, and in what order.
 *
 * This is the highest-volume surface in the contract and the one with the least room to be wrong. Everything a
 * message can settle alone it settles in {@link recordMeshMessage}: the partition is derived from the key, the
 * sequence is checked for being a position, the body and its digest are kept only as far as the retention class
 * allows. What is left needs the rest of the tenant, and all of it serves one rule — a message must not be able
 * to disagree with the stream carrying it.
 *
 * **Nothing is taken from the caller that the stream can answer instead.** The institution, the partitioning
 * declaration and the retention class are read off the stream record rather than accepted beside the envelope.
 * A caller able to supply them is a caller able to file a message under another school, partition it for a
 * count the stream does not have, or claim a retention the stream never promised — and each of those stores
 * cleanly, reads back cleanly, and is wrong in a way no consumer on the other side can detect.
 *
 * **The stream has to be open, and it has to be a stream that carries this.** A draft or paused stream refuses
 * with {@link StreamNotPublishableError}, which is a 503 rather than a fault, because the publisher's event was
 * fine and the channel is coming back. A stream that does not list the event type refuses as well: the accepted
 * list is the contract its consumers subscribed against, and a message outside it arrives at readers that were
 * never told to expect it and have no shape to read it with.
 *
 * **The version has to be one the registry still carries.** A message pinned to a draft version names a shape
 * no consumer has been shown; one pinned to a retired version names a shape whose readers have been told to
 * stop maintaining. Both are refused here rather than stored, because the failure otherwise lands weeks later
 * on somebody who was not the publisher and has no way back to this moment.
 *
 * **One event becomes one message, once.** A relay retrying a call whose answer it never saw is the ordinary
 * cause, and the harm is not a duplicate row — it is a second sequence for one fact, which every consumer on
 * the stream reads as the thing having happened twice. The refusal names the message already holding the
 * event, so a retrying relay can tell its own retry apart from a genuine conflict.
 *
 * **Recording announces nothing.** It is the busiest operation in the package, and an event per message would
 * put a second event on the in-process bus for every event on the mesh. Forgetting a payload announces every
 * time, because an erasure nothing witnessed is an erasure the institution cannot show it performed.
 */
export interface MeshMessageServiceDeps {
  readonly repository: MeshMessageRepository;
  readonly streams: EventStreamRepository;
  readonly eventTypes: EventTypeDefinitionRepository;
  readonly events?: Pick<EventBus, "publish">;
}

export class MeshMessageService {
  private readonly repository: MeshMessageRepository;
  private readonly streams: EventStreamRepository;
  private readonly eventTypes: EventTypeDefinitionRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: MeshMessageServiceDeps) {
    this.repository = deps.repository;
    this.streams = deps.streams;
    this.eventTypes = deps.eventTypes;
    this.events = deps.events;
  }

  // --- Recording -------------------------------------------------------------------

  /**
   * Place one completed envelope on its stream.
   *
   * The order of the checks is the order of how much each costs to get wrong. The stream is resolved first
   * because everything else is read off it; the accepted list is checked in memory before the registry is
   * touched; the registry is asked only about the one version this message names; and the event is checked for
   * having been recorded already last, because it is the only check that is a lookup over the message table.
   */
  async record(request: RecordMessageRequest): Promise<MeshMessage> {
    const envelope = request.envelope;
    const tenantId = envelope.tenantId;
    const stream = await this.requireOpenStream(tenantId, envelope.streamKey);
    this.requireStreamCarries(stream, envelope.eventTypeKey);
    await this.requireVersionCarried(tenantId, envelope.eventTypeKey, envelope.eventTypeVersion);
    await this.requireEventUnrecorded(tenantId, envelope.eventId);

    const message = recordMeshMessage({
      organizationId: stream.organizationId,
      envelope,
      partitioning: streamPartitioning(stream),
      sequence: await this.repository.nextSequence(tenantId, stream.streamKey),
      retention: stream.retention,
      payloadDigest: request.payloadDigest,
      payload: request.payload,
    });
    await this.requireSequenceUnused(message);
    await this.repository.save(message);
    return message;
  }

  // --- Retention -------------------------------------------------------------------

  /** Drop one message's body and announce it, or leave an already-hollow message exactly as it is. */
  async forget(tenantId: TenantId, id: Uuid): Promise<MeshMessage> {
    return this.forgetOne(await this.require(tenantId, id));
  }

  /**
   * Forget every body on one stream that its retention window has passed over, as of a stated moment.
   *
   * The moment is an argument rather than a clock reading, so a sweep can be run for a window that closed
   * before anybody noticed it had, and so every test of this method asserts about a date it chose.
   *
   * A retired stream is swept like any other. Retirement stops publication and changes nothing about the
   * obligation to stop holding bodies, and a stream whose sweep quietly stopped the day it was retired is the
   * one that still holds a year of learner data when somebody comes to ask.
   */
  async sweepRetention(
    tenantId: TenantId,
    streamKey: string,
    asOf: ISODateString,
  ): Promise<readonly MeshMessage[]> {
    const stream = await this.requireStream(tenantId, streamKey);
    const cutoff = retentionCutoff(asOf, stream.retentionSeconds);
    const due = await this.repository.listRetaining(tenantId, stream.streamKey, cutoff);
    const forgotten: MeshMessage[] = [];
    for (const message of due) {
      forgotten.push(await this.forgetOne(message));
    }
    return forgotten;
  }

  // --- Reading ---------------------------------------------------------------------

  /** One message, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<MeshMessage> {
    return this.require(tenantId, id);
  }

  /** One message by the event it carries, which is how a producer asks whether its event got through. */
  async getByEventId(tenantId: TenantId, eventId: Uuid): Promise<MeshMessage> {
    const message = await this.repository.findByEventId(tenantId, eventId);
    if (!message) {
      throw new MeshMessageNotFoundError(eventId);
    }
    return message;
  }

  /** The retained body, or a refusal saying the stream never kept it or no longer holds it. */
  async payload(tenantId: TenantId, id: Uuid): Promise<unknown> {
    return meshMessagePayload(await this.require(tenantId, id));
  }

  /** The highest sequence one partition holds. What every checkpoint on it is measured against. */
  async head(tenantId: TenantId, streamKey: string, partition: number): Promise<number> {
    return this.repository.streamHead(tenantId, normalizeKey(streamKey), partition);
  }

  /**
   * How many messages one stream holds across a window.
   *
   * The number a replay's ceiling is enforced against, and it is the store's rather than an estimate for that
   * reason: a ceiling checked against a guess is not a ceiling, it is a hope about the size of the guess.
   */
  async countWindow(
    tenantId: TenantId,
    streamKey: string,
    fromInstant: ISODateString,
    toInstant: ISODateString,
  ): Promise<number> {
    return this.repository.countWindow(tenantId, normalizeKey(streamKey), fromInstant, toInstant);
  }

  /** The messages across that same window, in sequence order, which is the order a replay walks them in. */
  async listWindow(
    tenantId: TenantId,
    streamKey: string,
    fromInstant: ISODateString,
    toInstant: ISODateString,
  ): Promise<readonly MeshMessage[]> {
    return this.repository.listWindow(tenantId, normalizeKey(streamKey), fromInstant, toInstant);
  }

  // --- Internals -------------------------------------------------------------------

  /** The message under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<MeshMessage> {
    const message = await this.repository.findById(tenantId, id);
    if (!message) {
      throw new MeshMessageNotFoundError(id);
    }
    return message;
  }

  /** The stream under this key, normalised on the way in, or a 404 naming the key as it was resolved. */
  private async requireStream(tenantId: TenantId, streamKey: string): Promise<EventStream> {
    const key = normalizeKey(streamKey);
    const stream = await this.streams.findByKey(tenantId, key);
    if (!stream) {
      throw new EventStreamNotFoundError(key);
    }
    return stream;
  }

  /** The stream, and it is accepting publications right now rather than merely existing. */
  private async requireOpenStream(tenantId: TenantId, streamKey: string): Promise<EventStream> {
    const stream = await this.requireStream(tenantId, streamKey);
    if (!isEventStreamPublishable(stream)) {
      throw new StreamNotPublishableError(stream.streamKey, stream.status);
    }
    return stream;
  }

  /** This stream lists this event type, which is the contract its consumers subscribed against. */
  private requireStreamCarries(stream: EventStream, eventTypeKey: string): void {
    if (!streamAcceptsEventType(stream, eventTypeKey)) {
      throw new EventTypeNotAcceptedError(stream.streamKey, eventTypeKey);
    }
  }

  /**
   * The registry holds this key at this version, and still carries it.
   *
   * Two refusals rather than one. An unregistered key is a 422 naming the key, because the ordinary cause is a
   * producer publishing a type nobody defined; a draft or retired version is a conflict naming the status,
   * because the key was right and the shape is not one a consumer can be pointed at.
   */
  private async requireVersionCarried(
    tenantId: TenantId,
    eventTypeKey: string,
    version: number,
  ): Promise<void> {
    const definition = await this.eventTypes.findByKeyAndVersion(tenantId, eventTypeKey, version);
    if (!definition) {
      throw new UnknownEventTypeError(eventTypeKey);
    }
    if (!isEventTypePublishable(definition.status)) {
      throw new EventTypeNotPublishableError(eventTypeKey, version, definition.status);
    }
  }

  /** This event has not already become a message, so a retried publication does not become a second fact. */
  private async requireEventUnrecorded(tenantId: TenantId, eventId: Uuid): Promise<void> {
    const existing = await this.repository.findByEventId(tenantId, eventId);
    if (existing) {
      throw new MeshMessageImmutableError(existing.id);
    }
  }

  /**
   * The sequence the allocator handed back really is past the end of the partition this message landed on.
   *
   * `nextSequence` is a read followed by a write, so two producers publishing at once can be given the same
   * number; the store's unique constraint catches it, and this catches it first with the error that says what
   * happened. Cheap enough to be worth doing on every publication: one indexed read of a single partition's
   * head, against the alternative of a second message at a sequence some checkpoint is about to commit past.
   */
  private async requireSequenceUnused(message: MeshMessage): Promise<void> {
    const head = await this.repository.streamHead(
      message.tenantId,
      message.streamKey,
      message.partition,
    );
    if (message.sequence <= head) {
      throw new DuplicateSequenceError(message.streamKey, message.sequence);
    }
  }

  /** Forget one body, store it and say so — or hand back an already-hollow message untouched. */
  private async forgetOne(message: MeshMessage): Promise<MeshMessage> {
    const next = forgetMeshMessagePayload(message);
    if (next === message) {
      return message;
    }
    await this.repository.save(next);
    await this.emit(messagePayloadForgotten(next));
    return next;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
