import type { CorrelationId, DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  ConcurrentReplayError,
  EventStreamNotFoundError,
  InvalidReplayProgressionError,
  MeshSubscriptionNotDeliverableError,
  MeshSubscriptionNotFoundError,
  PersonNotFoundForMeshError,
  ReasonTooShortError,
  ReplayNotApprovedError,
  ReplayRefusedError,
  ReplayRequestNotFoundError,
  ReplaySettledError,
  ReplayTooManyMessagesError,
  ReplayWindowInvertedError,
  ReplayWindowTooWideError,
  SelfApprovedReplayError,
} from "./errors";
import { activateEventStream, defineEventStream } from "./event-stream";
import {
  REPLAY_APPROVED,
  REPLAY_CANCELLED,
  REPLAY_COMPLETED,
  REPLAY_FAILED,
  REPLAY_REJECTED,
  REPLAY_REQUESTED,
  REPLAY_STARTED,
} from "./mesh-events";
import { type MeshMessage, recordMeshMessage } from "./mesh-message";
import {
  type RegisterMeshSubscriptionParams,
  activateMeshSubscription,
  pauseMeshSubscription,
  registerMeshSubscription,
} from "./mesh-subscription";
import { DEFAULT_PARTITION_COUNT, MAX_REPLAY_MESSAGES } from "./mesh-value";
import type { MeshEnvelope, PartitionDeclaration } from "./mesh-view";
import {
  InMemoryEventStreamRepository,
  InMemoryMeshMessageRepository,
  InMemoryMeshSubscriptionRepository,
  InMemoryReplayRequestRepository,
  type MeshMessageRepository,
  type PersonDirectory,
} from "./ports";
import { type RaiseReplayRequest, ReplayRequestService } from "./replay-request-service";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org-1" as Uuid;
const REQUESTER = "person-1" as Uuid;
const APPROVER = "person-2" as Uuid;
const ABSENT_PERSON = "person-absent" as Uuid;
const STUDENT = "student-1" as Uuid;
const CORRELATION = "correlation-1" as CorrelationId;
const MISSING = "replay-absent" as Uuid;
const ABSENT_SUBSCRIPTION = "subscription-absent" as Uuid;

const STREAM_KEY = "admissions.applications";
const UNBACKED_STREAM_KEY = "admissions.unbacked";
const KEY_PATH = "aggregate.aggregateId";
const SUBMITTED = "admissions.application.submitted";
const SUBSCRIPTION_KEY = "admissions.reporting";
const QUIET_SUBSCRIPTION_KEY = "admissions.finance";
const UNBACKED_SUBSCRIPTION_KEY = "admissions.archive";
const GROUP = "reporting-workers";
const QUIET_GROUP = "finance-workers";
const UNBACKED_GROUP = "archive-workers";

const DIGEST = "sha256:9f2c1a";
const TRACE = "trace-1";
const PAYLOAD = { applicationId: STUDENT, stage: "submitted" };

/** Three messages land inside the window below and one lands after it, so a count is a count of the window. */
const IN_WINDOW = 3;
const DELIVERED = 3;
const PARTIAL = 1;

const REASON = "Reprocessing the overnight backlog after a bad deployment dropped it.";
const REJECT_REASON = "The consumer is not idempotent yet, so this would reissue the invoices.";
const CANCEL_REASON = "The team found the gap was in their own projection rather than in the mesh.";
const FAIL_REASON = "The broker refused the connection halfway through the window.";

/** One fixed instant, so no assertion below depends on when the suite happens to run. */
const OCCURRED_AT = "2027-01-02T09:15:00.000Z" as ISODateString;
const RECORDED_AT = "2027-01-02T09:15:00.250Z" as ISODateString;
const SECOND_RECORDED_AT = "2027-01-02T09:30:00.000Z" as ISODateString;
const THIRD_RECORDED_AT = "2027-01-02T09:45:00.000Z" as ISODateString;
const AFTER_WINDOW_RECORDED_AT = "2027-01-02T11:00:00.000Z" as ISODateString;
const WINDOW_FROM = "2027-01-02T09:00:00.000Z" as ISODateString;
const WINDOW_TO = "2027-01-02T10:00:00.000Z" as ISODateString;
const LATER_WINDOW_TO = "2027-01-02T12:00:00.000Z" as ISODateString;
const APPROVED_AT = "2027-01-02T12:00:00.000Z" as ISODateString;

/** Days from an instant the test itself fixed, so a retention window never depends on the wall clock. */
const plusDays = (from: ISODateString, days: number): ISODateString =>
  new Date(Date.parse(from) + days * 86_400_000).toISOString() as ISODateString;

/** Forty days back, which is past the thirty-one the platform ever replays in one window. */
const WIDE_WINDOW_FROM = plusDays(WINDOW_FROM, -40);

/** Sixty days on, by which point the stream default of thirty days of retention has passed the window. */
const LONG_AFTERWARDS = plusDays(WINDOW_FROM, 60);

const recorder = () => {
  const published: DomainEvent[] = [];
  return {
    published,
    publish: async (event: DomainEvent): Promise<void> => {
      published.push(event);
    },
  };
};

const people: PersonDirectory = {
  exists: async (_tenantId, personId) => personId !== ABSENT_PERSON,
};

const envelope = (overrides: Partial<MeshEnvelope> = {}): MeshEnvelope => ({
  eventId: "event-1" as Uuid,
  eventTypeKey: SUBMITTED,
  eventTypeVersion: 1,
  tenantId: TENANT,
  aggregate: { aggregateType: "application", aggregateId: STUDENT },
  producerKey: "admissions",
  correlationId: CORRELATION,
  causationId: null,
  traceId: TRACE,
  streamKey: STREAM_KEY,
  partitionKey: STUDENT,
  occurredAt: OCCURRED_AT,
  recordedAt: RECORDED_AT,
  ...overrides,
});

const partitioning = (): PartitionDeclaration => ({
  streamKey: STREAM_KEY,
  ordering: "partition",
  partitionCount: DEFAULT_PARTITION_COUNT,
  partitionKeyPath: KEY_PATH,
});

const params = (
  overrides: Partial<RegisterMeshSubscriptionParams> = {},
): RegisterMeshSubscriptionParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  subscriptionKey: SUBSCRIPTION_KEY,
  streamKey: STREAM_KEY,
  consumerGroup: GROUP,
  title: "Admissions reporting",
  ...overrides,
});

/** One published message, so that the count an approver is shown comes from messages that really exist. */
const published = (eventId: string, sequence: number, recordedAt: ISODateString): MeshMessage =>
  recordMeshMessage({
    organizationId: ORG,
    envelope: envelope({ eventId: eventId as Uuid, recordedAt }),
    partitioning: partitioning(),
    sequence,
    retention: "full",
    payloadDigest: DIGEST,
    payload: PAYLOAD,
  });

const raise = (
  subscriptionId: Uuid,
  overrides: Partial<RaiseReplayRequest> = {},
): RaiseReplayRequest => ({
  tenantId: TENANT,
  subscriptionId,
  fromInstant: WINDOW_FROM,
  toInstant: WINDOW_TO,
  reason: REASON,
  requestedBy: REQUESTER,
  ...overrides,
});

const harness = async () => {
  const repository = new InMemoryReplayRequestRepository();
  const subscriptions = new InMemoryMeshSubscriptionRepository();
  const streams = new InMemoryEventStreamRepository();
  const messages = new InMemoryMeshMessageRepository();
  const events = recorder();
  const service = new ReplayRequestService({
    repository,
    subscriptions,
    streams,
    messages,
    people,
    events,
  });

  const stream = activateEventStream(
    defineEventStream({
      tenantId: TENANT,
      organizationId: ORG,
      streamKey: STREAM_KEY,
      title: "Admission Applications",
      summary: "Everything an application does between arriving and being decided.",
      partitionKeyPath: KEY_PATH,
      retention: "full",
      eventTypeKeys: [SUBMITTED],
    }),
    REQUESTER,
  );
  await streams.save(stream);

  const live = activateMeshSubscription(registerMeshSubscription(params()), REQUESTER);
  const quiet = registerMeshSubscription(
    params({ subscriptionKey: QUIET_SUBSCRIPTION_KEY, consumerGroup: QUIET_GROUP }),
  );
  const unbacked = activateMeshSubscription(
    registerMeshSubscription(
      params({
        subscriptionKey: UNBACKED_SUBSCRIPTION_KEY,
        streamKey: UNBACKED_STREAM_KEY,
        consumerGroup: UNBACKED_GROUP,
      }),
    ),
    REQUESTER,
  );
  const foreign = activateMeshSubscription(
    registerMeshSubscription(params({ tenantId: OTHER })),
    REQUESTER,
  );
  for (const subscription of [live, quiet, unbacked, foreign]) {
    await subscriptions.save(subscription);
  }

  const inside: readonly ISODateString[] = [RECORDED_AT, SECOND_RECORDED_AT, THIRD_RECORDED_AT];
  let sequence = 1;
  for (const recordedAt of [...inside, AFTER_WINDOW_RECORDED_AT]) {
    await messages.save(published(`event-${sequence}`, sequence, recordedAt));
    sequence += 1;
  }

  return {
    repository,
    subscriptions,
    streams,
    messages,
    events,
    service,
    stream,
    live,
    quiet,
    unbacked,
    foreign,
  };
};

const types = (events: ReturnType<typeof recorder>): string[] =>
  events.published.map((event) => event.type);

/**
 * A store that reports every window as covering more messages than the platform will ever replay at once,
 * because no suite can write the hundred thousand rows the ceiling actually names.
 */
const crowded = (repository: InMemoryMeshMessageRepository): MeshMessageRepository => ({
  findById: (tenantId, id) => repository.findById(tenantId, id),
  findByEventId: (tenantId, eventId) => repository.findByEventId(tenantId, eventId),
  nextSequence: (tenantId, streamKey) => repository.nextSequence(tenantId, streamKey),
  streamHead: (tenantId, streamKey, partition) =>
    repository.streamHead(tenantId, streamKey, partition),
  countWindow: async () => MAX_REPLAY_MESSAGES + 1,
  listWindow: (tenantId, streamKey, from, to) =>
    repository.listWindow(tenantId, streamKey, from, to),
  listRetaining: (tenantId, streamKey, before) =>
    repository.listRetaining(tenantId, streamKey, before),
  save: (message) => repository.save(message),
});

describe("ReplayRequestService — requesting", () => {
  it("describes the window against the consumer rather than against anything the caller typed", async () => {
    const { repository, events, service, live } = await harness();

    const raised = await service.request(raise(live.id));

    expect(raised.organizationId).toBe(ORG);
    expect(raised.subscriptionId).toBe(live.id);
    expect(raised.subscriptionKey).toBe(SUBSCRIPTION_KEY);
    expect(raised.streamKey).toBe(STREAM_KEY);
    expect(raised.status).toBe("requested");
    expect(raised.requestedBy).toBe(REQUESTER);
    expect(raised.approvedBy).toBeNull();
    expect(raised.messageCount).toBeNull();
    expect(await repository.findById(TENANT, raised.id)).toEqual(raised);
    expect(types(events)).toEqual([REPLAY_REQUESTED]);
  });

  it("refuses a window wider than the platform ever replays at once", async () => {
    const { events, service, live } = await harness();

    await expect(
      service.request(raise(live.id, { fromInstant: WIDE_WINDOW_FROM })),
    ).rejects.toThrow(ReplayWindowTooWideError);
    expect(await service.list(TENANT)).toEqual([]);
    expect(types(events)).toEqual([]);
  });

  it("refuses a window covering more messages than the platform ever replays at once", async () => {
    const { repository, subscriptions, streams, messages, events, live } = await harness();
    const service = new ReplayRequestService({
      repository,
      subscriptions,
      streams,
      messages: crowded(messages),
      people,
      events,
    });

    await expect(service.request(raise(live.id))).rejects.toThrow(ReplayTooManyMessagesError);
    expect(await service.list(TENANT)).toEqual([]);
  });

  it("settles what was typed before it counts anything the requester cannot see", async () => {
    const { repository, subscriptions, streams, messages, events, live } = await harness();
    const service = new ReplayRequestService({
      repository,
      subscriptions,
      streams,
      messages: crowded(messages),
      people,
      events,
    });

    await expect(
      service.request(raise(live.id, { fromInstant: WINDOW_TO, toInstant: WINDOW_FROM })),
    ).rejects.toThrow(ReplayWindowInvertedError);
  });

  it("refuses a request in the name of somebody the tenant does not know", async () => {
    const { service, live } = await harness();

    await expect(service.request(raise(live.id, { requestedBy: ABSENT_PERSON }))).rejects.toThrow(
      PersonNotFoundForMeshError,
    );
  });

  it("refuses a consumer this tenant does not have", async () => {
    const { service, live } = await harness();

    await expect(service.request(raise(ABSENT_SUBSCRIPTION))).rejects.toThrow(
      MeshSubscriptionNotFoundError,
    );
    await expect(service.request(raise(live.id, { tenantId: OTHER }))).rejects.toThrow(
      MeshSubscriptionNotFoundError,
    );
  });
});

describe("ReplayRequestService — approving", () => {
  it("keeps the count the approver was shown, and announces the decision", async () => {
    const { repository, events, service, live } = await harness();
    const raised = await service.request(raise(live.id));

    const approved = await service.approve(TENANT, raised.id, APPROVER, APPROVED_AT);

    expect(approved.status).toBe("approved");
    expect(approved.approvedBy).toBe(APPROVER);
    expect(approved.approvedAt).not.toBeNull();
    expect(approved.messageCount).toBe(IN_WINDOW);
    expect(await repository.findById(TENANT, raised.id)).toEqual(approved);
    expect(types(events)).toEqual([REPLAY_REQUESTED, REPLAY_APPROVED]);
  });

  it("counts the messages the window covers rather than the messages on the stream", async () => {
    const { service, live } = await harness();
    const narrow = await service.request(raise(live.id));
    const wide = await service.request(raise(live.id, { toInstant: LATER_WINDOW_TO }));

    const narrowly = await service.approve(TENANT, narrow.id, APPROVER, APPROVED_AT);
    const widely = await service.approve(TENANT, wide.id, APPROVER, APPROVED_AT);

    expect(narrowly.messageCount).toBe(IN_WINDOW);
    expect(widely.messageCount).toBe(IN_WINDOW + 1);
  });

  it("refuses the requester agreeing to their own replay", async () => {
    const { service, live } = await harness();
    const raised = await service.request(raise(live.id));

    await expect(service.approve(TENANT, raised.id, REQUESTER, APPROVED_AT)).rejects.toThrow(
      SelfApprovedReplayError,
    );
  });

  it("refuses a window that has aged out of retention, and leaves the request where it was", async () => {
    const { service, live } = await harness();
    const raised = await service.request(raise(live.id));

    await expect(service.approve(TENANT, raised.id, APPROVER, LONG_AFTERWARDS)).rejects.toThrow(
      ReplayRefusedError,
    );
    expect((await service.get(TENANT, raised.id)).status).toBe("requested");
  });

  it("refuses agreeing to send history to a consumer nothing is being delivered to", async () => {
    const { service, quiet } = await harness();
    const raised = await service.request(raise(quiet.id));

    await expect(service.approve(TENANT, raised.id, APPROVER, APPROVED_AT)).rejects.toThrow(
      ReplayRefusedError,
    );
  });

  it("refuses when the stream the window is a stretch of is not on record", async () => {
    const { service, unbacked } = await harness();
    const raised = await service.request(raise(unbacked.id));

    await expect(service.approve(TENANT, raised.id, APPROVER, APPROVED_AT)).rejects.toThrow(
      EventStreamNotFoundError,
    );
  });

  it("refuses an approval in the name of somebody the tenant does not know", async () => {
    const { service, live } = await harness();
    const raised = await service.request(raise(live.id));

    await expect(service.approve(TENANT, raised.id, ABSENT_PERSON, APPROVED_AT)).rejects.toThrow(
      PersonNotFoundForMeshError,
    );
  });

  it("refuses a second approval of a request somebody already agreed to", async () => {
    const { service, live } = await harness();
    const raised = await service.request(raise(live.id));
    await service.approve(TENANT, raised.id, APPROVER, APPROVED_AT);

    await expect(service.approve(TENANT, raised.id, APPROVER, APPROVED_AT)).rejects.toThrow(
      InvalidReplayProgressionError,
    );
  });
});

describe("ReplayRequestService — settling before it runs", () => {
  it("declines the request in somebody's name, with their reason, and announces it", async () => {
    const { repository, events, service, live } = await harness();
    const raised = await service.request(raise(live.id));

    const rejected = await service.reject(TENANT, raised.id, APPROVER, REJECT_REASON);

    expect(rejected.status).toBe("rejected");
    expect(rejected.settledBy).toBe(APPROVER);
    expect(rejected.settlementReason).toBe(REJECT_REASON);
    expect(rejected.settledAt).not.toBeNull();
    expect(await repository.findById(TENANT, raised.id)).toEqual(rejected);
    expect(types(events)).toEqual([REPLAY_REQUESTED, REPLAY_REJECTED]);
  });

  it("calls off a request that was agreed to but never started", async () => {
    const { events, service, live } = await harness();
    const raised = await service.request(raise(live.id));
    await service.approve(TENANT, raised.id, APPROVER, APPROVED_AT);

    const cancelled = await service.cancel(TENANT, raised.id, APPROVER, CANCEL_REASON);

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.settledBy).toBe(APPROVER);
    expect(cancelled.settlementReason).toBe(CANCEL_REASON);
    expect(types(events)).toEqual([REPLAY_REQUESTED, REPLAY_APPROVED, REPLAY_CANCELLED]);
  });

  it("refuses a decision in the name of somebody the tenant does not know", async () => {
    const { service, live } = await harness();
    const raised = await service.request(raise(live.id));

    await expect(service.reject(TENANT, raised.id, ABSENT_PERSON, REJECT_REASON)).rejects.toThrow(
      PersonNotFoundForMeshError,
    );
    await expect(service.cancel(TENANT, raised.id, ABSENT_PERSON, CANCEL_REASON)).rejects.toThrow(
      PersonNotFoundForMeshError,
    );
  });

  it("refuses a reason too short to be worth reading afterwards", async () => {
    const { service, live } = await harness();
    const raised = await service.request(raise(live.id));

    await expect(service.reject(TENANT, raised.id, APPROVER, "no")).rejects.toThrow(
      ReasonTooShortError,
    );
  });

  it("refuses a second decision about a request that already ended", async () => {
    const { service, live } = await harness();
    const raised = await service.request(raise(live.id));
    await service.reject(TENANT, raised.id, APPROVER, REJECT_REASON);

    await expect(service.cancel(TENANT, raised.id, APPROVER, CANCEL_REASON)).rejects.toThrow(
      ReplaySettledError,
    );
  });
});

describe("ReplayRequestService — running", () => {
  it("starts an agreed request and announces that a consumer is about to see history again", async () => {
    const { repository, events, service, live } = await harness();
    const raised = await service.request(raise(live.id));
    await service.approve(TENANT, raised.id, APPROVER, APPROVED_AT);

    const started = await service.start(TENANT, raised.id);

    expect(started.status).toBe("running");
    expect(started.startedAt).not.toBeNull();
    expect(await repository.findById(TENANT, raised.id)).toEqual(started);
    expect(types(events)).toEqual([REPLAY_REQUESTED, REPLAY_APPROVED, REPLAY_STARTED]);
  });

  it("refuses starting a request nobody has agreed to", async () => {
    const { service, live } = await harness();
    const raised = await service.request(raise(live.id));

    await expect(service.start(TENANT, raised.id)).rejects.toThrow(ReplayNotApprovedError);
  });

  it("refuses starting into a consumer whose team paused it after the approval", async () => {
    const { subscriptions, service, live } = await harness();
    const raised = await service.request(raise(live.id));
    await service.approve(TENANT, raised.id, APPROVER, APPROVED_AT);
    await subscriptions.save(pauseMeshSubscription(live));

    await expect(service.start(TENANT, raised.id)).rejects.toThrow(
      MeshSubscriptionNotDeliverableError,
    );
  });

  it("runs one replay into a consumer at a time, and releases it when the run ends", async () => {
    const { service, live } = await harness();
    const first = await service.request(raise(live.id));
    const second = await service.request(raise(live.id, { toInstant: LATER_WINDOW_TO }));
    await service.approve(TENANT, first.id, APPROVER, APPROVED_AT);
    await service.approve(TENANT, second.id, APPROVER, APPROVED_AT);
    await service.start(TENANT, first.id);

    await expect(service.start(TENANT, second.id)).rejects.toThrow(ConcurrentReplayError);
    await expect(service.start(TENANT, second.id)).rejects.toThrow(SUBSCRIPTION_KEY);

    await service.complete(TENANT, first.id, DELIVERED);

    expect((await service.start(TENANT, second.id)).status).toBe("running");
  });

  it("records what went out when the run reaches the end of its window, naming nobody", async () => {
    const { events, service, live } = await harness();
    const raised = await service.request(raise(live.id));
    await service.approve(TENANT, raised.id, APPROVER, APPROVED_AT);
    await service.start(TENANT, raised.id);

    const completed = await service.complete(TENANT, raised.id, DELIVERED);

    expect(completed.status).toBe("completed");
    expect(completed.deliveredCount).toBe(DELIVERED);
    expect(completed.settledBy).toBeNull();
    expect(completed.settledAt).not.toBeNull();
    expect(types(events)).toEqual([
      REPLAY_REQUESTED,
      REPLAY_APPROVED,
      REPLAY_STARTED,
      REPLAY_COMPLETED,
    ]);
  });

  it("records how far a run had got when it stopped, and what stopped it", async () => {
    const { events, service, live } = await harness();
    const raised = await service.request(raise(live.id));
    await service.approve(TENANT, raised.id, APPROVER, APPROVED_AT);
    await service.start(TENANT, raised.id);

    const failed = await service.fail(TENANT, raised.id, PARTIAL, FAIL_REASON);

    expect(failed.status).toBe("failed");
    expect(failed.deliveredCount).toBe(PARTIAL);
    expect(failed.settlementReason).toBe(FAIL_REASON);
    expect(failed.settledBy).toBeNull();
    expect(types(events)).toEqual([
      REPLAY_REQUESTED,
      REPLAY_APPROVED,
      REPLAY_STARTED,
      REPLAY_FAILED,
    ]);
  });

  it("stops a run somebody is watching go wrong, without guessing what it managed", async () => {
    const { service, live } = await harness();
    const raised = await service.request(raise(live.id));
    await service.approve(TENANT, raised.id, APPROVER, APPROVED_AT);
    await service.start(TENANT, raised.id);

    const cancelled = await service.cancel(TENANT, raised.id, APPROVER, CANCEL_REASON);

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.deliveredCount).toBeNull();
  });

  it("refuses recording an outcome for a run that never started", async () => {
    const { service, live } = await harness();
    const raised = await service.request(raise(live.id));
    await service.approve(TENANT, raised.id, APPROVER, APPROVED_AT);

    await expect(service.complete(TENANT, raised.id, DELIVERED)).rejects.toThrow(
      InvalidReplayProgressionError,
    );
  });
});

describe("ReplayRequestService — reading", () => {
  it("reads one request back, or refuses by id", async () => {
    const { service, live } = await harness();
    const raised = await service.request(raise(live.id));

    expect(await service.get(TENANT, raised.id)).toEqual(raised);
    await expect(service.get(TENANT, MISSING)).rejects.toThrow(ReplayRequestNotFoundError);
    await expect(service.get(OTHER, raised.id)).rejects.toThrow(ReplayRequestNotFoundError);
  });

  it("reports what is running into one consumer, and nothing once the run has ended", async () => {
    const { service, live, quiet } = await harness();
    const raised = await service.request(raise(live.id));
    await service.approve(TENANT, raised.id, APPROVER, APPROVED_AT);
    const started = await service.start(TENANT, raised.id);

    expect(await service.running(TENANT, live.id)).toEqual(started);
    expect(await service.running(TENANT, quiet.id)).toBeNull();

    await service.complete(TENANT, raised.id, DELIVERED);

    expect(await service.running(TENANT, live.id)).toBeNull();
  });

  it("lists what one consumer has ever been sent twice, and keeps another consumer's out", async () => {
    const { service, live, quiet } = await harness();
    const first = await service.request(raise(live.id));
    const second = await service.request(raise(live.id, { toInstant: LATER_WINDOW_TO }));
    await service.request(raise(quiet.id));

    const history = await service.listBySubscription(TENANT, live.id);

    expect(history).toHaveLength(2);
    expect(history.map((request) => request.id).sort()).toEqual([first.id, second.id].sort());
  });

  it("lists the tenant's requests, and keeps one tenant's out of another's", async () => {
    const { service, live, foreign } = await harness();
    await service.request(raise(live.id));
    await service.request(raise(foreign.id, { tenantId: OTHER }));

    expect(await service.list(TENANT)).toHaveLength(1);
    expect(await service.list(OTHER)).toHaveLength(1);
  });

  it("works without an event bus at all", async () => {
    const { repository, subscriptions, streams, messages, live } = await harness();
    const service = new ReplayRequestService({
      repository,
      subscriptions,
      streams,
      messages,
      people,
    });

    const raised = await service.request(raise(live.id));
    const approved = await service.approve(TENANT, raised.id, APPROVER, APPROVED_AT);

    expect(approved.status).toBe("approved");
  });
});
