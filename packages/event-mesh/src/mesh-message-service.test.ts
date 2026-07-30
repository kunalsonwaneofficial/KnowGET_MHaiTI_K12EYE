import type { CorrelationId, DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicateSequenceError,
  EventStreamNotFoundError,
  EventTypeNotAcceptedError,
  EventTypeNotPublishableError,
  MeshMessageImmutableError,
  MeshMessageNotFoundError,
  PayloadNotRetainedError,
  StreamNotPublishableError,
  UnknownEventTypeError,
} from "./errors";
import { activateEventStream, defineEventStream, retireEventStream } from "./event-stream";
import { defineEventType, publishEventType } from "./event-type-definition";
import { MESSAGE_PAYLOAD_FORGOTTEN } from "./mesh-events";
import { MeshMessageService, type RecordMessageRequest } from "./mesh-message-service";
import {
  DEFAULT_PARTITION_COUNT,
  FIRST_SEQUENCE,
  UNCOMMITTED_POSITION,
  type SchemaField,
} from "./mesh-value";
import type { MeshEnvelope } from "./mesh-view";
import { partitionFor } from "./partitioning";
import {
  InMemoryEventStreamRepository,
  InMemoryEventTypeDefinitionRepository,
  InMemoryMeshMessageRepository,
  type MeshMessageRepository,
} from "./ports";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org-1" as Uuid;
const OPERATOR = "person-1" as Uuid;
const EVENT_ID = "event-1" as Uuid;
const SECOND_EVENT_ID = "event-2" as Uuid;
const STUDENT = "student-1" as Uuid;
const SECOND_STUDENT = "student-2" as Uuid;
const CORRELATION = "correlation-1" as CorrelationId;
const MISSING = "message-absent" as Uuid;

const STREAM_KEY = "admissions.applications";
const DIGEST_STREAM_KEY = "admissions.audit";
const DRAFT_STREAM_KEY = "admissions.pending";
const CLOSED_STREAM_KEY = "admissions.legacy";
const ABSENT_STREAM_KEY = "admissions.missing";
const KEY_PATH = "aggregate.aggregateId";
const SUBMITTED = "admissions.application.submitted";
const WITHDRAWN = "admissions.application.withdrawn";

const DIGEST = "sha256:9f2c1a";
const PAYLOAD = { applicationId: STUDENT, stage: "submitted" };

const SCHEMA: readonly SchemaField[] = [
  { name: "applicationId", type: "uuid", required: true },
  { name: "submittedAt", type: "instant", required: true },
];

/** One fixed instant, so no assertion below depends on when the suite happens to run. */
const OCCURRED_AT = "2027-01-02T09:15:00.000Z" as ISODateString;
const RECORDED_AT = "2027-01-02T09:15:00.250Z" as ISODateString;

/** Days from an instant the test itself fixed, so a retention window never depends on the wall clock. */
const plusDays = (from: ISODateString, days: number): ISODateString =>
  new Date(Date.parse(from) + days * 86_400_000).toISOString() as ISODateString;

const recorder = () => {
  const published: DomainEvent[] = [];
  return {
    published,
    publish: async (event: DomainEvent): Promise<void> => {
      published.push(event);
    },
  };
};

const envelope = (overrides: Partial<MeshEnvelope> = {}): MeshEnvelope => ({
  eventId: EVENT_ID,
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

const request = (overrides: Partial<RecordMessageRequest> = {}): RecordMessageRequest => ({
  envelope: envelope(),
  payloadDigest: DIGEST,
  payload: PAYLOAD,
  ...overrides,
});

/**
 * One open channel that keeps bodies, one that keeps only digests, one still in draft and one closed, in each
 * tenant, so every publishability branch has a stream and neither tenant can borrow the other's.
 */
const channels = async (): Promise<InMemoryEventStreamRepository> => {
  const streams = new InMemoryEventStreamRepository();
  for (const tenantId of [TENANT, OTHER]) {
    for (const streamKey of [STREAM_KEY, DIGEST_STREAM_KEY, DRAFT_STREAM_KEY, CLOSED_STREAM_KEY]) {
      const stream = defineEventStream({
        tenantId,
        organizationId: ORG,
        streamKey,
        title: "Admission Applications",
        summary: "Everything an application does between arriving and being decided.",
        partitionKeyPath: KEY_PATH,
        retention: streamKey === DIGEST_STREAM_KEY ? "digest" : "full",
        eventTypeKeys: [SUBMITTED],
      });
      if (streamKey === DRAFT_STREAM_KEY) {
        await streams.save(stream);
        continue;
      }
      const open = activateEventStream(stream, OPERATOR);
      await streams.save(streamKey === CLOSED_STREAM_KEY ? retireEventStream(open) : open);
    }
  }
  return streams;
};

/** The submitted type published at version one, and a second version still in draft, in each tenant. */
const registry = async (): Promise<InMemoryEventTypeDefinitionRepository> => {
  const eventTypes = new InMemoryEventTypeDefinitionRepository();
  for (const tenantId of [TENANT, OTHER]) {
    for (const version of [1, 2]) {
      const draft = defineEventType({
        tenantId,
        organizationId: ORG,
        eventTypeKey: SUBMITTED,
        version,
        title: "Application Submitted",
        summary: "A guardian has submitted an admission application for one learner.",
        schemaFields: SCHEMA,
      });
      await eventTypes.save(version === 1 ? publishEventType(draft, OPERATOR) : draft);
    }
  }
  return eventTypes;
};

const harness = async () => {
  const repository = new InMemoryMeshMessageRepository();
  const streams = await channels();
  const eventTypes = await registry();
  const events = recorder();
  const service = new MeshMessageService({ repository, streams, eventTypes, events });
  return { repository, streams, eventTypes, events, service };
};

const types = (events: ReturnType<typeof recorder>): string[] =>
  events.published.map((event) => event.type);

/**
 * A store whose sequence allocator always hands back the first position, which is what a read-then-write race
 * between two publishers looks like from inside the service.
 */
const racing = (repository: InMemoryMeshMessageRepository): MeshMessageRepository => ({
  findById: (tenantId, id) => repository.findById(tenantId, id),
  findByEventId: (tenantId, eventId) => repository.findByEventId(tenantId, eventId),
  nextSequence: async () => FIRST_SEQUENCE,
  streamHead: (tenantId, streamKey, partition) =>
    repository.streamHead(tenantId, streamKey, partition),
  countWindow: (tenantId, streamKey, from, to) =>
    repository.countWindow(tenantId, streamKey, from, to),
  listWindow: (tenantId, streamKey, from, to) =>
    repository.listWindow(tenantId, streamKey, from, to),
  listRetaining: (tenantId, streamKey, before) =>
    repository.listRetaining(tenantId, streamKey, before),
  save: (message) => repository.save(message),
});

describe("MeshMessageService — recording", () => {
  it("records the envelope on its stream, under that stream's institution, and announces nothing", async () => {
    const { repository, events, service } = await harness();

    const message = await service.record(request());

    expect(message.organizationId).toBe(ORG);
    expect(message.streamKey).toBe(STREAM_KEY);
    expect(message.eventId).toBe(EVENT_ID);
    expect(message.sequence).toBe(FIRST_SEQUENCE);
    expect(message.retention).toBe("full");
    expect(message.payload).toEqual(PAYLOAD);
    expect(await repository.findById(TENANT, message.id)).toEqual(message);
    expect(types(events)).toEqual([]);
  });

  it("partitions by the stream's declaration rather than by anything the caller supplied", async () => {
    const { service } = await harness();

    const message = await service.record(request());

    expect(message.partitionCount).toBe(DEFAULT_PARTITION_COUNT);
    expect(message.partition).toBe(partitionFor(STUDENT, DEFAULT_PARTITION_COUNT));
  });

  it("keeps only a digest where the stream promised only a digest", async () => {
    const { service } = await harness();

    const message = await service.record(
      request({ envelope: envelope({ streamKey: DIGEST_STREAM_KEY }) }),
    );

    expect(message.retention).toBe("digest");
    expect(message.payloadDigest).toBe(DIGEST);
    expect(message.payload).toBeNull();
  });

  it("hands sequences out in order along one stream", async () => {
    const { service } = await harness();

    const first = await service.record(request());
    const second = await service.record(
      request({ envelope: envelope({ eventId: SECOND_EVENT_ID }) }),
    );

    expect(first.sequence).toBe(FIRST_SEQUENCE);
    expect(second.sequence).toBe(FIRST_SEQUENCE + 1);
  });

  it("refuses a channel that has not opened yet, because the publisher's event was fine", async () => {
    const { service } = await harness();

    await expect(
      service.record(request({ envelope: envelope({ streamKey: DRAFT_STREAM_KEY }) })),
    ).rejects.toThrow(StreamNotPublishableError);
    await expect(
      service.record(request({ envelope: envelope({ streamKey: DRAFT_STREAM_KEY }) })),
    ).rejects.toThrow("draft");
  });

  it("refuses a channel that will never carry anything again", async () => {
    const { service } = await harness();

    await expect(
      service.record(request({ envelope: envelope({ streamKey: CLOSED_STREAM_KEY }) })),
    ).rejects.toThrow(StreamNotPublishableError);
  });

  it("refuses a stream this tenant does not have", async () => {
    const { service } = await harness();

    await expect(
      service.record(request({ envelope: envelope({ streamKey: ABSENT_STREAM_KEY }) })),
    ).rejects.toThrow(EventStreamNotFoundError);
  });

  it("refuses an event type the stream does not list, which is the contract its readers hold", async () => {
    const { service } = await harness();

    await expect(
      service.record(request({ envelope: envelope({ eventTypeKey: WITHDRAWN }) })),
    ).rejects.toThrow(EventTypeNotAcceptedError);
  });

  it("refuses a version the registry does not hold at all", async () => {
    const { service } = await harness();

    await expect(
      service.record(request({ envelope: envelope({ eventTypeVersion: 9 }) })),
    ).rejects.toThrow(UnknownEventTypeError);
  });

  it("refuses a version nobody has been shown yet, naming the state it is in", async () => {
    const { service } = await harness();

    await expect(
      service.record(request({ envelope: envelope({ eventTypeVersion: 2 }) })),
    ).rejects.toThrow(EventTypeNotPublishableError);
    await expect(
      service.record(request({ envelope: envelope({ eventTypeVersion: 2 }) })),
    ).rejects.toThrow("draft");
  });

  it("refuses a second message for one event, naming the message already holding it", async () => {
    const { service } = await harness();
    const first = await service.record(request());

    await expect(service.record(request())).rejects.toThrow(MeshMessageImmutableError);
    await expect(service.record(request())).rejects.toThrow(first.id);
  });

  it("records the same event in another tenant, because a mesh belongs to one tenant", async () => {
    const { service } = await harness();
    await service.record(request());

    const elsewhere = await service.record(request({ envelope: envelope({ tenantId: OTHER }) }));

    expect(elsewhere.tenantId).toBe(OTHER);
    expect(elsewhere.sequence).toBe(FIRST_SEQUENCE);
  });

  it("refuses a sequence the partition already holds, which is what an allocator race looks like", async () => {
    const repository = new InMemoryMeshMessageRepository();
    const service = new MeshMessageService({
      repository: racing(repository),
      streams: await channels(),
      eventTypes: await registry(),
    });
    await service.record(request());

    await expect(
      service.record(request({ envelope: envelope({ eventId: SECOND_EVENT_ID }) })),
    ).rejects.toThrow(DuplicateSequenceError);
  });
});

describe("MeshMessageService — retention", () => {
  it("forgets one body, stamps the erasure, stores it and announces it", async () => {
    const { repository, events, service } = await harness();
    const message = await service.record(request());

    const forgotten = await service.forget(TENANT, message.id);

    expect(forgotten.payload).toBeNull();
    expect(forgotten.payloadForgottenAt).not.toBeNull();
    expect(await repository.findById(TENANT, message.id)).toEqual(forgotten);
    expect(types(events)).toEqual([MESSAGE_PAYLOAD_FORGOTTEN]);
  });

  it("leaves an already-hollow message alone, and does not say so a second time", async () => {
    const { events, service } = await harness();
    const message = await service.record(request());
    const forgotten = await service.forget(TENANT, message.id);

    const again = await service.forget(TENANT, message.id);

    expect(again).toBe(forgotten);
    expect(types(events)).toEqual([MESSAGE_PAYLOAD_FORGOTTEN]);
  });

  it("announces nothing where the stream never kept a body to forget", async () => {
    const { events, service } = await harness();
    const message = await service.record(
      request({ envelope: envelope({ streamKey: DIGEST_STREAM_KEY }) }),
    );

    await service.forget(TENANT, message.id);

    expect(types(events)).toEqual([]);
  });

  it("refuses to forget a message this tenant does not have", async () => {
    const { service } = await harness();

    await expect(service.forget(TENANT, MISSING)).rejects.toThrow(MeshMessageNotFoundError);
  });

  it("sweeps every body the window has passed over, as of the stated moment", async () => {
    const { events, service } = await harness();
    await service.record(request());
    await service.record(request({ envelope: envelope({ eventId: SECOND_EVENT_ID }) }));

    const swept = await service.sweepRetention(TENANT, STREAM_KEY, plusDays(RECORDED_AT, 40));

    expect(swept).toHaveLength(2);
    expect(swept.every((message) => message.payload === null)).toBe(true);
    expect(types(events)).toEqual([MESSAGE_PAYLOAD_FORGOTTEN, MESSAGE_PAYLOAD_FORGOTTEN]);
  });

  it("leaves a body the window still covers", async () => {
    const { events, service } = await harness();
    const message = await service.record(request());

    const swept = await service.sweepRetention(TENANT, STREAM_KEY, plusDays(RECORDED_AT, 1));

    expect(swept).toEqual([]);
    expect((await service.get(TENANT, message.id)).payload).toEqual(PAYLOAD);
    expect(types(events)).toEqual([]);
  });

  it("sweeps a retired stream, because retirement is not a licence to keep holding bodies", async () => {
    const { streams, service } = await harness();
    await service.record(request());
    const stream = await streams.findByKey(TENANT, STREAM_KEY);
    await streams.save(retireEventStream(stream!));

    const swept = await service.sweepRetention(TENANT, STREAM_KEY, plusDays(RECORDED_AT, 40));

    expect(swept).toHaveLength(1);
  });

  it("sweeps twice and does the work once", async () => {
    const { events, service } = await harness();
    await service.record(request());
    await service.sweepRetention(TENANT, STREAM_KEY, plusDays(RECORDED_AT, 40));

    const again = await service.sweepRetention(TENANT, STREAM_KEY, plusDays(RECORDED_AT, 40));

    expect(again).toEqual([]);
    expect(types(events)).toEqual([MESSAGE_PAYLOAD_FORGOTTEN]);
  });

  it("refuses a sweep of a stream this tenant does not have", async () => {
    const { service } = await harness();

    await expect(
      service.sweepRetention(TENANT, ABSENT_STREAM_KEY, plusDays(RECORDED_AT, 40)),
    ).rejects.toThrow(EventStreamNotFoundError);
  });
});

describe("MeshMessageService — reading", () => {
  it("reads one message back, or refuses by id", async () => {
    const { service } = await harness();
    const message = await service.record(request());

    expect(await service.get(TENANT, message.id)).toEqual(message);
    await expect(service.get(TENANT, MISSING)).rejects.toThrow(MeshMessageNotFoundError);
  });

  it("reads one message by the event it carries, which is how a producer checks it got through", async () => {
    const { service } = await harness();
    const message = await service.record(request());

    expect(await service.getByEventId(TENANT, EVENT_ID)).toEqual(message);
    await expect(service.getByEventId(TENANT, SECOND_EVENT_ID)).rejects.toThrow(
      MeshMessageNotFoundError,
    );
  });

  it("hands back the retained body", async () => {
    const { service } = await harness();
    const message = await service.record(request());

    expect(await service.payload(TENANT, message.id)).toEqual(PAYLOAD);
  });

  it("refuses the body of a message on a stream that only ever kept its digest", async () => {
    const { service } = await harness();
    const message = await service.record(
      request({ envelope: envelope({ streamKey: DIGEST_STREAM_KEY }) }),
    );

    await expect(service.payload(TENANT, message.id)).rejects.toThrow(PayloadNotRetainedError);
  });

  it("reports the head of a partition, and nothing at all for one nobody has reached", async () => {
    const { service } = await harness();
    const message = await service.record(request());
    const empty = (partitionFor(STUDENT, DEFAULT_PARTITION_COUNT) + 1) % DEFAULT_PARTITION_COUNT;

    expect(await service.head(TENANT, STREAM_KEY, message.partition)).toBe(message.sequence);
    expect(await service.head(TENANT, STREAM_KEY, empty)).toBe(UNCOMMITTED_POSITION);
  });

  it("counts and lists a window in sequence order, which is the order a replay walks it", async () => {
    const { service } = await harness();
    const first = await service.record(request());
    const second = await service.record(
      request({
        envelope: envelope({
          eventId: SECOND_EVENT_ID,
          partitionKey: SECOND_STUDENT,
          recordedAt: plusDays(RECORDED_AT, 1),
        }),
      }),
    );
    const from = OCCURRED_AT;
    const to = plusDays(RECORDED_AT, 2);

    expect(await service.countWindow(TENANT, STREAM_KEY, from, to)).toBe(2);
    expect(await service.listWindow(TENANT, STREAM_KEY, from, to)).toEqual([first, second]);
    expect(await service.countWindow(TENANT, STREAM_KEY, from, RECORDED_AT)).toBe(1);
  });

  it("keeps one tenant's messages out of another's", async () => {
    const { service } = await harness();
    const message = await service.record(request());

    await expect(service.get(OTHER, message.id)).rejects.toThrow(MeshMessageNotFoundError);
    await expect(service.getByEventId(OTHER, EVENT_ID)).rejects.toThrow(MeshMessageNotFoundError);
  });

  it("works without an event bus at all", async () => {
    const service = new MeshMessageService({
      repository: new InMemoryMeshMessageRepository(),
      streams: await channels(),
      eventTypes: await registry(),
    });
    const message = await service.record(request());

    const forgotten = await service.forget(TENANT, message.id);

    expect(forgotten.payload).toBeNull();
  });
});
