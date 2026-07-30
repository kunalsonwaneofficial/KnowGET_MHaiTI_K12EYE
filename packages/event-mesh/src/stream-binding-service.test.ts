import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  BindingAlreadyActiveError,
  BindingNotDrainedError,
  BindingRetiredError,
  DuplicateBindingError,
  EventStreamNotFoundError,
  InvalidBindingProgressionError,
  OrganizationNotFoundForMeshError,
  PersonNotFoundForMeshError,
  PlaintextTransportCredentialError,
  StreamBindingNotFoundError,
  TransportNotAvailableError,
} from "./errors";
import { defineEventStream } from "./event-stream";
import {
  BINDING_ACTIVATED,
  BINDING_DECLARED,
  BINDING_DRAINING,
  BINDING_RETARGETED,
  BINDING_RETIRED,
} from "./mesh-events";
import { TRANSPORT_KINDS, type TransportKind } from "./mesh-value";
import {
  InMemoryEventStreamRepository,
  InMemoryStreamBindingRepository,
  type OrganizationDirectory,
  type PersonDirectory,
  type TransportAdapterRegistry,
} from "./ports";
import type { DeclareStreamBindingParams, StreamBinding } from "./stream-binding";
import { StreamBindingService } from "./stream-binding-service";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org-1" as Uuid;
const SECOND_ORG = "org-2" as Uuid;
const ABSENT_ORG = "org-absent" as Uuid;
const OPERATOR = "person-1" as Uuid;
const ABSENT_PERSON = "person-absent" as Uuid;
const MISSING = "binding-absent" as Uuid;

const STREAM_KEY = "admissions.applications";
const SECOND_STREAM_KEY = "admissions.decisions";
const ABSENT_STREAM_KEY = "admissions.missing";
const KEY_PATH = "aggregate.aggregateId";
const SUBMITTED = "admissions.application.submitted";

/** What this deployment was built with. Two of the six transports are deliberately not among them. */
const SERVED: readonly TransportKind[] = ["in_process", "outbox", "kafka", "redpanda"];

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
const transports: TransportAdapterRegistry = {
  serves: async (transport) => SERVED.includes(transport),
};

const params = (
  overrides: Partial<DeclareStreamBindingParams> = {},
): DeclareStreamBindingParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  streamKey: STREAM_KEY,
  transportRef: "config:kafka-primary",
  ...overrides,
});

/** Two streams in each tenant, so a binding names something real and isolation has two sides to it. */
const channels = async (): Promise<InMemoryEventStreamRepository> => {
  const streams = new InMemoryEventStreamRepository();
  for (const tenantId of [TENANT, OTHER]) {
    for (const streamKey of [STREAM_KEY, SECOND_STREAM_KEY]) {
      await streams.save(
        defineEventStream({
          tenantId,
          organizationId: ORG,
          streamKey,
          title: "Admission Applications",
          summary: "Everything an application does between arriving and being decided.",
          partitionKeyPath: KEY_PATH,
          eventTypeKeys: [SUBMITTED],
        }),
      );
    }
  }
  return streams;
};

const harness = async () => {
  const repository = new InMemoryStreamBindingRepository();
  const streams = await channels();
  const events = recorder();
  const service = new StreamBindingService({
    repository,
    streams,
    organizations,
    people,
    transports,
    events,
  });
  return { repository, streams, events, service };
};

const types = (events: ReturnType<typeof recorder>): string[] =>
  events.published.map((event) => event.type);

/** Declare a binding and open it, which is the precondition of every swap and drain test below. */
const carrying = async (
  service: StreamBindingService,
  overrides: Partial<DeclareStreamBindingParams> = {},
): Promise<StreamBinding> => {
  const binding = await service.declare(params(overrides));
  return service.activate(overrides.tenantId ?? TENANT, binding.id, OPERATOR);
};

describe("StreamBindingService — declaration", () => {
  it("binds a stream to a backbone, stores it and announces it", async () => {
    const { repository, events, service } = await harness();

    const binding = await service.declare(params());

    expect(binding.status).toBe("declared");
    expect(binding.transport).toBe("outbox");
    expect(binding.activatedAt).toBeNull();
    expect(binding.drainingSince).toBeNull();
    expect(await repository.findById(TENANT, binding.id)).toEqual(binding);
    expect(types(events)).toEqual([BINDING_DECLARED]);
  });

  it("refuses a second binding to the same backbone on the same stream", async () => {
    const { service } = await harness();
    await service.declare(params({ transport: "kafka" }));

    await expect(service.declare(params({ transport: "kafka" }))).rejects.toThrow(
      DuplicateBindingError,
    );
  });

  it("binds one stream to two backbones, which is what a migration looks like", async () => {
    const { service } = await harness();
    await service.declare(params());

    const replacement = await service.declare(params({ transport: "kafka" }));

    expect(replacement.transport).toBe("kafka");
    expect(await service.listByStream(TENANT, STREAM_KEY)).toHaveLength(2);
  });

  it("refuses a binding naming a stream this tenant does not have", async () => {
    const { service } = await harness();

    await expect(service.declare(params({ streamKey: ABSENT_STREAM_KEY }))).rejects.toThrow(
      EventStreamNotFoundError,
    );
  });

  it("refuses a backbone nothing in this deployment serves", async () => {
    const { service } = await harness();

    await expect(service.declare(params({ transport: "nats" }))).rejects.toThrow(
      TransportNotAvailableError,
    );
    await expect(service.declare(params({ transport: "nats" }))).rejects.toThrow("nats");
  });

  it("asks the registry once when the backbone is served, and for the whole set when it is not", async () => {
    const asked: TransportKind[] = [];
    const counting: TransportAdapterRegistry = {
      serves: async (transport) => {
        asked.push(transport);
        return SERVED.includes(transport);
      },
    };
    const service = new StreamBindingService({
      repository: new InMemoryStreamBindingRepository(),
      streams: await channels(),
      organizations,
      people,
      transports: counting,
    });

    await service.declare(params({ transport: "kafka" }));
    expect(asked).toEqual(["kafka"]);

    await expect(service.declare(params({ transport: "amqp" }))).rejects.toThrow(
      TransportNotAvailableError,
    );
    expect(asked).toEqual(["kafka", "amqp", ...TRANSPORT_KINDS]);
  });

  it("refuses an institution the directory does not have", async () => {
    const { service } = await harness();

    await expect(service.declare(params({ organizationId: ABSENT_ORG }))).rejects.toThrow(
      OrganizationNotFoundForMeshError,
    );
  });

  it("refuses a reference carrying the settings before it consults any directory", async () => {
    const { service } = await harness();

    await expect(
      service.declare(
        params({ organizationId: ABSENT_ORG, transportRef: "kafka://admin:hunter2@broker:9092" }),
      ),
    ).rejects.toThrow(PlaintextTransportCredentialError);
  });

  it("leaves another tenant's binding on the same stream and backbone alone", async () => {
    const { service } = await harness();
    await service.declare(params({ tenantId: OTHER }));

    const binding = await service.declare(params());

    expect(binding.tenantId).toBe(TENANT);
    expect(await service.list(TENANT)).toHaveLength(1);
  });

  it("re-points a binding at different settings and announces it", async () => {
    const { events, service } = await harness();
    const binding = await service.declare(params());

    const moved = await service.retarget(TENANT, binding.id, "vault:mesh/kafka-rotated");

    expect(moved.transportRef).toBe("vault:mesh/kafka-rotated");
    expect(moved.transport).toBe("outbox");
    expect(types(events)).toEqual([BINDING_DECLARED, BINDING_RETARGETED]);
  });

  it("refuses to re-point a retired binding", async () => {
    const { service } = await harness();
    const binding = await carrying(service);
    await service.drain(TENANT, binding.id);
    await service.retire(TENANT, binding.id, 0);

    await expect(service.retarget(TENANT, binding.id, "config:kafka-secondary")).rejects.toThrow(
      BindingRetiredError,
    );
  });
});

describe("StreamBindingService — lifecycle", () => {
  it("opens the path in the name of whoever opened it", async () => {
    const { repository, events, service } = await harness();

    const binding = await carrying(service);

    expect(binding.status).toBe("active");
    expect(binding.activatedBy).toBe(OPERATOR);
    expect(binding.activatedAt).not.toBeNull();
    expect((await repository.findById(TENANT, binding.id))?.status).toBe("active");
    expect(types(events)).toEqual([BINDING_DECLARED, BINDING_ACTIVATED]);
  });

  it("refuses an activator the directory does not have", async () => {
    const { service } = await harness();
    const binding = await service.declare(params());

    await expect(service.activate(TENANT, binding.id, ABSENT_PERSON)).rejects.toThrow(
      PersonNotFoundForMeshError,
    );
  });

  it("refuses to open a second path while one is already carrying", async () => {
    const { service } = await harness();
    await carrying(service);
    const replacement = await service.declare(params({ transport: "kafka" }));

    await expect(service.activate(TENANT, replacement.id, OPERATOR)).rejects.toThrow(
      BindingAlreadyActiveError,
    );
    await expect(service.activate(TENANT, replacement.id, OPERATOR)).rejects.toThrow("outbox");
  });

  it("opens the replacement once the incumbent is draining, which is the swap", async () => {
    const { service } = await harness();
    const incumbent = await carrying(service);
    const replacement = await service.declare(params({ transport: "kafka" }));

    await service.drain(TENANT, incumbent.id);
    const opened = await service.activate(TENANT, replacement.id, OPERATOR);

    expect(opened.status).toBe("active");
    expect(await service.listCarrying(TENANT, ORG)).toHaveLength(1);
  });

  it("refuses to open the same path twice", async () => {
    const { service } = await harness();
    const binding = await carrying(service);

    await expect(service.activate(TENANT, binding.id, OPERATOR)).rejects.toThrow(
      InvalidBindingProgressionError,
    );
  });

  it("stops accepting on a draining path and records when the drain began", async () => {
    const { events, service } = await harness();
    const binding = await carrying(service);

    const draining = await service.drain(TENANT, binding.id);

    expect(draining.status).toBe("draining");
    expect(draining.drainingSince).not.toBeNull();
    expect(await service.listCarrying(TENANT, ORG)).toHaveLength(0);
    expect(types(events)).toEqual([BINDING_DECLARED, BINDING_ACTIVATED, BINDING_DRAINING]);
  });

  it("refuses to close a path with messages still in flight on it", async () => {
    const { service } = await harness();
    const binding = await carrying(service);
    await service.drain(TENANT, binding.id);

    await expect(service.retire(TENANT, binding.id, 41)).rejects.toThrow(BindingNotDrainedError);
    await expect(service.retire(TENANT, binding.id, 41)).rejects.toThrow("41");
  });

  it("closes a drained path, after which nothing moves it again", async () => {
    const { events, service } = await harness();
    const binding = await carrying(service);
    await service.drain(TENANT, binding.id);

    const retired = await service.retire(TENANT, binding.id, 0);

    expect(retired.status).toBe("retired");
    expect(retired.retiredAt).not.toBeNull();
    expect(types(events)).toEqual([
      BINDING_DECLARED,
      BINDING_ACTIVATED,
      BINDING_DRAINING,
      BINDING_RETIRED,
    ]);
    await expect(service.drain(TENANT, binding.id)).rejects.toThrow(BindingRetiredError);
  });

  it("withdraws a binding that never carried, without a drain it has nothing to do", async () => {
    const { service } = await harness();
    const binding = await service.declare(params());

    const retired = await service.retire(TENANT, binding.id, 0);

    expect(retired.status).toBe("retired");
  });

  it("lets another tenant carry the same stream on the same backbone", async () => {
    const { service } = await harness();
    await carrying(service);

    const elsewhere = await carrying(service, { tenantId: OTHER });

    expect(elsewhere.status).toBe("active");
  });
});

describe("StreamBindingService — reading", () => {
  it("returns one binding, or a 404 naming it", async () => {
    const { service } = await harness();
    const binding = await service.declare(params());

    expect(await service.get(TENANT, binding.id)).toEqual(binding);
    await expect(service.get(TENANT, MISSING)).rejects.toThrow(StreamBindingNotFoundError);
    await expect(service.get(OTHER, binding.id)).rejects.toThrow(StreamBindingNotFoundError);
  });

  it("returns the binding joining a stream to a backbone, or a 404 naming the pair", async () => {
    const { service } = await harness();
    const binding = await service.declare(params({ transport: "kafka" }));

    expect(
      await service.getByStreamAndTransport(TENANT, "Admissions.Applications", "kafka"),
    ).toEqual(binding);
    await expect(service.getByStreamAndTransport(TENANT, STREAM_KEY, "outbox")).rejects.toThrow(
      StreamBindingNotFoundError,
    );
    await expect(service.getByStreamAndTransport(TENANT, STREAM_KEY, "outbox")).rejects.toThrow(
      "admissions.applications/outbox",
    );
  });

  it("lists every backbone a stream is bound to, in every state", async () => {
    const { service } = await harness();
    const incumbent = await carrying(service);
    await service.declare(params({ transport: "kafka" }));
    await service.drain(TENANT, incumbent.id);
    await service.declare(params({ streamKey: SECOND_STREAM_KEY, transport: "redpanda" }));

    const bound = await service.listByStream(TENANT, STREAM_KEY);

    expect(bound.map((binding) => binding.status)).toEqual(["draining", "declared"]);
  });

  it("lists only what an institution is carrying right now", async () => {
    const { service } = await harness();
    await carrying(service);
    await carrying(service, { organizationId: SECOND_ORG, streamKey: SECOND_STREAM_KEY });

    const held = await service.listCarrying(TENANT, SECOND_ORG);

    expect(held.map((binding) => binding.streamKey)).toEqual([SECOND_STREAM_KEY]);
  });

  it("lists everything in the tenant and nothing from another", async () => {
    const { service } = await harness();
    await service.declare(params());
    await service.declare(params({ streamKey: SECOND_STREAM_KEY }));
    await service.declare(params({ tenantId: OTHER }));

    expect(await service.list(TENANT)).toHaveLength(2);
    expect(await service.list(OTHER)).toHaveLength(1);
  });

  it("works without an event bus at all", async () => {
    const service = new StreamBindingService({
      repository: new InMemoryStreamBindingRepository(),
      streams: await channels(),
      organizations,
      people,
      transports,
    });

    const binding = await service.activate(TENANT, (await service.declare(params())).id, OPERATOR);

    expect(binding.status).toBe("active");
  });
});
