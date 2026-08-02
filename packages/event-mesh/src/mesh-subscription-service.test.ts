import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicateConsumerGroupError,
  DuplicateMeshSubscriptionKeyError,
  EventStreamNotFoundError,
  InvalidAttemptCeilingError,
  InvalidMeshSubscriptionProgressionError,
  MeshSubscriptionNotFoundError,
  MeshSubscriptionRetiredError,
  OrganizationNotFoundForMeshError,
  PersonNotFoundForMeshError,
  SubscriptionStreamNotReadableError,
  UnknownFilterAttributeError,
} from "./errors";
import { activateEventStream, defineEventStream, retireEventStream } from "./event-stream";
import {
  SUBSCRIPTION_ACTIVATED,
  SUBSCRIPTION_DELIVERY_REVISED,
  SUBSCRIPTION_PAUSED,
  SUBSCRIPTION_REFILTERED,
  SUBSCRIPTION_REGISTERED,
  SUBSCRIPTION_RETIRED,
} from "./mesh-events";
import type { RegisterMeshSubscriptionParams } from "./mesh-subscription";
import { MeshSubscriptionService } from "./mesh-subscription-service";
import {
  DEFAULT_DELIVERY_ATTEMPTS,
  DEFAULT_DELIVERY_SEMANTICS,
  type FilterPredicate,
} from "./mesh-value";
import {
  InMemoryEventStreamRepository,
  InMemoryMeshSubscriptionRepository,
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
const MISSING = "subscription-absent" as Uuid;

const STREAM_KEY = "admissions.applications";
const SECOND_STREAM_KEY = "admissions.decisions";
const CLOSED_STREAM_KEY = "admissions.legacy";
const ABSENT_STREAM_KEY = "admissions.missing";
const KEY_PATH = "aggregate.aggregateId";
const SUBMITTED = "admissions.application.submitted";

const SUBSCRIPTION_KEY = "admissions.reporting";
const SECOND_SUBSCRIPTION_KEY = "admissions.finance";
const GROUP = "reporting-workers";
const SECOND_GROUP = "finance-workers";

const NARROWED: readonly FilterPredicate[] = [
  { attribute: "eventTypeKey", operator: "equals", values: [SUBMITTED] },
];
const UNREADABLE: readonly FilterPredicate[] = [
  { attribute: "learnerDiagnosis", operator: "equals", values: ["anything"] },
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

/** Two open channels and one closed one in each tenant, so every readability branch has a stream. */
const channels = async (): Promise<InMemoryEventStreamRepository> => {
  const streams = new InMemoryEventStreamRepository();
  for (const tenantId of [TENANT, OTHER]) {
    for (const streamKey of [STREAM_KEY, SECOND_STREAM_KEY, CLOSED_STREAM_KEY]) {
      const stream = defineEventStream({
        tenantId,
        organizationId: ORG,
        streamKey,
        title: "Admission Applications",
        summary: "Everything an application does between arriving and being decided.",
        partitionKeyPath: KEY_PATH,
        eventTypeKeys: [SUBMITTED],
      });
      const closed = streamKey === CLOSED_STREAM_KEY;
      await streams.save(
        closed ? retireEventStream(activateEventStream(stream, OPERATOR)) : stream,
      );
    }
  }
  return streams;
};

const harness = async () => {
  const repository = new InMemoryMeshSubscriptionRepository();
  const streams = await channels();
  const events = recorder();
  const service = new MeshSubscriptionService({
    repository,
    streams,
    organizations,
    people,
    events,
  });
  return { repository, streams, events, service };
};

const types = (events: ReturnType<typeof recorder>): string[] =>
  events.published.map((event) => event.type);

/** Register a consumer and start it, which is the precondition of every delivery test below. */
const live = async (
  service: MeshSubscriptionService,
  overrides: Partial<RegisterMeshSubscriptionParams> = {},
) => {
  const subscription = await service.register(params(overrides));
  return service.activate(overrides.tenantId ?? TENANT, subscription.id, OPERATOR);
};

describe("MeshSubscriptionService — registration", () => {
  it("registers a consumer that receives nothing yet, stores it and announces it", async () => {
    const { repository, events, service } = await harness();

    const subscription = await service.register(params());

    expect(subscription.status).toBe("registered");
    expect(subscription.semantics).toBe(DEFAULT_DELIVERY_SEMANTICS);
    expect(subscription.maxAttempts).toBe(DEFAULT_DELIVERY_ATTEMPTS);
    expect(subscription.filter).toEqual([]);
    expect(subscription.activatedAt).toBeNull();
    expect(await repository.findById(TENANT, subscription.id)).toEqual(subscription);
    expect(types(events)).toEqual([SUBSCRIPTION_REGISTERED]);
  });

  it("refuses a second consumer under the same key, in any institution in the tenant", async () => {
    const { service } = await harness();
    await service.register(params());

    await expect(
      service.register(params({ organizationId: SECOND_ORG, consumerGroup: SECOND_GROUP })),
    ).rejects.toThrow(DuplicateMeshSubscriptionKeyError);
  });

  it("keeps a retired consumer's key taken, because its checkpoints still refer to it", async () => {
    const { service } = await harness();
    const subscription = await service.register(params());
    await service.retire(TENANT, subscription.id);

    await expect(service.register(params({ consumerGroup: SECOND_GROUP }))).rejects.toThrow(
      DuplicateMeshSubscriptionKeyError,
    );
  });

  it("refuses a second consumer group reading the same stream", async () => {
    const { service } = await harness();
    await service.register(params());

    await expect(
      service.register(params({ subscriptionKey: SECOND_SUBSCRIPTION_KEY })),
    ).rejects.toThrow(DuplicateConsumerGroupError);
  });

  it("lets one group read a second stream, which is one consumer with two checkpoints", async () => {
    const { service } = await harness();
    await service.register(params());

    const second = await service.register(
      params({ subscriptionKey: SECOND_SUBSCRIPTION_KEY, streamKey: SECOND_STREAM_KEY }),
    );

    expect(second.consumerGroup).toBe(GROUP);
  });

  it("refuses a stream this tenant does not have", async () => {
    const { service } = await harness();

    await expect(service.register(params({ streamKey: ABSENT_STREAM_KEY }))).rejects.toThrow(
      EventStreamNotFoundError,
    );
  });

  it("subscribes to a channel still in draft, which is how a stream and its consumers come up", async () => {
    const { service } = await harness();

    const subscription = await service.register(params());

    expect(subscription.streamKey).toBe(STREAM_KEY);
  });

  it("refuses a channel that will never carry anything again", async () => {
    const { service } = await harness();

    await expect(service.register(params({ streamKey: CLOSED_STREAM_KEY }))).rejects.toThrow(
      SubscriptionStreamNotReadableError,
    );
    await expect(service.register(params({ streamKey: CLOSED_STREAM_KEY }))).rejects.toThrow(
      "retired",
    );
  });

  it("refuses an institution the directory does not have", async () => {
    const { service } = await harness();

    await expect(service.register(params({ organizationId: ABSENT_ORG }))).rejects.toThrow(
      OrganizationNotFoundForMeshError,
    );
  });

  it("refuses a filter reaching past the envelope before it reads anything", async () => {
    const { service } = await harness();

    await expect(
      service.register(params({ organizationId: ABSENT_ORG, filter: UNREADABLE })),
    ).rejects.toThrow(UnknownFilterAttributeError);
  });

  it("leaves another tenant's consumer under the same key alone", async () => {
    const { service } = await harness();
    await service.register(params({ tenantId: OTHER }));

    const subscription = await service.register(params());

    expect(subscription.tenantId).toBe(TENANT);
    expect(await service.list(TENANT)).toHaveLength(1);
  });
});

describe("MeshSubscriptionService — configuration", () => {
  it("replaces what the consumer wants whole, while it is live, and announces it", async () => {
    const { events, service } = await harness();
    const subscription = await live(service);

    const narrowed = await service.refilter(TENANT, subscription.id, NARROWED);

    expect(narrowed.filter).toEqual(NARROWED);
    expect(narrowed.status).toBe("active");
    expect(types(events)).toEqual([
      SUBSCRIPTION_REGISTERED,
      SUBSCRIPTION_ACTIVATED,
      SUBSCRIPTION_REFILTERED,
    ]);
  });

  it("refuses a replacement filter naming an attribute the envelope does not carry", async () => {
    const { service } = await harness();
    const subscription = await service.register(params());

    await expect(service.refilter(TENANT, subscription.id, UNREADABLE)).rejects.toThrow(
      UnknownFilterAttributeError,
    );
  });

  it("refuses to refilter a consumer that has been retired", async () => {
    const { service } = await harness();
    const subscription = await service.register(params());
    await service.retire(TENANT, subscription.id);

    await expect(service.refilter(TENANT, subscription.id, NARROWED)).rejects.toThrow(
      MeshSubscriptionRetiredError,
    );
  });

  it("moves the promise and the effort together, and announces one change", async () => {
    const { events, service } = await harness();
    const subscription = await service.register(params());

    const revised = await service.reviseDelivery(TENANT, subscription.id, "exactly_once", 3);

    expect(revised.semantics).toBe("exactly_once");
    expect(revised.maxAttempts).toBe(3);
    expect(types(events)).toEqual([SUBSCRIPTION_REGISTERED, SUBSCRIPTION_DELIVERY_REVISED]);
  });

  it("refuses an attempt ceiling outside the range the platform supports", async () => {
    const { service } = await harness();
    const subscription = await service.register(params());

    await expect(
      service.reviseDelivery(TENANT, subscription.id, "at_least_once", 99),
    ).rejects.toThrow(InvalidAttemptCeilingError);
  });
});

describe("MeshSubscriptionService — lifecycle", () => {
  it("starts the consumer in the name of whoever started it", async () => {
    const { repository, events, service } = await harness();

    const subscription = await live(service);

    expect(subscription.status).toBe("active");
    expect(subscription.activatedBy).toBe(OPERATOR);
    expect((await repository.findById(TENANT, subscription.id))?.status).toBe("active");
    expect(types(events)).toEqual([SUBSCRIPTION_REGISTERED, SUBSCRIPTION_ACTIVATED]);
  });

  it("refuses an activator the directory does not have", async () => {
    const { service } = await harness();
    const subscription = await service.register(params());

    await expect(service.activate(TENANT, subscription.id, ABSENT_PERSON)).rejects.toThrow(
      PersonNotFoundForMeshError,
    );
  });

  it("keeps the first activator across a deployment, and clears the pause", async () => {
    const { service } = await harness();
    const subscription = await live(service);
    await service.pause(TENANT, subscription.id);

    const resumed = await service.activate(TENANT, subscription.id, SECOND_OPERATOR);

    expect(resumed.activatedBy).toBe(OPERATOR);
    expect(resumed.activatedAt).toBe(subscription.activatedAt);
    expect(resumed.pausedAt).toBeNull();
  });

  it("refuses to start a consumer that is already receiving", async () => {
    const { service } = await harness();
    const subscription = await live(service);

    await expect(service.activate(TENANT, subscription.id, OPERATOR)).rejects.toThrow(
      InvalidMeshSubscriptionProgressionError,
    );
  });

  it("holds the consumer still on a pause, and says when the backlog began", async () => {
    const { events, service } = await harness();
    const subscription = await live(service);

    const paused = await service.pause(TENANT, subscription.id);

    expect(paused.status).toBe("paused");
    expect(paused.pausedAt).not.toBeNull();
    expect(types(events)).toEqual([
      SUBSCRIPTION_REGISTERED,
      SUBSCRIPTION_ACTIVATED,
      SUBSCRIPTION_PAUSED,
    ]);
  });

  it("withdraws a consumer that was never started, and moves it no further", async () => {
    const { events, service } = await harness();
    const subscription = await service.register(params());

    const retired = await service.retire(TENANT, subscription.id);

    expect(retired.status).toBe("retired");
    expect(retired.retiredAt).not.toBeNull();
    expect(types(events)).toEqual([SUBSCRIPTION_REGISTERED, SUBSCRIPTION_RETIRED]);
    await expect(service.pause(TENANT, subscription.id)).rejects.toThrow(
      MeshSubscriptionRetiredError,
    );
  });
});

describe("MeshSubscriptionService — reading", () => {
  it("returns one consumer, or a 404 naming it", async () => {
    const { service } = await harness();
    const subscription = await service.register(params());

    expect(await service.get(TENANT, subscription.id)).toEqual(subscription);
    await expect(service.get(TENANT, MISSING)).rejects.toThrow(MeshSubscriptionNotFoundError);
    await expect(service.get(OTHER, subscription.id)).rejects.toThrow(
      MeshSubscriptionNotFoundError,
    );
  });

  it("returns a consumer by the key its checkpoints use, or a 404 naming the normalised key", async () => {
    const { service } = await harness();
    const subscription = await service.register(params());

    expect(await service.getByKey(TENANT, "Admissions.Reporting")).toEqual(subscription);
    await expect(service.getByKey(TENANT, "Admissions.Missing")).rejects.toThrow(
      MeshSubscriptionNotFoundError,
    );
    await expect(service.getByKey(TENANT, "Admissions.Missing")).rejects.toThrow(
      "admissions.missing",
    );
  });

  it("lists every consumer on a stream, in every status", async () => {
    const { service } = await harness();
    await live(service);
    await service.register(
      params({ subscriptionKey: SECOND_SUBSCRIPTION_KEY, consumerGroup: SECOND_GROUP }),
    );
    await service.register(
      params({ subscriptionKey: "admissions.audit", streamKey: SECOND_STREAM_KEY }),
    );

    const onStream = await service.listByStream(TENANT, "Admissions.Applications");

    expect(onStream.map((subscription) => subscription.subscriptionKey)).toEqual([
      SECOND_SUBSCRIPTION_KEY,
      SUBSCRIPTION_KEY,
    ]);
  });

  it("lists only the consumers a message arriving on the stream may go to", async () => {
    const { service } = await harness();
    const started = await live(service);
    await service.register(
      params({ subscriptionKey: SECOND_SUBSCRIPTION_KEY, consumerGroup: SECOND_GROUP }),
    );

    const deliverable = await service.listDeliverable(TENANT, STREAM_KEY);

    expect(deliverable.map((subscription) => subscription.id)).toEqual([started.id]);

    await service.pause(TENANT, started.id);
    expect(await service.listDeliverable(TENANT, STREAM_KEY)).toHaveLength(0);
  });

  it("lists everything in the tenant and nothing from another", async () => {
    const { service } = await harness();
    await service.register(params());
    await service.register(
      params({ subscriptionKey: SECOND_SUBSCRIPTION_KEY, streamKey: SECOND_STREAM_KEY }),
    );
    await service.register(params({ tenantId: OTHER }));

    expect(await service.list(TENANT)).toHaveLength(2);
    expect(await service.list(OTHER)).toHaveLength(1);
  });

  it("works without an event bus at all", async () => {
    const service = new MeshSubscriptionService({
      repository: new InMemoryMeshSubscriptionRepository(),
      streams: await channels(),
      organizations,
      people,
    });

    const registered = await service.register(params());
    const subscription = await service.activate(TENANT, registered.id, OPERATOR);

    expect(subscription.status).toBe("active");
  });
});
