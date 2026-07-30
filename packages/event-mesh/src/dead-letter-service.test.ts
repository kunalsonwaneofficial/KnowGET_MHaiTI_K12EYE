import type { CorrelationId, DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { isDeadLetterOpen } from "./dead-letter";
import { DeadLetterService, type RecordFailureRequest } from "./dead-letter-service";
import {
  DeadLetterNotFoundError,
  DeadLetterNotReplayableError,
  DeadLetterSettledError,
  MeshMessageNotFoundError,
  MeshSubscriptionNotFoundError,
  PersonNotFoundForMeshError,
  ReasonTooShortError,
  ReplayRequestNotFoundError,
} from "./errors";
import { DEAD_LETTER_DISCARDED, DEAD_LETTER_RECORDED, DEAD_LETTER_REPLAYED } from "./mesh-events";
import { type MeshMessage, recordMeshMessage } from "./mesh-message";
import {
  type RegisterMeshSubscriptionParams,
  activateMeshSubscription,
  registerMeshSubscription,
} from "./mesh-subscription";
import { DEAD_LETTER_REASONS, DEFAULT_PARTITION_COUNT } from "./mesh-value";
import type { MeshEnvelope, PartitionDeclaration } from "./mesh-view";
import {
  InMemoryDeadLetterRepository,
  InMemoryMeshMessageRepository,
  InMemoryMeshSubscriptionRepository,
  InMemoryReplayRequestRepository,
  type PersonDirectory,
} from "./ports";
import { requestReplay } from "./replay-request";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org-1" as Uuid;
const SECOND_ORG = "org-2" as Uuid;
const OPERATOR = "person-1" as Uuid;
const ABSENT_PERSON = "person-absent" as Uuid;
const STUDENT = "student-1" as Uuid;
const CORRELATION = "correlation-1" as CorrelationId;
const MISSING = "dead-letter-absent" as Uuid;
const ABSENT_SUBSCRIPTION = "subscription-absent" as Uuid;
const ABSENT_MESSAGE = "message-absent" as Uuid;
const ABSENT_REPLAY = "replay-absent" as Uuid;

const STREAM_KEY = "admissions.applications";
const KEY_PATH = "aggregate.aggregateId";
const SUBMITTED = "admissions.application.submitted";
const SUBSCRIPTION_KEY = "admissions.reporting";
const SECOND_SUBSCRIPTION_KEY = "admissions.finance";
const GROUP = "reporting-workers";
const SECOND_GROUP = "finance-workers";

const DIGEST = "sha256:9f2c1a";
const TRACE = "trace-1";
const ATTEMPTS = 5;
const SEQUENCE = 5;
const SECOND_SEQUENCE = 6;

const DISCARD_REASON = "The applicant withdrew, so nothing downstream needs this fact any more.";
const REPLAY_REASON = "Reprocessing the overnight backlog after a bad deployment.";

/** One fixed instant, so no assertion below depends on when the suite happens to run. */
const OCCURRED_AT = "2027-01-02T09:15:00.000Z" as ISODateString;
const RECORDED_AT = "2027-01-02T09:15:00.250Z" as ISODateString;
const FAILED_AT = "2027-01-02T09:20:00.000Z" as ISODateString;
const LATER_FAILED_AT = "2027-01-02T11:45:00.000Z" as ISODateString;

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

/** One published message, so that everything the record says about a position comes from a real one. */
const published = (tenantId: TenantId, eventId: string, sequence: number): MeshMessage =>
  recordMeshMessage({
    organizationId: ORG,
    envelope: envelope({ tenantId, eventId: eventId as Uuid }),
    partitioning: partitioning(),
    sequence,
    retention: "digest",
    payloadDigest: DIGEST,
  });

/** What the delivery loop knows and nothing else: the two ids it failed between, and its own four facts. */
const failure = (
  subscriptionId: Uuid,
  messageId: Uuid,
  overrides: Partial<RecordFailureRequest> = {},
): RecordFailureRequest => ({
  tenantId: TENANT,
  subscriptionId,
  messageId,
  reason: "consumer_error",
  attempts: ATTEMPTS,
  traceId: TRACE,
  failedAt: FAILED_AT,
  ...overrides,
});

const harness = async () => {
  const repository = new InMemoryDeadLetterRepository();
  const subscriptions = new InMemoryMeshSubscriptionRepository();
  const messages = new InMemoryMeshMessageRepository();
  const replays = new InMemoryReplayRequestRepository();
  const events = recorder();
  const service = new DeadLetterService({
    repository,
    subscriptions,
    messages,
    replays,
    people,
    events,
  });

  const live = activateMeshSubscription(registerMeshSubscription(params()), OPERATOR);
  const sibling = activateMeshSubscription(
    registerMeshSubscription(
      params({
        organizationId: SECOND_ORG,
        subscriptionKey: SECOND_SUBSCRIPTION_KEY,
        consumerGroup: SECOND_GROUP,
      }),
    ),
    OPERATOR,
  );
  const foreign = activateMeshSubscription(
    registerMeshSubscription(params({ tenantId: OTHER })),
    OPERATOR,
  );
  for (const subscription of [live, sibling, foreign]) {
    await subscriptions.save(subscription);
  }

  const first = published(TENANT, "event-1", SEQUENCE);
  const second = published(TENANT, "event-2", SECOND_SEQUENCE);
  const elsewhere = published(OTHER, "event-3", SEQUENCE);
  for (const message of [first, second, elsewhere]) {
    await messages.save(message);
  }

  const replay = requestReplay({
    tenantId: TENANT,
    organizationId: ORG,
    subscriptionId: live.id,
    subscriptionKey: SUBSCRIPTION_KEY,
    streamKey: STREAM_KEY,
    fromInstant: OCCURRED_AT,
    toInstant: FAILED_AT,
    reason: REPLAY_REASON,
    requestedBy: OPERATOR,
  });
  await replays.save(replay);

  return {
    repository,
    subscriptions,
    messages,
    replays,
    events,
    service,
    live,
    sibling,
    foreign,
    first,
    second,
    elsewhere,
    replay,
  };
};

const types = (events: ReturnType<typeof recorder>): string[] =>
  events.published.map((event) => event.type);

describe("DeadLetterService — recording", () => {
  it("takes every fact but the loop's four off the subscription and the message", async () => {
    const { repository, events, service, live, first } = await harness();

    const letter = await service.record(failure(live.id, first.id));

    expect(letter.organizationId).toBe(ORG);
    expect(letter.subscriptionKey).toBe(SUBSCRIPTION_KEY);
    expect(letter.streamKey).toBe(STREAM_KEY);
    expect(letter.eventId).toBe(first.eventId);
    expect(letter.eventTypeKey).toBe(SUBMITTED);
    expect(letter.partition).toBe(first.partition);
    expect(letter.sequence).toBe(SEQUENCE);
    expect(letter.attempts).toBe(ATTEMPTS);
    expect(letter.traceId).toBe(TRACE);
    expect(letter.failedAt).toBe(FAILED_AT);
    expect(isDeadLetterOpen(letter)).toBe(true);
    expect(await repository.findById(TENANT, letter.id)).toEqual(letter);
    expect(types(events)).toEqual([DEAD_LETTER_RECORDED]);
  });

  it("records under every reason the platform recognises", async () => {
    for (const reason of DEAD_LETTER_REASONS) {
      const { service, live, first } = await harness();

      const letter = await service.record(failure(live.id, first.id, { reason }));

      expect(letter.reason).toBe(reason);
      expect(isDeadLetterOpen(letter)).toBe(true);
    }
  });

  it("hands the open record back and announces nothing when the same delivery fails again", async () => {
    const { repository, events, service, live, first } = await harness();
    const opened = await service.record(failure(live.id, first.id));

    const again = await service.record(
      failure(live.id, first.id, { attempts: ATTEMPTS + 4, failedAt: LATER_FAILED_AT }),
    );

    expect(again).toBe(opened);
    expect(again.attempts).toBe(ATTEMPTS);
    expect(await repository.listBySubscription(TENANT, live.id)).toHaveLength(1);
    expect(types(events)).toEqual([DEAD_LETTER_RECORDED]);
  });

  it("opens a fresh record once somebody has settled the first one", async () => {
    const { events, service, live, first } = await harness();
    const opened = await service.record(failure(live.id, first.id));
    await service.discard(TENANT, opened.id, OPERATOR, DISCARD_REASON);

    const reopened = await service.record(
      failure(live.id, first.id, { failedAt: LATER_FAILED_AT }),
    );

    expect(reopened.id).not.toBe(opened.id);
    expect(reopened.failedAt).toBe(LATER_FAILED_AT);
    expect(isDeadLetterOpen(reopened)).toBe(true);
    expect(types(events)).toEqual([
      DEAD_LETTER_RECORDED,
      DEAD_LETTER_DISCARDED,
      DEAD_LETTER_RECORDED,
    ]);
  });

  it("keeps two consumers failing on one message apart", async () => {
    const { service, live, sibling, first } = await harness();
    const mine = await service.record(failure(live.id, first.id));

    const theirs = await service.record(failure(sibling.id, first.id));

    expect(theirs.id).not.toBe(mine.id);
    expect(theirs.subscriptionKey).toBe(SECOND_SUBSCRIPTION_KEY);
    expect(theirs.organizationId).toBe(SECOND_ORG);
  });

  it("refuses a consumer this tenant does not have", async () => {
    const { service, live, first } = await harness();

    await expect(service.record(failure(ABSENT_SUBSCRIPTION, first.id))).rejects.toThrow(
      MeshSubscriptionNotFoundError,
    );
    await expect(service.record(failure(live.id, first.id, { tenantId: OTHER }))).rejects.toThrow(
      MeshSubscriptionNotFoundError,
    );
  });

  it("refuses a message this tenant does not have", async () => {
    const { service, live } = await harness();

    await expect(service.record(failure(live.id, ABSENT_MESSAGE))).rejects.toThrow(
      MeshMessageNotFoundError,
    );
  });
});

describe("DeadLetterService — settling", () => {
  it("closes the record against a replay that exists, in somebody's name, and announces it", async () => {
    const { repository, events, service, live, first, replay } = await harness();
    const opened = await service.record(failure(live.id, first.id));

    const settled = await service.replay(TENANT, opened.id, replay.id, OPERATOR);

    expect(settled.status).toBe("replayed");
    expect(settled.replayId).toBe(replay.id);
    expect(settled.settledBy).toBe(OPERATOR);
    expect(settled.settledAt).not.toBeNull();
    expect(isDeadLetterOpen(settled)).toBe(false);
    expect(await repository.findById(TENANT, opened.id)).toEqual(settled);
    expect(types(events)).toEqual([DEAD_LETTER_RECORDED, DEAD_LETTER_REPLAYED]);
  });

  it("refuses a replay this tenant does not hold, so the attribution cannot dangle", async () => {
    const { service, live, first } = await harness();
    const opened = await service.record(failure(live.id, first.id));

    await expect(service.replay(TENANT, opened.id, ABSENT_REPLAY, OPERATOR)).rejects.toThrow(
      ReplayRequestNotFoundError,
    );
  });

  it("refuses a replay in the name of somebody the tenant does not know", async () => {
    const { service, live, first, replay } = await harness();
    const opened = await service.record(failure(live.id, first.id));

    await expect(service.replay(TENANT, opened.id, replay.id, ABSENT_PERSON)).rejects.toThrow(
      PersonNotFoundForMeshError,
    );
  });

  it("refuses replaying a record somebody already discarded", async () => {
    const { service, live, first, replay } = await harness();
    const opened = await service.record(failure(live.id, first.id));
    await service.discard(TENANT, opened.id, OPERATOR, DISCARD_REASON);

    await expect(service.replay(TENANT, opened.id, replay.id, OPERATOR)).rejects.toThrow(
      DeadLetterNotReplayableError,
    );
  });

  it("discards with a person and a sentence, stores it and announces it", async () => {
    const { repository, events, service, live, first } = await harness();
    const opened = await service.record(failure(live.id, first.id));

    const settled = await service.discard(TENANT, opened.id, OPERATOR, DISCARD_REASON);

    expect(settled.status).toBe("discarded");
    expect(settled.discardReason).toBe(DISCARD_REASON);
    expect(settled.settledBy).toBe(OPERATOR);
    expect(settled.replayId).toBeNull();
    expect(await repository.findById(TENANT, opened.id)).toEqual(settled);
    expect(types(events)).toEqual([DEAD_LETTER_RECORDED, DEAD_LETTER_DISCARDED]);
  });

  it("refuses a discard in the name of somebody the tenant does not know", async () => {
    const { service, live, first } = await harness();
    const opened = await service.record(failure(live.id, first.id));

    await expect(service.discard(TENANT, opened.id, ABSENT_PERSON, DISCARD_REASON)).rejects.toThrow(
      PersonNotFoundForMeshError,
    );
  });

  it("refuses a discard whose reason is too short to be worth reading afterwards", async () => {
    const { service, live, first } = await harness();
    const opened = await service.record(failure(live.id, first.id));

    await expect(service.discard(TENANT, opened.id, OPERATOR, "gone")).rejects.toThrow(
      ReasonTooShortError,
    );
  });

  it("refuses a second decision about a record somebody already replayed", async () => {
    const { service, live, first, replay } = await harness();
    const opened = await service.record(failure(live.id, first.id));
    await service.replay(TENANT, opened.id, replay.id, OPERATOR);

    await expect(service.discard(TENANT, opened.id, OPERATOR, DISCARD_REASON)).rejects.toThrow(
      DeadLetterSettledError,
    );
  });

  it("refuses a record this tenant does not have", async () => {
    const { service, live, first, replay } = await harness();
    const opened = await service.record(failure(live.id, first.id));

    await expect(service.discard(TENANT, MISSING, OPERATOR, DISCARD_REASON)).rejects.toThrow(
      DeadLetterNotFoundError,
    );
    await expect(service.replay(OTHER, opened.id, replay.id, OPERATOR)).rejects.toThrow(
      ReplayRequestNotFoundError,
    );
  });
});

describe("DeadLetterService — reading", () => {
  it("reads one record back, or refuses by id", async () => {
    const { service, live, first } = await harness();
    const opened = await service.record(failure(live.id, first.id));

    expect(await service.get(TENANT, opened.id)).toEqual(opened);
    await expect(service.get(TENANT, MISSING)).rejects.toThrow(DeadLetterNotFoundError);
    await expect(service.get(OTHER, opened.id)).rejects.toThrow(DeadLetterNotFoundError);
  });

  it("reads one consumer's record for one message, or refuses naming the message", async () => {
    const { service, live, first, second } = await harness();
    const opened = await service.record(failure(live.id, first.id));

    expect(await service.getByMessage(TENANT, live.id, first.id)).toEqual(opened);
    await expect(service.getByMessage(TENANT, live.id, second.id)).rejects.toThrow(
      DeadLetterNotFoundError,
    );
    await expect(service.getByMessage(TENANT, live.id, second.id)).rejects.toThrow("message");
  });

  it("reads a settled record back by message, because a settled one is evidence", async () => {
    const { service, live, first } = await harness();
    const opened = await service.record(failure(live.id, first.id));
    const settled = await service.discard(TENANT, opened.id, OPERATOR, DISCARD_REASON);

    expect(await service.getByMessage(TENANT, live.id, first.id)).toEqual(settled);
  });

  it("lists what is open across one institution, oldest failure first", async () => {
    const { service, live, first, second } = await harness();
    await service.record(failure(live.id, second.id, { failedAt: LATER_FAILED_AT }));
    await service.record(failure(live.id, first.id));

    const open = await service.listOpen(TENANT, ORG);

    expect(open.map((letter) => letter.failedAt)).toEqual([FAILED_AT, LATER_FAILED_AT]);
  });

  it("drops a settled record out of the worklist and keeps another institution's out of it", async () => {
    const { service, live, sibling, first, second } = await harness();
    const mine = await service.record(failure(live.id, first.id));
    await service.record(failure(sibling.id, second.id));

    await service.discard(TENANT, mine.id, OPERATOR, DISCARD_REASON);

    expect(await service.listOpen(TENANT, ORG)).toEqual([]);
    expect(await service.listOpen(TENANT, SECOND_ORG)).toHaveLength(1);
  });

  it("lists everything one consumer ever failed on, settled records included", async () => {
    const { service, live, first, second } = await harness();
    const mine = await service.record(failure(live.id, first.id));
    await service.record(failure(live.id, second.id, { failedAt: LATER_FAILED_AT }));
    await service.discard(TENANT, mine.id, OPERATOR, DISCARD_REASON);

    const history = await service.listBySubscription(TENANT, live.id);

    expect(history).toHaveLength(2);
    expect(history.map((letter) => letter.status)).toEqual(["discarded", "open"]);
  });

  it("lists the tenant's records, and keeps one tenant's out of another's", async () => {
    const { service, live, foreign, first, elsewhere } = await harness();
    await service.record(failure(live.id, first.id));
    await service.record(failure(foreign.id, elsewhere.id, { tenantId: OTHER }));

    expect(await service.list(TENANT)).toHaveLength(1);
    expect(await service.list(OTHER)).toHaveLength(1);
  });

  it("works without an event bus at all", async () => {
    const subscriptions = new InMemoryMeshSubscriptionRepository();
    const messages = new InMemoryMeshMessageRepository();
    const service = new DeadLetterService({
      repository: new InMemoryDeadLetterRepository(),
      subscriptions,
      messages,
      replays: new InMemoryReplayRequestRepository(),
      people,
    });
    const live = activateMeshSubscription(registerMeshSubscription(params()), OPERATOR);
    await subscriptions.save(live);
    const message = published(TENANT, "event-1", SEQUENCE);
    await messages.save(message);
    const opened = await service.record(failure(live.id, message.id));

    const settled = await service.discard(TENANT, opened.id, OPERATOR, DISCARD_REASON);

    expect(settled.status).toBe("discarded");
  });
});
