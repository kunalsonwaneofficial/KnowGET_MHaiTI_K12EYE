import { createEvent } from "@knowget/events";
import type { DomainEvent, ISODateString, Uuid } from "@knowget/types";
import type { ApiConsumer } from "./api-consumer";
import { isApiConsumerActive } from "./api-consumer";
import type { ApiContract } from "./api-contract";
import { isApiContractServable } from "./api-contract";
import type { CapabilityRoute } from "./capability-route";
import { isCapabilityRouteActive } from "./capability-route";
import type {
  AuthScheme,
  CircuitPosture,
  ConsumerStatus,
  ContractStatus,
  ContractStyle,
  DeliveryMode,
  DeliveryOutcome,
  EndpointHealth,
  EndpointStatus,
  HttpMethod,
  IdempotencyState,
  IntegrationProtocol,
  PolicyScope,
  QuotaWindow,
  RouteStatus,
  SubscriptionStatus,
} from "./gateway-value";
import type { IdempotencyRecord } from "./idempotency-record";
import type { IntegrationEndpoint } from "./integration-endpoint";
import { isIntegrationEndpointCallable } from "./integration-endpoint";
import type { OutboundDelivery } from "./outbound-delivery";
import { isOutboundDeliverySettled } from "./outbound-delivery";
import type { TrafficPolicy } from "./traffic-policy";
import type { WebhookSubscription } from "./webhook-subscription";
import { isWebhookSubscriptionSending } from "./webhook-subscription";

/**
 * Domain events for the API gateway and integration fabric (P3-D01), on the `gateway.*` namespace.
 *
 * Payloads carry identifiers, registry keys, published paths, statuses, protocols, postures, outcomes and
 * counts. Four categories of field are held back, and each exclusion is the same clause of the contract read
 * in a different place.
 *
 * **No credential handle ever travels.** A consumer's `credentialRef`, an endpoint's `credentialRef` and a
 * subscription's `secretRef` are absent from every payload here, including from the rotation events whose whole
 * subject is that one of them changed. The aggregates are already careful to hold a handle rather than a
 * secret, and that care is worth nothing if the handle is then broadcast: a handle is an address in the custody
 * store, and an address published to every subscriber that ever registered is an invitation to go and ask. What
 * a rotation event carries is that a rotation happened and when, which is the entire content a compliance
 * subscriber needs and the entire content an attacker cannot use.
 *
 * **No internal target ever travels.** A route's `internalTarget` is the one field in this package that names
 * what actually answers a call, and the contract's standing instruction is to expose capabilities and never
 * implementation. A route event names the capability, the version, the method and the published path — the four
 * things an integrator already knows — and says nothing about what is behind them. An event carrying the target
 * would be the platform publishing its own service topology on a channel designed to be subscribed to widely.
 *
 * **No free text travels.** A consumer's `displayName` and `suspensionReason`, a contract's `title` and
 * `summary`, an endpoint's `disabledReason`, a delivery's `lastError` and `abandonedReason` all stay in the
 * tenant's records. Two of those are more than tidiness: a suspension reason is somebody's account of why an
 * integration was cut off, and a delivery error is a *third party's response body*, which the platform did not
 * write, cannot vouch for, and has repeatedly been handed a stack trace or a customer record inside.
 *
 * **No payload fingerprint travels.** Both the delivery aggregate and the idempotency ledger hold a digest of a
 * request or event body, and neither publishes it. A digest is not the body, but it is a perfect oracle for
 * guesses about the body, and the bodies in question here are frequently low-entropy: an enrolment payload with
 * eight fields is enumerable by anyone holding its digest and a weekend. Deliveries correlate on `eventId` and
 * idempotency records on their key, both of which are opaque and neither of which answers a guess.
 *
 * **Nothing here is a command, and nothing here fires on a read.** Every event is the past tense of a state
 * change somebody made or a delivery attempt the platform completed. An admission decision — the single highest
 * volume thing this package does — publishes nothing at all: a per-request event on the request path is a
 * metrics pipeline wearing a bus's clothes, and the platform already has metrics and audit contracts built for
 * that shape of traffic. What routes here is that a consumer's standing changed, not that it made a call.
 */

// --- API consumers ---------------------------------------------------------------
export const CONSUMER_REGISTERED = "gateway.consumer.registered";
export const CONSUMER_ACTIVATED = "gateway.consumer.activated";
export const CONSUMER_SUSPENDED = "gateway.consumer.suspended";
export const CONSUMER_RETIRED = "gateway.consumer.retired";
export const CONSUMER_CREDENTIAL_ROTATED = "gateway.consumer.credential-rotated";
export const CONSUMER_SCOPES_CHANGED = "gateway.consumer.scopes-changed";

export interface ApiConsumerEventPayload {
  readonly consumerId: Uuid;
  readonly organizationId: Uuid;
  readonly consumerKey: string;
  /** How the caller proves who it is. What a security subscriber routes a review question on. */
  readonly authScheme: AuthScheme;
  readonly status: ConsumerStatus;
  /**
   * How many scopes the consumer holds. The list itself is read within the tenant, deliberately.
   *
   * A count is enough to see an escalation — three became eleven is a question worth asking — and is not a
   * map of what an integration can reach, which is what the list would be on an open channel.
   */
  readonly scopeCount: number;
  /** The person accountable for the integration. Who a subscriber escalates to, and never a mailbox. */
  readonly ownerId: Uuid;
  readonly active: boolean;
  /** When the credential handle last changed. The rotation fact, without the handle. */
  readonly rotatedAt: ISODateString | null;
}

const consumerPayload = (consumer: ApiConsumer): ApiConsumerEventPayload => ({
  consumerId: consumer.id,
  organizationId: consumer.organizationId,
  consumerKey: consumer.consumerKey,
  authScheme: consumer.authScheme,
  status: consumer.status,
  scopeCount: consumer.grantedScopes.length,
  ownerId: consumer.ownerId,
  active: isApiConsumerActive(consumer),
  rotatedAt: consumer.rotatedAt,
});

export type ConsumerRegisteredEvent = DomainEvent<
  typeof CONSUMER_REGISTERED,
  ApiConsumerEventPayload
>;
export type ConsumerActivatedEvent = DomainEvent<
  typeof CONSUMER_ACTIVATED,
  ApiConsumerEventPayload
>;
export type ConsumerSuspendedEvent = DomainEvent<
  typeof CONSUMER_SUSPENDED,
  ApiConsumerEventPayload
>;
export type ConsumerRetiredEvent = DomainEvent<typeof CONSUMER_RETIRED, ApiConsumerEventPayload>;
export type ConsumerCredentialRotatedEvent = DomainEvent<
  typeof CONSUMER_CREDENTIAL_ROTATED,
  ApiConsumerEventPayload
>;
export type ConsumerScopesChangedEvent = DomainEvent<
  typeof CONSUMER_SCOPES_CHANGED,
  ApiConsumerEventPayload
>;

/** Registered, and holding nothing yet: a consumer is born unable to call anything. */
export const consumerRegistered = (consumer: ApiConsumer): ConsumerRegisteredEvent =>
  createEvent(CONSUMER_REGISTERED, consumerPayload(consumer), { tenantId: consumer.tenantId });

export const consumerActivated = (consumer: ApiConsumer): ConsumerActivatedEvent =>
  createEvent(CONSUMER_ACTIVATED, consumerPayload(consumer), { tenantId: consumer.tenantId });

/**
 * An integration was cut off. The reason stays on the record; that it happened does not.
 *
 * This is the event most worth subscribing to in the file. A suspension is the platform deciding that a system
 * somebody's daily work depends on stops working now, and the teams who will field those calls should hear it
 * from the bus rather than from the person whose enrolment sync just started failing.
 */
export const consumerSuspended = (consumer: ApiConsumer): ConsumerSuspendedEvent =>
  createEvent(CONSUMER_SUSPENDED, consumerPayload(consumer), { tenantId: consumer.tenantId });

export const consumerRetired = (consumer: ApiConsumer): ConsumerRetiredEvent =>
  createEvent(CONSUMER_RETIRED, consumerPayload(consumer), { tenantId: consumer.tenantId });

/** The credential behind the handle was replaced. The handle is not here, and that is the point. */
export const consumerCredentialRotated = (consumer: ApiConsumer): ConsumerCredentialRotatedEvent =>
  createEvent(CONSUMER_CREDENTIAL_ROTATED, consumerPayload(consumer), {
    tenantId: consumer.tenantId,
  });

/**
 * What the consumer may reach changed, in one direction or the other.
 *
 * One event for grants and revocations rather than two, because the only honest question a subscriber asks of
 * either is *what can this integration reach now*, and the answer is the same field in both cases. A
 * subscriber that reacts differently to a widening than to a narrowing is comparing counts across two events it
 * received anyway.
 */
export const consumerScopesChanged = (consumer: ApiConsumer): ConsumerScopesChangedEvent =>
  createEvent(CONSUMER_SCOPES_CHANGED, consumerPayload(consumer), { tenantId: consumer.tenantId });

// --- API contracts ---------------------------------------------------------------
export const CONTRACT_DEFINED = "gateway.contract.defined";
export const CONTRACT_PUBLISHED = "gateway.contract.published";
export const CONTRACT_DEPRECATED = "gateway.contract.deprecated";
export const CONTRACT_SUNSET = "gateway.contract.sunset";

export interface ApiContractEventPayload {
  readonly contractId: Uuid;
  readonly organizationId: Uuid;
  readonly capabilityKey: string;
  readonly contractVersion: string;
  readonly style: ContractStyle;
  readonly status: ContractStatus;
  /** Whether an integrator may still build against it — published, or on notice but still answering. */
  readonly servable: boolean;
  readonly deprecatedAt: ISODateString | null;
  /** When this version stops answering. The single field an integrator plans work around. */
  readonly sunsetAt: ISODateString | null;
  /** The version to move to, named with the deprecation so the notice is actionable. */
  readonly supersededByVersion: string | null;
}

const contractPayload = (contract: ApiContract): ApiContractEventPayload => ({
  contractId: contract.id,
  organizationId: contract.organizationId,
  capabilityKey: contract.capabilityKey,
  contractVersion: contract.contractVersion,
  style: contract.style,
  status: contract.status,
  servable: isApiContractServable(contract),
  deprecatedAt: contract.deprecatedAt,
  sunsetAt: contract.sunsetAt,
  supersededByVersion: contract.supersededByVersion,
});

export type ContractDefinedEvent = DomainEvent<typeof CONTRACT_DEFINED, ApiContractEventPayload>;
export type ContractPublishedEvent = DomainEvent<
  typeof CONTRACT_PUBLISHED,
  ApiContractEventPayload
>;
export type ContractDeprecatedEvent = DomainEvent<
  typeof CONTRACT_DEPRECATED,
  ApiContractEventPayload
>;
export type ContractSunsetEvent = DomainEvent<typeof CONTRACT_SUNSET, ApiContractEventPayload>;

/** Drafted. Nothing serves yet, and nobody should be told to integrate against it. */
export const contractDefined = (contract: ApiContract): ContractDefinedEvent =>
  createEvent(CONTRACT_DEFINED, contractPayload(contract), { tenantId: contract.tenantId });

export const contractPublished = (contract: ApiContract): ContractPublishedEvent =>
  createEvent(CONTRACT_PUBLISHED, contractPayload(contract), { tenantId: contract.tenantId });

/**
 * Notice was given, with a date attached.
 *
 * The event carries the sunset and the successor version rather than a notice period, because a subscriber
 * building a migration schedule needs the deadline and not the arithmetic that produced it — and because the
 * period is only meaningful against the announcement, which a subscriber may receive late.
 */
export const contractDeprecated = (contract: ApiContract): ContractDeprecatedEvent =>
  createEvent(CONTRACT_DEPRECATED, contractPayload(contract), { tenantId: contract.tenantId });

/** It has stopped answering. Terminal, and the last thing this contract will ever say. */
export const contractSunset = (contract: ApiContract): ContractSunsetEvent =>
  createEvent(CONTRACT_SUNSET, contractPayload(contract), { tenantId: contract.tenantId });

// --- Capability routes -----------------------------------------------------------
export const ROUTE_REGISTERED = "gateway.route.registered";
export const ROUTE_ACTIVATED = "gateway.route.activated";
export const ROUTE_RETIRED = "gateway.route.retired";

export interface CapabilityRouteEventPayload {
  readonly routeId: Uuid;
  readonly organizationId: Uuid;
  readonly contractId: Uuid;
  readonly capabilityKey: string;
  readonly contractVersion: string;
  readonly method: HttpMethod;
  /** The published template. Public by construction: an integrator cannot call what it cannot see. */
  readonly externalPath: string;
  readonly status: RouteStatus;
  /** The scope a caller must hold. Published for the same reason the path is. */
  readonly requiredScope: string;
  readonly idempotent: boolean;
  readonly active: boolean;
}

// `internalTarget` is absent and is the most important omission in this file. See the module comment.
const routePayload = (route: CapabilityRoute): CapabilityRouteEventPayload => ({
  routeId: route.id,
  organizationId: route.organizationId,
  contractId: route.contractId,
  capabilityKey: route.capabilityKey,
  contractVersion: route.contractVersion,
  method: route.method,
  externalPath: route.externalPath,
  status: route.status,
  requiredScope: route.requiredScope,
  idempotent: route.idempotent,
  active: isCapabilityRouteActive(route),
});

export type RouteRegisteredEvent = DomainEvent<
  typeof ROUTE_REGISTERED,
  CapabilityRouteEventPayload
>;
export type RouteActivatedEvent = DomainEvent<typeof ROUTE_ACTIVATED, CapabilityRouteEventPayload>;
export type RouteRetiredEvent = DomainEvent<typeof ROUTE_RETIRED, CapabilityRouteEventPayload>;

export const routeRegistered = (route: CapabilityRoute): RouteRegisteredEvent =>
  createEvent(ROUTE_REGISTERED, routePayload(route), { tenantId: route.tenantId });

/** The path is now answering. The one route event an integrator's tooling should act on. */
export const routeActivated = (route: CapabilityRoute): RouteActivatedEvent =>
  createEvent(ROUTE_ACTIVATED, routePayload(route), { tenantId: route.tenantId });

export const routeRetired = (route: CapabilityRoute): RouteRetiredEvent =>
  createEvent(ROUTE_RETIRED, routePayload(route), { tenantId: route.tenantId });

// --- Traffic policies ------------------------------------------------------------
export const POLICY_DEFINED = "gateway.policy.defined";
export const POLICY_REVISED = "gateway.policy.revised";
export const POLICY_DEACTIVATED = "gateway.policy.deactivated";
export const POLICY_REACTIVATED = "gateway.policy.reactivated";

export interface TrafficPolicyEventPayload {
  readonly policyId: Uuid;
  readonly organizationId: Uuid;
  readonly scope: PolicyScope;
  readonly consumerId: Uuid | null;
  readonly capabilityKey: string | null;
  readonly requestsPerWindow: number | null;
  readonly window: QuotaWindow | null;
  readonly burstAllowance: number | null;
  readonly maxPayloadBytes: number | null;
  readonly timeoutMs: number | null;
  readonly active: boolean;
}

const policyPayload = (policy: TrafficPolicy): TrafficPolicyEventPayload => ({
  policyId: policy.id,
  organizationId: policy.organizationId,
  scope: policy.scope,
  consumerId: policy.consumerId,
  capabilityKey: policy.capabilityKey,
  requestsPerWindow: policy.limits.requestsPerWindow,
  window: policy.limits.window,
  burstAllowance: policy.limits.burstAllowance,
  maxPayloadBytes: policy.limits.maxPayloadBytes,
  timeoutMs: policy.limits.timeoutMs,
  active: policy.active,
});

export type PolicyDefinedEvent = DomainEvent<typeof POLICY_DEFINED, TrafficPolicyEventPayload>;
export type PolicyRevisedEvent = DomainEvent<typeof POLICY_REVISED, TrafficPolicyEventPayload>;
export type PolicyDeactivatedEvent = DomainEvent<
  typeof POLICY_DEACTIVATED,
  TrafficPolicyEventPayload
>;
export type PolicyReactivatedEvent = DomainEvent<
  typeof POLICY_REACTIVATED,
  TrafficPolicyEventPayload
>;

export const policyDefined = (policy: TrafficPolicy): PolicyDefinedEvent =>
  createEvent(POLICY_DEFINED, policyPayload(policy), { tenantId: policy.tenantId });

/**
 * The limits changed, and the new ones travel in full.
 *
 * Flattened out of {@link TrafficPolicy.limits} rather than nested, because a subscriber reacting to a
 * tightened ceiling wants one field and not a shape, and because a flat payload survives a limit being added to
 * the policy later without every consumer of this event having to re-derive where it went.
 */
export const policyRevised = (policy: TrafficPolicy): PolicyRevisedEvent =>
  createEvent(POLICY_REVISED, policyPayload(policy), { tenantId: policy.tenantId });

/** It no longer applies. The policy is kept, because a limit somebody hit last month is evidence. */
export const policyDeactivated = (policy: TrafficPolicy): PolicyDeactivatedEvent =>
  createEvent(POLICY_DEACTIVATED, policyPayload(policy), { tenantId: policy.tenantId });

export const policyReactivated = (policy: TrafficPolicy): PolicyReactivatedEvent =>
  createEvent(POLICY_REACTIVATED, policyPayload(policy), { tenantId: policy.tenantId });

// --- Integration endpoints -------------------------------------------------------
export const ENDPOINT_REGISTERED = "gateway.endpoint.registered";
export const ENDPOINT_ACTIVATED = "gateway.endpoint.activated";
export const ENDPOINT_QUARANTINED = "gateway.endpoint.quarantined";
export const ENDPOINT_DISABLED = "gateway.endpoint.disabled";
export const ENDPOINT_RETIRED = "gateway.endpoint.retired";
export const ENDPOINT_CIRCUIT_OPENED = "gateway.endpoint.circuit-opened";
export const ENDPOINT_CIRCUIT_CLOSED = "gateway.endpoint.circuit-closed";

export interface IntegrationEndpointEventPayload {
  readonly endpointId: Uuid;
  readonly organizationId: Uuid;
  readonly endpointKey: string;
  readonly protocol: IntegrationProtocol;
  /** The adapter serving it. Names our implementation, never the vendor's address. */
  readonly adapterKey: string;
  readonly status: EndpointStatus;
  readonly health: EndpointHealth;
  readonly posture: CircuitPosture;
  readonly consecutiveFailures: number;
  /** Whether a call may be attempted right now — the composite of status, posture and health. */
  readonly callable: boolean;
  /** When the circuit last left `closed`. How long an outage has actually been running. */
  readonly circuitOpenedAt: ISODateString | null;
  readonly lastOutcomeAt: ISODateString | null;
}

const endpointPayload = (endpoint: IntegrationEndpoint): IntegrationEndpointEventPayload => ({
  endpointId: endpoint.id,
  organizationId: endpoint.organizationId,
  endpointKey: endpoint.endpointKey,
  protocol: endpoint.protocol,
  adapterKey: endpoint.adapterKey,
  status: endpoint.status,
  health: endpoint.health,
  posture: endpoint.posture,
  consecutiveFailures: endpoint.consecutiveFailures,
  callable: isIntegrationEndpointCallable(endpoint),
  circuitOpenedAt: endpoint.circuitOpenedAt,
  lastOutcomeAt: endpoint.lastOutcomeAt,
});

export type EndpointRegisteredEvent = DomainEvent<
  typeof ENDPOINT_REGISTERED,
  IntegrationEndpointEventPayload
>;
export type EndpointActivatedEvent = DomainEvent<
  typeof ENDPOINT_ACTIVATED,
  IntegrationEndpointEventPayload
>;
export type EndpointQuarantinedEvent = DomainEvent<
  typeof ENDPOINT_QUARANTINED,
  IntegrationEndpointEventPayload
>;
export type EndpointDisabledEvent = DomainEvent<
  typeof ENDPOINT_DISABLED,
  IntegrationEndpointEventPayload
>;
export type EndpointRetiredEvent = DomainEvent<
  typeof ENDPOINT_RETIRED,
  IntegrationEndpointEventPayload
>;
export type EndpointCircuitOpenedEvent = DomainEvent<
  typeof ENDPOINT_CIRCUIT_OPENED,
  IntegrationEndpointEventPayload
>;
export type EndpointCircuitClosedEvent = DomainEvent<
  typeof ENDPOINT_CIRCUIT_CLOSED,
  IntegrationEndpointEventPayload
>;

export const endpointRegistered = (endpoint: IntegrationEndpoint): EndpointRegisteredEvent =>
  createEvent(ENDPOINT_REGISTERED, endpointPayload(endpoint), { tenantId: endpoint.tenantId });

export const endpointActivated = (endpoint: IntegrationEndpoint): EndpointActivatedEvent =>
  createEvent(ENDPOINT_ACTIVATED, endpointPayload(endpoint), { tenantId: endpoint.tenantId });

/**
 * The platform has stopped calling a third party that has been failing long enough to have a problem.
 *
 * Distinct from an open circuit, and the distinction is the reason both events exist. A circuit opens and
 * closes on its own within minutes; a quarantine is a judgement that the failing has gone on long enough for a
 * person to be told, and nothing lifts it but a person. A subscriber paging somebody wants this one.
 */
export const endpointQuarantined = (endpoint: IntegrationEndpoint): EndpointQuarantinedEvent =>
  createEvent(ENDPOINT_QUARANTINED, endpointPayload(endpoint), { tenantId: endpoint.tenantId });

/** An operator took it out of service. The reason stays on the record. */
export const endpointDisabled = (endpoint: IntegrationEndpoint): EndpointDisabledEvent =>
  createEvent(ENDPOINT_DISABLED, endpointPayload(endpoint), { tenantId: endpoint.tenantId });

export const endpointRetired = (endpoint: IntegrationEndpoint): EndpointRetiredEvent =>
  createEvent(ENDPOINT_RETIRED, endpointPayload(endpoint), { tenantId: endpoint.tenantId });

/**
 * The breaker tripped: calls to this endpoint are being refused before they are attempted.
 *
 * Fired from the posture change rather than from each refused call, which is the difference between one event
 * and several thousand. Everything downstream that was going to fail is now failing faster, and a subscriber
 * watching integration health should hear the cause once rather than the symptom repeatedly.
 */
export const endpointCircuitOpened = (endpoint: IntegrationEndpoint): EndpointCircuitOpenedEvent =>
  createEvent(ENDPOINT_CIRCUIT_OPENED, endpointPayload(endpoint), { tenantId: endpoint.tenantId });

/** A probe succeeded and traffic is flowing again. The recovery half of the pair, and just as worth hearing. */
export const endpointCircuitClosed = (endpoint: IntegrationEndpoint): EndpointCircuitClosedEvent =>
  createEvent(ENDPOINT_CIRCUIT_CLOSED, endpointPayload(endpoint), { tenantId: endpoint.tenantId });

// --- Webhook subscriptions -------------------------------------------------------
export const SUBSCRIPTION_CREATED = "gateway.subscription.created";
export const SUBSCRIPTION_PAUSED = "gateway.subscription.paused";
export const SUBSCRIPTION_RESUMED = "gateway.subscription.resumed";
export const SUBSCRIPTION_SUSPENDED = "gateway.subscription.suspended";
export const SUBSCRIPTION_REVOKED = "gateway.subscription.revoked";

export interface WebhookSubscriptionEventPayload {
  readonly subscriptionId: Uuid;
  readonly organizationId: Uuid;
  readonly consumerId: Uuid;
  readonly subscriptionKey: string;
  readonly endpointId: Uuid;
  /** The event types subscribed to. This domain's own vocabulary, and what makes the record legible. */
  readonly eventTypes: readonly string[];
  readonly deliveryMode: DeliveryMode;
  readonly status: SubscriptionStatus;
  /** Whether payloads signed with a secret. The fact, never the handle. */
  readonly signed: boolean;
  readonly consecutiveFailures: number;
  /** Whether deliveries are actually being scheduled against it right now. */
  readonly sending: boolean;
  readonly lastSuccessAt: ISODateString | null;
}

const subscriptionPayload = (
  subscription: WebhookSubscription,
): WebhookSubscriptionEventPayload => ({
  subscriptionId: subscription.id,
  organizationId: subscription.organizationId,
  consumerId: subscription.consumerId,
  subscriptionKey: subscription.subscriptionKey,
  endpointId: subscription.endpointId,
  eventTypes: subscription.eventTypes,
  deliveryMode: subscription.deliveryMode,
  status: subscription.status,
  signed: subscription.secretRef !== null,
  consecutiveFailures: subscription.consecutiveFailures,
  sending: isWebhookSubscriptionSending(subscription),
  lastSuccessAt: subscription.lastSuccessAt,
});

export type SubscriptionCreatedEvent = DomainEvent<
  typeof SUBSCRIPTION_CREATED,
  WebhookSubscriptionEventPayload
>;
export type SubscriptionPausedEvent = DomainEvent<
  typeof SUBSCRIPTION_PAUSED,
  WebhookSubscriptionEventPayload
>;
export type SubscriptionResumedEvent = DomainEvent<
  typeof SUBSCRIPTION_RESUMED,
  WebhookSubscriptionEventPayload
>;
export type SubscriptionSuspendedEvent = DomainEvent<
  typeof SUBSCRIPTION_SUSPENDED,
  WebhookSubscriptionEventPayload
>;
export type SubscriptionRevokedEvent = DomainEvent<
  typeof SUBSCRIPTION_REVOKED,
  WebhookSubscriptionEventPayload
>;

export const subscriptionCreated = (subscription: WebhookSubscription): SubscriptionCreatedEvent =>
  createEvent(SUBSCRIPTION_CREATED, subscriptionPayload(subscription), {
    tenantId: subscription.tenantId,
  });

/** The consumer asked us to stop. Their decision, and reversible by them. */
export const subscriptionPaused = (subscription: WebhookSubscription): SubscriptionPausedEvent =>
  createEvent(SUBSCRIPTION_PAUSED, subscriptionPayload(subscription), {
    tenantId: subscription.tenantId,
  });

export const subscriptionResumed = (subscription: WebhookSubscription): SubscriptionResumedEvent =>
  createEvent(SUBSCRIPTION_RESUMED, subscriptionPayload(subscription), {
    tenantId: subscription.tenantId,
  });

/**
 * We stopped, because the consumer's receiver has been failing.
 *
 * The event a consumer most needs and is least able to receive, since the channel it would arrive on is the one
 * that just stopped. It is published anyway: the platform's own operators subscribe to it, and *your webhooks
 * were suspended at 04:12 after forty consecutive failures* is the difference between a support conversation
 * and an accusation.
 */
export const subscriptionSuspended = (
  subscription: WebhookSubscription,
): SubscriptionSuspendedEvent =>
  createEvent(SUBSCRIPTION_SUSPENDED, subscriptionPayload(subscription), {
    tenantId: subscription.tenantId,
  });

/** Terminal. Nothing will be delivered against this subscription again. */
export const subscriptionRevoked = (subscription: WebhookSubscription): SubscriptionRevokedEvent =>
  createEvent(SUBSCRIPTION_REVOKED, subscriptionPayload(subscription), {
    tenantId: subscription.tenantId,
  });

// --- Outbound deliveries ---------------------------------------------------------
export const DELIVERY_SCHEDULED = "gateway.delivery.scheduled";
export const DELIVERY_SUCCEEDED = "gateway.delivery.succeeded";
export const DELIVERY_FAILED = "gateway.delivery.failed";
export const DELIVERY_DEAD_LETTERED = "gateway.delivery.dead-lettered";
export const DELIVERY_ABANDONED = "gateway.delivery.abandoned";
export const DELIVERY_REPLAYED = "gateway.delivery.replayed";

export interface OutboundDeliveryEventPayload {
  readonly deliveryId: Uuid;
  readonly organizationId: Uuid;
  readonly subscriptionId: Uuid;
  readonly endpointId: Uuid;
  /** The event being delivered, in the platform's own namespace. */
  readonly eventType: string;
  /** The outbox record this carries. What several deliveries of one event correlate on. */
  readonly eventId: Uuid;
  readonly deliveryMode: DeliveryMode;
  readonly outcome: DeliveryOutcome;
  readonly attempts: number;
  /** What the receiver answered with, or `null` where it did not answer at all. */
  readonly lastStatusCode: number | null;
  readonly nextAttemptAt: ISODateString | null;
  readonly settled: boolean;
  /** The delivery this one replays, where it is a replay. */
  readonly replayOfDeliveryId: Uuid | null;
}

// `lastError` and `payloadFingerprint` are both absent — see the module comment. The status code travels
// because it is a number from a closed range that the receiver chose; the error string travels nowhere,
// because it is prose the receiver chose and we have no idea what is inside it.
const deliveryPayload = (delivery: OutboundDelivery): OutboundDeliveryEventPayload => ({
  deliveryId: delivery.id,
  organizationId: delivery.organizationId,
  subscriptionId: delivery.subscriptionId,
  endpointId: delivery.endpointId,
  eventType: delivery.eventType,
  eventId: delivery.eventId,
  deliveryMode: delivery.deliveryMode,
  outcome: delivery.outcome,
  attempts: delivery.attempts,
  lastStatusCode: delivery.lastStatusCode,
  nextAttemptAt: delivery.nextAttemptAt,
  settled: isOutboundDeliverySettled(delivery),
  replayOfDeliveryId: delivery.replayOfDeliveryId,
});

export type DeliveryScheduledEvent = DomainEvent<
  typeof DELIVERY_SCHEDULED,
  OutboundDeliveryEventPayload
>;
export type DeliverySucceededEvent = DomainEvent<
  typeof DELIVERY_SUCCEEDED,
  OutboundDeliveryEventPayload
>;
export type DeliveryFailedEvent = DomainEvent<typeof DELIVERY_FAILED, OutboundDeliveryEventPayload>;
export type DeliveryDeadLetteredEvent = DomainEvent<
  typeof DELIVERY_DEAD_LETTERED,
  OutboundDeliveryEventPayload
>;
export type DeliveryAbandonedEvent = DomainEvent<
  typeof DELIVERY_ABANDONED,
  OutboundDeliveryEventPayload
>;
export type DeliveryReplayedEvent = DomainEvent<
  typeof DELIVERY_REPLAYED,
  OutboundDeliveryEventPayload
>;

export const deliveryScheduled = (delivery: OutboundDelivery): DeliveryScheduledEvent =>
  createEvent(DELIVERY_SCHEDULED, deliveryPayload(delivery), { tenantId: delivery.tenantId });

export const deliverySucceeded = (delivery: OutboundDelivery): DeliverySucceededEvent =>
  createEvent(DELIVERY_SUCCEEDED, deliveryPayload(delivery), { tenantId: delivery.tenantId });

/**
 * An attempt failed and another is scheduled.
 *
 * Published on every retryable failure rather than only on the last one, because the shape of a failure over
 * time is the diagnosis: four attempts spread over an hour and four attempts inside a second are different
 * problems, and an event that only fires at the end cannot tell them apart.
 */
export const deliveryFailed = (delivery: OutboundDelivery): DeliveryFailedEvent =>
  createEvent(DELIVERY_FAILED, deliveryPayload(delivery), { tenantId: delivery.tenantId });

/** The attempts ran out. Somebody's system did not receive something the platform promised it. */
export const deliveryDeadLettered = (delivery: OutboundDelivery): DeliveryDeadLetteredEvent =>
  createEvent(DELIVERY_DEAD_LETTERED, deliveryPayload(delivery), { tenantId: delivery.tenantId });

/** An operator stopped it before the attempts ran out. A decision, not an outcome. */
export const deliveryAbandoned = (delivery: OutboundDelivery): DeliveryAbandonedEvent =>
  createEvent(DELIVERY_ABANDONED, deliveryPayload(delivery), { tenantId: delivery.tenantId });

/**
 * A settled delivery was sent again, as a new delivery that remembers the old one.
 *
 * The payload is the *replay's*, carrying `replayOfDeliveryId` back to the original, so a subscriber counting
 * deliveries never double-counts and one investigating can walk the chain in either direction.
 */
export const deliveryReplayed = (delivery: OutboundDelivery): DeliveryReplayedEvent =>
  createEvent(DELIVERY_REPLAYED, deliveryPayload(delivery), { tenantId: delivery.tenantId });

// --- Idempotency -----------------------------------------------------------------
export const IDEMPOTENCY_CONFLICT_DETECTED = "gateway.idempotency.conflict-detected";

export interface IdempotencyConflictEventPayload {
  readonly recordId: Uuid;
  readonly organizationId: Uuid;
  readonly consumerId: Uuid;
  readonly capabilityKey: string;
  readonly method: HttpMethod;
  /** Attempts made under a key already in flight. Where the state sat when the collision landed. */
  readonly state: IdempotencyState;
  readonly conflictedAt: ISODateString | null;
}

export type IdempotencyConflictDetectedEvent = DomainEvent<
  typeof IDEMPOTENCY_CONFLICT_DETECTED,
  IdempotencyConflictEventPayload
>;

/**
 * Two different requests arrived under one idempotency key.
 *
 * The only thing the ledger publishes, and it publishes it because it is always somebody's bug. A client
 * reusing a key across distinct payloads has a key-generation defect that will eventually reuse a key across
 * distinct *charges*, and the integration team should hear about it from the platform rather than from a
 * reconciliation three weeks later.
 *
 * Neither the key nor the fingerprint travels. The key is the caller's opaque token and the fingerprint is a
 * digest of their body; what a subscriber needs is which consumer, which capability, and how often — and the
 * record id for anyone entitled to go and look.
 */
export const idempotencyConflictDetected = (
  record: IdempotencyRecord,
): IdempotencyConflictDetectedEvent =>
  createEvent(
    IDEMPOTENCY_CONFLICT_DETECTED,
    {
      recordId: record.id,
      organizationId: record.organizationId,
      consumerId: record.consumerId,
      capabilityKey: record.capabilityKey,
      method: record.method,
      state: record.state,
      conflictedAt: record.conflictedAt,
    },
    { tenantId: record.tenantId },
  );
