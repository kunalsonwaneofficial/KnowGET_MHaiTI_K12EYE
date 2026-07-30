import type { EventBus } from "@knowget/events";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import { inspectCircuit } from "./circuit";
import {
  DuplicateEndpointKeyError,
  IntegrationEndpointNotFoundError,
  OrganizationNotFoundForGatewayError,
  UnknownAdapterError,
} from "./errors";
import {
  endpointActivated,
  endpointCircuitClosed,
  endpointCircuitOpened,
  endpointDisabled,
  endpointQuarantined,
  endpointRegistered,
  endpointRetired,
} from "./gateway-events";
import { type IntegrationProtocol, normalizeKey } from "./gateway-value";
import type { OutcomeWindow } from "./gateway-view";
import {
  type IntegrationEndpoint,
  type RegisterIntegrationEndpointParams,
  activateIntegrationEndpoint,
  applyCircuitVerdict,
  disableIntegrationEndpoint,
  isEndpointQuarantineDue,
  quarantineIntegrationEndpoint,
  rebindEndpointAdapter,
  registerIntegrationEndpoint,
  renameIntegrationEndpoint,
  retireIntegrationEndpoint,
  rotateEndpointCredential,
} from "./integration-endpoint";
import type {
  AdapterRegistry,
  IntegrationEndpointRepository,
  OrganizationDirectory,
} from "./ports";

/**
 * Application service for integration endpoints — every third-party system the institution talks to, and the
 * platform's own running judgement of whether each one is currently worth talking to.
 *
 * The aggregate holds an endpoint's lifecycle and its health arithmetic. Two rules need something the aggregate
 * cannot see, and one operation needs an engine, so all three live here.
 *
 * **The adapter exists and speaks the stated protocol.** One check, two failures, and the second is the more
 * dangerous of the pair by resembling the first less. Naming an adapter that is not registered is caught the
 * moment anything tries to call the endpoint. Naming a real adapter under the wrong protocol is not: registration
 * succeeds, the record reads as configured, the listing looks correct, and the endpoint fails at its first live
 * call in whatever way a mismatched wire format fails — which is to say, like a network problem, investigated by
 * people who have no reason to suspect configuration. {@link AdapterRegistry.supports} takes both together for
 * exactly this reason, and this service is the only place that asks it.
 *
 * **The endpoint key is taken once, tenant-wide rather than per organization.** An endpoint key is what a
 * delivery record, an adapter binding and an operator's runbook all refer to, and those three things are read by
 * people who will not be holding an organization id at the time. A trust whose two schools each integrate with
 * the same payment provider has two endpoints and needs two names, and being made to choose them is the point.
 *
 * **Health is recorded, never inferred.** {@link IntegrationEndpointService.recordOutcomes} is the only door
 * through which an endpoint's posture changes, and it takes a window of outcomes the fabric actually observed
 * rather than a posture somebody decided. The engine reads the window, the aggregate applies the verdict, and
 * this service does one thing neither can: it notices that the posture *changed*, and announces the crossing.
 *
 * The crossing is announced, not the state. A circuit that goes `open` → `half_open` → `open` across a bad ten
 * minutes is one outage, and firing an event at each step would turn a single incident into a pager storm whose
 * volume tracks how flaky the endpoint is rather than how serious the problem is. So the events fire on the two
 * transitions that mean something to somebody outside: closed to not-closed, and back again.
 *
 * {@link IntegrationEndpointService.sweepQuarantine} is the operation the endpoint repository's own
 * `listOpenCircuits` exists to serve. An endpoint that has been open long enough is due for quarantine, but
 * *due* is a property of a record and an instant, and nothing turns the first into the second except this read
 * running. It is deliberately a sweep rather than a per-call check: an endpoint whose circuit opened and which
 * then stopped receiving traffic altogether would otherwise never be looked at again, which is precisely the
 * endpoint most likely to have been quietly broken for a week.
 */
export interface IntegrationEndpointServiceDeps {
  readonly repository: IntegrationEndpointRepository;
  readonly organizations: OrganizationDirectory;
  readonly adapters: AdapterRegistry;
  readonly events?: Pick<EventBus, "publish">;
}

export class IntegrationEndpointService {
  private readonly repository: IntegrationEndpointRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly adapters: AdapterRegistry;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: IntegrationEndpointServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.adapters = deps.adapters;
    this.events = deps.events;
  }

  // --- Registration ----------------------------------------------------------------

  /** Register a third-party system behind an adapter. Nothing is called until it is activated. */
  async register(params: RegisterIntegrationEndpointParams): Promise<IntegrationEndpoint> {
    const endpoint = registerIntegrationEndpoint(params);
    await this.requireOrganization(params.tenantId, params.organizationId);
    await this.requireKeyFree(endpoint);
    await this.requireAdapter(endpoint.adapterKey, endpoint.protocol);
    await this.repository.save(endpoint);
    await this.emit(endpointRegistered(endpoint));
    return endpoint;
  }

  /** Change the label an operator reads. Nothing about what is called or how changes. */
  async rename(tenantId: TenantId, id: Uuid, displayName: string): Promise<IntegrationEndpoint> {
    return this.revise(tenantId, id, renameIntegrationEndpoint, displayName);
  }

  /**
   * Move the endpoint onto a different adapter, re-checking that the new one speaks its protocol.
   *
   * The protocol is the endpoint's and does not move with the adapter, which is what makes the re-check
   * necessary rather than ceremonial: an endpoint registered against a REST adapter and rebound to a SOAP one is
   * a change that reads as a routine swap and is a change of wire format.
   */
  async rebindAdapter(
    tenantId: TenantId,
    id: Uuid,
    adapterKey: string,
  ): Promise<IntegrationEndpoint> {
    const next = rebindEndpointAdapter(await this.require(tenantId, id), adapterKey);
    await this.requireAdapter(next.adapterKey, next.protocol);
    await this.repository.save(next);
    return next;
  }

  /**
   * Point the endpoint at a different credential handle, or at none.
   *
   * Not announced, and the asymmetry with a consumer's credential rotation is deliberate. A consumer's
   * credential is one the institution issued to somebody else, so rotating it is news to that somebody. This one
   * authenticates the platform to a third party, and the only parties to the change are the operator making it
   * and a vault neither publishes to.
   */
  async rotateCredential(
    tenantId: TenantId,
    id: Uuid,
    credentialRef: string | null,
  ): Promise<IntegrationEndpoint> {
    return this.revise(tenantId, id, rotateEndpointCredential, credentialRef);
  }

  // --- Lifecycle -------------------------------------------------------------------

  /** Put the endpoint into service, clearing whatever the last outage left behind. */
  async activate(tenantId: TenantId, id: Uuid): Promise<IntegrationEndpoint> {
    return this.transition(tenantId, id, activateIntegrationEndpoint, endpointActivated);
  }

  /** Stop calling it until a person says otherwise. What a sustained outage becomes. */
  async quarantine(tenantId: TenantId, id: Uuid): Promise<IntegrationEndpoint> {
    return this.transition(tenantId, id, quarantineIntegrationEndpoint, endpointQuarantined);
  }

  /** Take it out of service deliberately. The reason stays on the record and travels with the event. */
  async disable(tenantId: TenantId, id: Uuid, reason: string): Promise<IntegrationEndpoint> {
    return this.transition(tenantId, id, disableIntegrationEndpoint, endpointDisabled, reason);
  }

  /** Retire it for good. The record stays, because deliveries made through it still refer to it. */
  async retire(tenantId: TenantId, id: Uuid): Promise<IntegrationEndpoint> {
    return this.transition(tenantId, id, retireIntegrationEndpoint, endpointRetired);
  }

  // --- Observation -----------------------------------------------------------------

  /**
   * Record what a window of calls to this endpoint actually did, and let the circuit follow.
   *
   * The one path by which posture and health change. The window is a tally the fabric kept; the engine turns it
   * into a verdict; the aggregate writes the verdict onto the record. Only the crossing is announced — see the
   * class comment — so a circuit flapping between `open` and `half_open` produces no events at all, and the two
   * moments a subscriber cares about produce exactly one each.
   */
  async recordOutcomes(
    tenantId: TenantId,
    id: Uuid,
    window: OutcomeWindow,
  ): Promise<IntegrationEndpoint> {
    const endpoint = await this.require(tenantId, id);
    const next = applyCircuitVerdict(endpoint, window, inspectCircuit(window));
    await this.repository.save(next);

    const wasOpen = endpoint.posture !== "closed";
    const isOpen = next.posture !== "closed";
    if (!wasOpen && isOpen) {
      await this.emit(endpointCircuitOpened(next));
    } else if (wasOpen && !isOpen) {
      await this.emit(endpointCircuitClosed(next));
    }
    return next;
  }

  /**
   * Quarantine every endpoint whose circuit has been open long enough to stop being an incident.
   *
   * Returns what it quarantined rather than a count, because the caller is a scheduled job whose log entry is
   * the only record anybody will read of why four endpoints went out of service overnight.
   *
   * Endpoints that are open but not yet due are left exactly as they are, and no event is emitted for them: a
   * sweep that found nothing to do is not a fact about any endpoint.
   */
  async sweepQuarantine(
    tenantId: TenantId,
    asOf: ISODateString,
  ): Promise<readonly IntegrationEndpoint[]> {
    const open = await this.repository.listOpenCircuits(tenantId);
    const quarantined: IntegrationEndpoint[] = [];

    for (const endpoint of open) {
      if (!isEndpointQuarantineDue(endpoint, asOf)) continue;
      const next = quarantineIntegrationEndpoint(endpoint);
      await this.repository.save(next);
      await this.emit(endpointQuarantined(next));
      quarantined.push(next);
    }
    return quarantined;
  }

  // --- Reading ---------------------------------------------------------------------

  /** One endpoint, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<IntegrationEndpoint> {
    return this.require(tenantId, id);
  }

  /** One endpoint by the key a runbook names it with, or a 404 quoting the normalised key. */
  async getByKey(tenantId: TenantId, endpointKey: string): Promise<IntegrationEndpoint> {
    const key = normalizeKey(endpointKey);
    const endpoint = await this.repository.findByKey(tenantId, key);
    if (!endpoint) {
      throw new IntegrationEndpointNotFoundError(key);
    }
    return endpoint;
  }

  /** What the institution can currently reach: active endpoints for one organization. */
  async listCallable(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<readonly IntegrationEndpoint[]> {
    return this.repository.listCallable(tenantId, organizationId);
  }

  /**
   * Everything currently failing, across the whole tenant rather than one institution.
   *
   * Deliberately not scoped to an organization. An adapter or a vendor outage does not respect the boundary
   * between two schools in a trust, and the operator looking at this list is looking for the shape of a single
   * problem showing up in several places at once.
   */
  async listOpenCircuits(tenantId: TenantId): Promise<readonly IntegrationEndpoint[]> {
    return this.repository.listOpenCircuits(tenantId);
  }

  /** Every endpoint in the tenant, retired ones included. */
  async list(tenantId: TenantId): Promise<readonly IntegrationEndpoint[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The endpoint under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<IntegrationEndpoint> {
    const endpoint = await this.repository.findById(tenantId, id);
    if (!endpoint) {
      throw new IntegrationEndpointNotFoundError(id);
    }
    return endpoint;
  }

  /** The institution this endpoint integrates on behalf of, checked through the directory port. */
  private async requireOrganization(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForGatewayError(organizationId);
    }
  }

  /** No other endpoint in the tenant already answers to this key. */
  private async requireKeyFree(endpoint: IntegrationEndpoint): Promise<void> {
    const existing = await this.repository.findByKey(endpoint.tenantId, endpoint.endpointKey);
    if (existing && existing.id !== endpoint.id) {
      throw new DuplicateEndpointKeyError(endpoint.endpointKey);
    }
  }

  /** The adapter is registered and speaks this endpoint's protocol. Both halves, one question. */
  private async requireAdapter(adapterKey: string, protocol: IntegrationProtocol): Promise<void> {
    if (!(await this.adapters.supports(adapterKey, protocol))) {
      throw new UnknownAdapterError(adapterKey, protocol);
    }
  }

  /** Load, apply a pure revision, save. Nothing is announced: a label or a vault handle is not news. */
  private async revise<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (endpoint: IntegrationEndpoint, ...args: TArgs) => IntegrationEndpoint,
    ...args: TArgs
  ): Promise<IntegrationEndpoint> {
    const next = move(await this.require(tenantId, id), ...args);
    await this.repository.save(next);
    return next;
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (endpoint: IntegrationEndpoint, ...args: TArgs) => IntegrationEndpoint,
    announce: (endpoint: IntegrationEndpoint) => DomainEvent,
    ...args: TArgs
  ): Promise<IntegrationEndpoint> {
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
