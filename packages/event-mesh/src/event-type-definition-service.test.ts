import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DeprecationNoticeTooShortError,
  DuplicateEventTypeVersionError,
  EventTypeDefinitionNotFoundError,
  EventTypeNotDeprecatedError,
  EventTypeNotPublishableError,
  EventTypeSchemaFrozenError,
  InvalidMeshCountError,
  NonSequentialEventTypeVersionError,
  OrganizationNotFoundForMeshError,
  PersonNotFoundForMeshError,
  SchemaIncompatibleError,
} from "./errors";
import {
  type DefineEventTypeParams,
  type EventTypeDefinition,
  isEventTypeCarried,
} from "./event-type-definition";
import { EventTypeDefinitionService } from "./event-type-definition-service";
import {
  EVENT_TYPE_DEFINED,
  EVENT_TYPE_DEPRECATED,
  EVENT_TYPE_PUBLISHED,
  EVENT_TYPE_RETIRED,
} from "./mesh-events";
import { FIRST_EVENT_TYPE_VERSION, type SchemaField } from "./mesh-value";
import {
  InMemoryEventTypeDefinitionRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org-1" as Uuid;
const SECOND_ORG = "org-2" as Uuid;
const ABSENT_ORG = "org-absent" as Uuid;
const PUBLISHER = "person-1" as Uuid;
const ABSENT_PERSON = "person-absent" as Uuid;
const MISSING = "definition-absent" as Uuid;

const KEY = "admissions.application.submitted";
const OTHER_KEY = "admissions.application.withdrawn";

const BASE_FIELDS: readonly SchemaField[] = [
  { name: "applicationId", type: "uuid", required: true },
  { name: "submittedAt", type: "instant", required: true },
];

/** One fixed instant, so no assertion below depends on when the suite happens to run. */
const ANNOUNCED_AT = "2027-01-02T09:15:00.000Z" as ISODateString;

/** Days from an instant the test itself fixed, so a notice period never depends on the wall clock. */
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

const organizations: OrganizationDirectory = {
  exists: async (_tenantId, organizationId) => organizationId !== ABSENT_ORG,
};
const people: PersonDirectory = {
  exists: async (_tenantId, personId) => personId !== ABSENT_PERSON,
};

const params = (overrides: Partial<DefineEventTypeParams> = {}): DefineEventTypeParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  eventTypeKey: KEY,
  version: FIRST_EVENT_TYPE_VERSION,
  title: "Application Submitted",
  summary: "A guardian has submitted an admission application for one learner.",
  schemaFields: BASE_FIELDS,
  ...overrides,
});

const harness = () => {
  const repository = new InMemoryEventTypeDefinitionRepository();
  const events = recorder();
  const service = new EventTypeDefinitionService({ repository, organizations, people, events });
  return { repository, events, service };
};

const types = (events: ReturnType<typeof recorder>): string[] =>
  events.published.map((event) => event.type);

/** Register a version and publish it, which is the precondition of every notice test below. */
const live = async (
  service: EventTypeDefinitionService,
  version: number,
  overrides: Partial<DefineEventTypeParams> = {},
): Promise<EventTypeDefinition> => {
  const draft = await service.define(params({ version, ...overrides }));
  return service.publish(TENANT, draft.id, PUBLISHER);
};

describe("EventTypeDefinitionService — definition", () => {
  it("registers a first version, stores it and announces it", async () => {
    const { repository, events, service } = harness();

    const definition = await service.define(params());

    expect(definition.status).toBe("draft");
    expect(definition.version).toBe(FIRST_EVENT_TYPE_VERSION);
    expect(definition.publishedAt).toBeNull();
    expect(await repository.findById(TENANT, definition.id)).toEqual(definition);
    expect(types(events)).toEqual([EVENT_TYPE_DEFINED]);
  });

  it("takes backward to be what an unqualified promise means, and honours a mode that is stated", async () => {
    const { service } = harness();

    const unstated = await service.define(params());
    const stated = await service.define(params({ version: 2, compatibilityMode: "none" }));

    expect(unstated.compatibilityMode).toBe("backward");
    expect(stated.compatibilityMode).toBe("none");
  });

  it("refuses an organization the directory does not know", async () => {
    const { service } = harness();

    await expect(service.define(params({ organizationId: ABSENT_ORG }))).rejects.toThrow(
      OrganizationNotFoundForMeshError,
    );
  });

  it("refuses a key and version pair already taken", async () => {
    const { service } = harness();
    await service.define(params());

    await expect(service.define(params({ title: "Submitted, again" }))).rejects.toThrow(
      DuplicateEventTypeVersionError,
    );
  });

  it("holds the pair tenant-wide, so a second school cannot register its own v1", async () => {
    const { service } = harness();
    await service.define(params());

    await expect(service.define(params({ organizationId: SECOND_ORG }))).rejects.toThrow(
      DuplicateEventTypeVersionError,
    );
  });

  it("compares the pair after normalisation", async () => {
    const { service } = harness();
    await service.define(params());

    await expect(
      service.define(params({ eventTypeKey: "Admissions.Application.Submitted" })),
    ).rejects.toThrow(DuplicateEventTypeVersionError);
  });

  it("refuses a version that leaves a gap below it", async () => {
    const { service } = harness();
    await service.define(params());

    await expect(service.define(params({ version: 3 }))).rejects.toThrow(
      NonSequentialEventTypeVersionError,
    );
  });

  it("names the version it was expecting, so the sender can renumber without guessing", async () => {
    const { service } = harness();
    await service.define(params());

    await expect(service.define(params({ version: 7 }))).rejects.toThrow("expects version 2 next");
  });

  it("refuses a first registration numbered above the first version", async () => {
    const { service } = harness();

    await expect(service.define(params({ version: 4 }))).rejects.toThrow(
      NonSequentialEventTypeVersionError,
    );
  });

  it("lets another tenant hold the same pair", async () => {
    const { repository, service } = harness();
    await service.define(params());

    await service.define(params({ tenantId: OTHER }));

    expect(await repository.listByTenant(OTHER)).toHaveLength(1);
  });

  it("writes nothing and announces nothing when a check refuses", async () => {
    const { repository, events, service } = harness();

    await expect(service.define(params({ organizationId: ABSENT_ORG }))).rejects.toThrow(
      OrganizationNotFoundForMeshError,
    );

    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(events.published).toEqual([]);
  });
});

describe("EventTypeDefinitionService — compatibility", () => {
  it("asks nothing of a first version, which has nothing yet to be compatible with", async () => {
    const { service } = harness();

    const first = await service.define(params({ compatibilityMode: "full" }));

    expect(first.version).toBe(FIRST_EVENT_TYPE_VERSION);
  });

  it("accepts a version that adds an optional field to a backward-compatible type", async () => {
    const { service } = harness();
    await service.define(params());

    const second = await service.define(
      params({
        version: 2,
        schemaFields: [...BASE_FIELDS, { name: "cohortYear", type: "number", required: false }],
      }),
    );

    expect(second.schemaFields).toHaveLength(3);
  });

  it("refuses a version that adds a required field to a backward-compatible type", async () => {
    const { service } = harness();
    await service.define(params());

    await expect(
      service.define(
        params({
          version: 2,
          schemaFields: [...BASE_FIELDS, { name: "cohortYear", type: "number", required: true }],
        }),
      ),
    ).rejects.toThrow(SchemaIncompatibleError);
  });

  it("refuses a version that removes a required field from a forward-compatible type", async () => {
    const { service } = harness();
    await service.define(params({ compatibilityMode: "forward" }));

    await expect(
      service.define(
        params({
          version: 2,
          compatibilityMode: "forward",
          schemaFields: [{ name: "applicationId", type: "uuid", required: true }],
        }),
      ),
    ).rejects.toThrow(SchemaIncompatibleError);
  });

  it("takes a none promise at its word and accepts a break the other modes refuse", async () => {
    const { service } = harness();
    await service.define(params({ compatibilityMode: "none" }));

    const second = await service.define(
      params({
        version: 2,
        compatibilityMode: "none",
        schemaFields: [{ name: "applicationId", type: "uuid", required: true }],
      }),
    );

    expect(second.schemaFields).toHaveLength(1);
  });

  it("compares against the version immediately below, whatever status that version is in", async () => {
    const { service } = harness();
    await live(service, FIRST_EVENT_TYPE_VERSION);
    await service.define(
      params({
        version: 2,
        schemaFields: [...BASE_FIELDS, { name: "cohortYear", type: "number", required: false }],
      }),
    );

    await expect(
      service.define(
        params({
          version: 3,
          schemaFields: [...BASE_FIELDS, { name: "cohortYear", type: "string", required: false }],
        }),
      ),
    ).rejects.toThrow(SchemaIncompatibleError);
  });
});

describe("EventTypeDefinitionService — revisions", () => {
  it("changes a draft's prose, promise and shape without announcing anything", async () => {
    const { repository, events, service } = harness();
    const definition = await service.define(params());

    const revised = await service.revise(TENANT, definition.id, {
      title: "Admission Application Submitted",
      summary: "A guardian has submitted an admission application for one learner, in one cycle.",
      compatibilityMode: "full",
      schemaFields: [...BASE_FIELDS, { name: "cycleKey", type: "string", required: false }],
    });

    expect(revised.title).toBe("Admission Application Submitted");
    expect(revised.compatibilityMode).toBe("full");
    expect(await repository.findById(TENANT, definition.id)).toEqual(revised);
    expect(types(events)).toEqual([EVENT_TYPE_DEFINED]);
  });

  it("refuses to touch a version that has been published", async () => {
    const { service } = harness();
    const definition = await live(service, FIRST_EVENT_TYPE_VERSION);

    await expect(
      service.revise(TENANT, definition.id, {
        title: "Quietly different",
        summary: definition.summary,
        compatibilityMode: definition.compatibilityMode,
        schemaFields: definition.schemaFields,
      }),
    ).rejects.toThrow(EventTypeSchemaFrozenError);
  });

  it("refuses an edit that drifts the draft away from the version below it", async () => {
    const { service } = harness();
    await live(service, FIRST_EVENT_TYPE_VERSION);
    const second = await service.define(params({ version: 2 }));

    await expect(
      service.revise(TENANT, second.id, {
        title: second.title,
        summary: second.summary,
        compatibilityMode: "backward",
        schemaFields: [...BASE_FIELDS, { name: "cohortYear", type: "number", required: true }],
      }),
    ).rejects.toThrow(SchemaIncompatibleError);
  });

  it("404s rather than reaching a definition in another tenant", async () => {
    const { service } = harness();
    const definition = await service.define(params());

    await expect(
      service.revise(OTHER, definition.id, {
        title: "Elsewhere",
        summary: definition.summary,
        compatibilityMode: definition.compatibilityMode,
        schemaFields: definition.schemaFields,
      }),
    ).rejects.toThrow(EventTypeDefinitionNotFoundError);
  });
});

describe("EventTypeDefinitionService — lifecycle", () => {
  it("publishes in the name of the person answerable for the promise", async () => {
    const { events, service } = harness();

    const definition = await live(service, FIRST_EVENT_TYPE_VERSION);

    expect(definition.status).toBe("published");
    expect(definition.publishedBy).toBe(PUBLISHER);
    expect(definition.publishedAt).not.toBeNull();
    expect(types(events)).toEqual([EVENT_TYPE_DEFINED, EVENT_TYPE_PUBLISHED]);
  });

  it("refuses a publisher who resolves to nobody, before the record is touched", async () => {
    const { repository, events, service } = harness();
    const draft = await service.define(params());

    await expect(service.publish(TENANT, draft.id, ABSENT_PERSON)).rejects.toThrow(
      PersonNotFoundForMeshError,
    );

    expect((await repository.findById(TENANT, draft.id))?.status).toBe("draft");
    expect(types(events)).toEqual([EVENT_TYPE_DEFINED]);
  });

  it("gives notice, records the date and names a successor the mesh is carrying", async () => {
    const { events, service } = harness();
    const first = await live(service, FIRST_EVENT_TYPE_VERSION);
    await live(service, 2);

    const deprecated = await service.deprecate(
      TENANT,
      first.id,
      ANNOUNCED_AT,
      plusDays(ANNOUNCED_AT, 120),
      2,
    );

    expect(deprecated.status).toBe("deprecated");
    expect(deprecated.deprecatedAt).toBe(ANNOUNCED_AT);
    expect(deprecated.retireAt).toBe(plusDays(ANNOUNCED_AT, 120));
    expect(deprecated.supersededByVersion).toBe(2);
    expect(types(events)).toContain(EVENT_TYPE_DEPRECATED);
  });

  it("refuses a successor that was never registered", async () => {
    const { service } = harness();
    const first = await live(service, FIRST_EVENT_TYPE_VERSION);

    await expect(
      service.deprecate(TENANT, first.id, ANNOUNCED_AT, plusDays(ANNOUNCED_AT, 120), 2),
    ).rejects.toThrow(EventTypeDefinitionNotFoundError);
  });

  it("refuses a successor still in draft, because nobody can move onto it yet", async () => {
    const { service } = harness();
    const first = await live(service, FIRST_EVENT_TYPE_VERSION);
    await service.define(params({ version: 2 }));

    await expect(
      service.deprecate(TENANT, first.id, ANNOUNCED_AT, plusDays(ANNOUNCED_AT, 120), 2),
    ).rejects.toThrow(EventTypeNotPublishableError);
  });

  it("refuses a successor numbered at or below the version being retired", async () => {
    const { service } = harness();
    const first = await live(service, FIRST_EVENT_TYPE_VERSION);

    await expect(
      service.deprecate(TENANT, first.id, ANNOUNCED_AT, plusDays(ANNOUNCED_AT, 120), 1),
    ).rejects.toThrow(InvalidMeshCountError);
  });

  it("refuses notice below the floor, leaving the version published and unannounced", async () => {
    const { repository, events, service } = harness();
    const first = await live(service, FIRST_EVENT_TYPE_VERSION);
    await live(service, 2);

    await expect(
      service.deprecate(TENANT, first.id, ANNOUNCED_AT, plusDays(ANNOUNCED_AT, 30), 2),
    ).rejects.toThrow(DeprecationNoticeTooShortError);

    expect((await repository.findById(TENANT, first.id))?.status).toBe("published");
    expect(types(events)).not.toContain(EVENT_TYPE_DEPRECATED);
  });

  it("retires a version whose notice has been given, keeping the date that was announced", async () => {
    const { events, service } = harness();
    const first = await live(service, FIRST_EVENT_TYPE_VERSION);
    await live(service, 2);
    const retireAt = plusDays(ANNOUNCED_AT, 120);
    await service.deprecate(TENANT, first.id, ANNOUNCED_AT, retireAt, 2);

    const retired = await service.retire(TENANT, first.id);

    expect(retired.status).toBe("retired");
    expect(retired.retireAt).toBe(retireAt);
    expect(types(events)).toContain(EVENT_TYPE_RETIRED);
  });

  it("withdraws a draft that will never ship", async () => {
    const { service } = harness();
    const draft = await service.define(params());

    const withdrawn = await service.retire(TENANT, draft.id);

    expect(withdrawn.status).toBe("retired");
    expect(withdrawn.retireAt).not.toBeNull();
  });

  it("refuses to retire a published version that never served its notice", async () => {
    const { repository, service } = harness();
    const first = await live(service, FIRST_EVENT_TYPE_VERSION);

    await expect(service.retire(TENANT, first.id)).rejects.toThrow(EventTypeNotDeprecatedError);
    expect((await repository.findById(TENANT, first.id))?.status).toBe("published");
  });

  it("404s on a definition that does not exist", async () => {
    const { service } = harness();

    await expect(service.retire(TENANT, MISSING)).rejects.toThrow(EventTypeDefinitionNotFoundError);
  });
});

describe("EventTypeDefinitionService — reading", () => {
  it("finds a definition by the pair a consumer pins to", async () => {
    const { service } = harness();
    const definition = await service.define(params());

    const found = await service.getByKeyAndVersion(TENANT, "Admissions.Application.Submitted", 1);

    expect(found.id).toBe(definition.id);
  });

  it("404s naming the normalised pair rather than what the caller typed", async () => {
    const { service } = harness();

    await expect(
      service.getByKeyAndVersion(TENANT, "Admissions.Application.Submitted", 9),
    ).rejects.toThrow(`${KEY}@v9`);
  });

  it("404s rather than returning a definition from another tenant", async () => {
    const { service } = harness();
    await service.define(params());

    await expect(service.getByKeyAndVersion(OTHER, KEY, 1)).rejects.toThrow(
      EventTypeDefinitionNotFoundError,
    );
  });

  it("returns one definition by id", async () => {
    const { service } = harness();
    const definition = await service.define(params());

    expect((await service.get(TENANT, definition.id)).id).toBe(definition.id);
  });

  it("lists every version of one key, oldest version first, drafts included", async () => {
    const { service } = harness();
    await live(service, FIRST_EVENT_TYPE_VERSION);
    await live(service, 2);
    await service.define(params({ version: 3 }));

    const versions = await service.listByKey(TENANT, "Admissions.Application.Submitted");

    expect(versions.map((definition) => definition.version)).toEqual([1, 2, 3]);
  });

  it("lists what the mesh is carrying right now, leaving drafts out", async () => {
    const { service } = harness();
    const first = await live(service, FIRST_EVENT_TYPE_VERSION);
    await service.define(params({ version: 2 }));

    const carried = await service.listCarried(TENANT, ORG);

    expect(carried.map((definition) => definition.id)).toEqual([first.id]);
    expect(carried.every(isEventTypeCarried)).toBe(true);
  });

  it("keeps a deprecated version in the carried list, because producers are still on it", async () => {
    const { service } = harness();
    const first = await live(service, FIRST_EVENT_TYPE_VERSION);
    await live(service, 2);
    await service.deprecate(TENANT, first.id, ANNOUNCED_AT, plusDays(ANNOUNCED_AT, 120), 2);

    expect(await service.listCarried(TENANT, ORG)).toHaveLength(2);
  });

  it("scopes the carried read to one organization", async () => {
    const { service } = harness();
    await live(service, FIRST_EVENT_TYPE_VERSION);
    await live(service, FIRST_EVENT_TYPE_VERSION, {
      eventTypeKey: OTHER_KEY,
      organizationId: SECOND_ORG,
    });

    expect(await service.listCarried(TENANT, SECOND_ORG)).toHaveLength(1);
  });

  it("lists everything in the tenant, in every status", async () => {
    const { service } = harness();
    const draft = await service.define(params());
    await service.retire(TENANT, draft.id);
    await service.define(params({ eventTypeKey: OTHER_KEY }));

    expect(await service.list(TENANT)).toHaveLength(2);
  });

  it("answers whether a publication is accepted at an instant the caller names", async () => {
    const { service } = harness();
    const first = await live(service, FIRST_EVENT_TYPE_VERSION);
    const draft = await service.define(params({ version: 2 }));

    expect((await service.assessPublication(TENANT, first.id, ANNOUNCED_AT)).publishable).toBe(
      true,
    );
    expect((await service.assessPublication(TENANT, draft.id, ANNOUNCED_AT)).publishable).toBe(
      false,
    );
  });

  it("reads a deprecation as still publishable while its notice is running", async () => {
    const { service } = harness();
    const first = await live(service, FIRST_EVENT_TYPE_VERSION);
    await live(service, 2);
    await service.deprecate(TENANT, first.id, ANNOUNCED_AT, plusDays(ANNOUNCED_AT, 120), 2);

    const verdict = await service.assessPublication(TENANT, first.id, plusDays(ANNOUNCED_AT, 30));

    expect(verdict.deprecated).toBe(true);
    expect(verdict.publishable).toBe(true);
    expect(verdict.daysUntilRetirement).toBe(90);
  });

  it("works without an event bus at all", async () => {
    const repository = new InMemoryEventTypeDefinitionRepository();
    const service = new EventTypeDefinitionService({ repository, organizations, people });

    const definition = await service.define(params());
    const published = await service.publish(TENANT, definition.id, PUBLISHER);

    expect(published.status).toBe("published");
  });
});
