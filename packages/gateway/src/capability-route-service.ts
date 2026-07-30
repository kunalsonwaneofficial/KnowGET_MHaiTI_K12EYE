import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { ApiContract } from "./api-contract";
import {
  type CapabilityRoute,
  type ReviseCapabilityRouteParams,
  activateCapabilityRoute,
  registerCapabilityRoute,
  retargetCapabilityRoute,
  retireCapabilityRoute,
  reviseCapabilityRoute,
} from "./capability-route";
import {
  ApiContractNotFoundError,
  CapabilityRouteNotFoundError,
  ContractSunsetError,
  DuplicateRouteError,
  RouteAddressTakenError,
  UnknownScopeError,
  UnresolvableInternalTargetError,
} from "./errors";
import { routeActivated, routeRegistered, routeRetired } from "./gateway-events";
import { type HttpMethod, normalizeKey } from "./gateway-value";
import type {
  ApiContractRepository,
  CapabilityRouteRepository,
  CapabilityTargetDirectory,
  ScopeCatalogue,
} from "./ports";

/**
 * Application service for capability routes — the addresses the institution publishes, and what each one
 * reaches on the inside.
 *
 * **The request this service takes is deliberately smaller than the aggregate's parameters.** A route carries
 * `capabilityKey`, `contractVersion`, `style` and `organizationId`, and every one of those is a fact about the
 * contract the route serves. Accepting them from the caller would mean accepting four opportunities for the
 * route to disagree with its own contract, and then either refusing the disagreement — a refusal for a mistake
 * nobody needed to be able to make — or, worse, storing it. {@link RegisterRouteRequest} names the contract and
 * the service reads the rest off it, so the disagreement has no way to be expressed. The one field that is not
 * derivable is the address, because the whole point of a route is that the public address and the internal
 * capability are chosen independently.
 *
 * Four rules live here, all of them about facts no single route contains.
 *
 * **One capability, version and method is served by one route.** {@link resolveRoute} disambiguates by exactly
 * that triple, and two candidates give it a choice it has no basis for. It would make the choice, consistently
 * enough that the second route appeared to work for months, until an ordering change somewhere unrelated
 * swapped them.
 *
 * **One method and address is claimed by one route that has not been retired.** The sibling collision, arriving
 * from the opposite direction: the two routes are usually for different capabilities, registered by different
 * people, neither of whom knew about the other. Retirement frees the address, because retiring the old route
 * and activating a replacement on the same path is what a migration looks like.
 *
 * **The scope exists and the target resolves.** Both are checked at registration, which is the only moment
 * either is cheap. A route requiring a scope the platform does not issue is a route no consumer can ever be
 * granted access to, and it reads as configured. A route pointing at a target that resolves to nothing is
 * invisible from the outside — nobody outside ever sees the field — until an integrator who has pinned to a
 * published contract starts receiving a failure they cannot see the cause of and cannot fix from their side.
 *
 * **A route is never registered against a sunset version.** Not a lifecycle rule the aggregate could hold, since
 * it is a fact about the contract. It is refused here rather than left for activation because a draft route
 * under a version that has stopped answering can never be activated at all, and the operator who registers one
 * is going to come back to it days later having forgotten what they were doing.
 *
 * Activation is where the contract's status is consulted, and the aggregate takes it as a parameter for a
 * reason worth restating: the route and the contract are edited by different people at different times, so the
 * check cannot be satisfied by the order in which somebody happens to click.
 */
export interface RegisterRouteRequest {
  readonly tenantId: TenantId;
  /** The contract this route serves. Its capability, version, style and organization are read from it. */
  readonly contractId: Uuid;
  readonly method: HttpMethod;
  readonly externalPath: string;
  readonly requiredScope: string;
  readonly internalTarget: string;
  readonly idempotencyGuarded: boolean;
}

export interface CapabilityRouteServiceDeps {
  readonly repository: CapabilityRouteRepository;
  readonly contracts: ApiContractRepository;
  readonly scopes: ScopeCatalogue;
  readonly targets: CapabilityTargetDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class CapabilityRouteService {
  private readonly repository: CapabilityRouteRepository;
  private readonly contracts: ApiContractRepository;
  private readonly scopes: ScopeCatalogue;
  private readonly targets: CapabilityTargetDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: CapabilityRouteServiceDeps) {
    this.repository = deps.repository;
    this.contracts = deps.contracts;
    this.scopes = deps.scopes;
    this.targets = deps.targets;
    this.events = deps.events;
  }

  // --- Registration ----------------------------------------------------------------

  /** Register an address against a contract, as a draft. Nothing resolves to it until it is activated. */
  async register(request: RegisterRouteRequest): Promise<CapabilityRoute> {
    const contract = await this.requireLiveContract(request.tenantId, request.contractId);
    const route = registerCapabilityRoute({
      tenantId: request.tenantId,
      organizationId: contract.organizationId,
      contractId: contract.id,
      capabilityKey: contract.capabilityKey,
      contractVersion: contract.contractVersion,
      method: request.method,
      externalPath: request.externalPath,
      style: contract.style,
      requiredScope: request.requiredScope,
      internalTarget: request.internalTarget,
      idempotencyGuarded: request.idempotencyGuarded,
    });

    await this.requireMethodFree(route);
    await this.requireAddressFree(route);
    await this.requireScope(request.tenantId, route.requiredScope);
    await this.requireTarget(request.tenantId, route.capabilityKey, route.internalTarget);
    await this.repository.save(route);
    await this.emit(routeRegistered(route));
    return route;
  }

  /**
   * Change the published surface of a draft: the address, the scope and the idempotency guarantee.
   *
   * The address and the scope are re-checked, because a revision is exactly as capable of colliding or of
   * naming a scope that does not exist as a registration was. The collision check has to exclude the route
   * doing the revising, or a draft that kept its own path would refuse to change its scope.
   */
  async revise(
    tenantId: TenantId,
    id: Uuid,
    params: ReviseCapabilityRouteParams,
  ): Promise<CapabilityRoute> {
    const next = reviseCapabilityRoute(await this.require(tenantId, id), params);
    await this.requireAddressFree(next);
    await this.requireScope(tenantId, next.requiredScope);
    await this.repository.save(next);
    return next;
  }

  /**
   * Point the route at something else inside the platform, without changing anything the outside world sees.
   *
   * Permitted while the route is live, which is the whole reason the indirection exists: the alternative would
   * make every internal refactor cost an external migration, and capabilities would stop being refactored and
   * start being named after the modules that implement them.
   */
  async retarget(tenantId: TenantId, id: Uuid, internalTarget: string): Promise<CapabilityRoute> {
    const route = await this.require(tenantId, id);
    const next = retargetCapabilityRoute(route, internalTarget);
    await this.requireTarget(tenantId, next.capabilityKey, next.internalTarget);
    await this.repository.save(next);
    return next;
  }

  // --- Lifecycle -------------------------------------------------------------------

  /** Make the address resolve, if the contract behind it is published. */
  async activate(tenantId: TenantId, id: Uuid): Promise<CapabilityRoute> {
    const route = await this.require(tenantId, id);
    const contract = await this.requireContract(tenantId, route.contractId);
    const next = activateCapabilityRoute(route, contract.status);
    await this.requireAddressFree(next);
    await this.repository.save(next);
    await this.emit(routeActivated(next));
    return next;
  }

  /** Stop resolving the address. The record stays, because access logs refer to paths. */
  async retire(tenantId: TenantId, id: Uuid): Promise<CapabilityRoute> {
    return this.transition(tenantId, id, retireCapabilityRoute, routeRetired);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One route, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<CapabilityRoute> {
    return this.require(tenantId, id);
  }

  /** The routing table for one institution: every address that currently resolves. */
  async listActive(tenantId: TenantId, organizationId: Uuid): Promise<readonly CapabilityRoute[]> {
    return this.repository.listActive(tenantId, organizationId);
  }

  /**
   * Every address one contract publishes, in every status.
   *
   * What makes a contract's lifecycle enforceable. Sunsetting a version is a claim about every address that
   * version publishes, and a claim nobody can enumerate is a claim nobody can keep.
   */
  async listByContract(tenantId: TenantId, contractId: Uuid): Promise<readonly CapabilityRoute[]> {
    return this.repository.listByContract(tenantId, contractId);
  }

  /** Every route in the tenant, retired ones included. */
  async list(tenantId: TenantId): Promise<readonly CapabilityRoute[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The route under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<CapabilityRoute> {
    const route = await this.repository.findById(tenantId, id);
    if (!route) {
      throw new CapabilityRouteNotFoundError(id);
    }
    return route;
  }

  /** The contract this route serves, or a 404 naming it. */
  private async requireContract(tenantId: TenantId, contractId: Uuid): Promise<ApiContract> {
    const contract = await this.contracts.findById(tenantId, contractId);
    if (!contract) {
      throw new ApiContractNotFoundError(contractId);
    }
    return contract;
  }

  /** The contract exists and has not stopped answering, so a route under it could one day be activated. */
  private async requireLiveContract(tenantId: TenantId, contractId: Uuid): Promise<ApiContract> {
    const contract = await this.requireContract(tenantId, contractId);
    if (contract.status === "sunset") {
      throw new ContractSunsetError(contract.capabilityKey, contract.contractVersion);
    }
    return contract;
  }

  /**
   * No other route that has not been retired serves this contract under this method.
   *
   * Read through the contract rather than through the capability and version, which are the same question: every
   * route under one contract id carries that contract's capability and version, because this service is the only
   * thing that sets them and it sets them from the contract.
   */
  private async requireMethodFree(route: CapabilityRoute): Promise<void> {
    const siblings = await this.repository.listByContract(route.tenantId, route.contractId);
    const clash = siblings.find(
      (other) =>
        other.id !== route.id && other.method === route.method && other.status !== "retired",
    );
    if (clash) {
      throw new DuplicateRouteError(route.capabilityKey, route.contractVersion, route.method);
    }
  }

  /** No other route that has not been retired claims this method and public address. */
  private async requireAddressFree(route: CapabilityRoute): Promise<void> {
    const holder = await this.repository.findByMethodAndPath(
      route.tenantId,
      route.method,
      route.externalPath,
    );
    if (holder && holder.id !== route.id && holder.status !== "retired") {
      throw new RouteAddressTakenError(route.method, route.externalPath);
    }
  }

  /** The scope this route requires is one the platform issues. */
  private async requireScope(tenantId: TenantId, requiredScope: string): Promise<void> {
    if (!(await this.scopes.exists(tenantId, normalizeKey(requiredScope)))) {
      throw new UnknownScopeError(requiredScope);
    }
  }

  /** The internal target reaches something that answers. Never disclosed, so never noticed if wrong. */
  private async requireTarget(
    tenantId: TenantId,
    capabilityKey: string,
    internalTarget: string,
  ): Promise<void> {
    if (!(await this.targets.resolves(tenantId, internalTarget))) {
      throw new UnresolvableInternalTargetError(capabilityKey, internalTarget);
    }
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (route: CapabilityRoute, ...args: TArgs) => CapabilityRoute,
    announce: (route: CapabilityRoute) => DomainEvent,
    ...args: TArgs
  ): Promise<CapabilityRoute> {
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
