import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { isApiConsumerActive, type ApiConsumer } from "./api-consumer";
import { isApiContractDeprecated, isApiContractServable, type ApiContract } from "./api-contract";
import { isCapabilityRouteActive, type CapabilityRoute } from "./capability-route";
import type { HttpMethod, IntegrationProtocol, PolicyScope } from "./gateway-value";
import { isIdempotencyRecordExpired, type IdempotencyRecord } from "./idempotency-record";
import { isIntegrationEndpointCallable, type IntegrationEndpoint } from "./integration-endpoint";
import {
  isOutboundDeliveryDue,
  isOutboundDeliverySettled,
  type OutboundDelivery,
} from "./outbound-delivery";
import { isTrafficPolicyActive, type TrafficPolicy } from "./traffic-policy";
import {
  isSubscriptionInterestedIn,
  isWebhookSubscriptionSending,
  type WebhookSubscription,
} from "./webhook-subscription";

/**
 * The storage and directory contracts the integration fabric depends on, and nothing more.
 *
 * Every method takes the tenant explicitly and every read filters on it, on top of the row-level security the
 * adapters run under. Two independent barriers is the platform's standing position: RLS is the one that cannot
 * be forgotten, and the explicit argument is the one that shows up in a code review.
 *
 * Nothing here reaches beyond this domain's own records except the directories, which are read models rather
 * than dependencies — this domain never imports another domain package.
 *
 * **This package sends nothing, and there is no port through which it could.** There is no HTTP client, no
 * dispatcher, no transport of any kind. The fabric decides what a caller is allowed to do, which delivery is
 * due, and how long to wait before the next attempt; the machinery that actually opens a socket belongs to the
 * job runner, and the runtime retry, timeout and breaker behaviour around that socket belongs to the
 * reliability contracts. A `send` here would put a network call inside a package whose entire value is that it
 * is decidable without one — every rule in it could then be true only on a machine that could reach the
 * internet, and the tests that prove those rules would be integration tests wearing unit tests' clothes.
 *
 * **No handle is ever resolved here, and there is no directory that could resolve one.** A `credentialRef` and
 * a `secretRef` are addresses in the custody store, and this package holds them, copies them, and passes them
 * around without once asking what they point at. A directory answering *is this handle live* would be an oracle
 * that confirms which vault entries exist to anybody who can call it, and would give the fabric a second
 * opinion about custody that the institution would discover had drifted as a leak rather than as an error.
 *
 * **Counting is somebody else's.** Nothing here stores a request tally, a window position or a breaker state
 * machine. The quota engine is handed a count and returns a verdict; the circuit engine is handed a window of
 * outcomes and returns a posture. Where those numbers come from is the security contract's problem, and a
 * counter port in this file would be the beginning of a second one.
 *
 * **Almost nothing is removable.** No repository below offers a `remove` except the idempotency ledger, and
 * that single exception is explained where it appears. A retired consumer is the record that an integration
 * once had reach into the institution, which is the first thing anybody wants during an incident review. A
 * sunset contract is how the platform can still say what `v1` meant to the integrator who is asking why their
 * code stopped working. A retired route is the answer to *did this address ever exist*. A dead-lettered
 * delivery is evidence that the institution tried and a third party did not answer, and a store where those
 * quietly disappear reports a delivery rate the institution does not have. Every aggregate here has a way out
 * that leaves the history intact — retired, sunset, revoked, disabled, dead-lettered, abandoned — which is what
 * a `remove` would otherwise be reached for.
 */

// --- Directories -----------------------------------------------------------------

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the tenant?
 *
 * Every consumer, contract, route, policy, endpoint, subscription, delivery and ledger row hangs off one.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the person domain (P2-D01-M02): does this person exist in the tenant?
 *
 * Checked wherever this contract names somebody — who owns an integration, who registered it, who published a
 * contract version. An owner is the one field on a consumer that may never be null, on the grounds that every
 * integration reaching into an institution is somebody's responsibility; an owner identifier that resolves to
 * nobody satisfies the field and defeats the reason for it, and is discovered at the worst possible moment,
 * which is when somebody is trying to find out who authorised the thing that is currently misbehaving.
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/**
 * Read model over the platform's published scope catalogue: is this a scope the platform actually defines?
 *
 * Asked of every scope granted to a consumer and of every scope a route requires, and the two failures it
 * catches point in opposite directions. A grant naming a scope that does not exist is a permission that can
 * never be satisfied, so the integration fails on its first call for a reason that reads like an outage. A
 * route requiring a scope that does not exist is worse and quieter: it is an address the platform publishes
 * and no caller can ever hold the credential for, so it is not refused loudly, it simply never works for
 * anyone, and the failure looks like every other authorization failure in the log.
 *
 * The catalogue is the identity domain's, and stays there. This package asks whether a string is a scope; it
 * never asks what a scope permits, and could not act on the answer if it were told.
 */
export interface ScopeCatalogue {
  exists(tenantId: TenantId, scope: string): Promise<boolean>;
}

/**
 * Read model over the platform's internal capability surface: does this target resolve to something that
 * answers?
 *
 * This is the directory that keeps *expose capabilities, never implementation* from being a slogan. A route's
 * `internalTarget` is the one field the fabric holds and never discloses, and precisely because nobody outside
 * sees it, nobody outside will notice it is wrong. Checking it at registration puts the cost on whoever is
 * publishing the route, who still has the correct target to hand; skipping the check moves that cost onto an
 * integrator who has pinned to a published contract, written code against it, and is now receiving a failure
 * they cannot see the cause of and cannot fix from their side.
 *
 * A target is a capability address rather than a URL, and the composition root decides what addressing means.
 * This package never dereferences one, and could not.
 */
export interface CapabilityTargetDirectory {
  resolves(tenantId: TenantId, internalTarget: string): Promise<boolean>;
}

/**
 * Read model over the adapter registry: is there an adapter by this key, and does it speak this protocol?
 *
 * Both halves are asked at once because either alone lets through the failure the other catches. An endpoint
 * naming an adapter that was never built fails on first use; an endpoint naming a real adapter under the wrong
 * protocol fails on first use too, and looks like a network problem rather than a configuration one. Registering
 * an endpoint is the moment somebody is thinking about the vendor and is in a position to correct it.
 *
 * Every third party the institution talks to sits behind an adapter, and this is the whole of what the fabric
 * knows about that. It never learns which vendor is on the other side, and swapping one for another is a change
 * to the adapter registry and a change to this endpoint's `adapterKey` — never a change to this package.
 */
export interface AdapterRegistry {
  supports(adapterKey: string, protocol: IntegrationProtocol): Promise<boolean>;
}

/**
 * Read model over the platform's published event catalogue: is this an event type something actually emits?
 *
 * A webhook subscription names the event types it wants and matches them exactly, with no wildcards. That
 * exactness is deliberate elsewhere in this package, and it has a cost that belongs here: a mistyped event type
 * is not a subscription that misbehaves, it is a subscription that is silently, permanently empty. Nothing is
 * refused, nothing errors, no delivery is dead-lettered — the consumer simply never hears about the thing they
 * asked for, and finds out weeks later when somebody notices a downstream system is stale.
 *
 * Checking at subscription time is the only moment the mistake is cheap, because it is the only moment anybody
 * is looking at the string.
 */
export interface EventTypeCatalogue {
  exists(eventType: string): Promise<boolean>;
}

// --- API consumers ---------------------------------------------------------------

/**
 * Storage contract for API consumers. Tenant-scoped (explicit argument + RLS). `findByKey` backs the
 * one-consumer-per-key rule, including against retired consumers, whose keys stay taken — a key that could be
 * reissued would let a new integration inherit the logs, quota history and grant trail of an old one.
 *
 * `listActive` is the set of integrations that can currently reach the institution, which is the answer to the
 * only question a security review actually asks about this table. It is a first-class read rather than a filter
 * somebody remembers to apply, because the version of that question a filter answers is *which integrations did
 * we mean to leave active*, and the two lists differ in exactly the interesting cases.
 *
 * `listByOwner` is what makes the never-null owner mean something. An integration is somebody's responsibility,
 * and the moment that matters most is when that somebody leaves: offboarding has to be able to ask what this
 * person was accountable for and get a list rather than a shrug. Without this read the ownership field is a
 * label nobody can act on.
 */
export interface ApiConsumerRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<ApiConsumer | null>;
  findByKey(tenantId: TenantId, consumerKey: string): Promise<ApiConsumer | null>;
  listActive(tenantId: TenantId, organizationId: Uuid): Promise<ApiConsumer[]>;
  listByOwner(tenantId: TenantId, ownerId: Uuid): Promise<ApiConsumer[]>;
  listByTenant(tenantId: TenantId): Promise<ApiConsumer[]>;
  save(consumer: ApiConsumer): Promise<void>;
}

/** In-memory {@link ApiConsumerRepository} — the default for tests and bootstrap. */
export class InMemoryApiConsumerRepository implements ApiConsumerRepository {
  private readonly byId = new Map<string, ApiConsumer>();

  async findById(tenantId: TenantId, id: Uuid): Promise<ApiConsumer | null> {
    const consumer = this.byId.get(id);
    return consumer && consumer.tenantId === tenantId ? consumer : null;
  }

  async findByKey(tenantId: TenantId, consumerKey: string): Promise<ApiConsumer | null> {
    return (
      [...this.byId.values()].find(
        (c) => c.tenantId === tenantId && c.consumerKey === consumerKey,
      ) ?? null
    );
  }

  async listActive(tenantId: TenantId, organizationId: Uuid): Promise<ApiConsumer[]> {
    return [...this.byId.values()].filter(
      (c) =>
        c.tenantId === tenantId && c.organizationId === organizationId && isApiConsumerActive(c),
    );
  }

  async listByOwner(tenantId: TenantId, ownerId: Uuid): Promise<ApiConsumer[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId && c.ownerId === ownerId);
  }

  async listByTenant(tenantId: TenantId): Promise<ApiConsumer[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(consumer: ApiConsumer): Promise<void> {
    this.byId.set(consumer.id, consumer);
  }
}

// --- API contracts ---------------------------------------------------------------

/**
 * Storage contract for API contracts. Tenant-scoped (explicit argument + RLS).
 * `findByCapabilityAndVersion` backs the identity rule: a capability and a version name one contract, which is
 * the promise the word *pinning* makes to an integrator.
 *
 * `listByCapability` is the version history — every version of one capability, in the order they were defined.
 * It is what an integrator is shown when they ask what they should move to, and what an operator reads before
 * deprecating anything, because the answer to *is this version safe to sunset* is mostly about what else exists.
 *
 * `listServable` is what actually answers right now, which is a smaller set than what is published: a sunset
 * version is still a record and no longer a service. `listDeprecated` is the notice period made visible across
 * the whole estate rather than one capability at a time. A deprecation with a sunset date and no worklist is
 * not a notice, it is an intention, and the difference surfaces on the morning the date passes and something
 * nobody was tracking stops answering.
 */
export interface ApiContractRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<ApiContract | null>;
  findByCapabilityAndVersion(
    tenantId: TenantId,
    capabilityKey: string,
    contractVersion: string,
  ): Promise<ApiContract | null>;
  listByCapability(tenantId: TenantId, capabilityKey: string): Promise<ApiContract[]>;
  listServable(tenantId: TenantId, organizationId: Uuid): Promise<ApiContract[]>;
  listDeprecated(tenantId: TenantId, organizationId: Uuid): Promise<ApiContract[]>;
  listByTenant(tenantId: TenantId): Promise<ApiContract[]>;
  save(contract: ApiContract): Promise<void>;
}

/** In-memory {@link ApiContractRepository} — the default for tests and bootstrap. */
export class InMemoryApiContractRepository implements ApiContractRepository {
  private readonly byId = new Map<string, ApiContract>();

  async findById(tenantId: TenantId, id: Uuid): Promise<ApiContract | null> {
    const contract = this.byId.get(id);
    return contract && contract.tenantId === tenantId ? contract : null;
  }

  async findByCapabilityAndVersion(
    tenantId: TenantId,
    capabilityKey: string,
    contractVersion: string,
  ): Promise<ApiContract | null> {
    return (
      [...this.byId.values()].find(
        (c) =>
          c.tenantId === tenantId &&
          c.capabilityKey === capabilityKey &&
          c.contractVersion === contractVersion,
      ) ?? null
    );
  }

  async listByCapability(tenantId: TenantId, capabilityKey: string): Promise<ApiContract[]> {
    return [...this.byId.values()]
      .filter((c) => c.tenantId === tenantId && c.capabilityKey === capabilityKey)
      .sort((left, right) => (left.contractVersion < right.contractVersion ? -1 : 1));
  }

  async listServable(tenantId: TenantId, organizationId: Uuid): Promise<ApiContract[]> {
    return [...this.byId.values()].filter(
      (c) =>
        c.tenantId === tenantId && c.organizationId === organizationId && isApiContractServable(c),
    );
  }

  async listDeprecated(tenantId: TenantId, organizationId: Uuid): Promise<ApiContract[]> {
    return [...this.byId.values()].filter(
      (c) =>
        c.tenantId === tenantId &&
        c.organizationId === organizationId &&
        isApiContractDeprecated(c),
    );
  }

  async listByTenant(tenantId: TenantId): Promise<ApiContract[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(contract: ApiContract): Promise<void> {
    this.byId.set(contract.id, contract);
  }
}

// --- Capability routes -----------------------------------------------------------

/**
 * Storage contract for capability routes. Tenant-scoped (explicit argument + RLS).
 *
 * `findByMethodAndPath` backs the rule that one published address answers one way. Two active routes on the
 * same method and template is not a conflict the fabric can resolve — whichever it picked would be arbitrary,
 * and it would pick consistently enough that the second route would appear to work for months before an
 * ordering change somewhere unrelated swapped them.
 *
 * `listActive` is the routing table itself. It is the read the gateway is built around, and it is the one place
 * `internalTarget` is legitimately loaded in bulk, because resolving an address to something that answers is
 * the whole job.
 *
 * `listByContract` is what makes a contract's lifecycle enforceable. Sunsetting a version is a claim about
 * every address that version publishes, and a claim nobody can enumerate is a claim nobody can keep.
 */
export interface CapabilityRouteRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<CapabilityRoute | null>;
  findByMethodAndPath(
    tenantId: TenantId,
    method: HttpMethod,
    externalPath: string,
  ): Promise<CapabilityRoute | null>;
  listActive(tenantId: TenantId, organizationId: Uuid): Promise<CapabilityRoute[]>;
  listByContract(tenantId: TenantId, contractId: Uuid): Promise<CapabilityRoute[]>;
  listByTenant(tenantId: TenantId): Promise<CapabilityRoute[]>;
  save(route: CapabilityRoute): Promise<void>;
}

/** In-memory {@link CapabilityRouteRepository} — the default for tests and bootstrap. */
export class InMemoryCapabilityRouteRepository implements CapabilityRouteRepository {
  private readonly byId = new Map<string, CapabilityRoute>();

  async findById(tenantId: TenantId, id: Uuid): Promise<CapabilityRoute | null> {
    const route = this.byId.get(id);
    return route && route.tenantId === tenantId ? route : null;
  }

  async findByMethodAndPath(
    tenantId: TenantId,
    method: HttpMethod,
    externalPath: string,
  ): Promise<CapabilityRoute | null> {
    return (
      [...this.byId.values()].find(
        (r) => r.tenantId === tenantId && r.method === method && r.externalPath === externalPath,
      ) ?? null
    );
  }

  async listActive(tenantId: TenantId, organizationId: Uuid): Promise<CapabilityRoute[]> {
    return [...this.byId.values()].filter(
      (r) =>
        r.tenantId === tenantId &&
        r.organizationId === organizationId &&
        isCapabilityRouteActive(r),
    );
  }

  async listByContract(tenantId: TenantId, contractId: Uuid): Promise<CapabilityRoute[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.contractId === contractId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<CapabilityRoute[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(route: CapabilityRoute): Promise<void> {
    this.byId.set(route.id, route);
  }
}

// --- Traffic policies ------------------------------------------------------------

/**
 * Storage contract for traffic policies. Tenant-scoped (explicit argument + RLS).
 *
 * `findActiveByScopeTuple` backs the rule that one scope tuple carries one policy. The consumer and capability
 * arguments are nullable because two of the four scopes do not use them, and passing the whole tuple rather
 * than a discriminated pair keeps the uniqueness question in one shape: a global policy is the tuple with both
 * nulls, and it is unique for the same reason and by the same check as every other.
 *
 * The `Active` in the name is the load-bearing half. The rule is that one policy is *in force* on a tuple, not
 * that one row exists on it — deactivation releases a tuple, so a tuple legitimately accumulates a history of
 * policies that no longer apply. A lookup that returned any row on the tuple would therefore have to return one
 * of several, and whichever one it picked, the caller would be asking *is this tuple free* and getting an answer
 * about a row that stopped mattering months ago. Filtering here makes the read single-row by construction and
 * puts it in exact correspondence with the partial unique index on the tuple `WHERE active` that enforces the
 * same rule in the database, so the two cannot drift.
 *
 * `listActive` is the candidate set the policy engine resolves over. Resolution is a pure function of the
 * candidates and the request, so this read is the entirety of what selection needs — and because a deactivated
 * policy is excluded here rather than skipped there, turning a policy off is a fact about the record, not a
 * behaviour of whoever remembered to filter.
 *
 * There is no `listByConsumer`. It reads as the obvious way to answer *what limits apply to this integration*,
 * and it answers it wrongly: the policy that actually governs a consumer is very often a capability or global
 * one they are not named in. Selection is the only correct answer to that question, and a read shaped like a
 * shortcut to it would be believed.
 */
export interface TrafficPolicyRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<TrafficPolicy | null>;
  /** The policy *in force* on this tuple, if there is one. At most one can be, by the rule this read serves. */
  findActiveByScopeTuple(
    tenantId: TenantId,
    organizationId: Uuid,
    scope: PolicyScope,
    consumerId: Uuid | null,
    capabilityKey: string | null,
  ): Promise<TrafficPolicy | null>;
  listActive(tenantId: TenantId, organizationId: Uuid): Promise<TrafficPolicy[]>;
  listByTenant(tenantId: TenantId): Promise<TrafficPolicy[]>;
  save(policy: TrafficPolicy): Promise<void>;
}

/** In-memory {@link TrafficPolicyRepository} — the default for tests and bootstrap. */
export class InMemoryTrafficPolicyRepository implements TrafficPolicyRepository {
  private readonly byId = new Map<string, TrafficPolicy>();

  async findById(tenantId: TenantId, id: Uuid): Promise<TrafficPolicy | null> {
    const policy = this.byId.get(id);
    return policy && policy.tenantId === tenantId ? policy : null;
  }

  async findActiveByScopeTuple(
    tenantId: TenantId,
    organizationId: Uuid,
    scope: PolicyScope,
    consumerId: Uuid | null,
    capabilityKey: string | null,
  ): Promise<TrafficPolicy | null> {
    return (
      [...this.byId.values()].find(
        (p) =>
          p.tenantId === tenantId &&
          p.organizationId === organizationId &&
          p.scope === scope &&
          p.consumerId === consumerId &&
          p.capabilityKey === capabilityKey &&
          isTrafficPolicyActive(p),
      ) ?? null
    );
  }

  async listActive(tenantId: TenantId, organizationId: Uuid): Promise<TrafficPolicy[]> {
    return [...this.byId.values()].filter(
      (p) =>
        p.tenantId === tenantId && p.organizationId === organizationId && isTrafficPolicyActive(p),
    );
  }

  async listByTenant(tenantId: TenantId): Promise<TrafficPolicy[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(policy: TrafficPolicy): Promise<void> {
    this.byId.set(policy.id, policy);
  }
}

// --- Integration endpoints -------------------------------------------------------

/**
 * Storage contract for integration endpoints. Tenant-scoped (explicit argument + RLS). `findByKey` backs the
 * one-endpoint-per-key rule, and the key is what every delivery, log line and operator screen refers to.
 *
 * `listCallable` is what the fabric may currently attempt anything against. `listOpenCircuits` is the
 * quarantine sweep's input, and it is a separate read for a reason the aggregate is careful about: an open
 * circuit probes and re-opens, moving `postureSince` each time, so an endpoint that has been failing for six
 * hours looks a minute old to anything measuring from the posture. The sweep needs the endpoints whose circuit
 * has been open since some earlier moment, and then asks each one whether it has been open long enough — which
 * it answers from `circuitOpenedAt`, the stamp that survives the probe cycle.
 *
 * A circuit reopening on its own is an incident; an endpoint that has been failing since this morning is
 * somebody's task, and nothing turns the first into the second except this read running.
 */
export interface IntegrationEndpointRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<IntegrationEndpoint | null>;
  findByKey(tenantId: TenantId, endpointKey: string): Promise<IntegrationEndpoint | null>;
  listCallable(tenantId: TenantId, organizationId: Uuid): Promise<IntegrationEndpoint[]>;
  listOpenCircuits(tenantId: TenantId): Promise<IntegrationEndpoint[]>;
  listByTenant(tenantId: TenantId): Promise<IntegrationEndpoint[]>;
  save(endpoint: IntegrationEndpoint): Promise<void>;
}

/** In-memory {@link IntegrationEndpointRepository} — the default for tests and bootstrap. */
export class InMemoryIntegrationEndpointRepository implements IntegrationEndpointRepository {
  private readonly byId = new Map<string, IntegrationEndpoint>();

  async findById(tenantId: TenantId, id: Uuid): Promise<IntegrationEndpoint | null> {
    const endpoint = this.byId.get(id);
    return endpoint && endpoint.tenantId === tenantId ? endpoint : null;
  }

  async findByKey(tenantId: TenantId, endpointKey: string): Promise<IntegrationEndpoint | null> {
    return (
      [...this.byId.values()].find(
        (e) => e.tenantId === tenantId && e.endpointKey === endpointKey,
      ) ?? null
    );
  }

  async listCallable(tenantId: TenantId, organizationId: Uuid): Promise<IntegrationEndpoint[]> {
    return [...this.byId.values()].filter(
      (e) =>
        e.tenantId === tenantId &&
        e.organizationId === organizationId &&
        isIntegrationEndpointCallable(e),
    );
  }

  async listOpenCircuits(tenantId: TenantId): Promise<IntegrationEndpoint[]> {
    return [...this.byId.values()].filter(
      (e) => e.tenantId === tenantId && e.circuitOpenedAt !== null,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<IntegrationEndpoint[]> {
    return [...this.byId.values()].filter((e) => e.tenantId === tenantId);
  }

  async save(endpoint: IntegrationEndpoint): Promise<void> {
    this.byId.set(endpoint.id, endpoint);
  }
}

// --- Webhook subscriptions -------------------------------------------------------

/**
 * Storage contract for webhook subscriptions. Tenant-scoped (explicit argument + RLS). `findByKey` backs the
 * one-subscription-per-key-per-consumer rule; keys are unique within a consumer and never across the tenant,
 * because two consumers both calling their feed `enrolments` is the normal case and not a collision.
 *
 * `listInterestedIn` is the fan-out read, and it is the read that decides whether this fabric can carry an
 * institution's event traffic at all. It asks for the subscriptions that are both being sent to and subscribed
 * to a given type, so that publishing an event is a query rather than a scan of every subscription in the
 * tenant followed by a filter in application memory. The predicate that decides interest is pure and lives on
 * the aggregate; a real adapter pushes the same decision into SQL, and the two must agree.
 *
 * `listByEndpoint` is what makes disabling an endpoint an informed act. An endpoint is shared — several
 * subscriptions may point at one — and taking it out of service silently stops deliveries for all of them.
 * Whoever is disabling it should be told what they are about to stop.
 */
export interface WebhookSubscriptionRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<WebhookSubscription | null>;
  findByKey(
    tenantId: TenantId,
    consumerId: Uuid,
    subscriptionKey: string,
  ): Promise<WebhookSubscription | null>;
  listByConsumer(tenantId: TenantId, consumerId: Uuid): Promise<WebhookSubscription[]>;
  listByEndpoint(tenantId: TenantId, endpointId: Uuid): Promise<WebhookSubscription[]>;
  listInterestedIn(
    tenantId: TenantId,
    organizationId: Uuid,
    eventType: string,
  ): Promise<WebhookSubscription[]>;
  listByTenant(tenantId: TenantId): Promise<WebhookSubscription[]>;
  save(subscription: WebhookSubscription): Promise<void>;
}

/** In-memory {@link WebhookSubscriptionRepository} — the default for tests and bootstrap. */
export class InMemoryWebhookSubscriptionRepository implements WebhookSubscriptionRepository {
  private readonly byId = new Map<string, WebhookSubscription>();

  async findById(tenantId: TenantId, id: Uuid): Promise<WebhookSubscription | null> {
    const subscription = this.byId.get(id);
    return subscription && subscription.tenantId === tenantId ? subscription : null;
  }

  async findByKey(
    tenantId: TenantId,
    consumerId: Uuid,
    subscriptionKey: string,
  ): Promise<WebhookSubscription | null> {
    return (
      [...this.byId.values()].find(
        (s) =>
          s.tenantId === tenantId &&
          s.consumerId === consumerId &&
          s.subscriptionKey === subscriptionKey,
      ) ?? null
    );
  }

  async listByConsumer(tenantId: TenantId, consumerId: Uuid): Promise<WebhookSubscription[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.consumerId === consumerId,
    );
  }

  async listByEndpoint(tenantId: TenantId, endpointId: Uuid): Promise<WebhookSubscription[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.endpointId === endpointId,
    );
  }

  async listInterestedIn(
    tenantId: TenantId,
    organizationId: Uuid,
    eventType: string,
  ): Promise<WebhookSubscription[]> {
    return [...this.byId.values()].filter(
      (s) =>
        s.tenantId === tenantId &&
        s.organizationId === organizationId &&
        isWebhookSubscriptionSending(s) &&
        isSubscriptionInterestedIn(s, eventType),
    );
  }

  async listByTenant(tenantId: TenantId): Promise<WebhookSubscription[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(subscription: WebhookSubscription): Promise<void> {
    this.byId.set(subscription.id, subscription);
  }
}

// --- Outbound deliveries ---------------------------------------------------------

/**
 * Storage contract for outbound deliveries. Tenant-scoped (explicit argument + RLS).
 *
 * `listDue` is the dispatcher's worklist, and the `asOf` argument is the point of it. A sweep evaluates every
 * candidate against one instant, so a delivery scheduled for the boundary falls on one side of it for the whole
 * batch rather than on whichever side the clock happened to be on when its row came up.
 *
 * `findBySubscriptionAndEvent` is what keeps at-most-once meaning anything. One event reaching one subscription
 * twice is a second delivery record, and under a mode that promises the receiver will not see a duplicate, the
 * guarantee is decided here or it is not decided at all.
 *
 * `listDeadLettered` is the replay worklist. A dead letter is the platform's admission that it tried and could
 * not get through, and its whole value is that somebody can come back to it: replaying is a deliberate act with
 * a record, which is why a replay carries `replayOfDeliveryId` rather than resetting the original's counters.
 * A dead letter queue nobody can list is a deletion with extra steps.
 */
export interface OutboundDeliveryRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<OutboundDelivery | null>;
  findBySubscriptionAndEvent(
    tenantId: TenantId,
    subscriptionId: Uuid,
    eventId: Uuid,
  ): Promise<OutboundDelivery | null>;
  listDue(tenantId: TenantId, asOf: ISODateString): Promise<OutboundDelivery[]>;
  listBySubscription(tenantId: TenantId, subscriptionId: Uuid): Promise<OutboundDelivery[]>;
  listDeadLettered(tenantId: TenantId, organizationId: Uuid): Promise<OutboundDelivery[]>;
  listByTenant(tenantId: TenantId): Promise<OutboundDelivery[]>;
  save(delivery: OutboundDelivery): Promise<void>;
}

/** In-memory {@link OutboundDeliveryRepository} — the default for tests and bootstrap. */
export class InMemoryOutboundDeliveryRepository implements OutboundDeliveryRepository {
  private readonly byId = new Map<string, OutboundDelivery>();

  async findById(tenantId: TenantId, id: Uuid): Promise<OutboundDelivery | null> {
    const delivery = this.byId.get(id);
    return delivery && delivery.tenantId === tenantId ? delivery : null;
  }

  async findBySubscriptionAndEvent(
    tenantId: TenantId,
    subscriptionId: Uuid,
    eventId: Uuid,
  ): Promise<OutboundDelivery | null> {
    return (
      [...this.byId.values()].find(
        (d) =>
          d.tenantId === tenantId &&
          d.subscriptionId === subscriptionId &&
          d.eventId === eventId &&
          d.replayOfDeliveryId === null,
      ) ?? null
    );
  }

  async listDue(tenantId: TenantId, asOf: ISODateString): Promise<OutboundDelivery[]> {
    return [...this.byId.values()]
      .filter((d) => d.tenantId === tenantId && isOutboundDeliveryDue(d, asOf))
      .sort((left, right) => (left.createdAt < right.createdAt ? -1 : 1));
  }

  async listBySubscription(tenantId: TenantId, subscriptionId: Uuid): Promise<OutboundDelivery[]> {
    return [...this.byId.values()]
      .filter((d) => d.tenantId === tenantId && d.subscriptionId === subscriptionId)
      .sort((left, right) => (left.createdAt < right.createdAt ? -1 : 1));
  }

  async listDeadLettered(tenantId: TenantId, organizationId: Uuid): Promise<OutboundDelivery[]> {
    return [...this.byId.values()].filter(
      (d) =>
        d.tenantId === tenantId &&
        d.organizationId === organizationId &&
        d.outcome === "dead_lettered" &&
        isOutboundDeliverySettled(d),
    );
  }

  async listByTenant(tenantId: TenantId): Promise<OutboundDelivery[]> {
    return [...this.byId.values()].filter((d) => d.tenantId === tenantId);
  }

  async save(delivery: OutboundDelivery): Promise<void> {
    this.byId.set(delivery.id, delivery);
  }
}

// --- Idempotency ledger ----------------------------------------------------------

/**
 * Storage contract for the idempotency ledger. Tenant-scoped (explicit argument + RLS).
 *
 * `findByKey` is the read this whole aggregate exists for, and it is asked on the request path of every guarded
 * write in the platform. The key is unique within a consumer rather than within the tenant, because an
 * idempotency key is the caller's own token and two integrations both minting `1` is their business and not a
 * collision.
 *
 * **`purgeExpired` is the one removal in this file, and it is not an inconsistency.** Everything else here is a
 * record of something the institution did; a ledger row is a promise with a stated lifetime, which the row
 * stamps on itself at the moment it is created. Honouring a key forever is not a stronger guarantee, it is a
 * different and worse one — the table grows without bound, the lookup on the request path slows for every
 * caller, and the guarantee eventually degrades for everybody in order to keep a key from 2019 answerable. The
 * expiry is already public: the record carries `expiresAt`, the verdict distinguishes an expired lookup from an
 * empty one, and a caller whose retries outlive the window is told so. Deleting what has expired removes
 * nothing anybody was promised.
 *
 * It returns a count because a sweep that cannot say how much it removed is a sweep nobody can tell has stopped
 * working.
 *
 * There is no `listByTenant`, and its absence is the deliberate one. Every other repository here has that read
 * because every other table is small enough to hand to a human. This one takes a row per guarded write, and a
 * read that materialises the entire ledger is not a report, it is an outage waiting for the tenant that grows
 * large enough to trigger it. `listByConsumer` answers the question anybody actually has — what has this
 * integration been doing — and is bounded by something.
 */
export interface IdempotencyRecordRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<IdempotencyRecord | null>;
  findByKey(
    tenantId: TenantId,
    consumerId: Uuid,
    idempotencyKey: string,
  ): Promise<IdempotencyRecord | null>;
  listByConsumer(tenantId: TenantId, consumerId: Uuid): Promise<IdempotencyRecord[]>;
  purgeExpired(tenantId: TenantId, asOf: ISODateString): Promise<number>;
  save(record: IdempotencyRecord): Promise<void>;
}

/** In-memory {@link IdempotencyRecordRepository} — the default for tests and bootstrap. */
export class InMemoryIdempotencyRecordRepository implements IdempotencyRecordRepository {
  private readonly byId = new Map<string, IdempotencyRecord>();

  async findById(tenantId: TenantId, id: Uuid): Promise<IdempotencyRecord | null> {
    const record = this.byId.get(id);
    return record && record.tenantId === tenantId ? record : null;
  }

  async findByKey(
    tenantId: TenantId,
    consumerId: Uuid,
    idempotencyKey: string,
  ): Promise<IdempotencyRecord | null> {
    return (
      [...this.byId.values()].find(
        (r) =>
          r.tenantId === tenantId &&
          r.consumerId === consumerId &&
          r.idempotencyKey === idempotencyKey,
      ) ?? null
    );
  }

  async listByConsumer(tenantId: TenantId, consumerId: Uuid): Promise<IdempotencyRecord[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.consumerId === consumerId,
    );
  }

  async purgeExpired(tenantId: TenantId, asOf: ISODateString): Promise<number> {
    const expired = [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && isIdempotencyRecordExpired(r, asOf),
    );
    for (const record of expired) {
      this.byId.delete(record.id);
    }
    return expired.length;
  }

  async save(record: IdempotencyRecord): Promise<void> {
    this.byId.set(record.id, record);
  }
}
