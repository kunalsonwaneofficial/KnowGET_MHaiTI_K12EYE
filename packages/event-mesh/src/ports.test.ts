import type { CorrelationId, ISODateString, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  type DeadLetter,
  discardDeadLetter,
  recordDeadLetter,
  replayDeadLetter,
} from "./dead-letter";
import {
  type EventStream,
  activateEventStream,
  defineEventStream,
  retireEventStream,
} from "./event-stream";
import {
  type EventTypeDefinition,
  defineEventType,
  deprecateEventType,
  publishEventType,
  retireEventType,
} from "./event-type-definition";
import { type MeshMessage, forgetMeshMessagePayload, recordMeshMessage } from "./mesh-message";
import {
  type MeshSubscription,
  activateMeshSubscription,
  pauseMeshSubscription,
  registerMeshSubscription,
  retireMeshSubscription,
} from "./mesh-subscription";
import {
  DEFAULT_PARTITION_COUNT,
  FIRST_SEQUENCE,
  MIN_DEPRECATION_NOTICE_DAYS,
  type SchemaField,
  UNCOMMITTED_POSITION,
} from "./mesh-value";
import {
  InMemoryDeadLetterRepository,
  InMemoryEventStreamRepository,
  InMemoryEventTypeDefinitionRepository,
  InMemoryMeshMessageRepository,
  InMemoryMeshSubscriptionRepository,
  InMemoryReplayRequestRepository,
  InMemoryStreamBindingRepository,
  InMemorySubscriptionCheckpointRepository,
} from "./ports";
import {
  type ApproveReplayParams,
  type ReplayRequest,
  approveReplay,
  cancelReplay,
  completeReplay,
  requestReplay,
  startReplay,
} from "./replay-request";
import {
  type StreamBinding,
  activateStreamBinding,
  declareStreamBinding,
  drainStreamBinding,
  retireStreamBinding,
} from "./stream-binding";
import {
  type SubscriptionCheckpoint,
  commitCheckpoint,
  openSubscriptionCheckpoint,
} from "./subscription-checkpoint";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org1" as Uuid;
const SIBLING = "org2" as Uuid;
const PUBLISHER = "person-1" as Uuid;
const OPERATOR = "person-2" as Uuid;
const REQUESTER = "person-3" as Uuid;
const APPROVER = "person-4" as Uuid;
const STUDENT = "student-1" as Uuid;
const SUBSCRIPTION = "subscription-1" as Uuid;
const SECOND_SUBSCRIPTION = "subscription-2" as Uuid;
const MESSAGE = "message-1" as Uuid;
const SECOND_MESSAGE = "message-2" as Uuid;
const EVENT = "event-1" as Uuid;
const SECOND_EVENT = "event-2" as Uuid;
const REPLAY = "replay-1" as Uuid;
const CORRELATION = "correlation-1" as CorrelationId;

const EVENT_TYPE_KEY = "student-lifecycle.enrolment-confirmed";
const STREAM_KEY = "student-lifecycle.enrolment";
const OTHER_STREAM_KEY = "attendance.session";
const SUBSCRIPTION_KEY = "finance.ledger-projector";
const CONSUMER_GROUP = "finance.ledger";
const TRACE_ID = "trace-8f21";
const DIGEST = "sha256:9f2c1a";
const PAYLOAD = { studentId: STUDENT, admissionNumber: "ADM-2027-0044" };
const REPLAY_REASON = "the ledger projector lost a day of enrolments to a bad deploy";
const DISCARD_REASON = "the consumer was retired before the message could ever be handled";
const SETTLEMENT_REASON = "every message in the window reached the projector and reconciled";

const FIELDS: readonly SchemaField[] = [
  { name: "studentId", type: "uuid", required: true },
  { name: "admissionNumber", type: "string", required: true },
];

/** One fixed instant, so no assertion below depends on when the suite happens to run. */
const NOW = "2027-01-02T09:15:00.000Z" as ISODateString;
const RECORDED_AT = "2027-01-02T09:15:00.250Z" as ISODateString;
const FAILED_AT = "2027-01-02T09:20:00.000Z" as ISODateString;
const WINDOW_END = "2027-01-02T10:15:00.000Z" as ISODateString;
const RETENTION_CUTOFF = "2027-01-01T09:15:00.000Z" as ISODateString;
const SHORT_SPELLING = "2027-01-02T09:15:00Z" as ISODateString;
const HALF_SECOND_LATER = "2027-01-02T09:15:00.500Z" as ISODateString;
const DAY = 86_400;

const shift = (from: ISODateString, seconds: number): ISODateString =>
  new Date(Date.parse(from) + seconds * 1_000).toISOString() as ISODateString;

const RETIRE_AT = shift(NOW, MIN_DEPRECATION_NOTICE_DAYS * DAY);

const APPROVAL: ApproveReplayParams = {
  approvedBy: APPROVER,
  verdict: {
    subscriptionKey: SUBSCRIPTION_KEY,
    allowed: true,
    refusal: null,
    windowSeconds: 3_600,
    messageCount: 128,
    retentionCutoff: RETENTION_CUTOFF,
  },
};

const eventTypeIn = (
  tenantId: TenantId,
  overrides: Partial<EventTypeDefinition> = {},
): EventTypeDefinition => ({
  ...defineEventType({
    tenantId,
    organizationId: ORG,
    eventTypeKey: EVENT_TYPE_KEY,
    version: 2,
    title: "Enrolment Confirmed",
    summary: "A student's place at the school is confirmed and the roll is updated.",
    schemaFields: FIELDS,
  }),
  ...overrides,
});

const streamIn = (tenantId: TenantId, overrides: Partial<EventStream> = {}): EventStream => ({
  ...defineEventStream({
    tenantId,
    organizationId: ORG,
    streamKey: STREAM_KEY,
    title: "Enrolment",
    summary: "Every fact the enrolment desk publishes about a student's place at the school.",
    partitionKeyPath: "aggregate.aggregateId",
    retention: "full",
    eventTypeKeys: [EVENT_TYPE_KEY, "attendance.session-closed"],
  }),
  ...overrides,
});

const bindingIn = (tenantId: TenantId, overrides: Partial<StreamBinding> = {}): StreamBinding => ({
  ...declareStreamBinding({
    tenantId,
    organizationId: ORG,
    streamKey: STREAM_KEY,
    transport: "kafka",
    transportRef: "config:mesh.kafka.primary",
  }),
  ...overrides,
});

const subscriptionIn = (
  tenantId: TenantId,
  overrides: Partial<MeshSubscription> = {},
): MeshSubscription => ({
  ...registerMeshSubscription({
    tenantId,
    organizationId: ORG,
    subscriptionKey: SUBSCRIPTION_KEY,
    streamKey: STREAM_KEY,
    consumerGroup: CONSUMER_GROUP,
    title: "Ledger Projector",
  }),
  ...overrides,
});

const messageIn = (tenantId: TenantId, overrides: Partial<MeshMessage> = {}): MeshMessage => ({
  ...recordMeshMessage({
    organizationId: ORG,
    envelope: {
      eventId: EVENT,
      eventTypeKey: EVENT_TYPE_KEY,
      eventTypeVersion: 2,
      tenantId,
      aggregate: { aggregateType: "student", aggregateId: STUDENT },
      producerKey: "student-lifecycle",
      correlationId: CORRELATION,
      causationId: null,
      traceId: TRACE_ID,
      streamKey: STREAM_KEY,
      partitionKey: STUDENT,
      occurredAt: NOW,
      recordedAt: RECORDED_AT,
    },
    partitioning: {
      streamKey: STREAM_KEY,
      ordering: "partition",
      partitionCount: DEFAULT_PARTITION_COUNT,
      partitionKeyPath: "aggregate.aggregateId",
    },
    sequence: FIRST_SEQUENCE,
    retention: "full",
    payloadDigest: DIGEST,
    payload: PAYLOAD,
  }),
  ...overrides,
});

const checkpointIn = (
  tenantId: TenantId,
  overrides: Partial<SubscriptionCheckpoint> = {},
): SubscriptionCheckpoint => ({
  ...openSubscriptionCheckpoint({
    tenantId,
    organizationId: ORG,
    subscriptionId: SUBSCRIPTION,
    subscriptionKey: SUBSCRIPTION_KEY,
    streamKey: STREAM_KEY,
    partition: 3,
    partitionCount: DEFAULT_PARTITION_COUNT,
  }),
  ...overrides,
});

const deadLetterIn = (tenantId: TenantId, overrides: Partial<DeadLetter> = {}): DeadLetter => ({
  ...recordDeadLetter({
    tenantId,
    organizationId: ORG,
    subscriptionId: SUBSCRIPTION,
    subscriptionKey: SUBSCRIPTION_KEY,
    streamKey: STREAM_KEY,
    messageId: MESSAGE,
    eventId: EVENT,
    eventTypeKey: EVENT_TYPE_KEY,
    partition: 3,
    sequence: FIRST_SEQUENCE,
    reason: "attempts_exhausted",
    attempts: 7,
    traceId: TRACE_ID,
    failedAt: FAILED_AT,
  }),
  ...overrides,
});

const replayIn = (tenantId: TenantId, overrides: Partial<ReplayRequest> = {}): ReplayRequest => ({
  ...requestReplay({
    tenantId,
    organizationId: ORG,
    subscriptionId: SUBSCRIPTION,
    subscriptionKey: SUBSCRIPTION_KEY,
    streamKey: STREAM_KEY,
    fromInstant: NOW,
    toInstant: WINDOW_END,
    reason: REPLAY_REASON,
    requestedBy: REQUESTER,
  }),
  ...overrides,
});

describe("nothing a repository holds crosses a tenant boundary", () => {
  it("keeps an event type inside the tenant that defined it", async () => {
    const repository = new InMemoryEventTypeDefinitionRepository();
    const definition = eventTypeIn(TENANT);
    await repository.save(definition);

    expect(await repository.findById(OTHER, definition.id)).toBeNull();
    expect(await repository.findByKeyAndVersion(OTHER, EVENT_TYPE_KEY, 2)).toBeNull();
    expect(await repository.listByKey(OTHER, EVENT_TYPE_KEY)).toEqual([]);
    expect(await repository.listCarried(OTHER, ORG)).toEqual([]);
    expect(await repository.listByTenant(OTHER)).toEqual([]);
    expect(await repository.findById(TENANT, definition.id)).toEqual(definition);
  });

  it("keeps a stream inside the tenant that declared it", async () => {
    const repository = new InMemoryEventStreamRepository();
    const stream = streamIn(TENANT);
    await repository.save(stream);

    expect(await repository.findById(OTHER, stream.id)).toBeNull();
    expect(await repository.findByKey(OTHER, STREAM_KEY)).toBeNull();
    expect(await repository.listPublishable(OTHER, ORG)).toEqual([]);
    expect(await repository.listAcceptingEventType(OTHER, EVENT_TYPE_KEY)).toEqual([]);
    expect(await repository.listByTenant(OTHER)).toEqual([]);
    expect(await repository.findById(TENANT, stream.id)).toEqual(stream);
  });

  it("keeps a binding inside the tenant whose stream it carries", async () => {
    const repository = new InMemoryStreamBindingRepository();
    const binding = bindingIn(TENANT);
    await repository.save(binding);

    expect(await repository.findById(OTHER, binding.id)).toBeNull();
    expect(await repository.findByStreamAndTransport(OTHER, STREAM_KEY, "kafka")).toBeNull();
    expect(await repository.listByStream(OTHER, STREAM_KEY)).toEqual([]);
    expect(await repository.listCarrying(OTHER, ORG)).toEqual([]);
    expect(await repository.listByTenant(OTHER)).toEqual([]);
    expect(await repository.findById(TENANT, binding.id)).toEqual(binding);
  });

  it("keeps a subscription inside the tenant that registered it", async () => {
    const repository = new InMemoryMeshSubscriptionRepository();
    const subscription = subscriptionIn(TENANT);
    await repository.save(subscription);

    expect(await repository.findById(OTHER, subscription.id)).toBeNull();
    expect(await repository.findByKey(OTHER, SUBSCRIPTION_KEY)).toBeNull();
    expect(await repository.listByStream(OTHER, STREAM_KEY)).toEqual([]);
    expect(await repository.listDeliverable(OTHER, STREAM_KEY)).toEqual([]);
    expect(await repository.listByTenant(OTHER)).toEqual([]);
    expect(await repository.findById(TENANT, subscription.id)).toEqual(subscription);
  });

  it("keeps a message inside the tenant whose envelope carried it", async () => {
    const repository = new InMemoryMeshMessageRepository();
    const message = messageIn(TENANT);
    await repository.save(message);

    expect(await repository.findById(OTHER, message.id)).toBeNull();
    expect(await repository.findByEventId(OTHER, EVENT)).toBeNull();
    expect(await repository.nextSequence(OTHER, STREAM_KEY)).toBe(FIRST_SEQUENCE);
    expect(await repository.streamHead(OTHER, STREAM_KEY, message.partition)).toBe(
      UNCOMMITTED_POSITION,
    );
    expect(await repository.countWindow(OTHER, STREAM_KEY, NOW, WINDOW_END)).toBe(0);
    expect(await repository.listWindow(OTHER, STREAM_KEY, NOW, WINDOW_END)).toEqual([]);
    expect(await repository.listRetaining(OTHER, STREAM_KEY, WINDOW_END)).toEqual([]);
    expect(await repository.findById(TENANT, message.id)).toEqual(message);
  });

  it("keeps a checkpoint inside the tenant whose consumer committed it", async () => {
    const repository = new InMemorySubscriptionCheckpointRepository();
    const checkpoint = checkpointIn(TENANT);
    await repository.save(checkpoint);

    expect(await repository.findById(OTHER, checkpoint.id)).toBeNull();
    expect(await repository.findByPartition(OTHER, SUBSCRIPTION, checkpoint.partition)).toBeNull();
    expect(await repository.listBySubscription(OTHER, SUBSCRIPTION)).toEqual([]);
    expect(await repository.listByTenant(OTHER)).toEqual([]);
    expect(await repository.findById(TENANT, checkpoint.id)).toEqual(checkpoint);
  });

  it("keeps a dead letter inside the tenant whose delivery failed", async () => {
    const repository = new InMemoryDeadLetterRepository();
    const letter = deadLetterIn(TENANT);
    await repository.save(letter);

    expect(await repository.findById(OTHER, letter.id)).toBeNull();
    expect(await repository.findByMessage(OTHER, SUBSCRIPTION, MESSAGE)).toBeNull();
    expect(await repository.listOpen(OTHER, ORG)).toEqual([]);
    expect(await repository.listBySubscription(OTHER, SUBSCRIPTION)).toEqual([]);
    expect(await repository.listByTenant(OTHER)).toEqual([]);
    expect(await repository.findById(TENANT, letter.id)).toEqual(letter);
  });

  it("keeps a replay request inside the tenant that asked for it", async () => {
    const repository = new InMemoryReplayRequestRepository();
    const request = replayIn(TENANT);
    await repository.save(request);

    expect(await repository.findById(OTHER, request.id)).toBeNull();
    expect(await repository.findRunning(OTHER, SUBSCRIPTION)).toBeNull();
    expect(await repository.listBySubscription(OTHER, SUBSCRIPTION)).toEqual([]);
    expect(await repository.listByTenant(OTHER)).toEqual([]);
    expect(await repository.findById(TENANT, request.id)).toEqual(request);
  });
});

describe("the reads that stop there being two of something", () => {
  it("finds a version by the key and the number that together name it", async () => {
    const repository = new InMemoryEventTypeDefinitionRepository();
    const first = eventTypeIn(TENANT, { id: "definition-1" as Uuid, version: 1 });
    const second = eventTypeIn(TENANT, { id: "definition-2" as Uuid, version: 2 });
    await repository.save(first);
    await repository.save(second);

    expect(await repository.findByKeyAndVersion(TENANT, EVENT_TYPE_KEY, 1)).toEqual(first);
    expect(await repository.findByKeyAndVersion(TENANT, EVENT_TYPE_KEY, 2)).toEqual(second);
    expect(await repository.findByKeyAndVersion(TENANT, EVENT_TYPE_KEY, 3)).toBeNull();
  });

  it("keeps a retired version's number taken, so nothing is published into its shape again", async () => {
    const repository = new InMemoryEventTypeDefinitionRepository();
    const retired = retireEventType(eventTypeIn(TENANT));
    await repository.save(retired);

    expect(await repository.findByKeyAndVersion(TENANT, EVENT_TYPE_KEY, 2)).toEqual(retired);
    expect(await repository.listCarried(TENANT, ORG)).toEqual([]);
  });

  it("keeps a retired stream's key taken, so no later stream inherits its messages", async () => {
    const repository = new InMemoryEventStreamRepository();
    const retired = retireEventStream(streamIn(TENANT));
    await repository.save(retired);

    expect(await repository.findByKey(TENANT, STREAM_KEY)).toEqual(retired);
    expect(await repository.listPublishable(TENANT, ORG)).toEqual([]);
  });

  it("finds one binding per stream per backbone, so two never carry the same messages", async () => {
    const repository = new InMemoryStreamBindingRepository();
    const kafka = bindingIn(TENANT, { id: "binding-1" as Uuid });
    const nats = bindingIn(TENANT, {
      id: "binding-2" as Uuid,
      transport: "nats",
      transportRef: "config:mesh.nats.standby",
    });
    await repository.save(kafka);
    await repository.save(nats);

    expect(await repository.findByStreamAndTransport(TENANT, STREAM_KEY, "kafka")).toEqual(kafka);
    expect(await repository.findByStreamAndTransport(TENANT, STREAM_KEY, "nats")).toEqual(nats);
    expect(await repository.findByStreamAndTransport(TENANT, STREAM_KEY, "outbox")).toBeNull();
  });

  it("keeps a retired subscription's key taken, because its checkpoints outlive it", async () => {
    const repository = new InMemoryMeshSubscriptionRepository();
    const retired = retireMeshSubscription(subscriptionIn(TENANT));
    await repository.save(retired);

    expect(await repository.findByKey(TENANT, SUBSCRIPTION_KEY)).toEqual(retired);
    expect(await repository.listDeliverable(TENANT, STREAM_KEY)).toEqual([]);
  });

  it("finds the message an event was already recorded as, so a redelivery is not filed twice", async () => {
    const repository = new InMemoryMeshMessageRepository();
    const message = messageIn(TENANT);
    await repository.save(message);

    expect(await repository.findByEventId(TENANT, EVENT)).toEqual(message);
    expect(await repository.findByEventId(TENANT, SECOND_EVENT)).toBeNull();
  });

  it("holds one position per partition, so two consumers never commit over each other", async () => {
    const repository = new InMemorySubscriptionCheckpointRepository();
    const third = checkpointIn(TENANT, { id: "checkpoint-1" as Uuid, partition: 3 });
    const fifth = checkpointIn(TENANT, { id: "checkpoint-2" as Uuid, partition: 5 });
    await repository.save(third);
    await repository.save(fifth);

    expect(await repository.findByPartition(TENANT, SUBSCRIPTION, 3)).toEqual(third);
    expect(await repository.findByPartition(TENANT, SUBSCRIPTION, 5)).toEqual(fifth);
    expect(await repository.findByPartition(TENANT, SUBSCRIPTION, 4)).toBeNull();
  });

  it("holds one dead letter per message per subscription, and not one per stream", async () => {
    const repository = new InMemoryDeadLetterRepository();
    const projector = deadLetterIn(TENANT, { id: "letter-1" as Uuid });
    const warehouse = deadLetterIn(TENANT, {
      id: "letter-2" as Uuid,
      subscriptionId: SECOND_SUBSCRIPTION,
      subscriptionKey: "analytics.warehouse",
    });
    await repository.save(projector);
    await repository.save(warehouse);

    expect(await repository.findByMessage(TENANT, SUBSCRIPTION, MESSAGE)).toEqual(projector);
    expect(await repository.findByMessage(TENANT, SECOND_SUBSCRIPTION, MESSAGE)).toEqual(warehouse);
    expect(await repository.findByMessage(TENANT, SUBSCRIPTION, SECOND_MESSAGE)).toBeNull();
  });

  it("finds the replay that is running, and not the one merely asked for or already done", async () => {
    const repository = new InMemoryReplayRequestRepository();
    const asked = replayIn(TENANT, { id: "replay-2" as Uuid });
    const running = startReplay(approveReplay(replayIn(TENANT, { id: REPLAY }), APPROVAL));
    const done = completeReplay(
      startReplay(approveReplay(replayIn(TENANT, { id: "replay-3" as Uuid }), APPROVAL)),
      128,
    );
    await repository.save(asked);
    await repository.save(running);
    await repository.save(done);

    expect(await repository.findRunning(TENANT, SUBSCRIPTION)).toEqual(running);
    expect(await repository.findRunning(TENANT, SECOND_SUBSCRIPTION)).toBeNull();
  });
});

describe("the lists an operator runs off", () => {
  it("puts a key's versions in the order they were issued", async () => {
    const repository = new InMemoryEventTypeDefinitionRepository();
    await repository.save(eventTypeIn(TENANT, { id: "definition-3" as Uuid, version: 3 }));
    await repository.save(eventTypeIn(TENANT, { id: "definition-1" as Uuid, version: 1 }));
    await repository.save(eventTypeIn(TENANT, { id: "definition-2" as Uuid, version: 2 }));

    const versions = (await repository.listByKey(TENANT, EVENT_TYPE_KEY)).map((d) => d.version);

    expect(versions).toEqual([1, 2, 3]);
  });

  it("carries what a producer may publish against, and neither a draft nor a retired shape", async () => {
    const repository = new InMemoryEventTypeDefinitionRepository();
    const draft = eventTypeIn(TENANT, { id: "definition-1" as Uuid, version: 1 });
    const published = publishEventType(
      eventTypeIn(TENANT, { id: "definition-2" as Uuid, version: 2 }),
      PUBLISHER,
    );
    const retired = retireEventType(
      eventTypeIn(TENANT, { id: "definition-3" as Uuid, version: 3 }),
    );
    await repository.save(draft);
    await repository.save(published);
    await repository.save(retired);

    expect(await repository.listCarried(TENANT, ORG)).toEqual([published]);
    expect(await repository.listByTenant(TENANT)).toHaveLength(3);
  });

  it("keeps carrying a deprecated version, because the notice period is what it is for", async () => {
    const repository = new InMemoryEventTypeDefinitionRepository();
    const published = publishEventType(eventTypeIn(TENANT), PUBLISHER);
    const deprecated = deprecateEventType(published, NOW, RETIRE_AT, 3);
    await repository.save(deprecated);

    expect(await repository.listCarried(TENANT, ORG)).toEqual([deprecated]);
    expect(deprecated.retireAt).toBe(RETIRE_AT);
  });

  it("offers a producer the streams that are accepting, and not the ones meant to be", async () => {
    const repository = new InMemoryEventStreamRepository();
    const draft = streamIn(TENANT, { id: "stream-1" as Uuid, streamKey: "admissions.application" });
    const active = activateEventStream(streamIn(TENANT, { id: "stream-2" as Uuid }), OPERATOR);
    const retired = retireEventStream(
      streamIn(TENANT, { id: "stream-3" as Uuid, streamKey: OTHER_STREAM_KEY }),
    );
    await repository.save(draft);
    await repository.save(active);
    await repository.save(retired);

    expect(await repository.listPublishable(TENANT, ORG)).toEqual([active]);
    expect(await repository.listByTenant(TENANT)).toHaveLength(3);
  });

  it("answers which streams carry a type, so retiring one is an informed act", async () => {
    const repository = new InMemoryEventStreamRepository();
    await repository.save(streamIn(TENANT, { id: "stream-1" as Uuid }));
    await repository.save(
      streamIn(TENANT, { id: "stream-2" as Uuid, streamKey: OTHER_STREAM_KEY }),
    );
    await repository.save(
      streamIn(TENANT, {
        id: "stream-3" as Uuid,
        streamKey: "library.loan",
        eventTypeKeys: ["library.loan-issued"],
      }),
    );

    const keys = (await repository.listAcceptingEventType(TENANT, EVENT_TYPE_KEY)).map(
      (s) => s.streamKey,
    );

    expect(keys).toEqual([OTHER_STREAM_KEY, STREAM_KEY]);
  });

  it("puts a stream's backbones in the order they were declared", async () => {
    const repository = new InMemoryStreamBindingRepository();
    const first = bindingIn(TENANT, { id: "binding-1" as Uuid, createdAt: NOW });
    const second = bindingIn(TENANT, {
      id: "binding-2" as Uuid,
      transport: "nats",
      transportRef: "config:mesh.nats.standby",
      createdAt: shift(NOW, 60),
    });
    await repository.save(second);
    await repository.save(first);

    const transports = (await repository.listByStream(TENANT, STREAM_KEY)).map((b) => b.transport);

    expect(transports).toEqual(["kafka", "nats"]);
  });

  it("separates the backbone in service from the one still emptying", async () => {
    const repository = new InMemoryStreamBindingRepository();
    const carrying = activateStreamBinding(
      bindingIn(TENANT, { id: "binding-1" as Uuid }),
      OPERATOR,
    );
    const draining = drainStreamBinding(
      activateStreamBinding(
        bindingIn(TENANT, {
          id: "binding-2" as Uuid,
          transport: "nats",
          transportRef: "config:mesh.nats.standby",
        }),
        OPERATOR,
      ),
    );
    await repository.save(carrying);
    await repository.save(draining);

    expect(await repository.listCarrying(TENANT, ORG)).toEqual([carrying]);
    expect(await repository.listByStream(TENANT, STREAM_KEY)).toHaveLength(2);
  });

  it("keeps a retired binding on the stream's history, and off the carrying list", async () => {
    const repository = new InMemoryStreamBindingRepository();
    const retired = retireStreamBinding(bindingIn(TENANT), 0);
    await repository.save(retired);

    expect(await repository.listByStream(TENANT, STREAM_KEY)).toEqual([retired]);
    expect(await repository.listCarrying(TENANT, ORG)).toEqual([]);
  });

  it("routes to the subscriptions that are running, and lists the paused one anyway", async () => {
    const repository = new InMemoryMeshSubscriptionRepository();
    const active = activateMeshSubscription(
      subscriptionIn(TENANT, { id: "subscription-a" as Uuid }),
      OPERATOR,
    );
    const paused = pauseMeshSubscription(
      activateMeshSubscription(
        subscriptionIn(TENANT, {
          id: "subscription-b" as Uuid,
          subscriptionKey: "analytics.warehouse",
          consumerGroup: "analytics.warehouse",
        }),
        OPERATOR,
      ),
    );
    await repository.save(active);
    await repository.save(paused);

    const keys = (await repository.listByStream(TENANT, STREAM_KEY)).map((s) => s.subscriptionKey);

    expect(keys).toEqual(["analytics.warehouse", SUBSCRIPTION_KEY]);
    expect(await repository.listDeliverable(TENANT, STREAM_KEY)).toEqual([active]);
  });

  it("reports a consumer's positions per partition, because that is where lag lives", async () => {
    const repository = new InMemorySubscriptionCheckpointRepository();
    await repository.save(checkpointIn(TENANT, { id: "checkpoint-5" as Uuid, partition: 5 }));
    await repository.save(checkpointIn(TENANT, { id: "checkpoint-1" as Uuid, partition: 1 }));
    await repository.save(checkpointIn(TENANT, { id: "checkpoint-3" as Uuid, partition: 3 }));

    const partitions = (await repository.listBySubscription(TENANT, SUBSCRIPTION)).map(
      (c) => c.partition,
    );

    expect(partitions).toEqual([1, 3, 5]);
  });

  it("moves one partition's position and leaves every other partition where it was", async () => {
    const repository = new InMemorySubscriptionCheckpointRepository();
    const first = checkpointIn(TENANT, { id: "checkpoint-1" as Uuid, partition: 1 });
    const third = checkpointIn(TENANT, { id: "checkpoint-3" as Uuid, partition: 3 });
    await repository.save(commitCheckpoint(first, 42, 60));
    await repository.save(third);

    const positions = (await repository.listBySubscription(TENANT, SUBSCRIPTION)).map(
      (c) => c.committedPosition,
    );

    expect(positions).toEqual([42, UNCOMMITTED_POSITION]);
  });

  it("puts the oldest unanswered failure at the top of the worklist", async () => {
    const repository = new InMemoryDeadLetterRepository();
    const later = deadLetterIn(TENANT, {
      id: "letter-1" as Uuid,
      failedAt: shift(FAILED_AT, 300),
    });
    const earlier = deadLetterIn(TENANT, {
      id: "letter-2" as Uuid,
      messageId: SECOND_MESSAGE,
      eventId: SECOND_EVENT,
      failedAt: FAILED_AT,
    });
    await repository.save(later);
    await repository.save(earlier);

    const order = (await repository.listOpen(TENANT, ORG)).map((l) => l.id);

    expect(order).toEqual([earlier.id, later.id]);
  });

  it("takes a settled failure off the worklist and keeps it in the record", async () => {
    const repository = new InMemoryDeadLetterRepository();
    const open = deadLetterIn(TENANT, { id: "letter-1" as Uuid, failedAt: FAILED_AT });
    const replayed = replayDeadLetter(
      deadLetterIn(TENANT, {
        id: "letter-2" as Uuid,
        messageId: SECOND_MESSAGE,
        failedAt: shift(FAILED_AT, 60),
      }),
      REPLAY,
      OPERATOR,
    );
    const discarded = discardDeadLetter(
      deadLetterIn(TENANT, {
        id: "letter-3" as Uuid,
        messageId: "message-3" as Uuid,
        failedAt: shift(FAILED_AT, 120),
      }),
      { discardedBy: OPERATOR, reason: DISCARD_REASON },
    );
    await repository.save(open);
    await repository.save(replayed);
    await repository.save(discarded);

    expect(await repository.listOpen(TENANT, ORG)).toEqual([open]);
    expect(await repository.listBySubscription(TENANT, SUBSCRIPTION)).toHaveLength(3);
    expect(replayed.replayId).toBe(REPLAY);
    expect(discarded.discardReason).toBe(DISCARD_REASON);
  });

  it("keeps a consumer's replay history after each request has ended", async () => {
    const repository = new InMemoryReplayRequestRepository();
    const first = replayIn(TENANT, { id: REPLAY, createdAt: NOW });
    const second = cancelReplay(
      replayIn(TENANT, { id: "replay-2" as Uuid, createdAt: shift(NOW, 60) }),
      { settledBy: OPERATOR, reason: SETTLEMENT_REASON },
    );
    await repository.save(second);
    await repository.save(first);

    const order = (await repository.listBySubscription(TENANT, SUBSCRIPTION)).map((r) => r.id);

    expect(order).toEqual([first.id, second.id]);
    expect(await repository.findRunning(TENANT, SUBSCRIPTION)).toBeNull();
  });
});

describe("what one organization may not see of another", () => {
  it("shows each organization the event types it registered and no others", async () => {
    const repository = new InMemoryEventTypeDefinitionRepository();
    const ours = publishEventType(eventTypeIn(TENANT, { id: "definition-1" as Uuid }), PUBLISHER);
    const theirs = publishEventType(
      eventTypeIn(TENANT, { id: "definition-2" as Uuid, organizationId: SIBLING, version: 3 }),
      PUBLISHER,
    );
    await repository.save(ours);
    await repository.save(theirs);

    expect(await repository.listCarried(TENANT, ORG)).toEqual([ours]);
    expect(await repository.listCarried(TENANT, SIBLING)).toEqual([theirs]);
    expect(await repository.listByTenant(TENANT)).toHaveLength(2);
  });

  it("shows each organization the streams it may publish to and no others", async () => {
    const repository = new InMemoryEventStreamRepository();
    const ours = activateEventStream(streamIn(TENANT, { id: "stream-1" as Uuid }), OPERATOR);
    const theirs = activateEventStream(
      streamIn(TENANT, {
        id: "stream-2" as Uuid,
        organizationId: SIBLING,
        streamKey: OTHER_STREAM_KEY,
      }),
      OPERATOR,
    );
    await repository.save(ours);
    await repository.save(theirs);

    expect(await repository.listPublishable(TENANT, ORG)).toEqual([ours]);
    expect(await repository.listPublishable(TENANT, SIBLING)).toEqual([theirs]);
    expect(await repository.listByTenant(TENANT)).toHaveLength(2);
  });

  it("shows each organization the backbones carrying its traffic and no others", async () => {
    const repository = new InMemoryStreamBindingRepository();
    const ours = activateStreamBinding(bindingIn(TENANT, { id: "binding-1" as Uuid }), OPERATOR);
    const theirs = activateStreamBinding(
      bindingIn(TENANT, {
        id: "binding-2" as Uuid,
        organizationId: SIBLING,
        streamKey: OTHER_STREAM_KEY,
      }),
      OPERATOR,
    );
    await repository.save(ours);
    await repository.save(theirs);

    expect(await repository.listCarrying(TENANT, ORG)).toEqual([ours]);
    expect(await repository.listCarrying(TENANT, SIBLING)).toEqual([theirs]);
    expect(await repository.listByTenant(TENANT)).toHaveLength(2);
  });

  it("shows each organization the failures it has to answer for and no others", async () => {
    const repository = new InMemoryDeadLetterRepository();
    const ours = deadLetterIn(TENANT, { id: "letter-1" as Uuid });
    const theirs = deadLetterIn(TENANT, {
      id: "letter-2" as Uuid,
      organizationId: SIBLING,
      messageId: SECOND_MESSAGE,
      eventId: SECOND_EVENT,
    });
    await repository.save(ours);
    await repository.save(theirs);

    expect(await repository.listOpen(TENANT, ORG)).toEqual([ours]);
    expect(await repository.listOpen(TENANT, SIBLING)).toEqual([theirs]);
    expect(await repository.listByTenant(TENANT)).toHaveLength(2);
  });
});

describe("the reads that bound the one table nobody may list whole", () => {
  it("hands out sequences without a gap, starting where a stream starts", async () => {
    const repository = new InMemoryMeshMessageRepository();

    expect(await repository.nextSequence(TENANT, STREAM_KEY)).toBe(FIRST_SEQUENCE);

    await repository.save(messageIn(TENANT, { id: MESSAGE, sequence: FIRST_SEQUENCE }));

    expect(await repository.nextSequence(TENANT, STREAM_KEY)).toBe(FIRST_SEQUENCE + 1);

    await repository.save(messageIn(TENANT, { id: SECOND_MESSAGE, sequence: FIRST_SEQUENCE + 1 }));

    expect(await repository.nextSequence(TENANT, STREAM_KEY)).toBe(FIRST_SEQUENCE + 2);
  });

  it("counts a sequence per stream, so one busy stream does not advance another", async () => {
    const repository = new InMemoryMeshMessageRepository();
    await repository.save(messageIn(TENANT, { id: MESSAGE, sequence: 9 }));

    expect(await repository.nextSequence(TENANT, STREAM_KEY)).toBe(10);
    expect(await repository.nextSequence(TENANT, OTHER_STREAM_KEY)).toBe(FIRST_SEQUENCE);
  });

  it("reports a head per partition, because that is what a position is measured against", async () => {
    const repository = new InMemoryMeshMessageRepository();
    await repository.save(messageIn(TENANT, { id: MESSAGE, partition: 2, sequence: 7 }));
    await repository.save(messageIn(TENANT, { id: SECOND_MESSAGE, partition: 2, sequence: 11 }));

    expect(await repository.streamHead(TENANT, STREAM_KEY, 2)).toBe(11);
    expect(await repository.streamHead(TENANT, STREAM_KEY, 5)).toBe(UNCOMMITTED_POSITION);
  });

  it("counts exactly what it would list, so a replay estimate matches the replay", async () => {
    const repository = new InMemoryMeshMessageRepository();
    await repository.save(messageIn(TENANT, { id: MESSAGE, sequence: 1, recordedAt: NOW }));
    await repository.save(
      messageIn(TENANT, { id: SECOND_MESSAGE, sequence: 2, recordedAt: shift(NOW, 600) }),
    );
    await repository.save(
      messageIn(TENANT, { id: "message-3" as Uuid, sequence: 3, recordedAt: shift(NOW, 7_200) }),
    );

    expect(await repository.countWindow(TENANT, STREAM_KEY, NOW, WINDOW_END)).toBe(2);
    expect(await repository.listWindow(TENANT, STREAM_KEY, NOW, WINDOW_END)).toHaveLength(2);
  });

  it("takes both ends of a window inclusively, so a boundary message is not lost", async () => {
    const repository = new InMemoryMeshMessageRepository();
    await repository.save(messageIn(TENANT, { id: MESSAGE, sequence: 1, recordedAt: NOW }));
    await repository.save(
      messageIn(TENANT, { id: SECOND_MESSAGE, sequence: 2, recordedAt: WINDOW_END }),
    );

    expect(await repository.countWindow(TENANT, STREAM_KEY, NOW, WINDOW_END)).toBe(2);
  });

  it("delivers a window in the order the stream took it, not the order it was stored", async () => {
    const repository = new InMemoryMeshMessageRepository();
    await repository.save(messageIn(TENANT, { id: "message-3" as Uuid, sequence: 3 }));
    await repository.save(messageIn(TENANT, { id: MESSAGE, sequence: 1 }));
    await repository.save(messageIn(TENANT, { id: SECOND_MESSAGE, sequence: 2 }));

    const sequences = (await repository.listWindow(TENANT, STREAM_KEY, NOW, WINDOW_END)).map(
      (m) => m.sequence,
    );

    expect(sequences).toEqual([1, 2, 3]);
  });

  it("windows on when the mesh accepted the event, not on when it happened", async () => {
    const repository = new InMemoryMeshMessageRepository();
    await repository.save(
      messageIn(TENANT, { id: MESSAGE, occurredAt: shift(NOW, -DAY), recordedAt: RECORDED_AT }),
    );

    expect(await repository.countWindow(TENANT, STREAM_KEY, NOW, WINDOW_END)).toBe(1);
  });

  it("compares instants as instants, so a shorter spelling is not read as a later one", async () => {
    const repository = new InMemoryMeshMessageRepository();
    await repository.save(messageIn(TENANT, { id: MESSAGE, recordedAt: SHORT_SPELLING }));

    expect(await repository.countWindow(TENANT, STREAM_KEY, HALF_SECOND_LATER, WINDOW_END)).toBe(0);
    expect(await repository.countWindow(TENANT, STREAM_KEY, NOW, WINDOW_END)).toBe(1);
  });

  it("offers the sweep only the payloads there are still payloads to forget", async () => {
    const repository = new InMemoryMeshMessageRepository();
    const full = messageIn(TENANT, { id: MESSAGE, sequence: 1, recordedAt: NOW });
    const digestOnly = messageIn(TENANT, {
      id: SECOND_MESSAGE,
      sequence: 2,
      recordedAt: NOW,
      retention: "digest",
      payload: null,
    });
    const forgotten = forgetMeshMessagePayload(
      messageIn(TENANT, { id: "message-3" as Uuid, sequence: 3, recordedAt: NOW }),
    );
    await repository.save(full);
    await repository.save(digestOnly);
    await repository.save(forgotten);

    const retaining = (await repository.listRetaining(TENANT, STREAM_KEY, WINDOW_END)).map(
      (m) => m.id,
    );

    expect(retaining).toEqual([full.id]);
  });

  it("leaves the sweep nothing to do the second time it runs", async () => {
    const repository = new InMemoryMeshMessageRepository();
    await repository.save(messageIn(TENANT, { id: MESSAGE, recordedAt: NOW }));

    const sweep = await repository.listRetaining(TENANT, STREAM_KEY, WINDOW_END);
    for (const message of sweep) {
      await repository.save(forgetMeshMessagePayload(message));
    }

    expect(sweep).toHaveLength(1);
    expect(await repository.listRetaining(TENANT, STREAM_KEY, WINDOW_END)).toEqual([]);
  });

  it("treats the cutoff instant itself as expired, so retention has no off-by-one", async () => {
    const repository = new InMemoryMeshMessageRepository();
    await repository.save(messageIn(TENANT, { id: MESSAGE, recordedAt: NOW }));

    expect(await repository.listRetaining(TENANT, STREAM_KEY, NOW)).toHaveLength(1);
    expect(await repository.listRetaining(TENANT, STREAM_KEY, RETENTION_CUTOFF)).toEqual([]);
  });

  it("offers no way to read the store whole, which is the one omission that is structural", () => {
    const repository = new InMemoryMeshMessageRepository();

    expect("listWindow" in repository).toBe(true);
    expect("listByTenant" in repository).toBe(false);
  });
});
