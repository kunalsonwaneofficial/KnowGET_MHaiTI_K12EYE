import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  BindingAlreadyActiveError,
  DuplicateBindingError,
  EventStreamNotFoundError,
  OrganizationNotFoundForMeshError,
  PersonNotFoundForMeshError,
  StreamBindingNotFoundError,
  TransportNotAvailableError,
} from "./errors";
import {
  bindingActivated,
  bindingDeclared,
  bindingDraining,
  bindingRetargeted,
  bindingRetired,
} from "./mesh-events";
import { TRANSPORT_KINDS, type TransportKind, normalizeKey } from "./mesh-value";
import type {
  EventStreamRepository,
  OrganizationDirectory,
  PersonDirectory,
  StreamBindingRepository,
  TransportAdapterRegistry,
} from "./ports";
import {
  type DeclareStreamBindingParams,
  type StreamBinding,
  activateStreamBinding,
  declareStreamBinding,
  drainStreamBinding,
  isStreamBindingCarrying,
  retargetStreamBinding,
  retireStreamBinding,
} from "./stream-binding";

/**
 * Application service for stream bindings — which backbone actually carries a stream, where its settings live,
 * and how one backbone is swapped for another without losing what was in flight at the moment of the swap.
 *
 * The aggregate holds everything a binding decides about itself: the transport reference must be a handle
 * rather than a connection secret, a retired binding moves no further, retirement requires a drain first. Four
 * rules need what the rest of the tenant and the deployment hold, and they live here.
 *
 * **A stream binds a backbone once.** Two bindings from one stream to the same transport are not two paths;
 * they are one path described twice, and an operator retargeting the stream would edit whichever row they found
 * and leave the other one pointing at the decommissioned cluster. The refusal is per stream and per transport
 * rather than per stream, because binding one stream to both the outbox and a broker during a migration is the
 * ordinary case and is exactly what {@link BindingStatus} draining exists to support.
 *
 * **Exactly one binding carries at a time, and the reason is the sequence.** Sequences are per stream and
 * gapless, so two backbones accepting concurrently means two writers assigning the same numbers to different
 * messages, and every checkpoint in the tenant becomes a position in a sequence that no longer identifies
 * anything. Draining does not count as carrying, which is what makes the swap expressible: drain the old
 * binding, activate the new one, and let the old one finish handing over what it already accepted.
 *
 * **The deployment has to speak the backbone before a stream is bound to it.** The transport union is a set of
 * declarations, not a set of clients; whether this installation was built with a Kafka adapter is a fact the
 * composition root holds and {@link TransportAdapterRegistry} answers. Refused at declaration, because a stream
 * bound to a transport nothing implements is not an error anybody sees — it is a channel that accepts
 * publications and delivers to nobody, found weeks later by a consumer rather than by the operator who bound it.
 * The happy path costs one question; the list of what would have been accepted is assembled only to fill in the
 * refusal.
 *
 * **What is still in flight is an argument rather than a lookup.** No repository in this package can count the
 * messages a broker has accepted and not yet handed over — that number lives in the transport adapter at the
 * composition root, and asking this service to invent it would mean either a port that only one transport could
 * honestly implement or a drain check that quietly passed for every transport that could not.
 */
export interface StreamBindingServiceDeps {
  readonly repository: StreamBindingRepository;
  readonly streams: EventStreamRepository;
  readonly organizations: OrganizationDirectory;
  readonly people: PersonDirectory;
  readonly transports: TransportAdapterRegistry;
  readonly events?: Pick<EventBus, "publish">;
}

export class StreamBindingService {
  private readonly repository: StreamBindingRepository;
  private readonly streams: EventStreamRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly people: PersonDirectory;
  private readonly transports: TransportAdapterRegistry;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: StreamBindingServiceDeps) {
    this.repository = deps.repository;
    this.streams = deps.streams;
    this.organizations = deps.organizations;
    this.people = deps.people;
    this.transports = deps.transports;
    this.events = deps.events;
  }

  // --- Definition ------------------------------------------------------------------

  /**
   * Bind a stream to a backbone. It carries nothing until it is activated.
   *
   * The aggregate runs first, so a blank key and a transport reference carrying a password in it are both
   * turned away before anything is read — and in particular before the secret has been handed to a directory.
   */
  async declare(params: DeclareStreamBindingParams): Promise<StreamBinding> {
    const binding = declareStreamBinding(params);
    await this.requireOrganization(binding.tenantId, binding.organizationId);
    await this.requireStream(binding.tenantId, binding.streamKey);
    await this.requireTransportAvailable(binding.transport);
    await this.requireBindingFree(binding);
    await this.repository.save(binding);
    await this.emit(bindingDeclared(binding));
    return binding;
  }

  /**
   * Point the binding at different settings, which every state but retirement permits.
   *
   * The transport itself does not move. Changing which backbone carries a stream is a new binding beside the
   * old one and a drain between them, and collapsing that into an edit would be a swap with no drain in it.
   */
  async retarget(tenantId: TenantId, id: Uuid, transportRef: string): Promise<StreamBinding> {
    return this.transition(tenantId, id, retargetStreamBinding, bindingRetargeted, transportRef);
  }

  // --- Lifecycle -------------------------------------------------------------------

  /**
   * Start carrying the stream, in the name of whoever opened the path.
   *
   * The aggregate settles the transition before the tenant is read, so a binding that is already active or has
   * been retired is refused without the scan. The scan that follows is what enforces one carrier per stream,
   * and it names the transport already carrying rather than only refusing, because the remedy is to drain that
   * one and the operator needs to know which one it is.
   */
  async activate(tenantId: TenantId, id: Uuid, activatedBy: Uuid): Promise<StreamBinding> {
    await this.requirePerson(tenantId, activatedBy, "person activating the binding");
    const next = activateStreamBinding(await this.require(tenantId, id), activatedBy);
    await this.requireNothingElseCarrying(next);
    await this.repository.save(next);
    await this.emit(bindingActivated(next));
    return next;
  }

  /** Stop accepting new publications on this path while what it already took is handed over. */
  async drain(tenantId: TenantId, id: Uuid): Promise<StreamBinding> {
    return this.transition(tenantId, id, drainStreamBinding, bindingDraining);
  }

  /**
   * Close the path, once the caller can say nothing is left on it.
   *
   * The count is supplied rather than looked up, for the reason the class comment gives: what a broker has
   * accepted and not yet delivered is known to the adapter that spoke to it and to nothing else here.
   */
  async retire(tenantId: TenantId, id: Uuid, undeliveredMessages: number): Promise<StreamBinding> {
    return this.transition(tenantId, id, retireStreamBinding, bindingRetired, undeliveredMessages);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One binding, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<StreamBinding> {
    return this.require(tenantId, id);
  }

  /** The binding joining one stream to one backbone, or a 404 naming the pair that was searched for. */
  async getByStreamAndTransport(
    tenantId: TenantId,
    streamKey: string,
    transport: TransportKind,
  ): Promise<StreamBinding> {
    const key = normalizeKey(streamKey);
    const binding = await this.repository.findByStreamAndTransport(tenantId, key, transport);
    if (!binding) {
      throw new StreamBindingNotFoundError(`${key}/${transport}`);
    }
    return binding;
  }

  /** Every backbone one stream is bound to, in every state, which is what a migration is read from. */
  async listByStream(tenantId: TenantId, streamKey: string): Promise<readonly StreamBinding[]> {
    return this.repository.listByStream(tenantId, normalizeKey(streamKey));
  }

  /** The paths one institution is actually carrying traffic on right now. */
  async listCarrying(tenantId: TenantId, organizationId: Uuid): Promise<readonly StreamBinding[]> {
    return this.repository.listCarrying(tenantId, organizationId);
  }

  /** Every binding in the tenant, in every state. */
  async list(tenantId: TenantId): Promise<readonly StreamBinding[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The binding under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<StreamBinding> {
    const binding = await this.repository.findById(tenantId, id);
    if (!binding) {
      throw new StreamBindingNotFoundError(id);
    }
    return binding;
  }

  /** The institution this path belongs to, checked through the directory port. */
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

  /**
   * The stream being bound is one this tenant has.
   *
   * Existence and nothing else. A draft stream is bound before it opens, which is the order institutions
   * actually bring a channel up in, and a retired one keeps its bindings because they are what the drain of its
   * final messages runs on.
   */
  private async requireStream(tenantId: TenantId, streamKey: string): Promise<void> {
    if (!(await this.streams.findByKey(tenantId, streamKey))) {
      throw new EventStreamNotFoundError(streamKey);
    }
  }

  /**
   * Something in this deployment speaks this backbone.
   *
   * One question on the path that succeeds. The full set of what is served is assembled only when the answer
   * was no, because it is worth a round trip per transport exactly once — in a refusal somebody is reading.
   */
  private async requireTransportAvailable(transport: TransportKind): Promise<void> {
    if (await this.transports.serves(transport)) return;
    const served = await Promise.all(TRANSPORT_KINDS.map((kind) => this.transports.serves(kind)));
    const available = TRANSPORT_KINDS.filter((_, index) => served[index] === true);
    throw new TransportNotAvailableError(transport, available);
  }

  /** This stream is not already bound to this backbone, in any state including retired. */
  private async requireBindingFree(binding: StreamBinding): Promise<void> {
    const existing = await this.repository.findByStreamAndTransport(
      binding.tenantId,
      binding.streamKey,
      binding.transport,
    );
    if (existing) {
      throw new DuplicateBindingError(binding.streamKey, binding.transport);
    }
  }

  /** No other binding on this stream is carrying, which is what keeps the sequence single-writer. */
  private async requireNothingElseCarrying(binding: StreamBinding): Promise<void> {
    const bindings = await this.repository.listByStream(binding.tenantId, binding.streamKey);
    const carrying = bindings.find(
      (other) => other.id !== binding.id && isStreamBindingCarrying(other),
    );
    if (carrying) {
      throw new BindingAlreadyActiveError(binding.streamKey, carrying.transport);
    }
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (binding: StreamBinding, ...args: TArgs) => StreamBinding,
    announce: (binding: StreamBinding) => DomainEvent,
    ...args: TArgs
  ): Promise<StreamBinding> {
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
