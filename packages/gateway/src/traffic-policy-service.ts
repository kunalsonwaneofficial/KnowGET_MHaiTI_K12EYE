import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  ApiConsumerNotFoundError,
  DuplicatePolicyScopeError,
  OrganizationNotFoundForGatewayError,
  TrafficPolicyNotFoundError,
} from "./errors";
import {
  policyDeactivated,
  policyDefined,
  policyReactivated,
  policyRevised,
} from "./gateway-events";
import type { PolicyLimits } from "./gateway-view";
import type {
  ApiConsumerRepository,
  OrganizationDirectory,
  TrafficPolicyRepository,
} from "./ports";
import {
  type DefineTrafficPolicyParams,
  type TrafficPolicy,
  deactivateTrafficPolicy,
  defineTrafficPolicy,
  isTrafficPolicyActive,
  reactivateTrafficPolicy,
  renameTrafficPolicy,
  reviseTrafficPolicy,
} from "./traffic-policy";

/**
 * Application service for traffic policies — the limits the institution places on what it will absorb, and who
 * each one applies to.
 *
 * The aggregate refuses a policy that is internally incoherent: a consumer scope with no consumer, a limit that
 * is not a usable figure, a policy that sets nothing at all. Three rules need more than one record and live here.
 *
 * **One scope tuple carries one policy in force.** The four scopes are ordered by specificity so that ties
 * between *different* scopes are impossible by construction, which leaves exactly one collision the engine
 * cannot resolve: two policies on the same tuple. Every tie-break that could settle it — newest wins, tightest
 * wins, lowest id wins — makes a consumer's effective rate limit depend on something nobody would think to look
 * at, so it is refused at the point of creation instead, where somebody is present to be told.
 *
 * **Deactivating a policy releases its tuple, so putting one back in force is not the reverse of taking it out.**
 * A policy taken out of force in March and reinstated in September is being reinstated into a world that may
 * have given its tuple to a replacement, and reactivating without asking would produce exactly the ambiguity the
 * uniqueness rule exists to prevent — arrived at through the one path that never passes the check that
 * establishes it. So {@link TrafficPolicyService.reactivate} runs the same collision check a definition does.
 *
 * **A per-consumer policy names a consumer that exists.** The failure this closes is entirely silent: a policy
 * naming an identifier that resolves to nobody sits in the table looking configured, matches no request the
 * engine ever resolves, and the consumer it was meant to constrain runs unlimited under a limit the operator
 * believes is protecting them. Nothing errors and no counter moves, which is why it survives review.
 *
 * A capability-scoped policy's `capabilityKey` is deliberately *not* checked against the contract register.
 * Limits are set during capacity planning, which is work done before a capability ships, and a check here would
 * refuse the most useful time to do it.
 *
 * Repeats of {@link TrafficPolicyService.deactivate} and {@link TrafficPolicyService.reactivate} are not errors
 * — that is the aggregate's judgement and this service keeps it — and they are also not events. A policy that
 * was already out of force did not go out of force again, and announcing that it did would put an entry in
 * every subscriber's record of a change that never happened.
 */
export interface TrafficPolicyServiceDeps {
  readonly repository: TrafficPolicyRepository;
  readonly organizations: OrganizationDirectory;
  readonly consumers: ApiConsumerRepository;
  readonly events?: Pick<EventBus, "publish">;
}

export class TrafficPolicyService {
  private readonly repository: TrafficPolicyRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly consumers: ApiConsumerRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: TrafficPolicyServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.consumers = deps.consumers;
    this.events = deps.events;
  }

  // --- Definition ------------------------------------------------------------------

  /** Define a policy, in force from the moment it exists. */
  async define(params: DefineTrafficPolicyParams): Promise<TrafficPolicy> {
    const policy = defineTrafficPolicy(params);
    await this.requireOrganization(params.tenantId, params.organizationId);
    await this.requireSubject(policy);
    await this.requireTupleFree(policy);
    await this.repository.save(policy);
    await this.emit(policyDefined(policy));
    return policy;
  }

  /** Replace the limits wholesale. Announced, because a ceiling moving is what a subscriber is watching for. */
  async revise(tenantId: TenantId, id: Uuid, limits: PolicyLimits): Promise<TrafficPolicy> {
    return this.transition(tenantId, id, reviseTrafficPolicy, policyRevised, limits);
  }

  /** Change the label an operator reads. The scope, the subject and the limits are untouched. */
  async rename(tenantId: TenantId, id: Uuid, displayName: string): Promise<TrafficPolicy> {
    const next = renameTrafficPolicy(await this.require(tenantId, id), displayName);
    await this.repository.save(next);
    return next;
  }

  // --- Force -----------------------------------------------------------------------

  /**
   * Take the policy out of force, keeping the record and releasing its tuple.
   *
   * A repeat is neither an error nor an event: the record is returned as it stands, nothing is written, and no
   * subscriber is told a policy went out of force that was already out of force.
   */
  async deactivate(tenantId: TenantId, id: Uuid): Promise<TrafficPolicy> {
    const policy = await this.require(tenantId, id);
    if (!isTrafficPolicyActive(policy)) return policy;

    const next = deactivateTrafficPolicy(policy);
    await this.repository.save(next);
    await this.emit(policyDeactivated(next));
    return next;
  }

  /**
   * Put the policy back in force, if nothing has taken its tuple in the meantime.
   *
   * The check is the reason this is not simply the inverse of {@link TrafficPolicyService.deactivate}. See the
   * class comment: the world a reinstated policy returns to is not the one it left.
   */
  async reactivate(tenantId: TenantId, id: Uuid): Promise<TrafficPolicy> {
    const policy = await this.require(tenantId, id);
    if (isTrafficPolicyActive(policy)) return policy;

    const next = reactivateTrafficPolicy(policy);
    await this.requireTupleFree(next);
    await this.repository.save(next);
    await this.emit(policyReactivated(next));
    return next;
  }

  // --- Reading ---------------------------------------------------------------------

  /** One policy, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<TrafficPolicy> {
    return this.require(tenantId, id);
  }

  /**
   * The candidate set the policy engine resolves over, for one institution.
   *
   * Deactivated policies are excluded by the read rather than skipped by the engine, so turning a policy off is
   * a fact about the record instead of a behaviour of whoever remembered to filter.
   */
  async listActive(tenantId: TenantId, organizationId: Uuid): Promise<readonly TrafficPolicy[]> {
    return this.repository.listActive(tenantId, organizationId);
  }

  /** Every policy in the tenant, those out of force included. */
  async list(tenantId: TenantId): Promise<readonly TrafficPolicy[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The policy under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<TrafficPolicy> {
    const policy = await this.repository.findById(tenantId, id);
    if (!policy) {
      throw new TrafficPolicyNotFoundError(id);
    }
    return policy;
  }

  /** The institution this policy protects, checked through the directory port. */
  private async requireOrganization(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForGatewayError(organizationId);
    }
  }

  /** When the policy names a consumer, that consumer is one the institution has registered. */
  private async requireSubject(policy: TrafficPolicy): Promise<void> {
    if (policy.consumerId === null) return;
    if (!(await this.consumers.findById(policy.tenantId, policy.consumerId))) {
      throw new ApiConsumerNotFoundError(policy.consumerId);
    }
  }

  /**
   * No other policy in force already holds this scope tuple.
   *
   * The subject named in the refusal is the tuple in the form an operator would recognise it, rather than the
   * row id of the policy that got there first — because the operator's next action is to find the existing
   * policy, and they will find it by looking for the consumer or the capability, not by looking up an id.
   */
  private async requireTupleFree(policy: TrafficPolicy): Promise<void> {
    const holder = await this.repository.findByScopeTuple(
      policy.tenantId,
      policy.organizationId,
      policy.scope,
      policy.consumerId,
      policy.capabilityKey,
    );
    if (holder && holder.id !== policy.id && isTrafficPolicyActive(holder)) {
      throw new DuplicatePolicyScopeError(policy.scope, describeSubject(policy));
    }
  }

  /** Load, apply a pure change, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (policy: TrafficPolicy, ...args: TArgs) => TrafficPolicy,
    announce: (policy: TrafficPolicy) => DomainEvent,
    ...args: TArgs
  ): Promise<TrafficPolicy> {
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

/** The tuple in the form an operator would search for it, for the refusal that tells them one already exists. */
function describeSubject(policy: TrafficPolicy): string {
  if (policy.consumerId !== null && policy.capabilityKey !== null) {
    return `consumer "${policy.consumerId}" on capability "${policy.capabilityKey}"`;
  }
  if (policy.consumerId !== null) return `consumer "${policy.consumerId}"`;
  if (policy.capabilityKey !== null) return `capability "${policy.capabilityKey}"`;
  return "every request to this organization";
}
