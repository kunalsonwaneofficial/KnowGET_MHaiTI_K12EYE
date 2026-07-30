import { describe, expect, it } from "vitest";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import { type ApiConsumer, registerApiConsumer, retireApiConsumer } from "./api-consumer";
import {
  ApiConsumerNotFoundError,
  ConsumerRetiredError,
  DuplicateSubscriptionKeyError,
  EmptyGatewayKeyError,
  EndpointRetiredError,
  IntegrationEndpointNotFoundError,
  InvalidGatewayKeyError,
  InvalidSubscriptionProgressionError,
  NoEventTypesSubscribedError,
  PlaintextCredentialError,
  SubscriptionRevokedError,
  UnknownEventTypeError,
  WebhookSubscriptionNotFoundError,
} from "./errors";
import {
  SUBSCRIPTION_CREATED,
  SUBSCRIPTION_PAUSED,
  SUBSCRIPTION_RESUMED,
  SUBSCRIPTION_REVOKED,
  SUBSCRIPTION_SUSPENDED,
} from "./gateway-events";
import { DEFAULT_DELIVERY_MODE } from "./gateway-value";
import {
  type IntegrationEndpoint,
  registerIntegrationEndpoint,
  retireIntegrationEndpoint,
} from "./integration-endpoint";
import {
  type EventTypeCatalogue,
  InMemoryApiConsumerRepository,
  InMemoryIntegrationEndpointRepository,
  InMemoryWebhookSubscriptionRepository,
} from "./ports";
import type { CreateWebhookSubscriptionParams } from "./webhook-subscription";
import { WebhookSubscriptionService } from "./webhook-subscription-service";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org-1" as Uuid;
const SECOND_ORG = "org-2" as Uuid;
const OWNER = "person-1" as Uuid;
const MISSING = "subscription-absent" as Uuid;
const ABSENT_CONSUMER = "consumer-absent" as Uuid;
const ABSENT_ENDPOINT = "endpoint-absent" as Uuid;

const KEY = "enrolments";
const OTHER_KEY = "attendance";

const ENROLLED = "student.enrolled";
const WITHDRAWN = "student.withdrawn";
const ATTENDANCE = "attendance.recorded";
/** Well-formed and not in the catalogue — the mistyped type the creation check exists to catch. */
const UNKNOWN_EVENT = "student.enroled";

const SECRET = "vault:gateway/subscriptions/enrolments";

const CATALOGUE = new Set([ENROLLED, WITHDRAWN, ATTENDANCE]);

const recorder = () => {
  const published: DomainEvent[] = [];
  return {
    published,
    publish: async (event: DomainEvent): Promise<void> => {
      published.push(event);
    },
  };
};

const eventTypes: EventTypeCatalogue = {
  exists: async (eventType) => CATALOGUE.has(eventType),
};

/** Seconds from an instant the record itself carries, so no assertion here depends on the wall clock. */
const shift = (from: ISODateString, seconds: number): ISODateString =>
  new Date(Date.parse(from) + seconds * 1_000).toISOString() as ISODateString;

const consumerIn = (tenantId: TenantId, organizationId: Uuid = ORG): ApiConsumer =>
  registerApiConsumer({
    tenantId,
    organizationId,
    consumerKey: "sis.nightly-sync",
    displayName: "Nightly SIS Sync",
    authScheme: "api_key",
    credentialRef: "vault:gateway/consumers/sis-nightly-sync",
    grantedScopes: ["admissions.applications.read"],
    ownerId: OWNER,
    registeredBy: OWNER,
  });

const endpointIn = (tenantId: TenantId, organizationId: Uuid = ORG): IntegrationEndpoint =>
  registerIntegrationEndpoint({
    tenantId,
    organizationId,
    endpointKey: "sis.webhook-receiver",
    displayName: "SIS Webhook Receiver",
    protocol: "https",
    adapterKey: "webhook-post",
    credentialRef: "vault:gateway/endpoints/sis-webhook-receiver",
  });

const harness = async () => {
  const repository = new InMemoryWebhookSubscriptionRepository();
  const consumers = new InMemoryApiConsumerRepository();
  const endpoints = new InMemoryIntegrationEndpointRepository();
  const events = recorder();
  const service = new WebhookSubscriptionService({
    repository,
    consumers,
    endpoints,
    eventTypes,
    events,
  });
  const consumer = consumerIn(TENANT);
  const endpoint = endpointIn(TENANT);
  await consumers.save(consumer);
  await endpoints.save(endpoint);
  return { repository, consumers, endpoints, events, service, consumer, endpoint };
};

const params = (
  consumer: ApiConsumer,
  endpoint: IntegrationEndpoint,
  overrides: Partial<CreateWebhookSubscriptionParams> = {},
): CreateWebhookSubscriptionParams => ({
  tenantId: consumer.tenantId,
  organizationId: consumer.organizationId,
  consumerId: consumer.id,
  subscriptionKey: KEY,
  displayName: "Enrolment changes",
  endpointId: endpoint.id,
  eventTypes: [ENROLLED],
  secretRef: SECRET,
  ...overrides,
});

const types = (events: ReturnType<typeof recorder>): string[] =>
  events.published.map((event) => event.type);

describe("WebhookSubscriptionService — creation", () => {
  it("subscribes a consumer, storing the record and announcing it", async () => {
    const { repository, events, service, consumer, endpoint } = await harness();

    const subscription = await service.create(params(consumer, endpoint));

    expect(subscription.status).toBe("active");
    expect(subscription.consecutiveFailures).toBe(0);
    expect(await repository.findById(TENANT, subscription.id)).toEqual(subscription);
    expect(types(events)).toEqual([SUBSCRIPTION_CREATED]);
  });

  it("defaults to retrying, because a late webhook beats one that never arrives", async () => {
    const { service, consumer, endpoint } = await harness();

    const subscription = await service.create(params(consumer, endpoint));

    expect(subscription.deliveryMode).toBe(DEFAULT_DELIVERY_MODE);
    expect(subscription.deliveryMode).toBe("at_least_once");
  });

  it("takes at-most-once from a consumer who asked for it", async () => {
    const { service, consumer, endpoint } = await harness();

    const subscription = await service.create(
      params(consumer, endpoint, { deliveryMode: "at_most_once" }),
    );

    expect(subscription.deliveryMode).toBe("at_most_once");
  });

  it("holds the event types as a sorted set, so two identical subscriptions compare equal", async () => {
    const { service, consumer, endpoint } = await harness();

    const subscription = await service.create(
      params(consumer, endpoint, { eventTypes: [WITHDRAWN, ATTENDANCE, ENROLLED, ATTENDANCE] }),
    );

    expect(subscription.eventTypes).toEqual([ATTENDANCE, ENROLLED, WITHDRAWN]);
  });

  it("refuses a mistyped event type, which is the one mistake that produces no symptom", async () => {
    const { repository, events, service, consumer, endpoint } = await harness();

    await expect(
      service.create(params(consumer, endpoint, { eventTypes: [ENROLLED, UNKNOWN_EVENT] })),
    ).rejects.toThrow(UnknownEventTypeError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(types(events)).toEqual([]);
  });

  it("names the unknown type in the refusal, because the caller is looking for a typo", async () => {
    const { service, consumer, endpoint } = await harness();

    await expect(
      service.create(params(consumer, endpoint, { eventTypes: [UNKNOWN_EVENT] })),
    ).rejects.toThrow(UNKNOWN_EVENT);
  });

  it("refuses a subscription to nothing at all", async () => {
    const { service, consumer, endpoint } = await harness();

    await expect(service.create(params(consumer, endpoint, { eventTypes: [] }))).rejects.toThrow(
      NoEventTypesSubscribedError,
    );
    await expect(
      service.create(params(consumer, endpoint, { eventTypes: ["  "] })),
    ).rejects.toThrow(NoEventTypesSubscribedError);
  });

  it("refuses a malformed event type before it ever reaches the catalogue", async () => {
    const { service, consumer, endpoint } = await harness();

    await expect(
      service.create(params(consumer, endpoint, { eventTypes: ["Student Enrolled"] })),
    ).rejects.toThrow(InvalidGatewayKeyError);
  });

  it("refuses a consumer nobody registered", async () => {
    const { service, consumer, endpoint } = await harness();

    await expect(
      service.create(params(consumer, endpoint, { consumerId: ABSENT_CONSUMER })),
    ).rejects.toThrow(ApiConsumerNotFoundError);
  });

  it("refuses a retired consumer, because that is an offboarding that did not take", async () => {
    const { consumers, service, consumer, endpoint } = await harness();
    await consumers.save(retireApiConsumer(consumer));

    await expect(service.create(params(consumer, endpoint))).rejects.toThrow(ConsumerRetiredError);
  });

  it("refuses an endpoint nobody registered", async () => {
    const { service, consumer, endpoint } = await harness();

    await expect(
      service.create(params(consumer, endpoint, { endpointId: ABSENT_ENDPOINT })),
    ).rejects.toThrow(IntegrationEndpointNotFoundError);
  });

  it("refuses a retired endpoint", async () => {
    const { endpoints, service, consumer, endpoint } = await harness();
    await endpoints.save(retireIntegrationEndpoint(endpoint));

    await expect(service.create(params(consumer, endpoint))).rejects.toThrow(EndpointRetiredError);
  });

  it("accepts an endpoint that is registered but not yet in service", async () => {
    const { service, consumer, endpoint } = await harness();

    expect(endpoint.status).toBe("registered");
    await expect(service.create(params(consumer, endpoint))).resolves.toMatchObject({
      endpointId: endpoint.id,
    });
  });

  it("claims a key once within the consumer", async () => {
    const { service, consumer, endpoint } = await harness();
    await service.create(params(consumer, endpoint));

    await expect(service.create(params(consumer, endpoint))).rejects.toThrow(
      DuplicateSubscriptionKeyError,
    );
  });

  it("lets two consumers each call theirs the same thing", async () => {
    const { consumers, service, consumer, endpoint } = await harness();
    const second = consumerIn(TENANT);
    await consumers.save(second);
    await service.create(params(consumer, endpoint));

    const theirs = await service.create(params(second, endpoint));

    expect(theirs.subscriptionKey).toBe(KEY);
    expect(theirs.consumerId).toBe(second.id);
  });

  it("refuses a plaintext signing secret while permitting none at all", async () => {
    const { service, consumer, endpoint } = await harness();

    await expect(
      service.create(params(consumer, endpoint, { secretRef: "hunter2" })),
    ).rejects.toThrow(PlaintextCredentialError);
    await expect(
      service.create(params(consumer, endpoint, { secretRef: null })),
    ).resolves.toMatchObject({ secretRef: null });
  });

  it("keeps the secret handle off the bus, announcing only that payloads are signed", async () => {
    const { events, service, consumer, endpoint } = await harness();

    await service.create(params(consumer, endpoint));

    const payload = events.published[0]?.payload as { signed: boolean };
    expect(payload.signed).toBe(true);
    expect(JSON.stringify(events.published)).not.toContain(SECRET);
  });
});

describe("WebhookSubscriptionService — revision", () => {
  it("renames without announcing, because only the consumer and the platform are involved", async () => {
    const { repository, events, service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));

    const renamed = await service.rename(TENANT, subscription.id, "Enrolment feed");

    expect(renamed.displayName).toBe("Enrolment feed");
    expect(renamed.subscriptionKey).toBe(KEY);
    expect(await repository.findById(TENANT, subscription.id)).toEqual(renamed);
    expect(types(events)).toEqual([SUBSCRIPTION_CREATED]);
  });

  it("replaces the whole set of event types on a resubscription", async () => {
    const { repository, service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));

    const next = await service.resubscribe(TENANT, subscription.id, [ATTENDANCE, WITHDRAWN]);

    expect(next.eventTypes).toEqual([ATTENDANCE, WITHDRAWN]);
    expect(await repository.findById(TENANT, subscription.id)).toEqual(next);
  });

  it("re-checks the catalogue on a resubscription, which is made from a changelog months later", async () => {
    const { repository, service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));

    await expect(
      service.resubscribe(TENANT, subscription.id, [ATTENDANCE, UNKNOWN_EVENT]),
    ).rejects.toThrow(UnknownEventTypeError);
    expect((await repository.findById(TENANT, subscription.id))?.eventTypes).toEqual([ENROLLED]);
  });

  it("refuses a resubscription to nothing", async () => {
    const { service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));

    await expect(service.resubscribe(TENANT, subscription.id, [])).rejects.toThrow(
      NoEventTypesSubscribedError,
    );
  });

  it("rebinds to another endpoint without disturbing the filter", async () => {
    const { endpoints, service, consumer, endpoint } = await harness();
    const replacement = endpointIn(TENANT);
    await endpoints.save(replacement);
    const subscription = await service.create(params(consumer, endpoint));

    const rebound = await service.rebindEndpoint(TENANT, subscription.id, replacement.id);

    expect(rebound.endpointId).toBe(replacement.id);
    expect(rebound.eventTypes).toEqual(subscription.eventTypes);
  });

  it("re-checks the endpoint on a rebind, which is the same mistake made under time pressure", async () => {
    const { repository, endpoints, service, consumer, endpoint } = await harness();
    const replacement = endpointIn(TENANT);
    await endpoints.save(retireIntegrationEndpoint(replacement));
    const subscription = await service.create(params(consumer, endpoint));

    await expect(service.rebindEndpoint(TENANT, subscription.id, replacement.id)).rejects.toThrow(
      EndpointRetiredError,
    );
    await expect(service.rebindEndpoint(TENANT, subscription.id, ABSENT_ENDPOINT)).rejects.toThrow(
      IntegrationEndpointNotFoundError,
    );
    expect((await repository.findById(TENANT, subscription.id))?.endpointId).toBe(endpoint.id);
  });

  it("rotates the signing secret, or drops it, without announcing either", async () => {
    const { events, service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));

    const rotated = await service.rotateSecret(TENANT, subscription.id, "kms:gateway/enrolments");
    const dropped = await service.rotateSecret(TENANT, subscription.id, null);

    expect(rotated.secretRef).toBe("kms:gateway/enrolments");
    expect(dropped.secretRef).toBeNull();
    expect(types(events)).toEqual([SUBSCRIPTION_CREATED]);
  });

  it("refuses a plaintext secret on rotation as firmly as on creation", async () => {
    const { service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));

    await expect(service.rotateSecret(TENANT, subscription.id, "hunter2")).rejects.toThrow(
      PlaintextCredentialError,
    );
  });

  it("refuses every revision once the consumer has revoked the subscription", async () => {
    const { service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));
    await service.revoke(TENANT, subscription.id);

    await expect(service.rename(TENANT, subscription.id, "x")).rejects.toThrow(
      SubscriptionRevokedError,
    );
    await expect(service.resubscribe(TENANT, subscription.id, [ATTENDANCE])).rejects.toThrow(
      SubscriptionRevokedError,
    );
    await expect(service.rotateSecret(TENANT, subscription.id, null)).rejects.toThrow(
      SubscriptionRevokedError,
    );
  });
});

describe("WebhookSubscriptionService — lifecycle", () => {
  it("pauses at the consumer's request, announcing it", async () => {
    const { repository, events, service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));

    const paused = await service.pause(TENANT, subscription.id);

    expect(paused.status).toBe("paused");
    expect(paused.pausedAt).not.toBeNull();
    expect(await repository.findById(TENANT, subscription.id)).toEqual(paused);
    expect(types(events)).toEqual([SUBSCRIPTION_CREATED, SUBSCRIPTION_PAUSED]);
  });

  it("suspends with the platform's own reason attached", async () => {
    const { events, service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));

    const suspended = await service.suspend(TENANT, subscription.id, "40 consecutive failures");

    expect(suspended.status).toBe("suspended");
    expect(suspended.suspendedReason).toBe("40 consecutive failures");
    expect(types(events)).toEqual([SUBSCRIPTION_CREATED, SUBSCRIPTION_SUSPENDED]);
  });

  it("refuses a suspension with no reason, since the consumer will ask what we saw", async () => {
    const { service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));

    await expect(service.suspend(TENANT, subscription.id, "   ")).rejects.toThrow(
      EmptyGatewayKeyError,
    );
  });

  it("keeps the consumer's pause and the platform's suspension out of each other's way", async () => {
    const { service, consumer, endpoint } = await harness();
    const paused = await service.create(params(consumer, endpoint));
    await service.pause(TENANT, paused.id);

    await expect(service.suspend(TENANT, paused.id, "failing")).rejects.toThrow(
      InvalidSubscriptionProgressionError,
    );
  });

  it("resumes from either absence, clearing the stamps and the failure run", async () => {
    const { events, service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));
    await service.recordOutcome(
      TENANT,
      subscription.id,
      "failed",
      shift(subscription.createdAt, 5),
    );
    await service.suspend(TENANT, subscription.id, "failing");

    const resumed = await service.resume(TENANT, subscription.id);

    expect(resumed.status).toBe("active");
    expect(resumed.consecutiveFailures).toBe(0);
    expect(resumed.suspendedAt).toBeNull();
    expect(resumed.suspendedReason).toBeNull();
    expect(resumed.pausedAt).toBeNull();
    expect(types(events)).toEqual([
      SUBSCRIPTION_CREATED,
      SUBSCRIPTION_SUSPENDED,
      SUBSCRIPTION_RESUMED,
    ]);
  });

  it("refuses to resume something that was never stopped", async () => {
    const { service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));

    await expect(service.resume(TENANT, subscription.id)).rejects.toThrow(
      InvalidSubscriptionProgressionError,
    );
  });

  it("revokes from any status, and lets nothing back out", async () => {
    const { events, service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));
    await service.pause(TENANT, subscription.id);

    const revoked = await service.revoke(TENANT, subscription.id);

    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedAt).not.toBeNull();
    await expect(service.resume(TENANT, subscription.id)).rejects.toThrow(SubscriptionRevokedError);
    await expect(service.revoke(TENANT, subscription.id)).rejects.toThrow(SubscriptionRevokedError);
    expect(types(events)).toEqual([
      SUBSCRIPTION_CREATED,
      SUBSCRIPTION_PAUSED,
      SUBSCRIPTION_REVOKED,
    ]);
  });

  it("404s a lifecycle move against an id in another tenant", async () => {
    const { service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));

    await expect(service.pause(OTHER, subscription.id)).rejects.toThrow(
      WebhookSubscriptionNotFoundError,
    );
    await expect(service.pause(TENANT, MISSING)).rejects.toThrow(WebhookSubscriptionNotFoundError);
  });
});

describe("WebhookSubscriptionService — observation", () => {
  it("counts a failure and moves only the delivery stamp", async () => {
    const { service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));
    const at = shift(subscription.createdAt, 60);

    const next = await service.recordOutcome(TENANT, subscription.id, "failed", at);

    expect(next.consecutiveFailures).toBe(1);
    expect(next.lastDeliveryAt).toBe(at);
    expect(next.lastSuccessAt).toBeNull();
  });

  it("clears the run on a success and moves both stamps", async () => {
    const { service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));
    const failedAt = shift(subscription.createdAt, 60);
    const succeededAt = shift(subscription.createdAt, 120);
    await service.recordOutcome(TENANT, subscription.id, "failed", failedAt);
    await service.recordOutcome(TENANT, subscription.id, "failed", failedAt);

    const next = await service.recordOutcome(TENANT, subscription.id, "succeeded", succeededAt);

    expect(next.consecutiveFailures).toBe(0);
    expect(next.lastDeliveryAt).toBe(succeededAt);
    expect(next.lastSuccessAt).toBe(succeededAt);
  });

  it("distinguishes a subscription nobody has sent to from one that keeps failing", async () => {
    const { service, consumer, endpoint } = await harness();
    const idle = await service.create(params(consumer, endpoint));
    const failing = await service.create(
      params(consumer, endpoint, { subscriptionKey: OTHER_KEY }),
    );
    const at = shift(failing.createdAt, 60);
    await service.recordOutcome(TENANT, failing.id, "failed", at);

    expect(idle.lastDeliveryAt).toBeNull();
    expect((await service.get(TENANT, failing.id)).lastDeliveryAt).toBe(at);
    expect((await service.get(TENANT, failing.id)).lastSuccessAt).toBeNull();
  });

  it("never changes the status, because stopping is a decision about the endpoint", async () => {
    const { service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));
    const at = shift(subscription.createdAt, 60);

    for (let attempt = 0; attempt < 50; attempt += 1) {
      await service.recordOutcome(TENANT, subscription.id, "failed", at);
    }

    const settled = await service.get(TENANT, subscription.id);
    expect(settled.consecutiveFailures).toBe(50);
    expect(settled.status).toBe("active");
  });

  it("stays silent, because one event per attempt would publish the delivery log", async () => {
    const { events, service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));
    const at = shift(subscription.createdAt, 60);

    await service.recordOutcome(TENANT, subscription.id, "failed", at);
    await service.recordOutcome(TENANT, subscription.id, "succeeded", at);

    expect(types(events)).toEqual([SUBSCRIPTION_CREATED]);
  });

  it("refuses to record anything against a revoked subscription", async () => {
    const { service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));
    await service.revoke(TENANT, subscription.id);

    await expect(
      service.recordOutcome(TENANT, subscription.id, "failed", shift(subscription.createdAt, 60)),
    ).rejects.toThrow(SubscriptionRevokedError);
  });
});

describe("WebhookSubscriptionService — reading", () => {
  it("returns one subscription, or 404s naming the id asked for", async () => {
    const { service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));

    expect(await service.get(TENANT, subscription.id)).toEqual(subscription);
    await expect(service.get(TENANT, MISSING)).rejects.toThrow(MISSING);
    await expect(service.get(OTHER, subscription.id)).rejects.toThrow(
      WebhookSubscriptionNotFoundError,
    );
  });

  it("finds a subscription by the key its own consumer refers to it with", async () => {
    const { service, consumer, endpoint } = await harness();
    const subscription = await service.create(params(consumer, endpoint));

    expect(await service.getByKey(TENANT, consumer.id, "  Enrolments ")).toEqual(subscription);
  });

  it("404s an unknown key naming the normalised form, not what was typed", async () => {
    const { service, consumer } = await harness();

    await expect(service.getByKey(TENANT, consumer.id, "  Absent  ")).rejects.toThrow('"absent"');
  });

  it("does not find one consumer's subscription under another's id", async () => {
    const { consumers, service, consumer, endpoint } = await harness();
    const second = consumerIn(TENANT);
    await consumers.save(second);
    await service.create(params(consumer, endpoint));

    await expect(service.getByKey(TENANT, second.id, KEY)).rejects.toThrow(
      WebhookSubscriptionNotFoundError,
    );
  });

  it("lists everything one consumer holds, in every status", async () => {
    const { service, consumer, endpoint } = await harness();
    const revoked = await service.create(params(consumer, endpoint));
    await service.create(params(consumer, endpoint, { subscriptionKey: OTHER_KEY }));
    await service.revoke(TENANT, revoked.id);

    expect(await service.listByConsumer(TENANT, consumer.id)).toHaveLength(2);
  });

  it("lists what one endpoint going away would affect", async () => {
    const { endpoints, service, consumer, endpoint } = await harness();
    const spare = endpointIn(TENANT);
    await endpoints.save(spare);
    await service.create(params(consumer, endpoint));
    await service.create(params(consumer, endpoint, { subscriptionKey: OTHER_KEY }));
    await service.create(
      params(consumer, spare, { subscriptionKey: "results", eventTypes: [ATTENDANCE] }),
    );

    expect(await service.listByEndpoint(TENANT, endpoint.id)).toHaveLength(2);
    expect(await service.listByEndpoint(TENANT, spare.id)).toHaveLength(1);
  });

  it("answers the dispatch read with whoever asked for that exact type", async () => {
    const { service, consumer, endpoint } = await harness();
    await service.create(params(consumer, endpoint, { eventTypes: [ENROLLED, WITHDRAWN] }));
    await service.create(
      params(consumer, endpoint, { subscriptionKey: OTHER_KEY, eventTypes: [ATTENDANCE] }),
    );

    expect(await service.listInterestedIn(TENANT, ORG, ENROLLED)).toHaveLength(1);
    expect(await service.listInterestedIn(TENANT, ORG, ATTENDANCE)).toHaveLength(1);
    expect(await service.listInterestedIn(TENANT, ORG, "  Student.Enrolled  ")).toHaveLength(1);
  });

  it("leaves out a subscription that is not being sent to, so pausing needs no filter at dispatch", async () => {
    const { service, consumer, endpoint } = await harness();
    const paused = await service.create(params(consumer, endpoint));
    await service.create(params(consumer, endpoint, { subscriptionKey: OTHER_KEY }));

    await service.pause(TENANT, paused.id);

    expect(await service.listInterestedIn(TENANT, ORG, ENROLLED)).toHaveLength(1);
    await service.resume(TENANT, paused.id);
    expect(await service.listInterestedIn(TENANT, ORG, ENROLLED)).toHaveLength(2);
  });

  it("keeps the dispatch read inside one school of the institution", async () => {
    const { consumers, endpoints, service, consumer, endpoint } = await harness();
    const elsewhere = consumerIn(TENANT, SECOND_ORG);
    const theirEndpoint = endpointIn(TENANT, SECOND_ORG);
    await consumers.save(elsewhere);
    await endpoints.save(theirEndpoint);
    await service.create(params(consumer, endpoint));
    await service.create(params(elsewhere, theirEndpoint));

    expect(await service.listInterestedIn(TENANT, ORG, ENROLLED)).toHaveLength(1);
    expect(await service.listInterestedIn(TENANT, SECOND_ORG, ENROLLED)).toHaveLength(1);
  });

  it("lists the tenant's subscriptions and nobody else's", async () => {
    const { consumers, endpoints, service, consumer, endpoint } = await harness();
    const theirConsumer = consumerIn(OTHER);
    const theirEndpoint = endpointIn(OTHER);
    await consumers.save(theirConsumer);
    await endpoints.save(theirEndpoint);
    await service.create(params(consumer, endpoint));
    await service.create(params(theirConsumer, theirEndpoint));

    expect(await service.list(TENANT)).toHaveLength(1);
    expect(await service.list(OTHER)).toHaveLength(1);
  });
});
