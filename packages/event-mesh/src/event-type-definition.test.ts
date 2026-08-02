import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DeprecationNoticeTooShortError,
  DuplicateSchemaFieldError,
  EmptyMeshKeyError,
  EmptySchemaError,
  EventTypeNotDeprecatedError,
  EventTypeRetiredError,
  EventTypeSchemaFrozenError,
  InvalidEventTypeProgressionError,
  InvalidMeshCountError,
  InvalidMeshKeyError,
  InvalidSchemaFieldNameError,
  RetirementBeforeDeprecationError,
} from "./errors";
import {
  type DefineEventTypeParams,
  type EventTypeDefinition,
  defineEventType,
  deprecateEventType,
  eventTypePublication,
  isEventTypeCarried,
  isEventTypeSchemaFrozen,
  publishEventType,
  retireEventType,
  reviseEventType,
} from "./event-type-definition";
import {
  COMPATIBILITY_MODES,
  DEFAULT_COMPATIBILITY_MODE,
  FIRST_EVENT_TYPE_VERSION,
  INITIAL_EVENT_TYPE_STATUS,
  MIN_DEPRECATION_NOTICE_DAYS,
  type SchemaField,
} from "./mesh-value";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const PUBLISHER = "person-1" as Uuid;

/** One fixed instant, so no assertion below depends on when the suite happens to run. */
const NOW = "2027-01-02T09:15:00.000Z" as ISODateString;

const DAY = 86_400;

/** The instant a whole number of days from the fixture instant. Negative values run backwards. */
const daysFrom = (days: number): ISODateString =>
  new Date(Date.parse(NOW) + days * DAY * 1_000).toISOString() as ISODateString;

const ANNOUNCED = daysFrom(0);
const RETIRE_AT = daysFrom(MIN_DEPRECATION_NOTICE_DAYS);

const FIELDS: readonly SchemaField[] = Object.freeze([
  Object.freeze({ name: "applicationId", type: "uuid", required: true }),
  Object.freeze({ name: "submittedAt", type: "instant", required: true }),
]);

const params = (overrides: Partial<DefineEventTypeParams> = {}): DefineEventTypeParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  eventTypeKey: "admissions.application.submitted",
  title: "Application Submitted",
  summary: "A guardian completed and submitted an application for an open admissions cycle.",
  schemaFields: FIELDS,
  ...overrides,
});

const drafted = (overrides: Partial<DefineEventTypeParams> = {}): EventTypeDefinition =>
  defineEventType(params(overrides));

const published = (overrides: Partial<DefineEventTypeParams> = {}): EventTypeDefinition =>
  publishEventType(drafted(overrides), PUBLISHER);

const deprecated = (overrides: Partial<DefineEventTypeParams> = {}): EventTypeDefinition =>
  deprecateEventType(published(overrides), ANNOUNCED, RETIRE_AT, 2);

const retired = (): EventTypeDefinition => retireEventType(deprecated());

describe("registering an event type", () => {
  it("starts as a draft, promising nobody a shape", () => {
    const definition = drafted();

    expect(definition.status).toBe(INITIAL_EVENT_TYPE_STATUS);
    expect(definition.version).toBe(FIRST_EVENT_TYPE_VERSION);
    expect(definition.compatibilityMode).toBe(DEFAULT_COMPATIBILITY_MODE);
    expect(definition.publishedAt).toBeNull();
    expect(definition.publishedBy).toBeNull();
    expect(definition.deprecatedAt).toBeNull();
    expect(definition.retireAt).toBeNull();
    expect(definition.supersededByVersion).toBeNull();
  });

  it("normalises the key and trims the prose the reviewer will read", () => {
    const definition = drafted({
      eventTypeKey: "  Admissions.Application.Submitted  ",
      title: "  Application Submitted  ",
      summary: "  A guardian submitted an application.  ",
    });

    expect(definition.eventTypeKey).toBe("admissions.application.submitted");
    expect(definition.title).toBe("Application Submitted");
    expect(definition.summary).toBe("A guardian submitted an application.");
  });

  it("carries the tenant and organisation it was registered under", () => {
    const definition = drafted();

    expect(definition.tenantId).toBe(TENANT);
    expect(definition.organizationId).toBe(ORG);
    expect(definition.createdAt).toBe(definition.updatedAt);
  });

  it("accepts any compatibility mode the vocabulary names", () => {
    for (const mode of COMPATIBILITY_MODES) {
      expect(drafted({ compatibilityMode: mode }).compatibilityMode).toBe(mode);
    }
  });

  it("refuses a blank key, and one that does not fit the platform's grammar", () => {
    expect(() => drafted({ eventTypeKey: "   " })).toThrow(EmptyMeshKeyError);
    expect(() => drafted({ eventTypeKey: "admissions application" })).toThrow(InvalidMeshKeyError);
  });

  it("refuses a version number that could never have been a version", () => {
    for (const version of [0, -1, 1.5, Number.NaN]) {
      expect(() => drafted({ version })).toThrow(InvalidMeshCountError);
    }
  });

  it("refuses a schema nobody could write a reader against", () => {
    expect(() => drafted({ schemaFields: [] })).toThrow(EmptySchemaError);
    expect(() =>
      drafted({
        schemaFields: [
          { name: "applicationId", type: "uuid", required: true },
          { name: "applicationId", type: "string", required: false },
        ],
      }),
    ).toThrow(DuplicateSchemaFieldError);
    expect(() =>
      drafted({ schemaFields: [{ name: "application id", type: "string", required: true }] }),
    ).toThrow(InvalidSchemaFieldNameError);
  });

  it("keeps a copy of the schema the caller cannot reach afterwards", () => {
    const mutable: SchemaField[] = [{ name: "applicationId", type: "uuid", required: true }];
    const definition = drafted({ schemaFields: mutable });
    mutable.push({ name: "smuggled", type: "string", required: false });

    expect(definition.schemaFields).toHaveLength(1);
    expect(Object.isFrozen(definition.schemaFields)).toBe(true);
  });
});

describe("revising a draft", () => {
  it("changes the prose, the promise and the shape as one decision", () => {
    const revised = reviseEventType(drafted(), {
      title: "Application Submitted",
      summary: "A guardian submitted an application, and the cycle accepted it.",
      compatibilityMode: "full",
      schemaFields: [{ name: "applicationId", type: "uuid", required: true }],
    });

    expect(revised.compatibilityMode).toBe("full");
    expect(revised.schemaFields).toHaveLength(1);
    expect(revised.summary).toBe("A guardian submitted an application, and the cycle accepted it.");
  });

  it("leaves the key and the version alone, because consumers pin to both", () => {
    const definition = drafted({ version: 3 });
    const revised = reviseEventType(definition, {
      title: "Renamed",
      summary: "Renamed.",
      compatibilityMode: "none",
      schemaFields: FIELDS,
    });

    expect(revised.eventTypeKey).toBe(definition.eventTypeKey);
    expect(revised.version).toBe(3);
    expect(revised.id).toBe(definition.id);
  });

  it("refuses once the shape is somebody else's dependency", () => {
    expect(() =>
      reviseEventType(published(), {
        title: "Application Submitted",
        summary: "A quiet correction nobody downstream would hear about.",
        compatibilityMode: "backward",
        schemaFields: FIELDS,
      }),
    ).toThrow(EventTypeSchemaFrozenError);
  });
});

describe("publishing a version", () => {
  it("freezes the shape and records who promised it", () => {
    const definition = published();

    expect(definition.status).toBe("published");
    expect(definition.publishedBy).toBe(PUBLISHER);
    expect(definition.publishedAt).not.toBeNull();
    expect(isEventTypeSchemaFrozen(definition)).toBe(true);
    expect(isEventTypeCarried(definition)).toBe(true);
  });

  it("refuses a second publication of the same version", () => {
    expect(() => publishEventType(published(), PUBLISHER)).toThrow(
      InvalidEventTypeProgressionError,
    );
  });

  it("refuses a version that has been retired", () => {
    expect(() => publishEventType(retired(), PUBLISHER)).toThrow(EventTypeRetiredError);
  });
});

describe("deprecating a version", () => {
  it("keeps carrying it, and says when it stops and what replaces it", () => {
    const definition = deprecated();

    expect(definition.status).toBe("deprecated");
    expect(definition.deprecatedAt).toBe(ANNOUNCED);
    expect(definition.retireAt).toBe(RETIRE_AT);
    expect(definition.supersededByVersion).toBe(2);
    expect(isEventTypeCarried(definition)).toBe(true);
  });

  it("refuses a notice period shorter than the platform's floor", () => {
    expect(() =>
      deprecateEventType(published(), ANNOUNCED, daysFrom(MIN_DEPRECATION_NOTICE_DAYS - 1), 2),
    ).toThrow(DeprecationNoticeTooShortError);
  });

  it("refuses dates that describe no notice period at all", () => {
    expect(() => deprecateEventType(published(), ANNOUNCED, daysFrom(-1), 2)).toThrow(
      RetirementBeforeDeprecationError,
    );
  });

  it("refuses a successor that is not later than the version being deprecated", () => {
    for (const successor of [1, 0, -1, 1.5]) {
      expect(() => deprecateEventType(published(), ANNOUNCED, RETIRE_AT, successor)).toThrow(
        InvalidMeshCountError,
      );
    }
  });

  it("refuses a draft, which has promised nobody anything to give notice about", () => {
    expect(() => deprecateEventType(drafted(), ANNOUNCED, RETIRE_AT, 2)).toThrow(
      InvalidEventTypeProgressionError,
    );
  });

  it("refuses a version already deprecated, and one already retired", () => {
    expect(() => deprecateEventType(deprecated(), ANNOUNCED, RETIRE_AT, 3)).toThrow(
      InvalidEventTypeProgressionError,
    );
    expect(() => deprecateEventType(retired(), ANNOUNCED, RETIRE_AT, 3)).toThrow(
      EventTypeRetiredError,
    );
  });
});

describe("retiring a version", () => {
  it("stops it being carried, and keeps the date consumers scheduled around", () => {
    const definition = retired();

    expect(definition.status).toBe("retired");
    expect(definition.retireAt).toBe(RETIRE_AT);
    expect(isEventTypeCarried(definition)).toBe(false);
  });

  it("withdraws a draft that will never ship, stamping the moment it happened", () => {
    const definition = retireEventType(drafted());

    expect(definition.status).toBe("retired");
    expect(definition.retireAt).toBe(definition.updatedAt);
  });

  it("names the step the caller skipped rather than calling the move impossible", () => {
    expect(() => retireEventType(published())).toThrow(EventTypeNotDeprecatedError);
  });

  it("refuses a version already retired", () => {
    expect(() => retireEventType(retired())).toThrow(EventTypeRetiredError);
  });
});

describe("reading a version against the calendar", () => {
  it("reports a published version as publishable and not on notice", () => {
    const verdict = eventTypePublication(published(), NOW);

    expect(verdict.publishable).toBe(true);
    expect(verdict.deprecated).toBe(false);
    expect(verdict.reason).toBe("within_notice");
  });

  it("counts the days a deprecated version has left", () => {
    const verdict = eventTypePublication(deprecated(), NOW);

    expect(verdict.publishable).toBe(true);
    expect(verdict.deprecated).toBe(true);
    expect(verdict.daysUntilRetirement).toBe(MIN_DEPRECATION_NOTICE_DAYS);
  });

  it("answers about an instant before the announcement with what was true then", () => {
    const verdict = eventTypePublication(deprecated(), daysFrom(-30));

    expect(verdict.publishable).toBe(true);
    expect(verdict.deprecated).toBe(false);
    expect(verdict.daysUntilRetirement).toBeNull();
  });

  it("refuses once the announced date has arrived, whatever the status column says", () => {
    const verdict = eventTypePublication(deprecated(), daysFrom(MIN_DEPRECATION_NOTICE_DAYS + 1));

    expect(verdict.publishable).toBe(false);
    expect(verdict.reason).toBe("event_type_retired");
  });

  it("refuses a draft, which nothing may be published under", () => {
    const verdict = eventTypePublication(drafted(), NOW);

    expect(verdict.publishable).toBe(false);
    expect(verdict.reason).toBe("event_type_not_publishable");
  });
});
