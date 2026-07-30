import { describe, expect, it } from "vitest";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  DeliveryNotReplayableError,
  DeliverySettledError,
  EmptyGatewayKeyError,
  IntegrationEndpointNotFoundError,
  InvalidGatewayKeyError,
  OutboundDeliveryNotFoundError,
  WebhookSubscriptionNotFoundError,
} from "./errors";
import {
  DELIVERY_ABANDONED,
  DELIVERY_DEAD_LETTERED,
  DELIVERY_FAILED,
  DELIVERY_REPLAYED,
  DELIVERY_SCHEDULED,
  DELIVERY_SUCCEEDED,
} from "./gateway-events";
import { MAX_DELIVERY_ATTEMPTS } from "./gateway-value";
import { type IntegrationEndpoint, registerIntegrationEndpoint } from "./integration-endpoint";
import type {
  DeliveryFailure,
  OutboundDelivery,
  ScheduleOutboundDeliveryParams,
} from "./outbound-delivery";
import { type DispatchEventRequest, OutboundDeliveryService } from "./outbound-delivery-service";
import {
  InMemoryIntegrationEndpointRepository,
  InMemoryOutboundDeliveryRepository,
  InMemoryWebhookSubscriptionRepository,
} from "./ports";
import {
  type WebhookSubscription,
  createWebhookSubscription,
  pauseWebhookSubscription,
  rebindSubscriptionEndpoint,
  revokeWebhookSubscription,
  suspendWebhookSubscription,
} from "./webhook-subscription";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org-1" as Uuid;
const SECOND_ORG = "org-2" as Uuid;
const CONSUMER = "consumer-1" as Uuid;
const MISSING = "delivery-absent" as Uuid;
const ABSENT_SUBSCRIPTION = "subscription-absent" as Uuid;
const ABSENT_ENDPOINT = "endpoint-absent" as Uuid;

const ENROLLED = "student.enrolled";
const ATTENDANCE = "attendance.recorded";

const EVENT = "event-1" as Uuid;
const OTHER_EVENT = "event-2" as Uuid;

/** What the outbox computed over the payload. Compared for equality here and interpreted nowhere. */
const FINGERPRINT = "sha256:8f14e45fceea167a5a36dedd4bea2543";

const SECRET = "vault:gateway/subscriptions/enrolments";

const recorder = () => {
  const published: DomainEvent[] = [];
  return {
    published,
    publish: async (event: DomainEvent): Promise<void> => {
      published.push(event);
    },
  };
};

/** Seconds from an instant the record itself carries, so no assertion here depends on the wall clock. */
const shift = (from: ISODateString, seconds: number): ISODateString =>
  new Date(Date.parse(from) + seconds * 1_000).toISOString() as ISODateString;

/** The gap between two stamps in seconds, or `NaN` where the second one is absent — which fails any comparison. */
const gapSeconds = (from: ISODateString, to: ISODateString | null): number =>
  to === null ? Number.NaN : (Date.parse(to) - Date.parse(from)) / 1_000;

const endpointIn = (
  tenantId: TenantId,
  organizationId: Uuid = ORG,
  endpointKey = "sis.webhook-receiver",
): IntegrationEndpoint =>
  registerIntegrationEndpoint({
    tenantId,
    organizationId,
    endpointKey,
    displayName: "SIS Webhook Receiver",
    protocol: "https",
    adapterKey: "webhook-post",
    credentialRef: "vault:gateway/endpoints/sis-webhook-receiver",
  });

const subscriptionIn = (
  endpoint: IntegrationEndpoint,
  overrides: Partial<Parameters<typeof createWebhookSubscription>[0]> = {},
): WebhookSubscription =>
  createWebhookSubscription({
    tenantId: endpoint.tenantId,
    organizationId: endpoint.organizationId,
    consumerId: CONSUMER,
    subscriptionKey: "enrolments",
    displayName: "Enrolment changes",
    endpointId: endpoint.id,
    eventTypes: [ENROLLED],
    secretRef: SECRET,
    ...overrides,
  });

const harness = async () => {
  const repository = new InMemoryOutboundDeliveryRepository();
  const subscriptions = new InMemoryWebhookSubscriptionRepository();
  const endpoints = new InMemoryIntegrationEndpointRepository();
  const events = recorder();
  const service = new OutboundDeliveryService({ repository, subscriptions, endpoints, events });
  const endpoint = endpointIn(TENANT);
  const subscription = subscriptionIn(endpoint);
  await endpoints.save(endpoint);
  await subscriptions.save(subscription);
  return { repository, subscriptions, endpoints, events, service, endpoint, subscription };
};

const request = (overrides: Partial<DispatchEventRequest> = {}): DispatchEventRequest => ({
  tenantId: TENANT,
  organizationId: ORG,
  eventType: ENROLLED,
  eventId: EVENT,
  payloadFingerprint: FINGERPRINT,
  ...overrides,
});

const params = (
  subscription: WebhookSubscription,
  overrides: Partial<ScheduleOutboundDeliveryParams> = {},
): ScheduleOutboundDeliveryParams => ({
  tenantId: subscription.tenantId,
  organizationId: subscription.organizationId,
  subscriptionId: subscription.id,
  endpointId: subscription.endpointId,
  eventType: ENROLLED,
  eventId: EVENT,
  payloadFingerprint: FINGERPRINT,
  deliveryMode: subscription.deliveryMode,
  ...overrides,
});

const failure = (overrides: Partial<DeliveryFailure> = {}): DeliveryFailure => ({
  statusCode: 503,
  error: "connect ETIMEDOUT",
  ...overrides,
});

/**
 * Fail a delivery until its allowance runs out, so a replay has something replayable to work from.
 *
 * Each attempt is stamped a second later than the one before it, derived from the delivery's own creation
 * instant, and the loop stops as soon as the aggregate settles it — which is the first failure for an
 * at-most-once delivery and the last permitted one otherwise.
 */
const deadLetter = async (
  service: OutboundDeliveryService,
  delivery: OutboundDelivery,
): Promise<OutboundDelivery> => {
  let current = delivery;
  for (let attempt = 0; attempt < MAX_DELIVERY_ATTEMPTS; attempt += 1) {
    current = await service.recordFailure(
      current.tenantId,
      current.id,
      failure(),
      shift(current.createdAt, attempt + 1),
    );
    if (current.outcome === "dead_lettered") break;
  }
  return current;
};

const types = (events: ReturnType<typeof recorder>): string[] =>
  events.published.map((event) => event.type);

const ids = (deliveries: readonly OutboundDelivery[]): Uuid[] =>
  deliveries.map((delivery) => delivery.id);

describe("OutboundDeliveryService — dispatch", () => {
  it("schedules one delivery per subscription asking for the event", async () => {
    const { service, subscriptions, endpoint } = await harness();
    await subscriptions.save(
      subscriptionIn(endpoint, { subscriptionKey: "enrolments-audit", eventTypes: [ENROLLED] }),
    );

    const scheduled = await service.dispatch(request());

    expect(scheduled).toHaveLength(2);
    expect(new Set(scheduled.map((delivery) => delivery.subscriptionId)).size).toBe(2);
  });

  it("leaves a subscription that never selected the event type alone", async () => {
    const { service, subscriptions, endpoint } = await harness();
    await subscriptions.save(
      subscriptionIn(endpoint, { subscriptionKey: "attendance", eventTypes: [ATTENDANCE] }),
    );

    const scheduled = await service.dispatch(request());

    expect(scheduled).toHaveLength(1);
  });

  it("normalizes the arriving event type, so a padded or shouted one still fans out", async () => {
    const { service } = await harness();

    const scheduled = await service.dispatch(request({ eventType: "  Student.Enrolled  " }));

    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.eventType).toBe(ENROLLED);
  });

  it("schedules nothing for a paused subscription, because nothing was owed", async () => {
    const { service, subscriptions, subscription } = await harness();
    await subscriptions.save(pauseWebhookSubscription(subscription));

    expect(await service.dispatch(request())).toHaveLength(0);
  });

  it("schedules nothing for a suspended subscription", async () => {
    const { service, subscriptions, subscription } = await harness();
    await subscriptions.save(suspendWebhookSubscription(subscription, "receiver unreachable"));

    expect(await service.dispatch(request())).toHaveLength(0);
  });

  it("schedules nothing for a revoked subscription", async () => {
    const { service, subscriptions, subscription } = await harness();
    await subscriptions.save(revokeWebhookSubscription(subscription));

    expect(await service.dispatch(request())).toHaveLength(0);
  });

  it("sends each delivery wherever its own subscription points", async () => {
    const { service, subscriptions, endpoints } = await harness();
    const second = endpointIn(TENANT, ORG, "sis.webhook-standby");
    await endpoints.save(second);
    await subscriptions.save(
      subscriptionIn(second, { subscriptionKey: "enrolments-standby", eventTypes: [ENROLLED] }),
    );

    const scheduled = await service.dispatch(request());

    expect(new Set(scheduled.map((delivery) => delivery.endpointId)).size).toBe(2);
  });

  it("carries the subscription's delivery mode onto the delivery", async () => {
    const { service, subscriptions, endpoint } = await harness();
    await subscriptions.save(
      subscriptionIn(endpoint, {
        subscriptionKey: "enrolments-once",
        deliveryMode: "at_most_once",
      }),
    );

    const scheduled = await service.dispatch(request());
    const modes = scheduled.map((delivery) => delivery.deliveryMode).sort();

    expect(modes).toEqual(["at_least_once", "at_most_once"]);
  });

  it("leaves the delivery due immediately, because the backoff is a schedule of retries", async () => {
    const { service } = await harness();

    const scheduled = await service.dispatch(request());
    const delivery = scheduled[0];

    expect(delivery?.outcome).toBe("pending");
    expect(delivery?.attempts).toBe(0);
    expect(delivery?.nextAttemptAt).toBe(delivery?.createdAt);
  });

  it("records the event id and fingerprint the outbox handed over", async () => {
    const { service } = await harness();

    const scheduled = await service.dispatch(request());

    expect(scheduled[0]?.eventId).toBe(EVENT);
    expect(scheduled[0]?.payloadFingerprint).toBe(FINGERPRINT);
  });

  it("returns nothing on a second dispatch of the same event, having scheduled nothing", async () => {
    const { service, repository } = await harness();
    await service.dispatch(request());

    const again = await service.dispatch(request());

    expect(again).toHaveLength(0);
    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
  });

  it("leaves the delivery it already made untouched when the event arrives twice", async () => {
    const { service } = await harness();
    const first = await service.dispatch(request());
    const original = first[0];

    await service.dispatch(request());
    const held = await service.get(TENANT, original?.id ?? MISSING);

    expect(held.updatedAt).toBe(original?.updatedAt);
    expect(held.attempts).toBe(0);
  });

  it("schedules again for a different event, since dedupe is per event and not per subscription", async () => {
    const { service } = await harness();
    await service.dispatch(request());

    const scheduled = await service.dispatch(request({ eventId: OTHER_EVENT }));

    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.eventId).toBe(OTHER_EVENT);
  });

  it("does not reach into another organization's subscriptions", async () => {
    const { service } = await harness();

    expect(await service.dispatch(request({ organizationId: SECOND_ORG }))).toHaveLength(0);
  });

  it("does not reach into another tenant's subscriptions", async () => {
    const { service } = await harness();

    expect(await service.dispatch(request({ tenantId: OTHER }))).toHaveLength(0);
  });

  it("announces one scheduling per delivery and nothing on the repeat", async () => {
    const { service, subscriptions, endpoint, events } = await harness();
    await subscriptions.save(
      subscriptionIn(endpoint, { subscriptionKey: "enrolments-audit", eventTypes: [ENROLLED] }),
    );

    await service.dispatch(request());
    await service.dispatch(request());

    expect(types(events)).toEqual([DELIVERY_SCHEDULED, DELIVERY_SCHEDULED]);
  });
});

describe("OutboundDeliveryService — direct scheduling", () => {
  it("schedules one delivery against a subscription the caller named", async () => {
    const { service, subscription } = await harness();

    const delivery = await service.schedule(params(subscription));

    expect(delivery.subscriptionId).toBe(subscription.id);
    expect(delivery.endpointId).toBe(subscription.endpointId);
    expect(delivery.outcome).toBe("pending");
  });

  it("does not deduplicate, because a caller naming one event has already decided", async () => {
    const { service, subscription, repository } = await harness();

    const first = await service.schedule(params(subscription));
    const second = await service.schedule(params(subscription));

    expect(second.id).not.toBe(first.id);
    expect(await repository.listByTenant(TENANT)).toHaveLength(2);
  });

  it("404s on a subscription nobody can resolve", async () => {
    const { service, subscription } = await harness();

    await expect(
      service.schedule(params(subscription, { subscriptionId: ABSENT_SUBSCRIPTION })),
    ).rejects.toThrow(WebhookSubscriptionNotFoundError);
  });

  it("404s on a subscription that lives in another tenant", async () => {
    const { service, subscriptions, subscription } = await harness();
    const elsewhere = subscriptionIn(endpointIn(OTHER));
    await subscriptions.save(elsewhere);

    await expect(
      service.schedule(params(subscription, { subscriptionId: elsewhere.id })),
    ).rejects.toThrow(WebhookSubscriptionNotFoundError);
  });

  it("404s on an endpoint nobody can resolve", async () => {
    const { service, subscription } = await harness();

    await expect(
      service.schedule(params(subscription, { endpointId: ABSENT_ENDPOINT })),
    ).rejects.toThrow(IntegrationEndpointNotFoundError);
  });

  it("refuses a blank event type", async () => {
    const { service, subscription } = await harness();

    await expect(service.schedule(params(subscription, { eventType: "   " }))).rejects.toThrow(
      EmptyGatewayKeyError,
    );
  });

  it("refuses an event type that does not fit the platform's grammar", async () => {
    const { service, subscription } = await harness();

    await expect(
      service.schedule(params(subscription, { eventType: "student enrolled" })),
    ).rejects.toThrow(InvalidGatewayKeyError);
  });

  it("refuses a blank payload fingerprint", async () => {
    const { service, subscription } = await harness();

    await expect(
      service.schedule(params(subscription, { payloadFingerprint: "  " })),
    ).rejects.toThrow(EmptyGatewayKeyError);
  });

  it("judges the event type before the directory, so a malformed one is reported as such", async () => {
    const { service, subscription } = await harness();

    await expect(
      service.schedule(
        params(subscription, { eventType: "   ", subscriptionId: ABSENT_SUBSCRIPTION }),
      ),
    ).rejects.toThrow(EmptyGatewayKeyError);
  });

  it("announces the scheduling", async () => {
    const { service, subscription, events } = await harness();

    await service.schedule(params(subscription));

    expect(types(events)).toEqual([DELIVERY_SCHEDULED]);
  });
});

describe("OutboundDeliveryService — attempts", () => {
  it("settles a delivery the receiver accepted, and stamps when it went", async () => {
    const { events, service, subscription } = await harness();
    const delivery = await service.schedule(params(subscription));
    const at = shift(delivery.createdAt, 2);

    const next = await service.recordSuccess(TENANT, delivery.id, 200, at);

    expect(next.outcome).toBe("delivered");
    expect(next.attempts).toBe(1);
    expect(next.deliveredAt).toBe(at);
    expect(next.lastAttemptedAt).toBe(at);
    expect(next.nextAttemptAt).toBeNull();
    expect(next.lastStatusCode).toBe(200);
    expect(types(events)).toEqual([DELIVERY_SCHEDULED, DELIVERY_SUCCEEDED]);
  });

  it("clears the message from an earlier attempt, so a delivered row does not read as failed", async () => {
    const { service, subscription } = await harness();
    const delivery = await service.schedule(params(subscription));
    const failed = await service.recordFailure(
      TENANT,
      delivery.id,
      failure({ error: "502 Bad Gateway" }),
      shift(delivery.createdAt, 1),
    );
    expect(failed.lastError).toBe("502 Bad Gateway");

    const next = await service.recordSuccess(
      TENANT,
      delivery.id,
      202,
      shift(delivery.createdAt, 90),
    );

    expect(next.lastError).toBeNull();
    expect(next.attempts).toBe(2);
  });

  it("absorbs a status code outside the HTTP range rather than losing the outcome", async () => {
    const { service, subscription } = await harness();
    const delivery = await service.schedule(params(subscription));

    const next = await service.recordSuccess(TENANT, delivery.id, 0, shift(delivery.createdAt, 1));

    expect(next.outcome).toBe("delivered");
    expect(next.lastStatusCode).toBeNull();
  });

  it("records no status code where the receiver never answered", async () => {
    const { service, subscription } = await harness();
    const delivery = await service.schedule(params(subscription));

    const next = await service.recordFailure(
      TENANT,
      delivery.id,
      failure({ statusCode: null }),
      shift(delivery.createdAt, 1),
    );

    expect(next.lastStatusCode).toBeNull();
    expect(next.lastError).toBe("connect ETIMEDOUT");
  });

  it("counts a failed attempt and schedules the next one ahead of it", async () => {
    const { service, subscription } = await harness();
    const delivery = await service.schedule(params(subscription));
    const at = shift(delivery.createdAt, 1);

    const next = await service.recordFailure(TENANT, delivery.id, failure(), at);

    expect(next.outcome).toBe("failed");
    expect(next.attempts).toBe(1);
    expect(next.lastAttemptedAt).toBe(at);
    expect(gapSeconds(at, next.nextAttemptAt)).toBeGreaterThan(0);
    expect(next.deadLetteredAt).toBeNull();
  });

  it("truncates a message longer than the text it retains, keeping the front of it", async () => {
    const { service, subscription } = await harness();
    const delivery = await service.schedule(params(subscription));
    const rendered = `<html>${"x".repeat(4_000)}`;

    const next = await service.recordFailure(
      TENANT,
      delivery.id,
      failure({ error: rendered }),
      shift(delivery.createdAt, 1),
    );

    expect(next.lastError?.length).toBeLessThan(rendered.length);
    expect(rendered.startsWith(next.lastError ?? "")).toBe(true);
  });

  it("records no message where the receiver failed without saying anything", async () => {
    const { service, subscription } = await harness();
    const delivery = await service.schedule(params(subscription));

    const next = await service.recordFailure(
      TENANT,
      delivery.id,
      failure({ error: "   " }),
      shift(delivery.createdAt, 1),
    );

    expect(next.lastError).toBeNull();
  });

  it("announces a failure on every attempt, not only on the last one", async () => {
    const { service, subscription, events } = await harness();
    const delivery = await service.schedule(params(subscription));

    await service.recordFailure(TENANT, delivery.id, failure(), shift(delivery.createdAt, 1));
    await service.recordFailure(TENANT, delivery.id, failure(), shift(delivery.createdAt, 60));

    expect(types(events)).toEqual([DELIVERY_SCHEDULED, DELIVERY_FAILED, DELIVERY_FAILED]);
  });

  it("dead-letters once the allowance runs out, and says so", async () => {
    const { service, subscription, events } = await harness();
    const delivery = await service.schedule(params(subscription));

    const settled = await deadLetter(service, delivery);

    expect(settled.attempts).toBe(MAX_DELIVERY_ATTEMPTS);
    expect(settled.outcome).toBe("dead_lettered");
    expect(settled.nextAttemptAt).toBeNull();
    expect(settled.deadLetteredAt).toBe(settled.lastAttemptedAt);
    expect(types(events).filter((type) => type === DELIVERY_DEAD_LETTERED)).toHaveLength(1);
    expect(types(events).filter((type) => type === DELIVERY_FAILED)).toHaveLength(
      MAX_DELIVERY_ATTEMPTS - 1,
    );
  });

  it("dead-letters an at-most-once delivery on its first failure, whatever the allowance says", async () => {
    const { service, subscription, events } = await harness();
    const delivery = await service.schedule(params(subscription, { deliveryMode: "at_most_once" }));

    const settled = await service.recordFailure(
      TENANT,
      delivery.id,
      failure(),
      shift(delivery.createdAt, 1),
    );

    expect(settled.attempts).toBe(1);
    expect(settled.outcome).toBe("dead_lettered");
    expect(settled.nextAttemptAt).toBeNull();
    expect(types(events)).toEqual([DELIVERY_SCHEDULED, DELIVERY_DEAD_LETTERED]);
  });

  it("refuses any further attempt on a dead-lettered delivery", async () => {
    const { service, subscription } = await harness();
    const settled = await deadLetter(service, await service.schedule(params(subscription)));
    const at = shift(settled.createdAt, 7_200);

    await expect(service.recordFailure(TENANT, settled.id, failure(), at)).rejects.toThrow(
      DeliverySettledError,
    );
    await expect(service.recordSuccess(TENANT, settled.id, 200, at)).rejects.toThrow(
      DeliverySettledError,
    );
  });

  it("refuses any further attempt on a delivered delivery", async () => {
    const { service, subscription } = await harness();
    const delivery = await service.schedule(params(subscription));
    await service.recordSuccess(TENANT, delivery.id, 200, shift(delivery.createdAt, 1));

    await expect(
      service.recordFailure(TENANT, delivery.id, failure(), shift(delivery.createdAt, 2)),
    ).rejects.toThrow(DeliverySettledError);
  });

  it("404s on a delivery nobody can resolve", async () => {
    const { service } = await harness();
    const at = new Date(0).toISOString() as ISODateString;

    await expect(service.recordSuccess(TENANT, MISSING, 200, at)).rejects.toThrow(
      OutboundDeliveryNotFoundError,
    );
    await expect(service.recordFailure(TENANT, MISSING, failure(), at)).rejects.toThrow(
      OutboundDeliveryNotFoundError,
    );
  });

  it("404s on a delivery held in another tenant", async () => {
    const { service, subscription } = await harness();
    const delivery = await service.schedule(params(subscription));

    await expect(
      service.recordSuccess(OTHER, delivery.id, 200, shift(delivery.createdAt, 1)),
    ).rejects.toThrow(OutboundDeliveryNotFoundError);
  });
});

describe("OutboundDeliveryService — abandonment", () => {
  it("settles a delivery an operator gave up on, and records why", async () => {
    const { service, subscription } = await harness();
    const delivery = await service.schedule(params(subscription));

    const next = await service.abandon(TENANT, delivery.id, "  consumer decommissioned  ");

    expect(next.outcome).toBe("abandoned");
    expect(next.abandonedReason).toBe("consumer decommissioned");
    expect(next.abandonedAt).not.toBeNull();
    expect(next.nextAttemptAt).toBeNull();
  });

  it("refuses a blank reason, because this end is the only one nobody can reconstruct", async () => {
    const { service, subscription } = await harness();
    const delivery = await service.schedule(params(subscription));

    await expect(service.abandon(TENANT, delivery.id, "   ")).rejects.toThrow(EmptyGatewayKeyError);
  });

  it("refuses to abandon a delivery that already reached an end", async () => {
    const { service, subscription } = await harness();
    const delivery = await service.schedule(params(subscription));
    await service.recordSuccess(TENANT, delivery.id, 200, shift(delivery.createdAt, 1));

    await expect(service.abandon(TENANT, delivery.id, "no longer wanted")).rejects.toThrow(
      DeliverySettledError,
    );
  });

  it("announces the abandonment", async () => {
    const { service, subscription, events } = await harness();
    const delivery = await service.schedule(params(subscription));

    await service.abandon(TENANT, delivery.id, "consumer decommissioned");

    expect(types(events)).toEqual([DELIVERY_SCHEDULED, DELIVERY_ABANDONED]);
  });

  it("404s on a delivery nobody can resolve", async () => {
    const { service } = await harness();

    await expect(service.abandon(TENANT, MISSING, "no longer wanted")).rejects.toThrow(
      OutboundDeliveryNotFoundError,
    );
  });
});

describe("OutboundDeliveryService — replay", () => {
  it("sends a dead-lettered delivery again as a new record that remembers the old one", async () => {
    const { service, subscription } = await harness();
    const settled = await deadLetter(service, await service.schedule(params(subscription)));

    const replay = await service.replay(TENANT, settled.id);

    expect(replay.id).not.toBe(settled.id);
    expect(replay.replayOfDeliveryId).toBe(settled.id);
    expect(replay.outcome).toBe("pending");
    expect(replay.attempts).toBe(0);
    expect(replay.nextAttemptAt).toBe(replay.createdAt);
  });

  it("leaves the delivery it replays exactly as it stands", async () => {
    const { service, subscription } = await harness();
    const settled = await deadLetter(service, await service.schedule(params(subscription)));

    await service.replay(TENANT, settled.id);
    const original = await service.get(TENANT, settled.id);

    expect(original).toEqual(settled);
  });

  it("carries the event, the fingerprint and the mode forward, and no attempt history", async () => {
    const { service, subscription } = await harness();
    const settled = await deadLetter(service, await service.schedule(params(subscription)));

    const replay = await service.replay(TENANT, settled.id);

    expect(replay.eventType).toBe(settled.eventType);
    expect(replay.eventId).toBe(settled.eventId);
    expect(replay.payloadFingerprint).toBe(settled.payloadFingerprint);
    expect(replay.deliveryMode).toBe(settled.deliveryMode);
    expect(replay.lastStatusCode).toBeNull();
    expect(replay.lastError).toBeNull();
    expect(replay.deadLetteredAt).toBeNull();
  });

  it("sends the replay wherever the subscription points now, not where it pointed then", async () => {
    const { service, subscriptions, endpoints, subscription } = await harness();
    const settled = await deadLetter(service, await service.schedule(params(subscription)));
    const replacement = endpointIn(TENANT, ORG, "sis.webhook-standby");
    await endpoints.save(replacement);
    await subscriptions.save(rebindSubscriptionEndpoint(subscription, replacement.id));

    const replay = await service.replay(TENANT, settled.id);

    expect(settled.endpointId).not.toBe(replacement.id);
    expect(replay.endpointId).toBe(replacement.id);
  });

  it("points a replay of a replay at its immediate parent, so the chain walks in either direction", async () => {
    const { service, subscription } = await harness();
    const settled = await deadLetter(
      service,
      await service.schedule(params(subscription, { deliveryMode: "at_most_once" })),
    );
    const first = await service.replay(TENANT, settled.id);

    const second = await service.replay(TENANT, (await deadLetter(service, first)).id);

    expect(first.replayOfDeliveryId).toBe(settled.id);
    expect(second.replayOfDeliveryId).toBe(first.id);
  });

  it("refuses to replay a delivery the receiver accepted", async () => {
    const { service, subscription } = await harness();
    const delivery = await service.schedule(params(subscription));
    await service.recordSuccess(TENANT, delivery.id, 200, shift(delivery.createdAt, 1));

    await expect(service.replay(TENANT, delivery.id)).rejects.toThrow(DeliveryNotReplayableError);
  });

  it("refuses to replay a delivery an operator abandoned", async () => {
    const { service, subscription } = await harness();
    const delivery = await service.schedule(params(subscription));
    await service.abandon(TENANT, delivery.id, "consumer decommissioned");

    await expect(service.replay(TENANT, delivery.id)).rejects.toThrow(DeliveryNotReplayableError);
  });

  it("refuses to replay a delivery that has not been tried yet", async () => {
    const { service, subscription } = await harness();
    const delivery = await service.schedule(params(subscription));

    await expect(service.replay(TENANT, delivery.id)).rejects.toThrow(DeliveryNotReplayableError);
  });

  it("announces the replay under the replay's own id", async () => {
    const { service, subscription, events } = await harness();
    const settled = await deadLetter(service, await service.schedule(params(subscription)));

    const replay = await service.replay(TENANT, settled.id);
    const announced = events.published.at(-1);
    const payload = announced?.payload as { deliveryId: Uuid; replayOfDeliveryId: Uuid | null };

    expect(announced?.type).toBe(DELIVERY_REPLAYED);
    expect(payload.deliveryId).toBe(replay.id);
    expect(payload.replayOfDeliveryId).toBe(settled.id);
  });

  it("404s on a delivery nobody can resolve", async () => {
    const { service } = await harness();

    await expect(service.replay(TENANT, MISSING)).rejects.toThrow(OutboundDeliveryNotFoundError);
  });
});

describe("OutboundDeliveryService — reading", () => {
  it("reads one delivery back", async () => {
    const { service, subscription } = await harness();
    const delivery = await service.schedule(params(subscription));

    expect(await service.get(TENANT, delivery.id)).toEqual(delivery);
  });

  it("404s on a delivery nobody can resolve", async () => {
    const { service } = await harness();

    await expect(service.get(TENANT, MISSING)).rejects.toThrow(OutboundDeliveryNotFoundError);
  });

  it("does not read across tenants", async () => {
    const { service, subscription } = await harness();
    const delivery = await service.schedule(params(subscription));

    await expect(service.get(OTHER, delivery.id)).rejects.toThrow(OutboundDeliveryNotFoundError);
  });

  it("lists a delivery whose next attempt has come round", async () => {
    const { service, subscription } = await harness();
    const delivery = await service.schedule(params(subscription));

    const due = await service.listDue(TENANT, shift(delivery.createdAt, 1));

    expect(ids(due)).toEqual([delivery.id]);
  });

  it("leaves out a delivery whose next attempt is still ahead of the sweep", async () => {
    const { service, subscription } = await harness();
    const delivery = await service.schedule(params(subscription));
    const at = shift(delivery.createdAt, 1);
    await service.recordFailure(TENANT, delivery.id, failure(), at);

    expect(await service.listDue(TENANT, shift(at, 5))).toHaveLength(0);
    expect(await service.listDue(TENANT, shift(at, 3_600))).toHaveLength(1);
  });

  it("leaves out a delivery that has reached an end", async () => {
    const { service, subscription } = await harness();
    const delivered = await service.schedule(params(subscription));
    const abandoned = await service.schedule(params(subscription, { eventId: OTHER_EVENT }));
    await service.recordSuccess(TENANT, delivered.id, 200, shift(delivered.createdAt, 1));
    await service.abandon(TENANT, abandoned.id, "consumer decommissioned");

    expect(await service.listDue(TENANT, shift(delivered.createdAt, 7_200))).toHaveLength(0);
  });

  it("lists every delivery made for one subscription, in every outcome", async () => {
    const { service, subscriptions, subscription, endpoint } = await harness();
    const other = subscriptionIn(endpoint, { subscriptionKey: "enrolments-audit" });
    await subscriptions.save(other);
    const mine = await service.schedule(params(subscription));
    const settled = await service.schedule(params(subscription, { eventId: OTHER_EVENT }));
    await service.recordSuccess(TENANT, settled.id, 200, shift(settled.createdAt, 1));
    await service.schedule(params(other));

    const listed = await service.listBySubscription(TENANT, subscription.id);

    expect(new Set(ids(listed))).toEqual(new Set([mine.id, settled.id]));
  });

  it("lists what the institution stopped trying to deliver for one organization", async () => {
    const { service, subscription } = await harness();
    const settled = await deadLetter(service, await service.schedule(params(subscription)));
    await service.schedule(params(subscription, { eventId: OTHER_EVENT }));

    const listed = await service.listDeadLettered(TENANT, ORG);

    expect(ids(listed)).toEqual([settled.id]);
  });

  it("leaves a delivery that still has attempts left out of the dead-letter queue", async () => {
    const { service, subscription } = await harness();
    const delivery = await service.schedule(params(subscription));
    await service.recordFailure(TENANT, delivery.id, failure(), shift(delivery.createdAt, 1));

    expect(await service.listDeadLettered(TENANT, ORG)).toHaveLength(0);
  });

  it("does not put one organization's dead letters in another's queue", async () => {
    const { service, subscription } = await harness();
    await deadLetter(service, await service.schedule(params(subscription)));

    expect(await service.listDeadLettered(TENANT, SECOND_ORG)).toHaveLength(0);
  });

  it("lists every delivery in the tenant, in every outcome", async () => {
    const { service, subscription } = await harness();
    const pending = await service.schedule(params(subscription));
    const settled = await service.schedule(params(subscription, { eventId: OTHER_EVENT }));
    await service.abandon(TENANT, settled.id, "consumer decommissioned");

    const listed = await service.list(TENANT);

    expect(new Set(ids(listed))).toEqual(new Set([pending.id, settled.id]));
  });

  it("does not list across tenants", async () => {
    const { service, subscription } = await harness();
    await service.schedule(params(subscription));

    expect(await service.list(OTHER)).toHaveLength(0);
  });
});
