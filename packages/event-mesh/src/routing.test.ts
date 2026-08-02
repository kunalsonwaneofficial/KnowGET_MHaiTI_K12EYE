import type { CorrelationId, ISODateString, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  FilterValueMismatchError,
  TooManyFilterPredicatesError,
  TooManyFilterValuesError,
  UnknownFilterAttributeError,
} from "./errors";
import {
  FILTER_OPERATORS,
  type FilterOperator,
  type FilterPredicate,
  MAX_FILTER_PREDICATES,
  MAX_FILTER_VALUES,
  SUBSCRIPTION_STATUSES,
  isSubscriptionDeliverable,
} from "./mesh-value";
import type { MeshEnvelope, RoutingCandidate } from "./mesh-view";
import {
  FILTERABLE_ATTRIBUTES,
  type FilterableAttribute,
  matchesFilter,
  routeEnvelope,
  validateFilter,
} from "./routing";

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
const PARTITION_KEY = "class-9-b";
const EVENT_TYPE_VERSION = 3;
const SUBSCRIPTION_KEY = "reporting.enrolment-sink";

const envelope = (overrides: Partial<MeshEnvelope> = {}): MeshEnvelope => ({
  eventId: EVENT_ID,
  eventTypeKey: EVENT_TYPE,
  eventTypeVersion: EVENT_TYPE_VERSION,
  tenantId: TENANT,
  aggregate: { aggregateType: AGGREGATE_TYPE, aggregateId: AGGREGATE_ID },
  producerKey: PRODUCER_KEY,
  correlationId: CORRELATION,
  causationId: CAUSATION_ID,
  traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
  streamKey: STREAM_KEY,
  partitionKey: PARTITION_KEY,
  occurredAt: OCCURRED_AT,
  recordedAt: RECORDED_AT,
  ...overrides,
});

const candidate = (overrides: Partial<RoutingCandidate> = {}): RoutingCandidate => ({
  subscriptionKey: SUBSCRIPTION_KEY,
  streamKey: STREAM_KEY,
  status: "active",
  filter: [],
  ...overrides,
});

const predicate = (
  attribute: string,
  operator: FilterOperator,
  values: readonly string[] = [],
): FilterPredicate => ({ attribute, operator, values });

/** What each filterable attribute reads as on the canonical envelope above. */
const READS_AS: Readonly<Record<FilterableAttribute, string>> = Object.freeze({
  aggregateId: AGGREGATE_ID,
  aggregateType: AGGREGATE_TYPE,
  causationId: CAUSATION_ID,
  eventTypeKey: EVENT_TYPE,
  eventTypeVersion: String(EVENT_TYPE_VERSION),
  partitionKey: PARTITION_KEY,
  producerKey: PRODUCER_KEY,
});

describe("FILTERABLE_ATTRIBUTES", () => {
  it("is exactly the closed set the module documents", () => {
    expect([...FILTERABLE_ATTRIBUTES]).toEqual([
      "aggregateId",
      "aggregateType",
      "causationId",
      "eventTypeKey",
      "eventTypeVersion",
      "partitionKey",
      "producerKey",
    ]);
  });

  it("offers nothing that would let a filter decide on payload contents", () => {
    for (const attribute of FILTERABLE_ATTRIBUTES) {
      expect(attribute.startsWith("payload")).toBe(false);
    }
  });

  it("withholds the identities that describe one message rather than a class of them", () => {
    const withheld: readonly string[] = ["eventId", "correlationId", "traceId", "tenantId"];
    for (const attribute of withheld) {
      expect((FILTERABLE_ATTRIBUTES as readonly string[]).includes(attribute)).toBe(false);
    }
  });

  it("can be read off an envelope, every one of them", () => {
    for (const attribute of FILTERABLE_ATTRIBUTES) {
      const value = READS_AS[attribute];
      expect(matchesFilter(envelope(), [predicate(attribute, "equals", [value])])).toBe(true);
      expect(matchesFilter(envelope(), [predicate(attribute, "present")])).toBe(true);
    }
  });
});

describe("validateFilter", () => {
  it("accepts an empty filter as a subscription to everything on the stream", () => {
    expect(validateFilter(SUBSCRIPTION_KEY, [])).toEqual([]);
  });

  it("trims the attribute and every value, and freezes what it returns", () => {
    const validated = validateFilter(SUBSCRIPTION_KEY, [
      predicate("  producerKey  ", "in", ["  student-lifecycle  ", "admissions"]),
    ]);
    expect(validated).toHaveLength(1);
    expect(validated[0]?.attribute).toBe("producerKey");
    expect(validated[0]?.values).toEqual(["student-lifecycle", "admissions"]);
    expect(Object.isFrozen(validated)).toBe(true);
    expect(Object.isFrozen(validated[0])).toBe(true);
  });

  it("refuses more predicates than a filter is allowed to carry", () => {
    const tooMany = Array.from({ length: MAX_FILTER_PREDICATES + 1 }, () =>
      predicate("producerKey", "present"),
    );
    expect(() => validateFilter(SUBSCRIPTION_KEY, tooMany)).toThrow(TooManyFilterPredicatesError);
  });

  it("accepts exactly the permitted number of predicates", () => {
    const atCeiling = Array.from({ length: MAX_FILTER_PREDICATES }, () =>
      predicate("producerKey", "present"),
    );
    expect(validateFilter(SUBSCRIPTION_KEY, atCeiling)).toHaveLength(MAX_FILTER_PREDICATES);
  });

  it("refuses an attribute the mesh cannot read off an envelope", () => {
    expect(() =>
      validateFilter(SUBSCRIPTION_KEY, [predicate("payload.amount", "equals", ["100"])]),
    ).toThrow(UnknownFilterAttributeError);
  });

  it("refuses a value-free operator that was given values anyway", () => {
    for (const operator of ["present", "absent"] as const) {
      expect(() =>
        validateFilter(SUBSCRIPTION_KEY, [predicate("causationId", operator, ["anything"])]),
      ).toThrow(FilterValueMismatchError);
    }
  });

  it("refuses a value-taking operator that was given none", () => {
    for (const operator of ["equals", "not_equals", "in", "prefix"] as const) {
      expect(() => validateFilter(SUBSCRIPTION_KEY, [predicate("producerKey", operator)])).toThrow(
        FilterValueMismatchError,
      );
    }
  });

  it("holds equals and not_equals to exactly one value, so in stays a different operator", () => {
    for (const operator of ["equals", "not_equals"] as const) {
      expect(() =>
        validateFilter(SUBSCRIPTION_KEY, [predicate("producerKey", operator, ["a", "b"])]),
      ).toThrow(FilterValueMismatchError);
      expect(
        validateFilter(SUBSCRIPTION_KEY, [predicate("producerKey", operator, ["a"])]),
      ).toHaveLength(1);
    }
  });

  it("refuses more values on one predicate than the ceiling allows", () => {
    const values = Array.from({ length: MAX_FILTER_VALUES + 1 }, (_unused, i) => `producer-${i}`);
    expect(() =>
      validateFilter(SUBSCRIPTION_KEY, [predicate("producerKey", "in", values)]),
    ).toThrow(TooManyFilterValuesError);
  });

  it("refuses a value that is blank once trimmed, which would match nothing forever", () => {
    expect(() =>
      validateFilter(SUBSCRIPTION_KEY, [predicate("producerKey", "in", ["admissions", "  "])]),
    ).toThrow(FilterValueMismatchError);
  });

  it("has an opinion about every operator it declares", () => {
    for (const operator of FILTER_OPERATORS) {
      const values = operator === "present" || operator === "absent" ? [] : ["student-lifecycle"];
      expect(
        validateFilter(SUBSCRIPTION_KEY, [predicate("producerKey", operator, values)]),
      ).toHaveLength(1);
    }
  });
});

describe("matchesFilter", () => {
  it("matches everything when the filter is empty", () => {
    expect(matchesFilter(envelope(), [])).toBe(true);
  });

  it("requires every predicate to hold, not merely one of them", () => {
    const filter = [
      predicate("producerKey", "equals", [PRODUCER_KEY]),
      predicate("eventTypeKey", "equals", ["admissions.application.received"]),
    ];
    expect(matchesFilter(envelope(), filter)).toBe(false);
    expect(matchesFilter(envelope(), [filter[0] as FilterPredicate])).toBe(true);
  });

  it("reads in as membership and equals as identity", () => {
    const members = predicate("producerKey", "in", ["admissions", PRODUCER_KEY]);
    expect(matchesFilter(envelope(), [members])).toBe(true);
    expect(matchesFilter(envelope(), [predicate("producerKey", "in", ["admissions"])])).toBe(false);
  });

  it("matches a prefix against any of the offered prefixes", () => {
    expect(
      matchesFilter(envelope(), [predicate("eventTypeKey", "prefix", ["admissions.", "student-"])]),
    ).toBe(true);
    expect(matchesFilter(envelope(), [predicate("eventTypeKey", "prefix", ["admissions."])])).toBe(
      false,
    );
  });

  it("treats not_equals against an absent attribute as false, not as vacuously true", () => {
    const beginsAChain = envelope({ causationId: null });
    expect(matchesFilter(beginsAChain, [predicate("causationId", "not_equals", ["x"])])).toBe(
      false,
    );
    expect(matchesFilter(envelope(), [predicate("causationId", "not_equals", ["x"])])).toBe(true);
  });

  it("distinguishes a fact that begins a chain from one that continues it", () => {
    const beginsAChain = envelope({ causationId: null });
    expect(matchesFilter(beginsAChain, [predicate("causationId", "absent")])).toBe(true);
    expect(matchesFilter(beginsAChain, [predicate("causationId", "present")])).toBe(false);
    expect(matchesFilter(envelope(), [predicate("causationId", "absent")])).toBe(false);
    expect(matchesFilter(envelope(), [predicate("causationId", "present")])).toBe(true);
  });

  it("compares the schema version as the string the envelope renders", () => {
    expect(matchesFilter(envelope(), [predicate("eventTypeVersion", "equals", ["3"])])).toBe(true);
    expect(matchesFilter(envelope(), [predicate("eventTypeVersion", "equals", ["4"])])).toBe(false);
  });

  it("fails closed on an attribute it cannot read, whatever the operator", () => {
    for (const operator of FILTER_OPERATORS) {
      const values = operator === "present" || operator === "absent" ? [] : ["anything"];
      expect(matchesFilter(envelope(), [predicate("payload.amount", operator, values)])).toBe(
        false,
      );
    }
  });
});

describe("routeEnvelope", () => {
  it("reaches an active subscription on the stream with no filter", () => {
    const verdict = routeEnvelope({ envelope: envelope(), candidates: [candidate()] });
    expect(verdict.streamKey).toBe(STREAM_KEY);
    expect(verdict.reached).toEqual([SUBSCRIPTION_KEY]);
    expect(verdict.decisions).toEqual([
      { subscriptionKey: SUBSCRIPTION_KEY, reached: true, refusal: null },
    ]);
  });

  it("answers every candidate offered, including the ones it refused", () => {
    const verdict = routeEnvelope({
      envelope: envelope(),
      candidates: [
        candidate({ subscriptionKey: "a.elsewhere", streamKey: "admissions.application" }),
        candidate({ subscriptionKey: "b.paused", status: "paused" }),
        candidate({
          subscriptionKey: "c.narrow",
          filter: [predicate("producerKey", "equals", ["admissions"])],
        }),
        candidate({ subscriptionKey: "d.open" }),
      ],
    });

    expect(verdict.decisions.map((entry) => entry.refusal)).toEqual([
      "different_stream",
      "not_deliverable",
      "filtered",
      null,
    ]);
    expect(verdict.reached).toEqual(["d.open"]);
  });

  it("orders decisions by subscription key rather than by the order it was handed them", () => {
    const verdict = routeEnvelope({
      envelope: envelope(),
      candidates: [
        candidate({ subscriptionKey: "reporting.sink" }),
        candidate({ subscriptionKey: "analytics.sink" }),
        candidate({ subscriptionKey: "Archive.sink" }),
      ],
    });
    expect(verdict.decisions.map((entry) => entry.subscriptionKey)).toEqual([
      "Archive.sink",
      "analytics.sink",
      "reporting.sink",
    ]);
  });

  it("reports the most structural refusal when more than one applies", () => {
    const verdict = routeEnvelope({
      envelope: envelope(),
      candidates: [
        candidate({ status: "paused", streamKey: "admissions.application", filter: [] }),
      ],
    });
    expect(verdict.decisions[0]?.refusal).toBe("different_stream");
  });

  it("delivers to exactly the subscription statuses the value objects call deliverable", () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      const verdict = routeEnvelope({
        envelope: envelope(),
        candidates: [candidate({ status })],
      });
      expect(verdict.reached).toHaveLength(isSubscriptionDeliverable(status) ? 1 : 0);
    }
  });

  it("keeps reached and decisions telling the same story", () => {
    const verdict = routeEnvelope({
      envelope: envelope(),
      candidates: [
        candidate({ subscriptionKey: "a.open" }),
        candidate({ subscriptionKey: "b.paused", status: "paused" }),
        candidate({ subscriptionKey: "c.open" }),
      ],
    });
    const derived = verdict.decisions.filter((e) => e.reached).map((e) => e.subscriptionKey);
    expect([...verdict.reached]).toEqual(derived);
    for (const decision of verdict.decisions) {
      expect(decision.reached).toBe(decision.refusal === null);
    }
  });

  it("returns an empty verdict rather than throwing when nothing is subscribed", () => {
    const verdict = routeEnvelope({ envelope: envelope(), candidates: [] });
    expect(verdict.decisions).toEqual([]);
    expect(verdict.reached).toEqual([]);
    expect(Object.isFrozen(verdict)).toBe(true);
  });

  it("decides the same way however many times it is asked", () => {
    const request = {
      envelope: envelope(),
      candidates: [
        candidate({ subscriptionKey: "b.open" }),
        candidate({ subscriptionKey: "a.narrow", filter: [predicate("producerKey", "in", ["x"])] }),
      ],
    };
    expect(routeEnvelope(request)).toEqual(routeEnvelope(request));
  });
});
