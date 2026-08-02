import type { CorrelationId, DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { discardDeadLetter, recordDeadLetter, replayDeadLetter } from "./dead-letter";
import { activateEventStream, defineEventStream } from "./event-stream";
import {
  defineEventType,
  deprecateEventType,
  publishEventType,
  retireEventType,
} from "./event-type-definition";
import {
  BINDING_ACTIVATED,
  BINDING_DECLARED,
  BINDING_DRAINING,
  BINDING_RETARGETED,
  BINDING_RETIRED,
  CHECKPOINT_RESET,
  DEAD_LETTER_DISCARDED,
  DEAD_LETTER_RECORDED,
  DEAD_LETTER_REPLAYED,
  EVENT_TYPE_DEFINED,
  EVENT_TYPE_DEPRECATED,
  EVENT_TYPE_PUBLISHED,
  EVENT_TYPE_RETIRED,
  MESSAGE_PAYLOAD_FORGOTTEN,
  REPLAY_APPROVED,
  REPLAY_CANCELLED,
  REPLAY_COMPLETED,
  REPLAY_FAILED,
  REPLAY_REJECTED,
  REPLAY_REQUESTED,
  REPLAY_STARTED,
  STREAM_ACTIVATED,
  STREAM_DEFINED,
  STREAM_EVENT_TYPE_ACCEPTED,
  STREAM_EVENT_TYPE_WITHDRAWN,
  STREAM_PAUSED,
  STREAM_REPARTITIONED,
  STREAM_RETENTION_REVISED,
  STREAM_RETIRED,
  SUBSCRIPTION_ACTIVATED,
  SUBSCRIPTION_DELIVERY_REVISED,
  SUBSCRIPTION_PAUSED,
  SUBSCRIPTION_REFILTERED,
  SUBSCRIPTION_REGISTERED,
  SUBSCRIPTION_RETIRED,
  bindingActivated,
  bindingDeclared,
  bindingDraining,
  bindingRetargeted,
  bindingRetired,
  checkpointReset,
  deadLetterDiscarded,
  deadLetterRecorded,
  deadLetterReplayed,
  eventTypeDefined,
  eventTypeDeprecated,
  eventTypePublished,
  eventTypeRetired,
  messagePayloadForgotten,
  replayApproved,
  replayCancelled,
  replayCompleted,
  replayFailed,
  replayRejected,
  replayRequested,
  replayStarted,
  streamActivated,
  streamDefined,
  streamEventTypeAccepted,
  streamEventTypeWithdrawn,
  streamPaused,
  streamRepartitioned,
  streamRetentionRevised,
  streamRetired,
  subscriptionActivated,
  subscriptionDeliveryRevised,
  subscriptionPaused,
  subscriptionRefiltered,
  subscriptionRegistered,
  subscriptionRetired,
} from "./mesh-events";
import { forgetMeshMessagePayload, recordMeshMessage } from "./mesh-message";
import {
  activateMeshSubscription,
  pauseMeshSubscription,
  registerMeshSubscription,
  retireMeshSubscription,
} from "./mesh-subscription";
import {
  DEAD_LETTER_REASONS,
  DEFAULT_PARTITION_COUNT,
  FIRST_SEQUENCE,
  type FilterPredicate,
  MIN_DEPRECATION_NOTICE_DAYS,
  type SchemaField,
  UNCOMMITTED_POSITION,
} from "./mesh-value";
import {
  approveReplay,
  cancelReplay,
  completeReplay,
  failReplay,
  rejectReplay,
  requestReplay,
  startReplay,
} from "./replay-request";
import {
  activateStreamBinding,
  declareStreamBinding,
  drainStreamBinding,
  retireStreamBinding,
} from "./stream-binding";
import { openSubscriptionCheckpoint, resetSubscriptionCheckpoint } from "./subscription-checkpoint";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const PUBLISHER = "person-1" as Uuid;
const OPERATOR = "person-2" as Uuid;
const REQUESTER = "person-3" as Uuid;
const APPROVER = "person-4" as Uuid;
const STUDENT = "student-1" as Uuid;
const SUBSCRIPTION = "subscription-1" as Uuid;
const MESSAGE = "message-1" as Uuid;
const EVENT = "event-1" as Uuid;
const REPLAY = "replay-1" as Uuid;
const CORRELATION = "correlation-1" as CorrelationId;

const EVENT_TYPE_KEY = "student-lifecycle.enrolment-confirmed";
const STREAM_KEY = "student-lifecycle.enrolment";
const SUBSCRIPTION_KEY = "finance.ledger-projector";
const CONSUMER_GROUP = "finance.ledger";

/**
 * Everything from here to the instants is a value the mesh holds and, this file asserts, never broadcasts.
 *
 * They are named rather than inlined so that the assertions can look for the value itself in the serialised
 * payload, which catches a leak through a field nobody thought to write a `toHaveProperty` for.
 */
const EVENT_TYPE_TITLE = "Enrolment Confirmed";
const EVENT_TYPE_SUMMARY = "Raised once a place has been accepted and the register updated.";
const STREAM_TITLE = "Enrolment Stream";
const STREAM_SUMMARY = "Every fact about a place being offered, accepted, deferred or withdrawn.";
const SUBSCRIPTION_TITLE = "Ledger projector";
const TRANSPORT_REF = "vault:mesh/kafka-primary";
const TRACE_ID = "trace-8f21";
const DIGEST = "sha256:9f2c1a";
const ADMISSION_NUMBER = "ADM-2027-0044";
const PAYLOAD = { studentId: STUDENT, admissionNumber: ADMISSION_NUMBER };
const FILTER_VALUE = "safeguarding-note";
const REPLAY_REASON = "Reconciling the ledger after the projector was paused for maintenance";
const DISCARD_REASON = "Superseded by a corrected enrolment raised the following morning";
const RESET_REASON = "Rewound after the projector was released with a broken migration";
const SETTLEMENT_REASON = "Halted once the consumer was found not to be idempotent";

/** One fixed instant, so no assertion below depends on when the suite happens to run. */
const NOW = "2027-01-02T09:15:00.000Z" as ISODateString;
const RECORDED_AT = "2027-01-02T09:15:00.250Z" as ISODateString;
const WINDOW_END = "2027-01-02T10:15:00.000Z" as ISODateString;
const RETENTION_CUTOFF = "2026-12-03T09:15:00.000Z" as ISODateString;

const DAY = 86_400;
const daysFrom = (days: number): ISODateString =>
  new Date(Date.parse(NOW) + days * DAY * 1_000).toISOString() as ISODateString;

const RETIRE_AT = daysFrom(MIN_DEPRECATION_NOTICE_DAYS);

const FIELDS: readonly SchemaField[] = Object.freeze([
  Object.freeze({ name: "studentId", type: "uuid", required: true }),
  Object.freeze({ name: "admissionNumber", type: "string", required: true }),
  Object.freeze({ name: "confirmedAt", type: "instant", required: true }),
]);

const FILTER: readonly FilterPredicate[] = Object.freeze([
  Object.freeze({
    attribute: "aggregateType",
    operator: "in",
    values: Object.freeze([FILTER_VALUE]),
  }),
]);

const drafted = defineEventType({
  tenantId: TENANT,
  organizationId: ORG,
  eventTypeKey: EVENT_TYPE_KEY,
  version: 2,
  title: EVENT_TYPE_TITLE,
  summary: EVENT_TYPE_SUMMARY,
  compatibilityMode: "backward",
  schemaFields: FIELDS,
});
const published = publishEventType(drafted, PUBLISHER);
const deprecated = deprecateEventType(published, NOW, RETIRE_AT, 3);
const retiredType = retireEventType(deprecated);

const draftStream = defineEventStream({
  tenantId: TENANT,
  organizationId: ORG,
  streamKey: STREAM_KEY,
  title: STREAM_TITLE,
  summary: STREAM_SUMMARY,
  ordering: "partition",
  partitionCount: DEFAULT_PARTITION_COUNT,
  partitionKeyPath: "aggregate.aggregateId",
  retention: "full",
  retentionSeconds: 30 * DAY,
  eventTypeKeys: [EVENT_TYPE_KEY],
});
const stream = activateEventStream(draftStream, OPERATOR);

const declaredBinding = declareStreamBinding({
  tenantId: TENANT,
  organizationId: ORG,
  streamKey: STREAM_KEY,
  transport: "kafka",
  transportRef: TRANSPORT_REF,
});
const carrying = activateStreamBinding(declaredBinding, OPERATOR);
const draining = drainStreamBinding(carrying);
const retiredBinding = retireStreamBinding(draining, 0);

const registered = registerMeshSubscription({
  tenantId: TENANT,
  organizationId: ORG,
  subscriptionKey: SUBSCRIPTION_KEY,
  streamKey: STREAM_KEY,
  consumerGroup: CONSUMER_GROUP,
  title: SUBSCRIPTION_TITLE,
  semantics: "exactly_once",
  maxAttempts: 7,
  filter: FILTER,
});
const subscribed = activateMeshSubscription(registered, OPERATOR);
const pausedSubscription = pauseMeshSubscription(subscribed);
const retiredSubscription = retireMeshSubscription(pausedSubscription);

const recorded = recordMeshMessage({
  organizationId: ORG,
  envelope: {
    eventId: EVENT,
    eventTypeKey: EVENT_TYPE_KEY,
    eventTypeVersion: 2,
    tenantId: TENANT,
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
});
const forgotten = forgetMeshMessagePayload(recorded);

const opened = openSubscriptionCheckpoint({
  tenantId: TENANT,
  organizationId: ORG,
  subscriptionId: SUBSCRIPTION,
  subscriptionKey: SUBSCRIPTION_KEY,
  streamKey: STREAM_KEY,
  partition: 3,
  partitionCount: DEFAULT_PARTITION_COUNT,
});
const reset = resetSubscriptionCheckpoint(opened, {
  position: 200,
  streamHead: 512,
  resetBy: OPERATOR,
  reason: RESET_REASON,
});
const rewound = resetSubscriptionCheckpoint(opened, {
  position: UNCOMMITTED_POSITION,
  streamHead: 512,
  resetBy: OPERATOR,
  reason: RESET_REASON,
});

const deadLetter = recordDeadLetter({
  tenantId: TENANT,
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
  failedAt: NOW,
});
const replayedLetter = replayDeadLetter(deadLetter, REPLAY, OPERATOR);
const discarded = discardDeadLetter(deadLetter, {
  discardedBy: OPERATOR,
  reason: DISCARD_REASON,
});

const requested = requestReplay({
  tenantId: TENANT,
  organizationId: ORG,
  subscriptionId: SUBSCRIPTION,
  subscriptionKey: SUBSCRIPTION_KEY,
  streamKey: STREAM_KEY,
  fromInstant: NOW,
  toInstant: WINDOW_END,
  reason: REPLAY_REASON,
  requestedBy: REQUESTER,
});
const approved = approveReplay(requested, {
  approvedBy: APPROVER,
  verdict: {
    subscriptionKey: SUBSCRIPTION_KEY,
    allowed: true,
    refusal: null,
    windowSeconds: 3_600,
    messageCount: 128,
    retentionCutoff: RETENTION_CUTOFF,
  },
});
const running = startReplay(approved);
const completed = completeReplay(running, 128);
const failedReplay = failReplay(running, { deliveredCount: 96, reason: SETTLEMENT_REASON });
const rejected = rejectReplay(requested, { settledBy: APPROVER, reason: SETTLEMENT_REASON });
const cancelled = cancelReplay(running, { settledBy: REQUESTER, reason: SETTLEMENT_REASON });

/** Every type this contract puts on a bus, written out rather than derived, so an addition is deliberate. */
const DECLARED: readonly string[] = [
  EVENT_TYPE_DEFINED,
  EVENT_TYPE_PUBLISHED,
  EVENT_TYPE_DEPRECATED,
  EVENT_TYPE_RETIRED,
  STREAM_DEFINED,
  STREAM_REPARTITIONED,
  STREAM_RETENTION_REVISED,
  STREAM_ACTIVATED,
  STREAM_PAUSED,
  STREAM_RETIRED,
  STREAM_EVENT_TYPE_ACCEPTED,
  STREAM_EVENT_TYPE_WITHDRAWN,
  BINDING_DECLARED,
  BINDING_RETARGETED,
  BINDING_ACTIVATED,
  BINDING_DRAINING,
  BINDING_RETIRED,
  SUBSCRIPTION_REGISTERED,
  SUBSCRIPTION_REFILTERED,
  SUBSCRIPTION_DELIVERY_REVISED,
  SUBSCRIPTION_ACTIVATED,
  SUBSCRIPTION_PAUSED,
  SUBSCRIPTION_RETIRED,
  MESSAGE_PAYLOAD_FORGOTTEN,
  CHECKPOINT_RESET,
  DEAD_LETTER_RECORDED,
  DEAD_LETTER_REPLAYED,
  DEAD_LETTER_DISCARDED,
  REPLAY_REQUESTED,
  REPLAY_APPROVED,
  REPLAY_REJECTED,
  REPLAY_STARTED,
  REPLAY_COMPLETED,
  REPLAY_FAILED,
  REPLAY_CANCELLED,
];

/**
 * One of each, built from the aggregates above.
 *
 * Two of the calls are deliberately made against a record that still holds the thing being asserted absent:
 * `messagePayloadForgotten` is handed a message whose body and digest are both still there, and
 * `bindingRetargeted` a binding still holding a live transport reference. Handing each the already-emptied
 * version would test that a null stays null, which is not the claim this file is making.
 */
const everyEvent = (): readonly DomainEvent[] => [
  eventTypeDefined(drafted),
  eventTypePublished(published),
  eventTypeDeprecated(deprecated),
  eventTypeRetired(retiredType),
  streamDefined(draftStream),
  streamRepartitioned(stream),
  streamRetentionRevised(stream),
  streamActivated(stream),
  streamPaused(stream),
  streamRetired(stream),
  streamEventTypeAccepted(stream, EVENT_TYPE_KEY),
  streamEventTypeWithdrawn(stream, EVENT_TYPE_KEY),
  bindingDeclared(declaredBinding),
  bindingRetargeted(carrying),
  bindingActivated(carrying),
  bindingDraining(draining),
  bindingRetired(retiredBinding),
  subscriptionRegistered(registered),
  subscriptionRefiltered(subscribed),
  subscriptionDeliveryRevised(subscribed),
  subscriptionActivated(subscribed),
  subscriptionPaused(pausedSubscription),
  subscriptionRetired(retiredSubscription),
  messagePayloadForgotten(recorded),
  checkpointReset(reset),
  deadLetterRecorded(deadLetter),
  deadLetterReplayed(replayedLetter),
  deadLetterDiscarded(discarded),
  replayRequested(requested),
  replayApproved(approved),
  replayRejected(rejected),
  replayStarted(running),
  replayCompleted(completed),
  replayFailed(failedReplay),
  replayCancelled(cancelled),
];

describe("what the mesh will not put on a bus", () => {
  it("keeps the body of the fact out of every event, including the one about a body", () => {
    for (const event of everyEvent()) {
      expect(event.payload).not.toHaveProperty("payload");
      expect(event.payload).not.toHaveProperty("payloadDigest");
      expect(JSON.stringify(event.payload)).not.toContain(ADMISSION_NUMBER);
      expect(JSON.stringify(event.payload)).not.toContain(DIGEST);
    }
  });

  it("names the provider a transport reference resolves through, and never the reference", () => {
    for (const event of everyEvent()) {
      expect(event.payload).not.toHaveProperty("transportRef");
      expect(JSON.stringify(event.payload)).not.toContain(TRANSPORT_REF);
    }

    expect(bindingRetargeted(carrying).payload.transportRefProvider).toBe("vault");
  });

  it("counts a subscription's predicates rather than saying what they match on", () => {
    for (const event of everyEvent()) {
      expect(event.payload).not.toHaveProperty("filter");
      expect(JSON.stringify(event.payload)).not.toContain(FILTER_VALUE);
    }

    expect(subscriptionRefiltered(subscribed).payload.filterPredicateCount).toBe(FILTER.length);
  });

  it("leaves the trace handle in the tenant's own records", () => {
    for (const event of everyEvent()) {
      expect(event.payload).not.toHaveProperty("traceId");
      expect(JSON.stringify(event.payload)).not.toContain(TRACE_ID);
    }
  });

  it("broadcasts nothing anybody wrote in their own words", () => {
    const written = [
      EVENT_TYPE_TITLE,
      EVENT_TYPE_SUMMARY,
      STREAM_TITLE,
      STREAM_SUMMARY,
      SUBSCRIPTION_TITLE,
      REPLAY_REASON,
      DISCARD_REASON,
      RESET_REASON,
      SETTLEMENT_REASON,
    ];

    for (const event of everyEvent()) {
      for (const text of written) {
        expect(JSON.stringify(event.payload)).not.toContain(text);
      }
    }
  });

  it("says a replay happened without publishing the argument anybody made for it", () => {
    for (const event of [
      replayRequested(requested),
      replayApproved(approved),
      replayRejected(rejected),
      replayStarted(running),
      replayCompleted(completed),
      replayFailed(failedReplay),
      replayCancelled(cancelled),
    ]) {
      expect(event.payload).not.toHaveProperty("reason");
      expect(event.payload).not.toHaveProperty("settlementReason");
    }

    expect(checkpointReset(reset).payload).not.toHaveProperty("resetReason");
  });

  it("carries a dead letter's failure code and not the sentence somebody wrote beside it", () => {
    for (const event of [deadLetterRecorded(deadLetter), deadLetterDiscarded(discarded)]) {
      expect(DEAD_LETTER_REASONS).toContain(event.payload.reason);
      expect(event.payload).not.toHaveProperty("discardReason");
    }
  });

  it("publishes nothing at all on the two paths it travels millions of times a day", () => {
    expect(DECLARED).not.toContain("mesh.message.recorded");
    expect(DECLARED).not.toContain("mesh.checkpoint.committed");
  });
});

describe("what every mesh event carries", () => {
  it("scopes every event to the tenant it happened in", () => {
    for (const event of everyEvent()) expect(event.metadata.tenantId).toBe(TENANT);
  });

  it("names every event under the mesh namespace", () => {
    for (const event of everyEvent()) expect(event.type).toMatch(/^mesh\.[a-z-]+\.[a-z-]+$/);
  });

  it("names the organization on every event, because a group runs more than one", () => {
    for (const event of everyEvent()) expect(event.payload).toHaveProperty("organizationId", ORG);
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
      expect(type).not.toMatch(/^mesh\.[a-z-]+\.(send|publish|deliver|commit|retry|sweep)$/);
    }
  });
});

describe("the facts a subscriber acts on", () => {
  it("says whether the version a consumer pins to is still carried and still open to change", () => {
    expect(eventTypeDefined(drafted).payload.carried).toBe(false);
    expect(eventTypeDefined(drafted).payload.schemaFrozen).toBe(false);
    expect(eventTypeDefined(drafted).payload.schemaFieldCount).toBe(FIELDS.length);
    expect(eventTypeDefined(drafted).payload.version).toBe(2);
    expect(eventTypePublished(published).payload.carried).toBe(true);
    expect(eventTypePublished(published).payload.schemaFrozen).toBe(true);
    expect(eventTypeRetired(retiredType).payload.carried).toBe(false);
  });

  it("gives a deprecation the date it stops on and the version that takes over", () => {
    const event = eventTypeDeprecated(deprecated);

    expect(event.payload.retireAt).toBe(RETIRE_AT);
    expect(event.payload.supersededByVersion).toBe(3);
    expect(event.payload.compatibilityMode).toBe("backward");
    expect(event.payload.carried).toBe(true);
  });

  it("says how a stream is partitioned and how long it keeps what it carries", () => {
    const event = streamDefined(draftStream);

    expect(event.payload.ordering).toBe("partition");
    expect(event.payload.partitionCount).toBe(DEFAULT_PARTITION_COUNT);
    expect(event.payload.retention).toBe("full");
    expect(event.payload.retentionSeconds).toBe(30 * DAY);
    expect(event.payload.publishable).toBe(false);
    expect(streamActivated(stream).payload.publishable).toBe(true);
    expect(streamPaused(stream).payload.activatedAt).toBe(stream.activatedAt);
  });

  it("names the type a stream's vocabulary just gained or lost, and how many are left", () => {
    const accepted = streamEventTypeAccepted(stream, EVENT_TYPE_KEY);
    const withdrawn = streamEventTypeWithdrawn(stream, EVENT_TYPE_KEY);

    expect(accepted.payload.eventTypeKey).toBe(EVENT_TYPE_KEY);
    expect(accepted.payload.eventTypeCount).toBe(stream.eventTypeKeys.length);
    expect(withdrawn.payload.eventTypeKey).toBe(EVENT_TYPE_KEY);
  });

  it("tells an operator which backbone a binding is on and whether it is still carrying", () => {
    expect(bindingDeclared(declaredBinding).payload.transport).toBe("kafka");
    expect(bindingDeclared(declaredBinding).payload.transportRefProvider).toBe("vault");
    expect(bindingDeclared(declaredBinding).payload.carrying).toBe(false);
    expect(bindingActivated(carrying).payload.carrying).toBe(true);
    expect(bindingDraining(draining).payload.draining).toBe(true);
    expect(bindingRetired(retiredBinding).payload.carrying).toBe(false);
  });

  it("says what a subscription was promised and what that obliges the mesh to do", () => {
    const event = subscriptionRegistered(registered);

    expect(event.payload.consumerGroup).toBe(CONSUMER_GROUP);
    expect(event.payload.streamKey).toBe(STREAM_KEY);
    expect(event.payload.semantics).toBe("exactly_once");
    expect(event.payload.maxAttempts).toBe(7);
    expect(event.payload.deduplicated).toBe(true);
    expect(event.payload.retried).toBe(true);
    expect(event.payload.deliverable).toBe(false);
    expect(subscriptionActivated(subscribed).payload.deliverable).toBe(true);
    expect(subscriptionPaused(pausedSubscription).payload.deliverable).toBe(false);
    expect(subscriptionDeliveryRevised(subscribed).payload.maxAttempts).toBe(7);
    expect(subscriptionRetired(retiredSubscription).payload.deliverable).toBe(false);
  });

  it("says a message can no longer be replayed once its body has gone", () => {
    const event = messagePayloadForgotten(forgotten);

    expect(event.payload.messageId).toBe(forgotten.id);
    expect(event.payload.eventId).toBe(EVENT);
    expect(event.payload.eventTypeVersion).toBe(2);
    expect(event.payload.sequence).toBe(FIRST_SEQUENCE);
    expect(event.payload.partition).toBe(forgotten.partition);
    expect(event.payload.retention).toBe("full");
    expect(event.payload.replayable).toBe(false);
    expect(event.payload.forgottenAt).toBe(forgotten.payloadForgottenAt);
  });

  it("says where a checkpoint was put back to, and whether that is anywhere at all", () => {
    expect(checkpointReset(reset).payload.committedPosition).toBe(200);
    expect(checkpointReset(reset).payload.committed).toBe(true);
    expect(checkpointReset(reset).payload.resetBy).toBe(OPERATOR);
    expect(checkpointReset(reset).payload.subscriptionId).toBe(SUBSCRIPTION);
    expect(checkpointReset(rewound).payload.committedPosition).toBe(UNCOMMITTED_POSITION);
    expect(checkpointReset(rewound).payload.committed).toBe(false);
  });

  it("says what failed, how many times it was tried, and whether it can be tried again", () => {
    const event = deadLetterRecorded(deadLetter);

    expect(event.payload.reason).toBe("attempts_exhausted");
    expect(event.payload.attempts).toBe(7);
    expect(event.payload.messageId).toBe(MESSAGE);
    expect(event.payload.failedAt).toBe(NOW);
    expect(event.payload.open).toBe(true);
    expect(event.payload.retriable).toBe(false);
    expect(event.payload.replayId).toBeNull();
    expect(deadLetterReplayed(replayedLetter).payload.replayId).toBe(REPLAY);
    expect(deadLetterDiscarded(discarded).payload.open).toBe(false);
  });

  it("says how wide a replay is, who allowed it, and how far it got", () => {
    expect(replayRequested(requested).payload.fromInstant).toBe(NOW);
    expect(replayRequested(requested).payload.toInstant).toBe(WINDOW_END);
    expect(replayRequested(requested).payload.requestedBy).toBe(REQUESTER);
    expect(replayRequested(requested).payload.needsApproval).toBe(true);
    expect(replayRequested(requested).payload.approvedBy).toBeNull();
    expect(replayApproved(approved).payload.approvedBy).toBe(APPROVER);
    expect(replayApproved(approved).payload.messageCount).toBe(128);
    expect(replayStarted(running).payload.running).toBe(true);
    expect(replayCompleted(completed).payload.deliveredCount).toBe(128);
    expect(replayCompleted(completed).payload.settled).toBe(true);
    expect(replayFailed(failedReplay).payload.deliveredCount).toBe(96);
    expect(replayRejected(rejected).payload.settled).toBe(true);
    expect(replayCancelled(cancelled).payload.settled).toBe(true);
  });
});
