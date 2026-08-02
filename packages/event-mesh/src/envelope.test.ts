import type {
  CorrelationId,
  DomainEvent,
  EventMetadata,
  ISODateString,
  TenantId,
  Uuid,
} from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  MANDATORY_ENVELOPE_FIELDS,
  type MandatoryEnvelopeField,
  completeEnvelope,
} from "./envelope";
import {
  IncompleteEnvelopeError,
  InvalidMeshCountError,
  InvalidMeshInstantError,
  InvalidMeshKeyError,
} from "./errors";
import { FIRST_EVENT_TYPE_VERSION, MAX_KEY_LENGTH } from "./mesh-value";
import type { AggregateReference, EnvelopeContext } from "./mesh-view";

const TENANT = "5fae7a4c-9b8c-4d7e-bf40-2c3d5e7f9a1b" as TenantId;
const EVENT_ID = "1f0a5c62-0f0d-4b6a-9a2e-7d4c1b8e33a1" as Uuid;
const AGGREGATE_ID = "2c7b4d19-6e5f-4a3b-8c1d-9e0f2a4b6c8d" as Uuid;
const CAUSATION_ID = "3d8c5e2a-7f6a-4b5c-9d2e-0a1b3c5d7e9f" as Uuid;
const CORRELATION = "4e9d6f3b-8a7b-4c6d-ae3f-1b2c4d6e8f0a" as CorrelationId;
const OCCURRED_AT = "2027-01-02T09:15:00.000Z" as ISODateString;
const RECORDED_AT = "2027-01-02T09:15:00.412Z" as ISODateString;

const EVENT_TYPE = "student-lifecycle.enrolment.confirmed";
const AGGREGATE_TYPE = "student-lifecycle.enrolment";
const PRODUCER_KEY = "student-lifecycle";
const STREAM_KEY = "student-lifecycle.enrolment";
const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";

/**
 * A payload that reports being read.
 *
 * The engine promises never to touch `event.payload`, and the only way to test a promise about something not
 * happening is to make the thing that must not happen loud. Every route by which content escapes a payload —
 * reading a property, spreading it, enumerating it — raises here rather than passing quietly.
 */
const watchedPayload = (): unknown => {
  const caught = (): never => {
    throw new Error("the envelope engine read the payload");
  };
  return new Proxy({ learnerId: AGGREGATE_ID }, { get: caught, has: caught, ownKeys: caught });
};

const metadata = (overrides: Partial<EventMetadata> = {}): EventMetadata =>
  ({
    eventId: EVENT_ID,
    occurredAt: OCCURRED_AT,
    version: FIRST_EVENT_TYPE_VERSION,
    tenantId: TENANT,
    correlationId: CORRELATION,
    ...overrides,
  }) as EventMetadata;

const event = (overrides: Partial<EventMetadata> = {}, type: string = EVENT_TYPE): DomainEvent => ({
  type,
  payload: watchedPayload(),
  metadata: metadata(overrides),
});

const aggregate = (overrides: Partial<AggregateReference> = {}): AggregateReference =>
  ({
    aggregateType: AGGREGATE_TYPE,
    aggregateId: AGGREGATE_ID,
    ...overrides,
  }) as AggregateReference;

const context = (overrides: Partial<EnvelopeContext> = {}): EnvelopeContext =>
  ({
    streamKey: STREAM_KEY,
    producerKey: PRODUCER_KEY,
    traceId: TRACE_ID,
    aggregate: aggregate(),
    recordedAt: RECORDED_AT,
    ...overrides,
  }) as EnvelopeContext;

/** One completion attempt, made deliberately short of exactly one thing. */
interface Attempt {
  readonly event: DomainEvent;
  readonly context: EnvelopeContext;
}

/**
 * How each mandatory field is taken away, one at a time.
 *
 * Keyed by {@link MandatoryEnvelopeField} rather than by a loose string, so a field added to the mandate without
 * a way of removing it fails to compile rather than going untested.
 */
const without: Record<MandatoryEnvelopeField, () => Attempt> = {
  eventId: () => ({ event: event({ eventId: undefined }), context: context() }),
  eventTypeKey: () => ({ event: event({}, "   "), context: context() }),
  eventTypeVersion: () => ({ event: event({ version: undefined }), context: context() }),
  tenantId: () => ({
    event: event({ tenantId: undefined }),
    context: context({ tenantId: undefined }),
  }),
  correlationId: () => ({
    event: event({ correlationId: undefined }),
    context: context({ correlationId: undefined }),
  }),
  traceId: () => ({ event: event(), context: context({ traceId: undefined }) }),
  aggregateType: () => ({
    event: event(),
    context: context({ aggregate: aggregate({ aggregateType: undefined }) }),
  }),
  aggregateId: () => ({
    event: event(),
    context: context({ aggregate: aggregate({ aggregateId: undefined }) }),
  }),
  producerKey: () => ({ event: event(), context: context({ producerKey: undefined }) }),
  streamKey: () => ({ event: event(), context: context({ streamKey: undefined }) }),
  occurredAt: () => ({ event: event({ occurredAt: undefined }), context: context() }),
  recordedAt: () => ({ event: event(), context: context({ recordedAt: undefined }) }),
};

describe("the mandate", () => {
  it("names every field a publication has to supply from somewhere", () => {
    expect(MANDATORY_ENVELOPE_FIELDS).toEqual([
      "eventId",
      "eventTypeKey",
      "eventTypeVersion",
      "tenantId",
      "correlationId",
      "traceId",
      "aggregateType",
      "aggregateId",
      "producerKey",
      "streamKey",
      "occurredAt",
      "recordedAt",
    ]);
  });

  it("leaves out the two fields that are not mandates", () => {
    expect(MANDATORY_ENVELOPE_FIELDS).not.toContain("partitionKey");
    expect(MANDATORY_ENVELOPE_FIELDS).not.toContain("causationId");
  });

  it("refuses a completion missing any one of them, and names the one that is missing", () => {
    for (const field of MANDATORY_ENVELOPE_FIELDS) {
      const attempt = without[field]();
      expect(() => completeEnvelope(attempt.event, attempt.context)).toThrow(
        IncompleteEnvelopeError,
      );
      expect(() => completeEnvelope(attempt.event, attempt.context)).toThrow(
        `A mesh envelope must carry "${field}"`,
      );
    }
  });

  it("completes the envelope when every one of them is present", () => {
    expect(() => completeEnvelope(event(), context())).not.toThrow();
  });
});

describe("completing an event", () => {
  it("carries everything the mesh mandates and nothing it was not given", () => {
    expect(completeEnvelope(event({ causationId: CAUSATION_ID }), context())).toEqual({
      eventId: EVENT_ID,
      eventTypeKey: EVENT_TYPE,
      eventTypeVersion: FIRST_EVENT_TYPE_VERSION,
      tenantId: TENANT,
      aggregate: { aggregateType: AGGREGATE_TYPE, aggregateId: AGGREGATE_ID },
      producerKey: PRODUCER_KEY,
      correlationId: CORRELATION,
      causationId: CAUSATION_ID,
      traceId: TRACE_ID,
      streamKey: STREAM_KEY,
      partitionKey: AGGREGATE_ID,
      occurredAt: OCCURRED_AT,
      recordedAt: RECORDED_AT,
    });
  });

  it("never reads the payload", () => {
    expect(() => completeEnvelope(event(), context())).not.toThrow();
  });

  it("hands back a frozen envelope with a frozen aggregate", () => {
    const envelope = completeEnvelope(event(), context());
    expect(Object.isFrozen(envelope)).toBe(true);
    expect(Object.isFrozen(envelope.aggregate)).toBe(true);
  });

  it("takes tenant, correlation and causation from the context when the event is silent", () => {
    const bare = event({ tenantId: undefined, correlationId: undefined });
    const envelope = completeEnvelope(
      bare,
      context({ tenantId: TENANT, correlationId: CORRELATION, causationId: CAUSATION_ID }),
    );
    expect(envelope.tenantId).toBe(TENANT);
    expect(envelope.correlationId).toBe(CORRELATION);
    expect(envelope.causationId).toBe(CAUSATION_ID);
  });

  it("prefers the context over the event's own metadata, because the boundary knows better", () => {
    const other = "6a1b8c5d-0e9f-4a2b-bc51-3d4e6f8a0b2c" as TenantId;
    const envelope = completeEnvelope(event(), context({ tenantId: other }));
    expect(envelope.tenantId).toBe(other);
  });
});

describe("identities and keys", () => {
  it("normalises every key it stores", () => {
    const envelope = completeEnvelope(
      event({}, "  Student-Lifecycle.Enrolment.Confirmed "),
      context({
        streamKey: " Student-Lifecycle.Enrolment ",
        producerKey: "STUDENT-LIFECYCLE",
        traceId: "4BF92F3577B34DA6A3CE929D0E0E4736",
        aggregate: aggregate({ aggregateType: "Student-Lifecycle.Enrolment" }),
      }),
    );
    expect(envelope.eventTypeKey).toBe(EVENT_TYPE);
    expect(envelope.streamKey).toBe(STREAM_KEY);
    expect(envelope.producerKey).toBe(PRODUCER_KEY);
    expect(envelope.traceId).toBe(TRACE_ID);
    expect(envelope.aggregate.aggregateType).toBe(AGGREGATE_TYPE);
  });

  it("refuses an identifier that is present but is not a key, naming what kind it was", () => {
    expect(() => completeEnvelope(event({}, "enrolment confirmed"), context())).toThrow(
      InvalidMeshKeyError,
    );
    expect(() => completeEnvelope(event(), context({ streamKey: "enrolment/stream" }))).toThrow(
      InvalidMeshKeyError,
    );
    expect(() => completeEnvelope(event(), context({ producerKey: "student..lifecycle" }))).toThrow(
      InvalidMeshKeyError,
    );
    expect(() => completeEnvelope(event(), context({ traceId: "trace:4bf9" }))).toThrow(
      InvalidMeshKeyError,
    );
    expect(() =>
      completeEnvelope(event(), context({ aggregate: aggregate({ aggregateType: "-enrolment" }) })),
    ).toThrow(InvalidMeshKeyError);
  });

  it("does not hold identities to the key grammar, because they are not keys", () => {
    const envelope = completeEnvelope(event(), context());
    expect(envelope.eventId).toBe(EVENT_ID);
    expect(envelope.aggregate.aggregateId).toBe(AGGREGATE_ID);
  });

  it("records an absent causation as null rather than leaving the field off", () => {
    const envelope = completeEnvelope(event(), context());
    expect(envelope.causationId).toBeNull();
    expect(Object.keys(envelope)).toContain("causationId");
  });

  it("treats a blank causation as the absence somebody meant it to be", () => {
    const blank = "   " as Uuid;
    expect(completeEnvelope(event({ causationId: blank }), context()).causationId).toBeNull();
  });
});

describe("the partition key", () => {
  it("defaults to the aggregate id, which is what keeps a thing's facts in order", () => {
    expect(completeEnvelope(event(), context()).partitionKey).toBe(AGGREGATE_ID);
  });

  it("takes an override, for a stream that wants a whole register in one partition", () => {
    const envelope = completeEnvelope(event(), context({ partitionKey: "class-7b.2027" }));
    expect(envelope.partitionKey).toBe("class-7b.2027");
  });

  it("falls back to the aggregate id when the override is blank", () => {
    expect(completeEnvelope(event(), context({ partitionKey: "  " })).partitionKey).toBe(
      AGGREGATE_ID,
    );
  });

  it("accepts an external identifier that no key grammar would allow, because it is hashed", () => {
    const external = "CBSE/2027/Class 7-B";
    expect(completeEnvelope(event(), context({ partitionKey: external })).partitionKey).toBe(
      external,
    );
  });

  it("refuses one that would not fit the column", () => {
    const long = "p".repeat(MAX_KEY_LENGTH + 1);
    expect(() => completeEnvelope(event(), context({ partitionKey: long }))).toThrow(
      InvalidMeshKeyError,
    );
    expect(() =>
      completeEnvelope(event(), context({ partitionKey: "p".repeat(MAX_KEY_LENGTH) })),
    ).not.toThrow();
  });
});

describe("instants", () => {
  it("stores one spelling of a moment, so that a text comparison sorts correctly", () => {
    const envelope = completeEnvelope(
      event({ occurredAt: "2027-01-02T09:15:00Z" as ISODateString }),
      context({ recordedAt: "2027-01-02T14:45:00.412+05:30" as ISODateString }),
    );
    expect(envelope.occurredAt).toBe("2027-01-02T09:15:00.000Z");
    expect(envelope.recordedAt).toBe(RECORDED_AT);
  });

  it("refuses an instant that is present but is not a moment, naming the field", () => {
    expect(() =>
      completeEnvelope(event({ occurredAt: "last Tuesday" as ISODateString }), context()),
    ).toThrow(InvalidMeshInstantError);
    expect(() =>
      completeEnvelope(event(), context({ recordedAt: "2027-13-45T00:00:00Z" as ISODateString })),
    ).toThrow('"recordedAt" must be an ISO-8601 instant');
  });

  it("does not read a clock: the same event and context complete to the same envelope", () => {
    expect(completeEnvelope(event(), context())).toEqual(completeEnvelope(event(), context()));
  });
});

describe("the schema version", () => {
  it("accepts the first version and every version after it", () => {
    expect(
      completeEnvelope(event({ version: FIRST_EVENT_TYPE_VERSION }), context()),
    ).toHaveProperty("eventTypeVersion", FIRST_EVENT_TYPE_VERSION);
    expect(completeEnvelope(event({ version: 7 }), context()).eventTypeVersion).toBe(7);
  });

  it("refuses a version this platform could not have assigned", () => {
    for (const version of [0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => completeEnvelope(event({ version }), context())).toThrow(InvalidMeshCountError);
    }
  });

  it("separates a version nobody set from one that was set wrongly", () => {
    expect(() => completeEnvelope(event({ version: undefined }), context())).toThrow(
      IncompleteEnvelopeError,
    );
    expect(() => completeEnvelope(event({ version: 0 }), context())).toThrow(InvalidMeshCountError);
  });
});
