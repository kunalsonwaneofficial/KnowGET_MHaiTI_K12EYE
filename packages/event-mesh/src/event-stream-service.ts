import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateStreamKeyError,
  EventStreamNotFoundError,
  OrganizationNotFoundForMeshError,
  PersonNotFoundForMeshError,
  UnknownEventTypeError,
} from "./errors";
import {
  type DefineEventStreamParams,
  type EventStream,
  type RepartitionEventStreamParams,
  acceptEventType,
  activateEventStream,
  defineEventStream,
  pauseEventStream,
  repartitionEventStream,
  retireEventStream,
  reviseStreamRetention,
  streamPartitioning,
  withdrawEventType,
} from "./event-stream";
import {
  streamActivated,
  streamDefined,
  streamEventTypeAccepted,
  streamEventTypeWithdrawn,
  streamPaused,
  streamRepartitioned,
  streamRetentionRevised,
  streamRetired,
} from "./mesh-events";
import { type PayloadRetention, normalizeKey } from "./mesh-value";
import type { PartitionDeclaration } from "./mesh-view";
import type {
  EventStreamRepository,
  EventTypeDefinitionRepository,
  OrganizationDirectory,
  PersonDirectory,
} from "./ports";

/**
 * Application service for event streams — the named channels facts travel on, what each one accepts, how it is
 * ordered and partitioned, what it keeps and for how long, and whether it is open for publication at all.
 *
 * The aggregate decides everything a stream can decide holding only itself: partitioning freezes once the
 * channel leaves draft, a retired stream accepts nothing further, a withdrawal that would empty the accepted
 * list is refused, retention and its window move together. Three rules need the rest of the registry and live
 * here.
 *
 * **A stream key names one channel in the tenant.** Producers address a stream by key, not by id, so a second
 * channel under the same key is two different sets of subscribers each believing they receive everything on it.
 * The check is tenant-wide rather than per organization for the same reason the event type namespace is: a key
 * is what appears in a producer configuration, and a key that means one thing at one school and another thing
 * at the school next door is a key that cannot be read at the trust level at all.
 *
 * **A stream accepts only types the registry knows.** The check runs against everything registered in the
 * tenant, in every status, rather than against what is currently carried, and the difference matters in the
 * ordinary case rather than a corner of it. Institutions bring up a stream and its event types together, drafts
 * first; refusing a stream that names a drafted type would force the two into an order nothing else requires,
 * and {@link UnknownEventTypeError} says the type is not registered, which of a draft would simply be false.
 * What a producer may publish *today* is a different question, and it is answered at publication by
 * {@link EventTypeDefinitionService.listCarried}, where a draft correctly does not appear.
 *
 * **Activation is attributed.** Opening a channel is the act that lets institutional facts start flowing across
 * a backbone, and `activatedBy` is stamped once and kept across every later pause, because the question worth
 * answering months afterwards is who opened this channel rather than who last unpaused it.
 *
 * Vocabulary changes are announced individually, one event per key, rather than as a new accepted list. A
 * subscriber that cares about `admissions.application.submitted` should not have to diff two arrays to learn
 * that the stream carrying it stopped, and the mesh has a policy against putting anything on the bus a
 * subscriber would have to be cleared to read — a whole vocabulary is a description of what the institution
 * records, which is more than a listener needs to be told about one key.
 */
export interface EventStreamServiceDeps {
  readonly repository: EventStreamRepository;
  readonly eventTypes: EventTypeDefinitionRepository;
  readonly organizations: OrganizationDirectory;
  readonly people: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class EventStreamService {
  private readonly repository: EventStreamRepository;
  private readonly eventTypes: EventTypeDefinitionRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly people: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: EventStreamServiceDeps) {
    this.repository = deps.repository;
    this.eventTypes = deps.eventTypes;
    this.organizations = deps.organizations;
    this.people = deps.people;
    this.events = deps.events;
  }

  // --- Definition ------------------------------------------------------------------

  /** Declare a channel. It carries nothing until it is activated. */
  async define(params: DefineEventStreamParams): Promise<EventStream> {
    const stream = defineEventStream(params);
    await this.requireOrganization(params.tenantId, params.organizationId);
    await this.requireKeyFree(stream);
    await this.requireEventTypesRegistered(stream.tenantId, stream.eventTypeKeys);
    await this.repository.save(stream);
    await this.emit(streamDefined(stream));
    return stream;
  }

  /** Change the ordering guarantee and the partition count, which only a draft still permits. */
  async repartition(
    tenantId: TenantId,
    id: Uuid,
    params: RepartitionEventStreamParams,
  ): Promise<EventStream> {
    return this.transition(tenantId, id, repartitionEventStream, streamRepartitioned, params);
  }

  /** Change what the stream keeps and for how long, which a live stream still permits. */
  async reviseRetention(
    tenantId: TenantId,
    id: Uuid,
    retention: PayloadRetention,
    retentionSeconds: number,
  ): Promise<EventStream> {
    return this.transition(
      tenantId,
      id,
      reviseStreamRetention,
      streamRetentionRevised,
      retention,
      retentionSeconds,
    );
  }

  // --- Vocabulary ------------------------------------------------------------------

  /**
   * Accept one more event type onto the channel.
   *
   * The registry lookup runs after the aggregate, so a key the stream already accepts, a stream that is retired
   * and a stream already at the ceiling are all turned away without a read. It is one lookup by key rather than
   * the whole-tenant read {@link EventStreamService.define} pays for, because there is exactly one key to
   * settle and no reason to fetch a registry to answer a question about a single row of it.
   */
  async accept(tenantId: TenantId, id: Uuid, eventTypeKey: string): Promise<EventStream> {
    const next = acceptEventType(await this.require(tenantId, id), eventTypeKey);
    const key = normalizeKey(eventTypeKey);
    await this.requireEventTypeRegistered(tenantId, key);
    await this.repository.save(next);
    await this.emit(streamEventTypeAccepted(next, key));
    return next;
  }

  /**
   * Stop accepting an event type on the channel.
   *
   * No registry lookup: the type is leaving, and whether it is still registered has no bearing on a stream that
   * will refuse it either way. A withdrawal of a type the stream never accepted is refused by the aggregate,
   * which is the only question worth asking here.
   */
  async withdraw(tenantId: TenantId, id: Uuid, eventTypeKey: string): Promise<EventStream> {
    const next = withdrawEventType(await this.require(tenantId, id), eventTypeKey);
    await this.repository.save(next);
    await this.emit(streamEventTypeWithdrawn(next, normalizeKey(eventTypeKey)));
    return next;
  }

  // --- Lifecycle -------------------------------------------------------------------

  /** Open the channel for publication, from draft or from paused, in the name of whoever opened it. */
  async activate(tenantId: TenantId, id: Uuid, activatedBy: Uuid): Promise<EventStream> {
    await this.requirePerson(tenantId, activatedBy, "person activating the stream");
    return this.transition(tenantId, id, activateEventStream, streamActivated, activatedBy);
  }

  /** Stop accepting publications for now, keeping everything the stream holds and every subscription on it. */
  async pause(tenantId: TenantId, id: Uuid): Promise<EventStream> {
    return this.transition(tenantId, id, pauseEventStream, streamPaused);
  }

  /** Finish with the channel. Nothing is published on it again, and its retention runs out on its own. */
  async retire(tenantId: TenantId, id: Uuid): Promise<EventStream> {
    return this.transition(tenantId, id, retireEventStream, streamRetired);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One stream, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<EventStream> {
    return this.require(tenantId, id);
  }

  /**
   * One stream by the key a producer addresses it with, or a 404 naming the normalised key.
   *
   * The refusal quotes what was searched for rather than what was typed, so a caller who asked for
   * `Student-Lifecycle.Enrolment` learns which key the mesh looked under.
   */
  async getByKey(tenantId: TenantId, streamKey: string): Promise<EventStream> {
    const key = normalizeKey(streamKey);
    const stream = await this.repository.findByKey(tenantId, key);
    if (!stream) {
      throw new EventStreamNotFoundError(key);
    }
    return stream;
  }

  /** The channels one institution can publish on right now. */
  async listPublishable(tenantId: TenantId, organizationId: Uuid): Promise<readonly EventStream[]> {
    return this.repository.listPublishable(tenantId, organizationId);
  }

  /** Every stream in the tenant that accepts a type, which is where a producer finds out where to publish. */
  async listAcceptingEventType(
    tenantId: TenantId,
    eventTypeKey: string,
  ): Promise<readonly EventStream[]> {
    return this.repository.listAcceptingEventType(tenantId, normalizeKey(eventTypeKey));
  }

  /** Every stream in the tenant, in every status. */
  async list(tenantId: TenantId): Promise<readonly EventStream[]> {
    return this.repository.listByTenant(tenantId);
  }

  /**
   * The partitioning declaration a producer needs to place a message on this stream.
   *
   * It is derived rather than stored twice, so a message recorded through
   * {@link MeshMessageService} lands on a partition the stream itself declared rather than one a caller
   * asserted about it.
   */
  async partitioning(tenantId: TenantId, id: Uuid): Promise<PartitionDeclaration> {
    return streamPartitioning(await this.require(tenantId, id));
  }

  // --- Internals -------------------------------------------------------------------

  /** The stream under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<EventStream> {
    const stream = await this.repository.findById(tenantId, id);
    if (!stream) {
      throw new EventStreamNotFoundError(id);
    }
    return stream;
  }

  /** The institution this channel belongs to, checked through the directory port. */
  private async requireOrganization(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForMeshError(organizationId);
    }
  }

  /** One person, checked against the directory. */
  private async requirePerson(tenantId: TenantId, personId: Uuid, role: string): Promise<void> {
    if (!(await this.people.exists(tenantId, personId))) {
      throw new PersonNotFoundForMeshError(personId, role);
    }
  }

  /** The key is not already taken in this tenant. Compared after normalisation, as the store holds it. */
  private async requireKeyFree(stream: EventStream): Promise<void> {
    if (await this.repository.findByKey(stream.tenantId, stream.streamKey)) {
      throw new DuplicateStreamKeyError(stream.streamKey);
    }
  }

  /**
   * Every key the stream declares is a type the registry has heard of, settled from one read.
   *
   * A stream may name up to {@link MAX_STREAM_EVENT_TYPES} types, and checking each one by key would buy that
   * many round trips to reach the same refusal. One tenant read turned into a set answers all of them, and the
   * first key that is missing is the one named, because a caller fixing a typo wants the typo rather than a
   * count.
   */
  private async requireEventTypesRegistered(
    tenantId: TenantId,
    eventTypeKeys: readonly string[],
  ): Promise<void> {
    const registered = new Set(
      (await this.eventTypes.listByTenant(tenantId)).map((definition) => definition.eventTypeKey),
    );
    for (const key of eventTypeKeys) {
      if (!registered.has(key)) {
        throw new UnknownEventTypeError(key);
      }
    }
  }

  /** One key the registry has heard of, in any status. */
  private async requireEventTypeRegistered(
    tenantId: TenantId,
    eventTypeKey: string,
  ): Promise<void> {
    const versions = await this.eventTypes.listByKey(tenantId, eventTypeKey);
    if (versions.length === 0) {
      throw new UnknownEventTypeError(eventTypeKey);
    }
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (stream: EventStream, ...args: TArgs) => EventStream,
    announce: (stream: EventStream) => DomainEvent,
    ...args: TArgs
  ): Promise<EventStream> {
    const next = move(await this.require(tenantId, id), ...args);
    await this.repository.save(next);
    await this.emit(announce(next));
    return next;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
