import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicateStreamKeyError,
  EmptyMeshKeyError,
  EmptyStreamEventTypesError,
  EventStreamNotFoundError,
  EventTypeNotAcceptedError,
  InvalidStreamProgressionError,
  OrganizationNotFoundForMeshError,
  PartitioningFrozenError,
  PersonNotFoundForMeshError,
  StreamRetiredError,
  UnknownEventTypeError,
} from "./errors";
import type { DefineEventStreamParams, EventStream } from "./event-stream";
import { EventStreamService } from "./event-stream-service";
import { defineEventType } from "./event-type-definition";
import {
  STREAM_ACTIVATED,
  STREAM_DEFINED,
  STREAM_EVENT_TYPE_ACCEPTED,
  STREAM_EVENT_TYPE_WITHDRAWN,
  STREAM_PAUSED,
  STREAM_REPARTITIONED,
  STREAM_RETENTION_REVISED,
  STREAM_RETIRED,
} from "./mesh-events";
import {
  DEFAULT_PARTITION_COUNT,
  DEFAULT_PAYLOAD_RETENTION,
  DEFAULT_RETENTION_SECONDS,
  MIN_RETENTION_SECONDS,
  type SchemaField,
} from "./mesh-value";
import {
  InMemoryEventStreamRepository,
  InMemoryEventTypeDefinitionRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org-1" as Uuid;
const SECOND_ORG = "org-2" as Uuid;
const ABSENT_ORG = "org-absent" as Uuid;
const OPERATOR = "person-1" as Uuid;
const SECOND_OPERATOR = "person-2" as Uuid;
const ABSENT_PERSON = "person-absent" as Uuid;
const MISSING = "stream-absent" as Uuid;

const STREAM_KEY = "admissions.applications";
const SECOND_STREAM_KEY = "admissions.decisions";
const KEY_PATH = "aggregate.aggregateId";
const SUBMITTED = "admissions.application.submitted";
const OFFERED = "admissions.offer.made";
const UNREGISTERED = "admissions.offer.declined";

const SEED_FIELDS: readonly SchemaField[] = [
  { name: "applicationId", type: "uuid", required: true },
];

const recorder = () => {
  const published: DomainEvent[] = [];
  return {
    published,
    publish: async (event: DomainEvent): Promise<void> => {
      published.push(event);
    },
  };
};

const organizations: OrganizationDirectory = {
  exists: async (_tenantId, organizationId) => organizationId !== ABSENT_ORG,
};
const people: PersonDirectory = {
  exists: async (_tenantId, personId) => personId !== ABSENT_PERSON,
};

const params = (overrides: Partial<DefineEventStreamParams> = {}): DefineEventStreamParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  streamKey: STREAM_KEY,
  title: "Admission Applications",
  summary: "Everything an application does between arriving and being decided.",
  partitionKeyPath: KEY_PATH,
  eventTypeKeys: [SUBMITTED],
  ...overrides,
});

/**
 * A registry holding both tenants' types as drafts, which is the state a stream is usually brought up in.
 */
const registry = async (): Promise<InMemoryEventTypeDefinitionRepository> => {
  const eventTypes = new InMemoryEventTypeDefinitionRepository();
  for (const tenantId of [TENANT, OTHER]) {
    for (const eventTypeKey of [SUBMITTED, OFFERED]) {
      await eventTypes.save(
        defineEventType({
          tenantId,
          organizationId: ORG,
          eventTypeKey,
          title: "A registered type",
          summary: "Seeded so that a stream naming this key has something to be checked against.",
          schemaFields: SEED_FIELDS,
        }),
      );
    }
  }
  return eventTypes;
};

const harness = async () => {
  const repository = new InMemoryEventStreamRepository();
  const eventTypes = await registry();
  const events = recorder();
  const service = new EventStreamService({
    repository,
    eventTypes,
    organizations,
    people,
    events,
  });
  return { repository, eventTypes, events, service };
};

const types = (events: ReturnType<typeof recorder>): string[] =>
  events.published.map((event) => event.type);

/** Define a stream and open it, which is the precondition of every frozen-configuration test below. */
const open = async (
  service: EventStreamService,
  overrides: Partial<DefineEventStreamParams> = {},
): Promise<EventStream> => {
  const stream = await service.define(params(overrides));
  return service.activate(TENANT, stream.id, OPERATOR);
};

describe("EventStreamService — definition", () => {
  it("declares a channel, stores it and announces it", async () => {
    const { repository, events, service } = await harness();

    const stream = await service.define(params());

    expect(stream.status).toBe("draft");
    expect(stream.activatedAt).toBeNull();
    expect(stream.activatedBy).toBeNull();
    expect(await repository.findById(TENANT, stream.id)).toEqual(stream);
    expect(types(events)).toEqual([STREAM_DEFINED]);
  });

  it("takes the conservative default on every setting a caller left unstated", async () => {
    const { service } = await harness();

    const stream = await service.define(params());

    expect(stream.ordering).toBe("partition");
    expect(stream.partitionCount).toBe(DEFAULT_PARTITION_COUNT);
    expect(stream.retention).toBe(DEFAULT_PAYLOAD_RETENTION);
    expect(stream.retentionSeconds).toBe(DEFAULT_RETENTION_SECONDS);
  });

  it("refuses an organization the directory does not know", async () => {
    const { service } = await harness();

    await expect(service.define(params({ organizationId: ABSENT_ORG }))).rejects.toThrow(
      OrganizationNotFoundForMeshError,
    );
  });

  it("refuses a stream key already taken", async () => {
    const { service } = await harness();
    await service.define(params());

    await expect(service.define(params({ title: "Applications, again" }))).rejects.toThrow(
      DuplicateStreamKeyError,
    );
  });

  it("holds the key tenant-wide, so a second school cannot claim the same channel", async () => {
    const { service } = await harness();
    await service.define(params());

    await expect(service.define(params({ organizationId: SECOND_ORG }))).rejects.toThrow(
      DuplicateStreamKeyError,
    );
  });

  it("compares keys after normalisation, so a differently cased key is the same channel", async () => {
    const { service } = await harness();
    await service.define(params());

    await expect(
      service.define(params({ streamKey: "  Admissions.Applications  " })),
    ).rejects.toThrow(DuplicateStreamKeyError);
  });

  it("leaves the same key in another tenant alone", async () => {
    const { service } = await harness();
    await service.define(params());

    const elsewhere = await service.define(params({ tenantId: OTHER }));

    expect(elsewhere.streamKey).toBe(STREAM_KEY);
    expect(elsewhere.tenantId).toBe(OTHER);
  });

  it("refuses a type the registry has never heard of, naming the key it could not place", async () => {
    const { service } = await harness();

    const define = service.define(params({ eventTypeKeys: [SUBMITTED, UNREGISTERED] }));

    await expect(define).rejects.toThrow(UnknownEventTypeError);
    await expect(service.define(params({ eventTypeKeys: [UNREGISTERED] }))).rejects.toThrow(
      UNREGISTERED,
    );
  });

  it("accepts a drafted type, so a channel and its vocabulary come up together", async () => {
    const { eventTypes, service } = await harness();

    const stream = await service.define(params({ eventTypeKeys: [SUBMITTED, OFFERED] }));
    const registered = await eventTypes.listByKey(TENANT, SUBMITTED);

    expect(registered.every((definition) => definition.status === "draft")).toBe(true);
    expect(stream.eventTypeKeys).toEqual([SUBMITTED, OFFERED]);
  });

  it("settles what the aggregate can refuse before it asks anything else", async () => {
    const { service } = await harness();

    const define = service.define(params({ streamKey: "   ", organizationId: ABSENT_ORG }));

    await expect(define).rejects.toThrow(EmptyMeshKeyError);
  });

  it("404s on a stream that does not exist", async () => {
    const { service } = await harness();

    await expect(service.get(TENANT, MISSING)).rejects.toThrow(EventStreamNotFoundError);
  });
});

describe("EventStreamService — vocabulary", () => {
  it("accepts one more type and announces the single key that arrived", async () => {
    const { repository, events, service } = await harness();
    const stream = await service.define(params());

    const next = await service.accept(TENANT, stream.id, OFFERED);

    expect(next.eventTypeKeys).toEqual([SUBMITTED, OFFERED].sort());
    expect(await repository.findById(TENANT, stream.id)).toEqual(next);
    expect(types(events)).toEqual([STREAM_DEFINED, STREAM_EVENT_TYPE_ACCEPTED]);
  });

  it("normalises the key it stores", async () => {
    const { service } = await harness();
    const stream = await service.define(params());

    const next = await service.accept(TENANT, stream.id, "  Admissions.Offer.Made  ");

    expect(next.eventTypeKeys).toContain(OFFERED);
  });

  it("refuses a type the registry has never heard of, and stores nothing", async () => {
    const { repository, service } = await harness();
    const stream = await service.define(params());

    await expect(service.accept(TENANT, stream.id, UNREGISTERED)).rejects.toThrow(
      UnknownEventTypeError,
    );
    expect((await repository.findById(TENANT, stream.id))?.eventTypeKeys).toEqual([SUBMITTED]);
  });

  it("treats a repeated acceptance as the set operation it is", async () => {
    const { service } = await harness();
    const stream = await service.define(params());

    const next = await service.accept(TENANT, stream.id, SUBMITTED);

    expect(next.eventTypeKeys).toEqual([SUBMITTED]);
  });

  it("refuses to widen a retired channel", async () => {
    const { service } = await harness();
    const stream = await service.define(params());
    await service.retire(TENANT, stream.id);

    await expect(service.accept(TENANT, stream.id, OFFERED)).rejects.toThrow(StreamRetiredError);
  });

  it("withdraws a type and announces the key that left", async () => {
    const { events, service } = await harness();
    const stream = await service.define(params({ eventTypeKeys: [SUBMITTED, OFFERED] }));

    const next = await service.withdraw(TENANT, stream.id, OFFERED);

    expect(next.eventTypeKeys).toEqual([SUBMITTED]);
    expect(types(events)).toEqual([STREAM_DEFINED, STREAM_EVENT_TYPE_WITHDRAWN]);
  });

  it("refuses to withdraw a type the channel never accepted", async () => {
    const { service } = await harness();
    const stream = await service.define(params());

    await expect(service.withdraw(TENANT, stream.id, OFFERED)).rejects.toThrow(
      EventTypeNotAcceptedError,
    );
  });

  it("refuses to leave a channel carrying nothing", async () => {
    const { service } = await harness();
    const stream = await service.define(params());

    await expect(service.withdraw(TENANT, stream.id, SUBMITTED)).rejects.toThrow(
      EmptyStreamEventTypesError,
    );
  });

  it("withdraws a type the registry no longer holds, because the type is leaving anyway", async () => {
    const { repository, service } = await harness();
    const stream = await service.define(params({ eventTypeKeys: [SUBMITTED, OFFERED] }));
    const forgetful = new EventStreamService({
      repository,
      eventTypes: new InMemoryEventTypeDefinitionRepository(),
      organizations,
      people,
    });

    const next = await forgetful.withdraw(TENANT, stream.id, OFFERED);

    expect(next.eventTypeKeys).toEqual([SUBMITTED]);
  });
});

describe("EventStreamService — configuration", () => {
  it("repartitions a draft, while nobody is reading it", async () => {
    const { events, service } = await harness();
    const stream = await service.define(params());

    const next = await service.repartition(TENANT, stream.id, {
      ordering: "global",
      partitionCount: 1,
      partitionKeyPath: null,
    });

    expect(next.ordering).toBe("global");
    expect(next.partitionCount).toBe(1);
    expect(types(events)).toEqual([STREAM_DEFINED, STREAM_REPARTITIONED]);
  });

  it("freezes partitioning the moment the channel opens", async () => {
    const { service } = await harness();
    const stream = await open(service);

    const repartition = service.repartition(TENANT, stream.id, {
      ordering: "none",
      partitionCount: 4,
      partitionKeyPath: null,
    });

    await expect(repartition).rejects.toThrow(PartitioningFrozenError);
  });

  it("revises retention on a live channel, because the window binds what it carries next", async () => {
    const { events, service } = await harness();
    const stream = await open(service);

    const next = await service.reviseRetention(TENANT, stream.id, "full", MIN_RETENTION_SECONDS);

    expect(next.retention).toBe("full");
    expect(next.retentionSeconds).toBe(MIN_RETENTION_SECONDS);
    expect(types(events)).toContain(STREAM_RETENTION_REVISED);
  });

  it("refuses to reconfigure a channel that is finished", async () => {
    const { service } = await harness();
    const stream = await service.define(params());
    await service.retire(TENANT, stream.id);

    await expect(
      service.reviseRetention(TENANT, stream.id, "full", MIN_RETENTION_SECONDS),
    ).rejects.toThrow(StreamRetiredError);
  });

  it("hands a producer the partitioning the stream itself declared", async () => {
    const { service } = await harness();
    const stream = await service.define(params());

    const declaration = await service.partitioning(TENANT, stream.id);

    expect(declaration).toEqual({
      streamKey: STREAM_KEY,
      ordering: stream.ordering,
      partitionCount: stream.partitionCount,
      partitionKeyPath: KEY_PATH,
    });
  });
});

describe("EventStreamService — lifecycle", () => {
  it("opens the channel in the name of whoever opened it", async () => {
    const { events, service } = await harness();
    const stream = await service.define(params());

    const opened = await service.activate(TENANT, stream.id, OPERATOR);

    expect(opened.status).toBe("active");
    expect(opened.activatedBy).toBe(OPERATOR);
    expect(opened.activatedAt).not.toBeNull();
    expect(types(events)).toEqual([STREAM_DEFINED, STREAM_ACTIVATED]);
  });

  it("refuses a person the directory does not know, and leaves the channel shut", async () => {
    const { repository, events, service } = await harness();
    const stream = await service.define(params());

    await expect(service.activate(TENANT, stream.id, ABSENT_PERSON)).rejects.toThrow(
      PersonNotFoundForMeshError,
    );
    expect((await repository.findById(TENANT, stream.id))?.status).toBe("draft");
    expect(types(events)).toEqual([STREAM_DEFINED]);
  });

  it("keeps the first activation across a pause and a reopening", async () => {
    const { events, service } = await harness();
    const stream = await open(service);
    await service.pause(TENANT, stream.id);

    const reopened = await service.activate(TENANT, stream.id, SECOND_OPERATOR);

    expect(reopened.activatedBy).toBe(OPERATOR);
    expect(reopened.activatedAt).toBe(stream.activatedAt);
    expect(types(events)).toEqual([
      STREAM_DEFINED,
      STREAM_ACTIVATED,
      STREAM_PAUSED,
      STREAM_ACTIVATED,
    ]);
  });

  it("refuses to open a channel that is already open", async () => {
    const { service } = await harness();
    const stream = await open(service);

    await expect(service.activate(TENANT, stream.id, OPERATOR)).rejects.toThrow(
      InvalidStreamProgressionError,
    );
  });

  it("retires a draft, which is how a channel that will never carry anything is withdrawn", async () => {
    const { events, service } = await harness();
    const stream = await service.define(params());

    const retired = await service.retire(TENANT, stream.id);

    expect(retired.status).toBe("retired");
    expect(retired.retiredAt).not.toBeNull();
    expect(types(events)).toEqual([STREAM_DEFINED, STREAM_RETIRED]);
  });

  it("refuses every further move once the channel is closed", async () => {
    const { service } = await harness();
    const stream = await open(service);
    await service.retire(TENANT, stream.id);

    await expect(service.pause(TENANT, stream.id)).rejects.toThrow(StreamRetiredError);
    await expect(service.activate(TENANT, stream.id, OPERATOR)).rejects.toThrow(StreamRetiredError);
  });

  it("404s on a stream that does not exist", async () => {
    const { service } = await harness();

    await expect(service.pause(TENANT, MISSING)).rejects.toThrow(EventStreamNotFoundError);
  });
});

describe("EventStreamService — reading", () => {
  it("finds a channel by the key a producer addresses it with", async () => {
    const { service } = await harness();
    const stream = await service.define(params());

    const found = await service.getByKey(TENANT, "  Admissions.Applications  ");

    expect(found.id).toBe(stream.id);
  });

  it("404s naming the key it searched under rather than the one it was handed", async () => {
    const { service } = await harness();

    const read = service.getByKey(TENANT, "Admissions.Missing");

    await expect(read).rejects.toThrow(EventStreamNotFoundError);
    await expect(service.getByKey(TENANT, "Admissions.Missing")).rejects.toThrow(
      "admissions.missing",
    );
  });

  it("keeps one tenant's channels out of another tenant's reads", async () => {
    const { service } = await harness();
    const elsewhere = await service.define(params({ tenantId: OTHER }));

    await expect(service.get(TENANT, elsewhere.id)).rejects.toThrow(EventStreamNotFoundError);
    expect(await service.list(TENANT)).toEqual([]);
    expect((await service.list(OTHER)).map((stream) => stream.id)).toEqual([elsewhere.id]);
  });

  it("lists what one institution can publish on right now", async () => {
    const { service } = await harness();
    const live = await open(service);
    await service.define(params({ streamKey: SECOND_STREAM_KEY }));
    await open(service, { streamKey: "admissions.enquiries", organizationId: SECOND_ORG });

    const publishable = await service.listPublishable(TENANT, ORG);

    expect(publishable.map((stream) => stream.id)).toEqual([live.id]);
  });

  it("lists every channel carrying a type, which is what makes retiring one an informed act", async () => {
    const { service } = await harness();
    await service.define(params());
    await service.define(params({ streamKey: SECOND_STREAM_KEY, eventTypeKeys: [OFFERED] }));

    const carrying = await service.listAcceptingEventType(
      TENANT,
      "Admissions.Application.Submitted",
    );

    expect(carrying.map((stream) => stream.streamKey)).toEqual([STREAM_KEY]);
  });

  it("lists every channel in the tenant, in every status", async () => {
    const { service } = await harness();
    await open(service);
    const draft = await service.define(params({ streamKey: SECOND_STREAM_KEY }));
    await service.retire(TENANT, draft.id);

    const all = await service.list(TENANT);

    expect(all.map((stream) => stream.status).sort()).toEqual(["active", "retired"]);
  });

  it("works without an event bus at all", async () => {
    const repository = new InMemoryEventStreamRepository();
    const eventTypes = await registry();
    const service = new EventStreamService({ repository, eventTypes, organizations, people });

    const stream = await service.define(params());
    const opened = await service.activate(TENANT, stream.id, OPERATOR);

    expect(opened.status).toBe("active");
  });
});
