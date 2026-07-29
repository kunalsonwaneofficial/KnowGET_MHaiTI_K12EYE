import { describe, expect, it } from "vitest";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import { registerApiConsumer } from "./api-consumer";
import { defineApiContract } from "./api-contract";
import { registerCapabilityRoute } from "./capability-route";
import {
  CONSUMER_ACTIVATED,
  CONSUMER_CREDENTIAL_ROTATED,
  CONSUMER_REGISTERED,
  CONSUMER_RETIRED,
  CONSUMER_SCOPES_CHANGED,
  CONSUMER_SUSPENDED,
  CONTRACT_DEFINED,
  CONTRACT_DEPRECATED,
  CONTRACT_PUBLISHED,
  CONTRACT_SUNSET,
  DELIVERY_ABANDONED,
  DELIVERY_DEAD_LETTERED,
  DELIVERY_FAILED,
  DELIVERY_REPLAYED,
  DELIVERY_SCHEDULED,
  DELIVERY_SUCCEEDED,
  ENDPOINT_ACTIVATED,
  ENDPOINT_CIRCUIT_CLOSED,
  ENDPOINT_CIRCUIT_OPENED,
  ENDPOINT_DISABLED,
  ENDPOINT_QUARANTINED,
  ENDPOINT_REGISTERED,
  ENDPOINT_RETIRED,
  IDEMPOTENCY_CONFLICT_DETECTED,
  POLICY_DEACTIVATED,
  POLICY_DEFINED,
  POLICY_REACTIVATED,
  POLICY_REVISED,
  ROUTE_ACTIVATED,
  ROUTE_REGISTERED,
  ROUTE_RETIRED,
  SUBSCRIPTION_CREATED,
  SUBSCRIPTION_PAUSED,
  SUBSCRIPTION_RESUMED,
  SUBSCRIPTION_REVOKED,
  SUBSCRIPTION_SUSPENDED,
  consumerActivated,
  consumerCredentialRotated,
  consumerRegistered,
  consumerRetired,
  consumerScopesChanged,
  consumerSuspended,
  contractDefined,
  contractDeprecated,
  contractPublished,
  contractSunset,
  deliveryAbandoned,
  deliveryDeadLettered,
  deliveryFailed,
  deliveryReplayed,
  deliveryScheduled,
  deliverySucceeded,
  endpointActivated,
  endpointCircuitClosed,
  endpointCircuitOpened,
  endpointDisabled,
  endpointQuarantined,
  endpointRegistered,
  endpointRetired,
  idempotencyConflictDetected,
  policyDeactivated,
  policyDefined,
  policyReactivated,
  policyRevised,
  routeActivated,
  routeRegistered,
  routeRetired,
  subscriptionCreated,
  subscriptionPaused,
  subscriptionResumed,
  subscriptionRevoked,
  subscriptionSuspended,
} from "./gateway-events";
import { beginIdempotentOperation, markIdempotencyConflict } from "./idempotency-record";
import { registerIntegrationEndpoint } from "./integration-endpoint";
import { scheduleOutboundDelivery } from "./outbound-delivery";
import { defineTrafficPolicy } from "./traffic-policy";
import { createWebhookSubscription } from "./webhook-subscription";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const OWNER = "person-1" as Uuid;
const REGISTRAR = "person-2" as Uuid;
const CONTRACT = "contract-1" as Uuid;
const CONSUMER = "consumer-1" as Uuid;
const ENDPOINT = "endpoint-1" as Uuid;
const SUBSCRIPTION = "subscription-1" as Uuid;
const EVENT = "event-1" as Uuid;
const AT = "2026-07-17T10:00:00.000Z" as ISODateString;

const CREDENTIAL_REF = "vault:gateway/district-reporting-bridge";
const SECRET_REF = "vault:webhooks/enrolments";
const INTERNAL_TARGET = "admissions.application.submit";
const DISPLAY_NAME = "District Reporting Bridge";
const FINGERPRINT = "sha256:9f2c1b903a444e219c778a1d6e0b42f3";

const consumer = registerApiConsumer({
  tenantId: TENANT,
  organizationId: ORG,
  consumerKey: "district.reporting-bridge",
  displayName: DISPLAY_NAME,
  authScheme: "oauth2_client_credentials",
  credentialRef: CREDENTIAL_REF,
  grantedScopes: ["admissions.applications.read"],
  ownerId: OWNER,
  registeredBy: REGISTRAR,
});

const contract = defineApiContract({
  tenantId: TENANT,
  organizationId: ORG,
  capabilityKey: "admissions.applications",
  contractVersion: "v2",
  title: "Admissions Applications",
  summary: "Submit and track applications for a published admissions cycle.",
  specificationRef: "spec://openapi/admissions.applications/v2",
});

const route = registerCapabilityRoute({
  tenantId: TENANT,
  organizationId: ORG,
  contractId: CONTRACT,
  capabilityKey: "admissions.applications",
  contractVersion: "v2",
  method: "POST",
  externalPath: "/v2/admissions/applications",
  style: "rest",
  requiredScope: "admissions.write",
  internalTarget: INTERNAL_TARGET,
  idempotencyGuarded: true,
});

const policy = defineTrafficPolicy({
  tenantId: TENANT,
  organizationId: ORG,
  scope: "global",
  consumerId: null,
  capabilityKey: null,
  displayName: "Platform default",
  limits: {
    requestsPerWindow: 100,
    window: "minute",
    burstAllowance: 150,
    maxPayloadBytes: 1_048_576,
    timeoutMs: 30_000,
  },
});

const endpoint = registerIntegrationEndpoint({
  tenantId: TENANT,
  organizationId: ORG,
  endpointKey: "finance.payment-gateway",
  displayName: "Payment gateway",
  protocol: "https",
  adapterKey: "payments.hosted-checkout",
  credentialRef: CREDENTIAL_REF,
});

const subscription = createWebhookSubscription({
  tenantId: TENANT,
  organizationId: ORG,
  consumerId: CONSUMER,
  subscriptionKey: "enrolments",
  displayName: "Enrolment feed",
  endpointId: ENDPOINT,
  eventTypes: ["admissions.application.submitted"],
  secretRef: SECRET_REF,
});

const delivery = scheduleOutboundDelivery({
  tenantId: TENANT,
  organizationId: ORG,
  subscriptionId: SUBSCRIPTION,
  endpointId: ENDPOINT,
  eventType: "admissions.application.submitted",
  eventId: EVENT,
  payloadFingerprint: FINGERPRINT,
  deliveryMode: "at_least_once",
});

const record = markIdempotencyConflict(
  beginIdempotentOperation({
    tenantId: TENANT,
    organizationId: ORG,
    consumerId: CONSUMER,
    idempotencyKey: "6b1f8a90-4c2d-4e77-9a13-5d0e8f2b7c46",
    capabilityKey: "admissions.applications",
    method: "POST",
    payloadFingerprint: FINGERPRINT,
    asOf: AT,
  }),
  AT,
);

const DECLARED = [
  CONSUMER_REGISTERED,
  CONSUMER_ACTIVATED,
  CONSUMER_SUSPENDED,
  CONSUMER_RETIRED,
  CONSUMER_CREDENTIAL_ROTATED,
  CONSUMER_SCOPES_CHANGED,
  CONTRACT_DEFINED,
  CONTRACT_PUBLISHED,
  CONTRACT_DEPRECATED,
  CONTRACT_SUNSET,
  ROUTE_REGISTERED,
  ROUTE_ACTIVATED,
  ROUTE_RETIRED,
  POLICY_DEFINED,
  POLICY_REVISED,
  POLICY_DEACTIVATED,
  POLICY_REACTIVATED,
  ENDPOINT_REGISTERED,
  ENDPOINT_ACTIVATED,
  ENDPOINT_QUARANTINED,
  ENDPOINT_DISABLED,
  ENDPOINT_RETIRED,
  ENDPOINT_CIRCUIT_OPENED,
  ENDPOINT_CIRCUIT_CLOSED,
  SUBSCRIPTION_CREATED,
  SUBSCRIPTION_PAUSED,
  SUBSCRIPTION_RESUMED,
  SUBSCRIPTION_SUSPENDED,
  SUBSCRIPTION_REVOKED,
  DELIVERY_SCHEDULED,
  DELIVERY_SUCCEEDED,
  DELIVERY_FAILED,
  DELIVERY_DEAD_LETTERED,
  DELIVERY_ABANDONED,
  DELIVERY_REPLAYED,
  IDEMPOTENCY_CONFLICT_DETECTED,
];

const everyEvent = (): readonly DomainEvent[] => [
  consumerRegistered(consumer),
  consumerActivated(consumer),
  consumerSuspended(consumer),
  consumerRetired(consumer),
  consumerCredentialRotated(consumer),
  consumerScopesChanged(consumer),
  contractDefined(contract),
  contractPublished(contract),
  contractDeprecated(contract),
  contractSunset(contract),
  routeRegistered(route),
  routeActivated(route),
  routeRetired(route),
  policyDefined(policy),
  policyRevised(policy),
  policyDeactivated(policy),
  policyReactivated(policy),
  endpointRegistered(endpoint),
  endpointActivated(endpoint),
  endpointQuarantined(endpoint),
  endpointDisabled(endpoint),
  endpointRetired(endpoint),
  endpointCircuitOpened(endpoint),
  endpointCircuitClosed(endpoint),
  subscriptionCreated(subscription),
  subscriptionPaused(subscription),
  subscriptionResumed(subscription),
  subscriptionSuspended(subscription),
  subscriptionRevoked(subscription),
  deliveryScheduled(delivery),
  deliverySucceeded(delivery),
  deliveryFailed(delivery),
  deliveryDeadLettered(delivery),
  deliveryAbandoned(delivery),
  deliveryReplayed(delivery),
  idempotencyConflictDetected(record),
];

describe("what the gateway will not put on a bus", () => {
  it("broadcasts no credential handle, from any aggregate that holds one", () => {
    for (const event of everyEvent()) {
      expect(event.payload).not.toHaveProperty("credentialRef");
      expect(event.payload).not.toHaveProperty("secretRef");
      expect(JSON.stringify(event.payload)).not.toContain(CREDENTIAL_REF);
      expect(JSON.stringify(event.payload)).not.toContain(SECRET_REF);
    }
  });

  it("says a subscription is signed without saying what it is signed with", () => {
    const event = subscriptionCreated(subscription);

    expect(event.payload.signed).toBe(true);
    expect(JSON.stringify(event.payload)).not.toContain(SECRET_REF);
  });

  it("broadcasts no internal target, which is the whole of what a route hides", () => {
    for (const event of [routeRegistered(route), routeActivated(route), routeRetired(route)]) {
      expect(event.payload).not.toHaveProperty("internalTarget");
      expect(JSON.stringify(event.payload)).not.toContain(INTERNAL_TARGET);
    }
  });

  it("broadcasts the published path, because an integrator already has it", () => {
    expect(routeActivated(route).payload.externalPath).toBe("/v2/admissions/applications");
    expect(routeActivated(route).payload.requiredScope).toBe("admissions.write");
  });

  it("broadcasts no free text anybody typed into a form", () => {
    for (const event of everyEvent()) {
      expect(event.payload).not.toHaveProperty("displayName");
      expect(event.payload).not.toHaveProperty("title");
      expect(event.payload).not.toHaveProperty("summary");
      expect(event.payload).not.toHaveProperty("suspensionReason");
      expect(event.payload).not.toHaveProperty("disabledReason");
      expect(event.payload).not.toHaveProperty("abandonedReason");
      expect(JSON.stringify(event.payload)).not.toContain(DISPLAY_NAME);
    }
  });

  it("broadcasts no third party's own words back into the platform", () => {
    for (const event of everyEvent()) {
      expect(event.payload).not.toHaveProperty("lastError");
    }
  });

  it("broadcasts no digest of anybody's body, from the ledger or from a delivery", () => {
    for (const event of everyEvent()) {
      expect(event.payload).not.toHaveProperty("payloadFingerprint");
      expect(JSON.stringify(event.payload)).not.toContain(FINGERPRINT);
    }
  });

  it("broadcasts no idempotency key, which is the caller's token and not ours to repeat", () => {
    const event = idempotencyConflictDetected(record);

    expect(event.payload).not.toHaveProperty("idempotencyKey");
    expect(JSON.stringify(event.payload)).not.toContain(record.idempotencyKey);
  });

  it("counts a consumer's scopes rather than listing what it can reach", () => {
    const event = consumerScopesChanged(consumer);

    expect(event.payload.scopeCount).toBe(1);
    expect(event.payload).not.toHaveProperty("grantedScopes");
  });
});

describe("what every gateway event carries", () => {
  it("scopes every event to the tenant it happened in", () => {
    for (const event of everyEvent()) {
      expect(event.metadata.tenantId).toBe(TENANT);
    }
  });

  it("names every event under the gateway namespace", () => {
    for (const event of everyEvent()) {
      expect(event.type).toMatch(/^gateway\.[a-z]+\.[a-z-]+$/);
    }
  });

  it("names the organization on every event, because a group runs more than one", () => {
    for (const event of everyEvent()) {
      expect(event.payload).toHaveProperty("organizationId", ORG);
    }
  });

  it("mints a distinct event id for every broadcast", () => {
    const events = everyEvent();
    const ids = new Set(events.map((event) => event.metadata.eventId));

    expect(ids.size).toBe(events.length);
  });

  it("produces every event this contract declares, and no other", () => {
    const produced = new Set(everyEvent().map((event) => event.type));

    expect(produced).toEqual(new Set(DECLARED));
    expect(DECLARED.length).toBe(new Set(DECLARED).size);
  });

  it("declares nothing that reads like an instruction to do something", () => {
    for (const type of DECLARED) {
      expect(type).not.toMatch(/^gateway\.[a-z]+\.(send|call|deploy|invoke|retry|execute)$/);
    }
  });

  it("publishes nothing at all for an admitted call", () => {
    for (const type of DECLARED) {
      expect(type).not.toMatch(/request|admitted|throttled|denied/);
    }
  });
});

describe("the facts a subscriber acts on", () => {
  it("reports a consumer's standing and who is accountable for it", () => {
    const event = consumerRegistered(consumer);

    expect(event.payload.consumerKey).toBe("district.reporting-bridge");
    expect(event.payload.authScheme).toBe("oauth2_client_credentials");
    expect(event.payload.status).toBe("registered");
    expect(event.payload.active).toBe(false);
    expect(event.payload.ownerId).toBe(OWNER);
  });

  it("reports a rotation as a moment, with no handle attached", () => {
    expect(consumerCredentialRotated(consumer).payload.rotatedAt).toBeNull();
  });

  it("reports a contract by the identity an integrator pins to", () => {
    const event = contractDefined(contract);

    expect(event.payload.capabilityKey).toBe("admissions.applications");
    expect(event.payload.contractVersion).toBe("v2");
    expect(event.payload.style).toBe("rest");
    expect(event.payload.status).toBe("draft");
    expect(event.payload.servable).toBe(false);
    expect(event.payload.sunsetAt).toBeNull();
    expect(event.payload.supersededByVersion).toBeNull();
  });

  it("reports a route as draft until somebody activates it", () => {
    const event = routeRegistered(route);

    expect(event.payload.status).toBe("draft");
    expect(event.payload.active).toBe(false);
    expect(event.payload.method).toBe("POST");
    expect(event.payload.idempotent).toBe(true);
  });

  it("flattens a policy's limits, so one field answers one question", () => {
    const event = policyRevised(policy);

    expect(event.payload.scope).toBe("global");
    expect(event.payload.requestsPerWindow).toBe(100);
    expect(event.payload.window).toBe("minute");
    expect(event.payload.burstAllowance).toBe(150);
    expect(event.payload.maxPayloadBytes).toBe(1_048_576);
    expect(event.payload.timeoutMs).toBe(30_000);
    expect(event.payload).not.toHaveProperty("limits");
  });

  it("reports an endpoint's posture and whether anything may be attempted against it", () => {
    const event = endpointRegistered(endpoint);

    expect(event.payload.endpointKey).toBe("finance.payment-gateway");
    expect(event.payload.protocol).toBe("https");
    expect(event.payload.adapterKey).toBe("payments.hosted-checkout");
    expect(event.payload.posture).toBe("closed");
    expect(event.payload.consecutiveFailures).toBe(0);
    expect(event.payload.callable).toBe(false);
    expect(event.payload.circuitOpenedAt).toBeNull();
  });

  it("reports what a subscription is subscribed to, which is our vocabulary and not a body", () => {
    const event = subscriptionCreated(subscription);

    expect(event.payload.eventTypes).toEqual(["admissions.application.submitted"]);
    expect(event.payload.deliveryMode).toBe("at_least_once");
    expect(event.payload.sending).toBe(true);
    expect(event.payload.consecutiveFailures).toBe(0);
  });

  it("reports a delivery by the outbox record several attempts share", () => {
    const event = deliveryScheduled(delivery);

    expect(event.payload.eventId).toBe(EVENT);
    expect(event.payload.eventType).toBe("admissions.application.submitted");
    expect(event.payload.subscriptionId).toBe(SUBSCRIPTION);
    expect(event.payload.attempts).toBe(0);
    expect(event.payload.settled).toBe(false);
    expect(event.payload.replayOfDeliveryId).toBeNull();
  });

  it("reports the status a receiver gave, which is a number from a closed range", () => {
    expect(deliveryScheduled(delivery).payload.lastStatusCode).toBeNull();
  });

  it("reports a collision by consumer and capability, which is who has the defect", () => {
    const event = idempotencyConflictDetected(record);

    expect(event.payload.consumerId).toBe(CONSUMER);
    expect(event.payload.capabilityKey).toBe("admissions.applications");
    expect(event.payload.method).toBe("POST");
    expect(event.payload.state).toBe("conflicted");
    expect(event.payload.conflictedAt).toBe(AT);
  });
});
