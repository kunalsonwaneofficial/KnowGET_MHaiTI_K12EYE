import type { CorrelationId, DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  CheckpointAheadOfStreamError,
  CheckpointRegressionError,
  DuplicateCheckpointError,
  EventStreamNotFoundError,
  MeshSubscriptionNotFoundError,
  MeshSubscriptionRetiredError,
  PartitionOutOfRangeError,
  PersonNotFoundForMeshError,
  ReasonTooShortError,
  SubscriptionCheckpointNotFoundError,
} from "./errors";
import { activateEventStream, defineEventStream } from "./event-stream";
import { CHECKPOINT_RESET } from "./mesh-events";
import { recordMeshMessage } from "./mesh-message";
import {
  type RegisterMeshSubscriptionParams,
  activateMeshSubscription,
  registerMeshSubscription,
  retireMeshSubscription,
} from "./mesh-subscription";
import { DEFAULT_PARTITION_COUNT, UNCOMMITTED_POSITION } from "./mesh-value";
import type { MeshEnvelope, PartitionDeclaration } from "./mesh-view";
import { partitionFor } from "./partitioning";
import {
  InMemoryEventStreamRepository,
  InMemoryMeshMessageRepository,
  InMemoryMeshSubscriptionRepository,
  InMemorySubscriptionCheckpointRepository,
  type PersonDirectory,
} from "./ports";
import { hasCheckpointCommitted } from "./subscription-checkpoint";
import { SubscriptionCheckpointService } from "./subscription-checkpoint-service";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org-1" as Uuid;
const OPERATOR = "person-1" as Uuid;
const ABSENT_PERSON = "person-absent" as Uuid;
const STUDENT = "student-1" as Uuid;
const CORRELATION = "correlation-1" as CorrelationId;
const MISSING = "checkpoint-absent" as Uuid;
const ABSENT_SUBSCRIPTION = "subscription-absent" as Uuid;

const STREAM_KEY = "admissions.applications";
const ABSENT_STREAM_KEY = "admissions.missing";
const KEY_PATH = "aggregate.aggregateId";
const SUBMITTED = "admissions.application.submitted";

const SUBSCRIPTION_KEY = "admissions.reporting";
const RETIRED_SUBSCRIPTION_KEY = "admissions.finance";
const ORPHAN_SUBSCRIPTION_KEY = "admissions.archive";
const GROUP = "reporting-workers";
const SECOND_GROUP = "finance-workers";
const THIRD_GROUP = "archive-workers";

const DIGEST = "sha256:9f2c1a";
const REASON = "Reprocessing the overnight backlog after a bad deployment.";

/** The last sequence the seeded stream holds, so every position below is judged against a known head. */
const HEAD = 5;
const PARTITION = partitionFor(STUDENT, DEFAULT_PARTITION_COUNT);
const EMPTY_PARTITION = (PARTITION + 1) % DEFAULT_PARTITION_COUNT;

/** One fixed instant, so no assertion below depends on when the suite happens to run. */
const OCCURRED_AT = "2027-01-02T09:15:00.000Z" as ISODateString;
const RECORDED_AT = "2027-01-02T09:15:00.250Z" as ISODateString;

/** Seconds from an instant the checkpoint itself carries, so idle time is never read off the wall clock. */
const plusSeconds = (from: ISODateString, seconds: number): ISODateString =>
  new Date(Date.parse(from) + seconds * 1_000).toISOString() as ISODateString;

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
  traceId: "trace-1",
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

/** One open channel in each tenant, so a consumer in one cannot read the partition count of the other. */
const channels = async (): Promise<InMemoryEventStreamRepository> => {
  const streams = new InMemoryEventStreamRepository();
  for (const tenantId of [TENANT, OTHER]) {
    const stream = defineEventStream({
      tenantId,
      organizationId: ORG,
      streamKey: STREAM_KEY,
      title: "Admission Applications",
      summary: "Everything an application does between arriving and being decided.",
      partitionKeyPath: KEY_PATH,
      eventTypeKeys: [SUBMITTED],
    });
    await streams.save(activateEventStream(stream, OPERATOR));
  }
  return streams;
};

/** One message at {@link HEAD} on the partition every checkpoint below follows. */
const published = async (): Promise<InMemoryMeshMessageRepository> => {
  const messages = new InMemoryMeshMessageRepository();
  for (const tenantId of [TENANT, OTHER]) {
    await messages.save(
      recordMeshMessage({
        organizationId: ORG,
        envelope: envelope({ tenantId }),
        partitioning: partitioning(),
        sequence: HEAD,
        retention: "digest",
        payloadDigest: DIGEST,
      }),
    );
  }
  return messages;
};

const harness = async () => {
  const repository = new InMemorySubscriptionCheckpointRepository();
  const subscriptions = new InMemoryMeshSubscriptionRepository();
  const streams = await channels();
  const messages = await published();
  const events = recorder();
  const service = new SubscriptionCheckpointService({
    repository,
    subscriptions,
    streams,
    messages,
    people,
    events,
  });

  const live = activateMeshSubscription(registerMeshSubscription(params()), OPERATOR);
  const dead = retireMeshSubscription(
    activateMeshSubscription(
      registerMeshSubscription(
        params({ subscriptionKey: RETIRED_SUBSCRIPTION_KEY, consumerGroup: SECOND_GROUP }),
      ),
      OPERATOR,
    ),
  );
  const orphan = registerMeshSubscription(
    params({
      subscriptionKey: ORPHAN_SUBSCRIPTION_KEY,
      consumerGroup: THIRD_GROUP,
      streamKey: ABSENT_STREAM_KEY,
    }),
  );
  for (const subscription of [live, dead, orphan]) {
    await subscriptions.save(subscription);
  }

  return { repository, subscriptions, streams, messages, events, service, live, dead, orphan };
};

const types = (events: ReturnType<typeof recorder>): string[] =>
  events.published.map((event) => event.type);

describe("SubscriptionCheckpointService — opening", () => {
  it("opens a position at the beginning of the partition, stores it and announces nothing", async () => {
    const { repository, events, service, live } = await harness();

    const checkpoint = await service.open(TENANT, live.id, PARTITION);

    expect(checkpoint.committedPosition).toBe(UNCOMMITTED_POSITION);
    expect(hasCheckpointCommitted(checkpoint)).toBe(false);
    expect(checkpoint.subscriptionKey).toBe(SUBSCRIPTION_KEY);
    expect(checkpoint.streamKey).toBe(STREAM_KEY);
    expect(checkpoint.organizationId).toBe(ORG);
    expect(checkpoint.resetAt).toBeNull();
    expect(await repository.findById(TENANT, checkpoint.id)).toEqual(checkpoint);
    expect(types(events)).toEqual([]);
  });

  it("takes the partition count from the stream, so a partition it does not have is refused", async () => {
    const { service, live } = await harness();

    await expect(service.open(TENANT, live.id, DEFAULT_PARTITION_COUNT)).rejects.toThrow(
      PartitionOutOfRangeError,
    );
  });

  it("refuses a second position on one partition of one consumer", async () => {
    const { service, live } = await harness();
    await service.open(TENANT, live.id, PARTITION);

    await expect(service.open(TENANT, live.id, PARTITION)).rejects.toThrow(
      DuplicateCheckpointError,
    );
  });

  it("opens a second position on another partition of the same stream", async () => {
    const { service, live } = await harness();
    await service.open(TENANT, live.id, PARTITION);

    const second = await service.open(TENANT, live.id, EMPTY_PARTITION);

    expect(second.partition).toBe(EMPTY_PARTITION);
  });

  it("refuses a consumer this tenant does not have", async () => {
    const { service, live } = await harness();

    await expect(service.open(TENANT, ABSENT_SUBSCRIPTION, PARTITION)).rejects.toThrow(
      MeshSubscriptionNotFoundError,
    );
    await expect(service.open(OTHER, live.id, PARTITION)).rejects.toThrow(
      MeshSubscriptionNotFoundError,
    );
  });

  it("refuses a retired consumer, whose position nothing would ever advance", async () => {
    const { service, dead } = await harness();

    await expect(service.open(TENANT, dead.id, PARTITION)).rejects.toThrow(
      MeshSubscriptionRetiredError,
    );
  });

  it("refuses where the channel the consumer names has gone", async () => {
    const { service, orphan } = await harness();

    await expect(service.open(TENANT, orphan.id, PARTITION)).rejects.toThrow(
      EventStreamNotFoundError,
    );
  });
});

describe("SubscriptionCheckpointService — commits", () => {
  it("moves the position forward, stores it and announces nothing", async () => {
    const { repository, events, service, live } = await harness();
    const checkpoint = await service.open(TENANT, live.id, PARTITION);

    const committed = await service.commit(TENANT, checkpoint.id, 3);

    expect(committed.committedPosition).toBe(3);
    expect(hasCheckpointCommitted(committed)).toBe(true);
    expect(await repository.findById(TENANT, checkpoint.id)).toEqual(committed);
    expect(types(events)).toEqual([]);
  });

  it("hands back the same checkpoint where the position has not moved", async () => {
    const { service, live } = await harness();
    const checkpoint = await service.open(TENANT, live.id, PARTITION);
    const committed = await service.commit(TENANT, checkpoint.id, 3);

    const again = await service.commit(TENANT, checkpoint.id, 3);

    expect(again).toBe(committed);
  });

  it("refuses a position behind the one already committed", async () => {
    const { service, live } = await harness();
    const checkpoint = await service.open(TENANT, live.id, PARTITION);
    await service.commit(TENANT, checkpoint.id, 3);

    await expect(service.commit(TENANT, checkpoint.id, 2)).rejects.toThrow(
      CheckpointRegressionError,
    );
  });

  it("refuses a position past the end of the partition, using the head the store reports", async () => {
    const { service, live } = await harness();
    const checkpoint = await service.open(TENANT, live.id, PARTITION);

    await expect(service.commit(TENANT, checkpoint.id, HEAD)).resolves.toBeDefined();
    await expect(service.commit(TENANT, checkpoint.id, HEAD + 1)).rejects.toThrow(
      CheckpointAheadOfStreamError,
    );
  });

  it("commits on a retired consumer, because a worker draining its last batch is doing its job", async () => {
    const { subscriptions, service, live } = await harness();
    const checkpoint = await service.open(TENANT, live.id, PARTITION);
    await subscriptions.save(retireMeshSubscription(live));

    const committed = await service.commit(TENANT, checkpoint.id, 3);

    expect(committed.committedPosition).toBe(3);
  });

  it("refuses a checkpoint this tenant does not have", async () => {
    const { service, live } = await harness();
    const checkpoint = await service.open(TENANT, live.id, PARTITION);

    await expect(service.commit(TENANT, MISSING, 1)).rejects.toThrow(
      SubscriptionCheckpointNotFoundError,
    );
    await expect(service.commit(OTHER, checkpoint.id, 1)).rejects.toThrow(
      SubscriptionCheckpointNotFoundError,
    );
  });
});

describe("SubscriptionCheckpointService — resets", () => {
  it("moves the position by hand, in somebody's name, and announces it", async () => {
    const { repository, events, service, live } = await harness();
    const checkpoint = await service.open(TENANT, live.id, PARTITION);
    await service.commit(TENANT, checkpoint.id, 4);

    const reset = await service.reset(TENANT, checkpoint.id, 1, OPERATOR, REASON);

    expect(reset.committedPosition).toBe(1);
    expect(reset.resetBy).toBe(OPERATOR);
    expect(reset.resetReason).toBe(REASON);
    expect(reset.resetAt).not.toBeNull();
    expect(await repository.findById(TENANT, checkpoint.id)).toEqual(reset);
    expect(types(events)).toEqual([CHECKPOINT_RESET]);
  });

  it("announces a reset to the position already held, because deciding that is a decision", async () => {
    const { events, service, live } = await harness();
    const checkpoint = await service.open(TENANT, live.id, PARTITION);

    const reset = await service.reset(
      TENANT,
      checkpoint.id,
      UNCOMMITTED_POSITION,
      OPERATOR,
      REASON,
    );

    expect(reset.committedPosition).toBe(UNCOMMITTED_POSITION);
    expect(reset.resetAt).not.toBeNull();
    expect(types(events)).toEqual([CHECKPOINT_RESET]);
  });

  it("refuses a reset in the name of somebody the tenant does not know", async () => {
    const { service, live } = await harness();
    const checkpoint = await service.open(TENANT, live.id, PARTITION);

    await expect(service.reset(TENANT, checkpoint.id, 1, ABSENT_PERSON, REASON)).rejects.toThrow(
      PersonNotFoundForMeshError,
    );
  });

  it("refuses a reset past the end of the partition", async () => {
    const { service, live } = await harness();
    const checkpoint = await service.open(TENANT, live.id, PARTITION);

    await expect(service.reset(TENANT, checkpoint.id, HEAD + 1, OPERATOR, REASON)).rejects.toThrow(
      CheckpointAheadOfStreamError,
    );
  });

  it("refuses a reason too short to be worth reading afterwards", async () => {
    const { service, live } = await harness();
    const checkpoint = await service.open(TENANT, live.id, PARTITION);

    await expect(service.reset(TENANT, checkpoint.id, 1, OPERATOR, "oops")).rejects.toThrow(
      ReasonTooShortError,
    );
  });
});

describe("SubscriptionCheckpointService — reading", () => {
  it("reads one checkpoint back, or refuses by id", async () => {
    const { service, live } = await harness();
    const checkpoint = await service.open(TENANT, live.id, PARTITION);

    expect(await service.get(TENANT, checkpoint.id)).toEqual(checkpoint);
    await expect(service.get(TENANT, MISSING)).rejects.toThrow(SubscriptionCheckpointNotFoundError);
  });

  it("reads one consumer's position on one partition, or refuses naming the partition", async () => {
    const { service, live } = await harness();
    const checkpoint = await service.open(TENANT, live.id, PARTITION);

    expect(await service.getByPartition(TENANT, live.id, PARTITION)).toEqual(checkpoint);
    await expect(service.getByPartition(TENANT, live.id, EMPTY_PARTITION)).rejects.toThrow(
      SubscriptionCheckpointNotFoundError,
    );
    await expect(service.getByPartition(TENANT, live.id, EMPTY_PARTITION)).rejects.toThrow(
      "partition",
    );
  });

  it("lists every partition one consumer holds, in partition order", async () => {
    const { service, live } = await harness();
    await service.open(TENANT, live.id, EMPTY_PARTITION);
    await service.open(TENANT, live.id, PARTITION);

    const held = await service.listBySubscription(TENANT, live.id);

    expect(held.map((checkpoint) => checkpoint.partition)).toEqual(
      [PARTITION, EMPTY_PARTITION].sort((left, right) => left - right),
    );
  });

  it("lists the tenant's checkpoints, and keeps one tenant's out of another's", async () => {
    const { service, live } = await harness();
    await service.open(TENANT, live.id, PARTITION);

    expect(await service.list(TENANT)).toHaveLength(1);
    expect(await service.list(OTHER)).toEqual([]);
  });

  it("assesses lag against the head the store reports, as of the stated moment", async () => {
    const { service, live } = await harness();
    const checkpoint = await service.open(TENANT, live.id, PARTITION);

    const fresh = await service.assessLag(
      TENANT,
      checkpoint.id,
      plusSeconds(checkpoint.positionMovedAt, 60),
    );

    expect(fresh.subscriptionKey).toBe(SUBSCRIPTION_KEY);
    expect(fresh.partition).toBe(PARTITION);
    expect(fresh.lag).toBe(HEAD);
    expect(fresh.idleSeconds).toBe(60);
    expect(fresh.band).toBe("current");
  });

  it("calls a consumer stalled once its position has stood still through a backlog", async () => {
    const { service, live } = await harness();
    const checkpoint = await service.open(TENANT, live.id, PARTITION);

    const stale = await service.assessLag(
      TENANT,
      checkpoint.id,
      plusSeconds(checkpoint.positionMovedAt, 1_800),
    );

    expect(stale.band).toBe("stalled");
  });

  it("calls a consumer current once it has caught up with the head", async () => {
    const { service, live } = await harness();
    const checkpoint = await service.open(TENANT, live.id, PARTITION);
    const committed = await service.commit(TENANT, checkpoint.id, HEAD);

    const caught = await service.assessLag(
      TENANT,
      checkpoint.id,
      plusSeconds(committed.positionMovedAt, 1_800),
    );

    expect(caught.lag).toBe(0);
    expect(caught.band).toBe("current");
  });

  it("works without an event bus at all", async () => {
    const subscriptions = new InMemoryMeshSubscriptionRepository();
    const service = new SubscriptionCheckpointService({
      repository: new InMemorySubscriptionCheckpointRepository(),
      subscriptions,
      streams: await channels(),
      messages: await published(),
      people,
    });
    const live = activateMeshSubscription(registerMeshSubscription(params()), OPERATOR);
    await subscriptions.save(live);
    const checkpoint = await service.open(TENANT, live.id, PARTITION);

    const reset = await service.reset(TENANT, checkpoint.id, 1, OPERATOR, REASON);

    expect(reset.committedPosition).toBe(1);
  });
});
