import { describe, expect, it } from "vitest";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type ApiConsumer,
  activateApiConsumer,
  registerApiConsumer,
  retireApiConsumer,
} from "./api-consumer";
import {
  type ApiContract,
  defineApiContract,
  deprecateApiContract,
  publishApiContract,
  sunsetApiContract,
} from "./api-contract";
import {
  type CapabilityRoute,
  activateCapabilityRoute,
  registerCapabilityRoute,
} from "./capability-route";
import { inspectCircuit } from "./circuit";
import {
  type IdempotencyRecord,
  beginIdempotentOperation,
  completeIdempotentOperation,
} from "./idempotency-record";
import {
  type IntegrationEndpoint,
  activateIntegrationEndpoint,
  applyCircuitVerdict,
  disableIntegrationEndpoint,
  registerIntegrationEndpoint,
} from "./integration-endpoint";
import {
  type OutboundDelivery,
  recordDeliveryFailure,
  recordDeliverySuccess,
  scheduleOutboundDelivery,
} from "./outbound-delivery";
import {
  InMemoryApiConsumerRepository,
  InMemoryApiContractRepository,
  InMemoryCapabilityRouteRepository,
  InMemoryIdempotencyRecordRepository,
  InMemoryIntegrationEndpointRepository,
  InMemoryOutboundDeliveryRepository,
  InMemoryTrafficPolicyRepository,
  InMemoryWebhookSubscriptionRepository,
} from "./ports";
import { type TrafficPolicy, deactivateTrafficPolicy, defineTrafficPolicy } from "./traffic-policy";
import {
  type WebhookSubscription,
  createWebhookSubscription,
  pauseWebhookSubscription,
  revokeWebhookSubscription,
} from "./webhook-subscription";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org1" as Uuid;
const SIBLING = "org2" as Uuid;
const OWNER = "person-1" as Uuid;
const SECOND_OWNER = "person-2" as Uuid;
const PUBLISHER = "person-3" as Uuid;
const CONTRACT = "contract-1" as Uuid;
const SECOND_CONTRACT = "contract-2" as Uuid;
const CONSUMER = "consumer-1" as Uuid;
const SECOND_CONSUMER = "consumer-2" as Uuid;
const ENDPOINT = "endpoint-1" as Uuid;
const SECOND_ENDPOINT = "endpoint-2" as Uuid;
const SUBSCRIPTION = "subscription-1" as Uuid;
const EVENT = "event-1" as Uuid;
const SECOND_EVENT = "event-2" as Uuid;

const ANNOUNCED = "2026-01-01T00:00:00.000Z" as ISODateString;
const SUNSET = "2026-06-01T00:00:00.000Z" as ISODateString;
const AT = "2026-07-17T10:00:00.000Z" as ISODateString;
const FINGERPRINT = "sha256:9f2c1b903a444e219c778a1d6e0b42f3";
const SUBMITTED = "admissions.application.submitted";

const shift = (from: ISODateString, seconds: number): ISODateString =>
  new Date(Date.parse(from) + seconds * 1_000).toISOString() as ISODateString;

const consumerIn = (tenantId: TenantId, overrides: Partial<ApiConsumer> = {}): ApiConsumer => ({
  ...registerApiConsumer({
    tenantId,
    organizationId: ORG,
    consumerKey: "district.reporting-bridge",
    displayName: "District Reporting Bridge",
    authScheme: "oauth2_client_credentials",
    credentialRef: "vault:gateway/district-reporting-bridge",
    grantedScopes: ["admissions.applications.read"],
    ownerId: OWNER,
    registeredBy: OWNER,
  }),
  ...overrides,
});

const contractIn = (tenantId: TenantId, overrides: Partial<ApiContract> = {}): ApiContract => ({
  ...defineApiContract({
    tenantId,
    organizationId: ORG,
    capabilityKey: "admissions.applications",
    contractVersion: "v2",
    title: "Admissions Applications",
    summary: "Submit and track applications for a published admissions cycle.",
    specificationRef: "spec://openapi/admissions.applications/v2",
  }),
  ...overrides,
});

const routeIn = (
  tenantId: TenantId,
  overrides: Partial<CapabilityRoute> = {},
): CapabilityRoute => ({
  ...registerCapabilityRoute({
    tenantId,
    organizationId: ORG,
    contractId: CONTRACT,
    capabilityKey: "admissions.applications",
    contractVersion: "v2",
    method: "POST",
    externalPath: "/v2/admissions/applications",
    style: "rest",
    requiredScope: "admissions.write",
    internalTarget: "admissions.application.submit",
    idempotencyGuarded: true,
  }),
  ...overrides,
});

const policyIn = (tenantId: TenantId, overrides: Partial<TrafficPolicy> = {}): TrafficPolicy => ({
  ...defineTrafficPolicy({
    tenantId,
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
  }),
  ...overrides,
});

const endpointIn = (
  tenantId: TenantId,
  overrides: Partial<IntegrationEndpoint> = {},
): IntegrationEndpoint => ({
  ...registerIntegrationEndpoint({
    tenantId,
    organizationId: ORG,
    endpointKey: "finance.payment-gateway",
    displayName: "Payment gateway",
    protocol: "https",
    adapterKey: "payments.hosted-checkout",
    credentialRef: "vault:endpoints/payment-gateway",
  }),
  ...overrides,
});

const subscriptionIn = (
  tenantId: TenantId,
  overrides: Partial<WebhookSubscription> = {},
): WebhookSubscription => ({
  ...createWebhookSubscription({
    tenantId,
    organizationId: ORG,
    consumerId: CONSUMER,
    subscriptionKey: "enrolments",
    displayName: "Enrolment feed",
    endpointId: ENDPOINT,
    eventTypes: [SUBMITTED],
    secretRef: "vault:webhooks/enrolments",
  }),
  ...overrides,
});

const deliveryIn = (
  tenantId: TenantId,
  overrides: Partial<OutboundDelivery> = {},
): OutboundDelivery => ({
  ...scheduleOutboundDelivery({
    tenantId,
    organizationId: ORG,
    subscriptionId: SUBSCRIPTION,
    endpointId: ENDPOINT,
    eventType: SUBMITTED,
    eventId: EVENT,
    payloadFingerprint: FINGERPRINT,
    deliveryMode: "at_least_once",
  }),
  ...overrides,
});

const recordIn = (
  tenantId: TenantId,
  overrides: Partial<IdempotencyRecord> = {},
): IdempotencyRecord => ({
  ...beginIdempotentOperation({
    tenantId,
    organizationId: ORG,
    consumerId: CONSUMER,
    idempotencyKey: "6b1f8a90-4c2d-4e77-9a13-5d0e8f2b7c46",
    capabilityKey: "admissions.applications",
    method: "POST",
    payloadFingerprint: FINGERPRINT,
    asOf: AT,
  }),
  ...overrides,
});

describe("nothing a repository holds crosses a tenant boundary", () => {
  it("hides a consumer from another tenant, by id and by key", async () => {
    const repository = new InMemoryApiConsumerRepository();
    const consumer = consumerIn(TENANT);
    await repository.save(consumer);

    expect(await repository.findById(OTHER, consumer.id)).toBeNull();
    expect(await repository.findByKey(OTHER, consumer.consumerKey)).toBeNull();
    expect(await repository.listByTenant(OTHER)).toEqual([]);
    expect(await repository.findById(TENANT, consumer.id)).toEqual(consumer);
  });

  it("hides a contract from another tenant, including from the version lookup", async () => {
    const repository = new InMemoryApiContractRepository();
    const contract = contractIn(TENANT);
    await repository.save(contract);

    expect(await repository.findById(OTHER, contract.id)).toBeNull();
    expect(
      await repository.findByCapabilityAndVersion(OTHER, contract.capabilityKey, "v2"),
    ).toBeNull();
    expect(await repository.listByCapability(OTHER, contract.capabilityKey)).toEqual([]);
  });

  it("hides a route from another tenant, including from the published address", async () => {
    const repository = new InMemoryCapabilityRouteRepository();
    const route = routeIn(TENANT);
    await repository.save(route);

    expect(await repository.findById(OTHER, route.id)).toBeNull();
    expect(await repository.findByMethodAndPath(OTHER, "POST", route.externalPath)).toBeNull();
    expect(await repository.listByContract(OTHER, CONTRACT)).toEqual([]);
  });

  it("hides a policy from another tenant, including from the scope tuple", async () => {
    const repository = new InMemoryTrafficPolicyRepository();
    const policy = policyIn(TENANT);
    await repository.save(policy);

    expect(await repository.findById(OTHER, policy.id)).toBeNull();
    expect(await repository.findActiveByScopeTuple(OTHER, ORG, "global", null, null)).toBeNull();
    expect(await repository.listActive(OTHER, ORG)).toEqual([]);
  });

  it("hides an endpoint from another tenant, including from the open-circuit sweep", async () => {
    const repository = new InMemoryIntegrationEndpointRepository();
    const endpoint = endpointIn(TENANT, { circuitOpenedAt: AT });
    await repository.save(endpoint);

    expect(await repository.findById(OTHER, endpoint.id)).toBeNull();
    expect(await repository.findByKey(OTHER, endpoint.endpointKey)).toBeNull();
    expect(await repository.listOpenCircuits(OTHER)).toEqual([]);
    expect(await repository.listOpenCircuits(TENANT)).toEqual([endpoint]);
  });

  it("hides a subscription from another tenant, including from the fan-out read", async () => {
    const repository = new InMemoryWebhookSubscriptionRepository();
    const subscription = subscriptionIn(TENANT);
    await repository.save(subscription);

    expect(await repository.findById(OTHER, subscription.id)).toBeNull();
    expect(await repository.findByKey(OTHER, CONSUMER, "enrolments")).toBeNull();
    expect(await repository.listInterestedIn(OTHER, ORG, SUBMITTED)).toEqual([]);
    expect(await repository.listByEndpoint(OTHER, ENDPOINT)).toEqual([]);
  });

  it("hides a delivery from another tenant, including from the dispatcher's worklist", async () => {
    const repository = new InMemoryOutboundDeliveryRepository();
    const delivery = deliveryIn(TENANT);
    await repository.save(delivery);

    expect(await repository.findById(OTHER, delivery.id)).toBeNull();
    expect(await repository.findBySubscriptionAndEvent(OTHER, SUBSCRIPTION, EVENT)).toBeNull();
    expect(await repository.listDue(OTHER, shift(delivery.createdAt, 3_600))).toEqual([]);
  });

  it("hides a ledger row from another tenant, and will not purge one either", async () => {
    const repository = new InMemoryIdempotencyRecordRepository();
    const record = recordIn(TENANT);
    await repository.save(record);

    expect(await repository.findById(OTHER, record.id)).toBeNull();
    expect(await repository.findByKey(OTHER, CONSUMER, record.idempotencyKey)).toBeNull();
    expect(await repository.purgeExpired(OTHER, shift(record.expiresAt, 60))).toBe(0);
    expect(await repository.findById(TENANT, record.id)).toEqual(record);
  });
});

describe("the reads that stop there being two of something", () => {
  it("finds a consumer by the key that may never be reissued, retired or not", async () => {
    const repository = new InMemoryApiConsumerRepository();
    const retired = retireApiConsumer(consumerIn(TENANT));
    await repository.save(retired);

    expect(await repository.findByKey(TENANT, "district.reporting-bridge")).toEqual(retired);
  });

  it("finds a contract by capability and version, which together are its identity", async () => {
    const repository = new InMemoryApiContractRepository();
    const v2 = contractIn(TENANT);
    const v3 = contractIn(TENANT, { id: SECOND_CONTRACT, contractVersion: "v3" });
    await repository.save(v2);
    await repository.save(v3);

    expect(await repository.findByCapabilityAndVersion(TENANT, v2.capabilityKey, "v3")).toEqual(v3);
    expect(await repository.findByCapabilityAndVersion(TENANT, v2.capabilityKey, "v9")).toBeNull();
  });

  it("finds a route by method and path, because one address answers one way", async () => {
    const repository = new InMemoryCapabilityRouteRepository();
    const post = routeIn(TENANT);
    await repository.save(post);

    expect(await repository.findByMethodAndPath(TENANT, "POST", post.externalPath)).toEqual(post);
    expect(await repository.findByMethodAndPath(TENANT, "GET", post.externalPath)).toBeNull();
  });

  it("treats a global policy's two nulls as part of the tuple rather than an absence", async () => {
    const repository = new InMemoryTrafficPolicyRepository();
    const global = policyIn(TENANT);
    const perConsumer = policyIn(TENANT, {
      id: "policy-2" as Uuid,
      scope: "consumer",
      consumerId: CONSUMER,
    });
    await repository.save(global);
    await repository.save(perConsumer);

    expect(await repository.findActiveByScopeTuple(TENANT, ORG, "global", null, null)).toEqual(
      global,
    );
    expect(
      await repository.findActiveByScopeTuple(TENANT, ORG, "consumer", CONSUMER, null),
    ).toEqual(perConsumer);
    expect(
      await repository.findActiveByScopeTuple(TENANT, ORG, "consumer", SECOND_CONSUMER, null),
    ).toBeNull();
  });

  it("keeps a policy released from its tuple out of the tuple lookup, so the tuple reads as free", async () => {
    const repository = new InMemoryTrafficPolicyRepository();
    const released = policyIn(TENANT, { active: false, deactivatedAt: AT });
    const inForce = policyIn(TENANT, { id: "policy-2" as Uuid });
    await repository.save(released);
    await repository.save(inForce);

    expect(await repository.findActiveByScopeTuple(TENANT, ORG, "global", null, null)).toEqual(
      inForce,
    );
  });

  it("scopes a subscription key to its consumer, so two consumers may both have one", async () => {
    const repository = new InMemoryWebhookSubscriptionRepository();
    const mine = subscriptionIn(TENANT);
    const theirs = subscriptionIn(TENANT, {
      id: "subscription-2" as Uuid,
      consumerId: SECOND_CONSUMER,
    });
    await repository.save(mine);
    await repository.save(theirs);

    expect(await repository.findByKey(TENANT, CONSUMER, "enrolments")).toEqual(mine);
    expect(await repository.findByKey(TENANT, SECOND_CONSUMER, "enrolments")).toEqual(theirs);
  });

  it("finds the original delivery of an event to a subscription, and not a replay of it", async () => {
    const repository = new InMemoryOutboundDeliveryRepository();
    const original = deliveryIn(TENANT);
    const replay = deliveryIn(TENANT, {
      id: "delivery-2" as Uuid,
      replayOfDeliveryId: original.id,
    });
    await repository.save(original);
    await repository.save(replay);

    expect(await repository.findBySubscriptionAndEvent(TENANT, SUBSCRIPTION, EVENT)).toEqual(
      original,
    );
    expect(
      await repository.findBySubscriptionAndEvent(TENANT, SUBSCRIPTION, SECOND_EVENT),
    ).toBeNull();
  });

  it("scopes an idempotency key to its consumer, because the key is the caller's own", async () => {
    const repository = new InMemoryIdempotencyRecordRepository();
    const mine = recordIn(TENANT);
    const theirs = recordIn(TENANT, { id: "record-2" as Uuid, consumerId: SECOND_CONSUMER });
    await repository.save(mine);
    await repository.save(theirs);

    expect(await repository.findByKey(TENANT, CONSUMER, mine.idempotencyKey)).toEqual(mine);
    expect(await repository.findByKey(TENANT, SECOND_CONSUMER, mine.idempotencyKey)).toEqual(
      theirs,
    );
  });
});

describe("the lists an operator runs off", () => {
  it("lists the consumers that can currently reach the institution, and no others", async () => {
    const repository = new InMemoryApiConsumerRepository();
    const live = activateApiConsumer(consumerIn(TENANT));
    const registered = consumerIn(TENANT, { id: "consumer-9" as Uuid });
    const gone = retireApiConsumer(consumerIn(TENANT, { id: "consumer-8" as Uuid }));
    await repository.save(live);
    await repository.save(registered);
    await repository.save(gone);

    expect(await repository.listActive(TENANT, ORG)).toEqual([live]);
  });

  it("lists what a departing person is accountable for", async () => {
    const repository = new InMemoryApiConsumerRepository();
    const theirs = consumerIn(TENANT);
    const somebody = consumerIn(TENANT, { id: "consumer-9" as Uuid, ownerId: SECOND_OWNER });
    await repository.save(theirs);
    await repository.save(somebody);

    expect(await repository.listByOwner(TENANT, OWNER)).toEqual([theirs]);
    expect(await repository.listByOwner(TENANT, SECOND_OWNER)).toEqual([somebody]);
  });

  it("separates what answers now from what is merely on the books", async () => {
    const repository = new InMemoryApiContractRepository();
    const published = publishApiContract(contractIn(TENANT), PUBLISHER);
    const draft = contractIn(TENANT, { id: SECOND_CONTRACT, contractVersion: "v3" });
    const gone = sunsetApiContract(
      contractIn(TENANT, { id: "contract-3" as Uuid, contractVersion: "v1" }),
    );
    await repository.save(published);
    await repository.save(draft);
    await repository.save(gone);

    expect(await repository.listServable(TENANT, ORG)).toEqual([published]);
  });

  it("keeps a version on notice servable while listing it as sunsetting", async () => {
    const repository = new InMemoryApiContractRepository();
    const onNotice = deprecateApiContract(
      publishApiContract(contractIn(TENANT), PUBLISHER),
      ANNOUNCED,
      SUNSET,
      "v3",
    );
    await repository.save(onNotice);

    expect(await repository.listDeprecated(TENANT, ORG)).toEqual([onNotice]);
    expect(await repository.listServable(TENANT, ORG)).toEqual([onNotice]);
  });

  it("orders a capability's versions rather than returning them however they arrived", async () => {
    const repository = new InMemoryApiContractRepository();
    const v3 = contractIn(TENANT, { id: SECOND_CONTRACT, contractVersion: "v3" });
    const v1 = contractIn(TENANT, { id: "contract-3" as Uuid, contractVersion: "v1" });
    const v2 = contractIn(TENANT);
    await repository.save(v3);
    await repository.save(v1);
    await repository.save(v2);

    const versions = (await repository.listByCapability(TENANT, v2.capabilityKey)).map(
      (contract) => contract.contractVersion,
    );

    expect(versions).toEqual(["v1", "v2", "v3"]);
  });

  it("lists the routing table, which is the active routes and nothing else", async () => {
    const repository = new InMemoryCapabilityRouteRepository();
    const live = activateCapabilityRoute(routeIn(TENANT), "published");
    const draft = routeIn(TENANT, {
      id: "route-2" as Uuid,
      externalPath: "/v2/admissions/applications/{applicationId}",
    });
    await repository.save(live);
    await repository.save(draft);

    expect(await repository.listActive(TENANT, ORG)).toEqual([live]);
  });

  it("enumerates the addresses one contract publishes, so a sunset can be kept", async () => {
    const repository = new InMemoryCapabilityRouteRepository();
    const mine = routeIn(TENANT);
    const other = routeIn(TENANT, {
      id: "route-2" as Uuid,
      contractId: SECOND_CONTRACT,
      externalPath: "/v3/admissions/applications",
    });
    await repository.save(mine);
    await repository.save(other);

    expect(await repository.listByContract(TENANT, CONTRACT)).toEqual([mine]);
  });

  it("drops a deactivated policy out of the set selection resolves over", async () => {
    const repository = new InMemoryTrafficPolicyRepository();
    const live = policyIn(TENANT);
    const off = deactivateTrafficPolicy(
      policyIn(TENANT, { id: "policy-2" as Uuid, scope: "consumer", consumerId: CONSUMER }),
    );
    await repository.save(live);
    await repository.save(off);

    expect(await repository.listActive(TENANT, ORG)).toEqual([live]);
    expect(await repository.findById(TENANT, off.id)).toEqual(off);
  });

  it("lists the endpoints anything may be attempted against", async () => {
    const repository = new InMemoryIntegrationEndpointRepository();
    const live = activateIntegrationEndpoint(endpointIn(TENANT));
    const off = disableIntegrationEndpoint(
      endpointIn(TENANT, { id: SECOND_ENDPOINT, endpointKey: "sis.roster-sync" }),
      "Vendor migration.",
    );
    await repository.save(live);
    await repository.save(off);

    expect(await repository.listCallable(TENANT, ORG)).toEqual([live]);
  });

  it("sweeps on the stamp that survives a probe cycle, not on the posture's own age", async () => {
    const repository = new InMemoryIntegrationEndpointRepository();
    const live = activateIntegrationEndpoint(endpointIn(TENANT));
    const opened = shift(live.postureSince, 60);
    const failing = applyCircuitVerdict(
      live,
      {
        successes: 0,
        failures: 10,
        consecutiveFailures: 10,
        posture: "closed",
        postureSince: live.postureSince,
        asOf: opened,
      },
      inspectCircuit({
        successes: 0,
        failures: 10,
        consecutiveFailures: 10,
        posture: "closed",
        postureSince: live.postureSince,
        asOf: opened,
      }),
    );
    await repository.save(failing);

    expect(failing.posture).not.toBe("closed");
    expect(failing.circuitOpenedAt).toBe(opened);
    expect(await repository.listOpenCircuits(TENANT)).toEqual([failing]);

    await repository.save(
      activateIntegrationEndpoint(disableIntegrationEndpoint(failing, "Fixed.")),
    );
    expect(await repository.listOpenCircuits(TENANT)).toEqual([]);
  });

  it("fans out only to subscriptions that are both sending and interested", async () => {
    const repository = new InMemoryWebhookSubscriptionRepository();
    const interested = subscriptionIn(TENANT);
    const paused = pauseWebhookSubscription(
      subscriptionIn(TENANT, { id: "subscription-2" as Uuid, subscriptionKey: "paused-feed" }),
    );
    const elsewhere = subscriptionIn(TENANT, {
      id: "subscription-3" as Uuid,
      subscriptionKey: "attendance",
      eventTypes: ["attendance.session.closed"],
    });
    await repository.save(interested);
    await repository.save(paused);
    await repository.save(elsewhere);

    expect(await repository.listInterestedIn(TENANT, ORG, SUBMITTED)).toEqual([interested]);
    expect(await repository.listInterestedIn(TENANT, ORG, "attendance.session.closed")).toEqual([
      elsewhere,
    ]);
  });

  it("names what taking an endpoint out of service would stop", async () => {
    const repository = new InMemoryWebhookSubscriptionRepository();
    const bound = subscriptionIn(TENANT);
    const alsoBound = subscriptionIn(TENANT, {
      id: "subscription-2" as Uuid,
      subscriptionKey: "attendance",
    });
    const elsewhere = subscriptionIn(TENANT, {
      id: "subscription-3" as Uuid,
      subscriptionKey: "finance",
      endpointId: SECOND_ENDPOINT,
    });
    await repository.save(bound);
    await repository.save(alsoBound);
    await repository.save(elsewhere);

    expect(await repository.listByEndpoint(TENANT, ENDPOINT)).toEqual([bound, alsoBound]);
  });

  it("keeps a revoked subscription readable while never sending to it again", async () => {
    const repository = new InMemoryWebhookSubscriptionRepository();
    const revoked = revokeWebhookSubscription(subscriptionIn(TENANT));
    await repository.save(revoked);

    expect(await repository.listInterestedIn(TENANT, ORG, SUBMITTED)).toEqual([]);
    expect(await repository.listByConsumer(TENANT, CONSUMER)).toEqual([revoked]);
  });

  it("gives the dispatcher one instant to judge every candidate against", async () => {
    const repository = new InMemoryOutboundDeliveryRepository();
    const due = deliveryIn(TENANT);
    const settled = recordDeliverySuccess(
      deliveryIn(TENANT, { id: "delivery-2" as Uuid, eventId: SECOND_EVENT }),
      200,
      AT,
    );
    await repository.save(due);
    await repository.save(settled);

    const beforeDue = due.nextAttemptAt ?? due.createdAt;

    expect(await repository.listDue(TENANT, shift(beforeDue, -60))).toEqual([]);
    expect(await repository.listDue(TENANT, beforeDue)).toEqual([due]);
  });

  it("keeps a dead letter listable, because a queue nobody can read is a deletion", async () => {
    const repository = new InMemoryOutboundDeliveryRepository();
    const refused = deliveryIn(TENANT, { deliveryMode: "at_most_once" });
    const dead = recordDeliveryFailure(refused, { statusCode: 500, error: "Upstream error." }, AT);
    await repository.save(dead);

    expect(dead.outcome).toBe("dead_lettered");
    expect(await repository.listDeadLettered(TENANT, ORG)).toEqual([dead]);
    expect(await repository.listDue(TENANT, shift(AT, 86_400))).toEqual([]);
  });

  it("orders a subscription's deliveries by when they were scheduled", async () => {
    const repository = new InMemoryOutboundDeliveryRepository();
    const first = deliveryIn(TENANT);
    const second = deliveryIn(TENANT, {
      id: "delivery-2" as Uuid,
      eventId: SECOND_EVENT,
      createdAt: shift(first.createdAt, 60),
    });
    await repository.save(second);
    await repository.save(first);

    expect(await repository.listBySubscription(TENANT, SUBSCRIPTION)).toEqual([first, second]);
  });
});

describe("what one organization may not see of another", () => {
  it("keeps a sibling organization's consumers out of an active list", async () => {
    const repository = new InMemoryApiConsumerRepository();
    const ours = activateApiConsumer(consumerIn(TENANT));
    const theirs = activateApiConsumer(
      consumerIn(TENANT, {
        id: "consumer-9" as Uuid,
        organizationId: SIBLING,
        consumerKey: "sibling.bridge",
      }),
    );
    await repository.save(ours);
    await repository.save(theirs);

    expect(await repository.listActive(TENANT, ORG)).toEqual([ours]);
    expect(await repository.listActive(TENANT, SIBLING)).toEqual([theirs]);
    expect(await repository.listByTenant(TENANT)).toHaveLength(2);
  });

  it("keeps a sibling organization's subscriptions out of a fan-out", async () => {
    const repository = new InMemoryWebhookSubscriptionRepository();
    const ours = subscriptionIn(TENANT);
    const theirs = subscriptionIn(TENANT, {
      id: "subscription-2" as Uuid,
      organizationId: SIBLING,
    });
    await repository.save(ours);
    await repository.save(theirs);

    expect(await repository.listInterestedIn(TENANT, ORG, SUBMITTED)).toEqual([ours]);
    expect(await repository.listInterestedIn(TENANT, SIBLING, SUBMITTED)).toEqual([theirs]);
  });
});

describe("the one removal in this contract", () => {
  it("removes what has run out of retention and reports how much", async () => {
    const repository = new InMemoryIdempotencyRecordRepository();
    const record = recordIn(TENANT);
    await repository.save(record);

    expect(await repository.purgeExpired(TENANT, shift(record.expiresAt, 1))).toBe(1);
    expect(await repository.findByKey(TENANT, CONSUMER, record.idempotencyKey)).toBeNull();
  });

  it("leaves a row that is still being honoured exactly where it is", async () => {
    const repository = new InMemoryIdempotencyRecordRepository();
    const record = completeIdempotentOperation(
      recordIn(TENANT),
      { statusCode: 201, responseRef: "blob:responses/1" },
      AT,
    );
    await repository.save(record);

    expect(await repository.purgeExpired(TENANT, shift(record.expiresAt, -1))).toBe(0);
    expect(await repository.findByKey(TENANT, CONSUMER, record.idempotencyKey)).toEqual(record);
  });

  it("treats the expiry instant itself as expired, the way the record reads it", async () => {
    const repository = new InMemoryIdempotencyRecordRepository();
    const record = recordIn(TENANT);
    await repository.save(record);

    expect(await repository.purgeExpired(TENANT, record.expiresAt)).toBe(1);
  });

  it("purges nothing when nothing has expired, and says so", async () => {
    const repository = new InMemoryIdempotencyRecordRepository();
    await repository.save(recordIn(TENANT));
    await repository.save(
      recordIn(TENANT, { id: "record-2" as Uuid, consumerId: SECOND_CONSUMER }),
    );

    expect(await repository.purgeExpired(TENANT, AT)).toBe(0);
    expect(await repository.listByConsumer(TENANT, CONSUMER)).toHaveLength(1);
  });
});
