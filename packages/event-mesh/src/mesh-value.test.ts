import type { ISODateString } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  BINDING_STATUSES,
  COMPATIBILITY_MODES,
  DEAD_LETTER_REASONS,
  DEAD_LETTER_STATUSES,
  DEFAULT_COMPATIBILITY_MODE,
  DEFAULT_DELIVERY_ATTEMPTS,
  DEFAULT_DELIVERY_SEMANTICS,
  DEFAULT_ORDERING_GUARANTEE,
  DEFAULT_PARTITION_COUNT,
  DEFAULT_PAYLOAD_RETENTION,
  DEFAULT_RETENTION_SECONDS,
  DEFAULT_TRANSPORT_KIND,
  DELIVERY_SEMANTICS,
  DELIVERY_VERDICTS,
  EVENT_TYPE_STATUSES,
  FILTER_OPERATORS,
  FIRST_EVENT_TYPE_VERSION,
  FIRST_SEQUENCE,
  GLOBAL_ORDER_PARTITION_COUNT,
  INITIAL_BINDING_STATUS,
  INITIAL_DEAD_LETTER_STATUS,
  INITIAL_EVENT_TYPE_STATUS,
  INITIAL_REPLAY_STATUS,
  INITIAL_STREAM_STATUS,
  INITIAL_SUBSCRIPTION_STATUS,
  LAG_BANDS,
  LAG_BEHIND_THRESHOLD,
  LAG_STALLED_AFTER_SECONDS,
  MAX_DELIVERY_ATTEMPTS,
  MAX_FILTER_PREDICATES,
  MAX_FILTER_VALUES,
  MAX_KEY_LENGTH,
  MAX_PARTITION_COUNT,
  MAX_REASON_LENGTH,
  MAX_REPLAY_MESSAGES,
  MAX_REPLAY_WINDOW_SECONDS,
  MAX_RETENTION_SECONDS,
  MAX_SCHEMA_FIELDS,
  MAX_STREAM_EVENT_TYPES,
  MIN_DELIVERY_ATTEMPTS,
  MIN_DEPRECATION_NOTICE_DAYS,
  MIN_PARTITION_COUNT,
  MIN_REASON_LENGTH,
  MIN_RETENTION_SECONDS,
  ORDERING_GUARANTEES,
  PAYLOAD_RETENTIONS,
  REPLAY_REFUSAL_REASONS,
  REPLAY_STATUSES,
  SCHEMA_FIELD_TYPES,
  STREAM_STATUSES,
  SUBSCRIPTION_STATUSES,
  TRANSPORT_KINDS,
  TRANSPORT_REF_PROVIDERS,
  UNCOMMITTED_POSITION,
  fixedWidthInstant,
  isBindingCarrying,
  isBindingDraining,
  isEventTypePublishable,
  isEventTypeSchemaEditable,
  isReplayable,
  isStreamPublishable,
  isSubscriptionDeliverable,
  isTerminalBindingStatus,
  isTerminalDeadLetterStatus,
  isTerminalEventTypeStatus,
  isTerminalReplayStatus,
  isTerminalStreamStatus,
  isTerminalSubscriptionStatus,
  isTransportReference,
  isValidKey,
  normalizeKey,
  operatorTakesValues,
  requiresDeduplication,
  requiresRetry,
} from "./mesh-value";

describe("keys", () => {
  it("normalizes by trimming and lowercasing", () => {
    expect(normalizeKey("  Admissions.Application.Submitted  ")).toBe(
      "admissions.application.submitted",
    );
  });

  it("accepts dot, dash and underscore separated lowercase segments", () => {
    expect(isValidKey("enrolments")).toBe(true);
    expect(isValidKey("admissions.application.submitted")).toBe(true);
    expect(isValidKey("student-lifecycle_v2.enrolled")).toBe(true);
    expect(isValidKey("v2")).toBe(true);
  });

  it("refuses empty, over-long, uppercase, separator-edged and doubly-separated keys", () => {
    expect(isValidKey("")).toBe(false);
    expect(isValidKey("a".repeat(MAX_KEY_LENGTH + 1))).toBe(false);
    expect(isValidKey("Admissions")).toBe(false);
    expect(isValidKey(".admissions")).toBe(false);
    expect(isValidKey("admissions.")).toBe(false);
    expect(isValidKey("admissions..submitted")).toBe(false);
    expect(isValidKey("admissions submitted")).toBe(false);
    expect(isValidKey("admissions/submitted")).toBe(false);
  });

  it("accepts a key of exactly the maximum length", () => {
    expect(isValidKey("a".repeat(MAX_KEY_LENGTH))).toBe(true);
  });

  /**
   * The gateway holds capability keys to the same ceiling, and the two packages name overlapping things from
   * opposite sides. A divergence here is a string that fits one surface and not the other.
   */
  it("holds the same key ceiling the gateway does", () => {
    expect(MAX_KEY_LENGTH).toBe(128);
  });
});

describe("instants", () => {
  /**
   * The hazard this exists for: `Z` with no fractional part sorts *after* a millisecond-bearing spelling of a
   * later moment, so a lexical range comparison in the store gets the chronology backwards. Both spellings must
   * come back as the same fixed width.
   */
  it("renders every spelling of one moment at one width", () => {
    const withoutMillis = "2027-03-01T00:00:00Z" as ISODateString;
    const withMillis = "2027-03-01T00:00:00.000Z" as ISODateString;
    expect(fixedWidthInstant(withoutMillis)).toBe("2027-03-01T00:00:00.000Z");
    expect(fixedWidthInstant(withMillis)).toBe("2027-03-01T00:00:00.000Z");
  });

  it("normalizes an offset spelling to UTC", () => {
    expect(fixedWidthInstant("2027-03-01T05:30:00+05:30" as ISODateString)).toBe(
      "2027-03-01T00:00:00.000Z",
    );
  });

  it("makes lexical order agree with chronological order", () => {
    const earlier = fixedWidthInstant("2027-03-01T00:00:00Z" as ISODateString);
    const later = fixedWidthInstant("2027-03-01T00:00:00.500Z" as ISODateString);
    expect(earlier < later).toBe(true);
  });

  it("is idempotent", () => {
    const once = fixedWidthInstant("2027-03-01T00:00:00+00:00" as ISODateString);
    expect(fixedWidthInstant(once)).toBe(once);
  });
});

describe("event-type schemas", () => {
  it("declares seven decidable field types and no schema-language escape hatch", () => {
    expect(SCHEMA_FIELD_TYPES).toHaveLength(7);
    expect(SCHEMA_FIELD_TYPES).toContain("instant");
    expect(SCHEMA_FIELD_TYPES).not.toContain("any");
  });

  it("bounds a schema's field count", () => {
    expect(MAX_SCHEMA_FIELDS).toBe(64);
  });

  it("defaults compatibility to what a subscriber needs", () => {
    expect(COMPATIBILITY_MODES).toContain(DEFAULT_COMPATIBILITY_MODE);
    expect(DEFAULT_COMPATIBILITY_MODE).toBe("backward");
  });

  it("offers no promise only under a mode that has to be chosen by name", () => {
    expect(COMPATIBILITY_MODES).toContain("none");
    expect(DEFAULT_COMPATIBILITY_MODE).not.toBe("none");
  });
});

describe("event-type statuses", () => {
  it("starts a registration in draft", () => {
    expect(EVENT_TYPE_STATUSES).toContain(INITIAL_EVENT_TYPE_STATUS);
    expect(INITIAL_EVENT_TYPE_STATUS).toBe("draft");
  });

  it("treats only retirement as terminal", () => {
    const terminal = EVENT_TYPE_STATUSES.filter(isTerminalEventTypeStatus);
    expect(terminal).toEqual(["retired"]);
  });

  /**
   * Deprecation must keep publishing or nobody ever deprecates anything: the notice period is precisely the
   * window in which events keep flowing while consumers migrate.
   */
  it("keeps publishing a deprecated type and refuses a retired one", () => {
    expect(isEventTypePublishable("published")).toBe(true);
    expect(isEventTypePublishable("deprecated")).toBe(true);
    expect(isEventTypePublishable("draft")).toBe(false);
    expect(isEventTypePublishable("retired")).toBe(false);
  });

  it("freezes the schema of everything except a draft", () => {
    const editable = EVENT_TYPE_STATUSES.filter(isEventTypeSchemaEditable);
    expect(editable).toEqual(["draft"]);
  });

  it("holds deprecation notice to the same floor the gateway holds API contracts to", () => {
    expect(MIN_DEPRECATION_NOTICE_DAYS).toBe(90);
  });

  it("numbers versions from one", () => {
    expect(FIRST_EVENT_TYPE_VERSION).toBe(1);
  });
});

describe("streams", () => {
  it("defaults ordering to the per-partition guarantee", () => {
    expect(ORDERING_GUARANTEES).toContain(DEFAULT_ORDERING_GUARANTEE);
    expect(DEFAULT_ORDERING_GUARANTEE).toBe("partition");
  });

  /**
   * A total order is one partition by construction. The constant exists so that the stream aggregate and the
   * partitioning engine cannot hold different beliefs about what `global` costs.
   */
  it("makes a global order a single partition", () => {
    expect(GLOBAL_ORDER_PARTITION_COUNT).toBe(1);
    expect(GLOBAL_ORDER_PARTITION_COUNT).toBe(MIN_PARTITION_COUNT);
  });

  it("bounds the partition count and defaults inside the bounds", () => {
    expect(MIN_PARTITION_COUNT).toBeLessThan(MAX_PARTITION_COUNT);
    expect(DEFAULT_PARTITION_COUNT).toBeGreaterThanOrEqual(MIN_PARTITION_COUNT);
    expect(DEFAULT_PARTITION_COUNT).toBeLessThanOrEqual(MAX_PARTITION_COUNT);
  });

  it("defaults retention to a digest, so a stream opts into being an archive", () => {
    expect(PAYLOAD_RETENTIONS).toContain(DEFAULT_PAYLOAD_RETENTION);
    expect(DEFAULT_PAYLOAD_RETENTION).toBe("digest");
  });

  it("makes only full retention replayable with a payload", () => {
    const replayable = PAYLOAD_RETENTIONS.filter(isReplayable);
    expect(replayable).toEqual(["full"]);
  });

  it("bounds the retention window and defaults inside the bounds", () => {
    expect(MIN_RETENTION_SECONDS).toBeLessThan(MAX_RETENTION_SECONDS);
    expect(DEFAULT_RETENTION_SECONDS).toBeGreaterThanOrEqual(MIN_RETENTION_SECONDS);
    expect(DEFAULT_RETENTION_SECONDS).toBeLessThanOrEqual(MAX_RETENTION_SECONDS);
  });

  it("caps retention at a year and a day, because forever is not a policy", () => {
    expect(MAX_RETENTION_SECONDS).toBe(366 * 24 * 60 * 60);
  });

  it("starts a stream in draft and treats only retirement as terminal", () => {
    expect(INITIAL_STREAM_STATUS).toBe("draft");
    expect(STREAM_STATUSES.filter(isTerminalStreamStatus)).toEqual(["retired"]);
  });

  /**
   * `paused` accepts nothing and loses nothing. That asymmetry is the whole reason it exists beside `retired`,
   * so the predicate has to exclude it without implying anything was dropped.
   */
  it("accepts publications only while active", () => {
    expect(STREAM_STATUSES.filter(isStreamPublishable)).toEqual(["active"]);
  });

  it("bounds how many event types one stream may accept", () => {
    expect(MAX_STREAM_EVENT_TYPES).toBe(32);
  });
});

describe("transport bindings", () => {
  it("declares the in-process bus and the outbox alongside the swappable backbones", () => {
    expect(TRANSPORT_KINDS).toContain("in_process");
    expect(TRANSPORT_KINDS).toContain("outbox");
    expect(TRANSPORT_KINDS).toContain("kafka");
  });

  it("defaults to the only backbone that is crash-safe without a second system", () => {
    expect(TRANSPORT_KINDS).toContain(DEFAULT_TRANSPORT_KIND);
    expect(DEFAULT_TRANSPORT_KIND).toBe("outbox");
  });

  it("starts a binding declared and treats only retirement as terminal", () => {
    expect(INITIAL_BINDING_STATUS).toBe("declared");
    expect(BINDING_STATUSES.filter(isTerminalBindingStatus)).toEqual(["retired"]);
  });

  it("carries new publications on exactly one state and drains on another", () => {
    expect(BINDING_STATUSES.filter(isBindingCarrying)).toEqual(["active"]);
    expect(BINDING_STATUSES.filter(isBindingDraining)).toEqual(["draining"]);
  });

  it("keeps draining distinct from carrying, which is what makes a swap safe", () => {
    expect(isBindingCarrying("draining")).toBe(false);
    expect(isBindingDraining("active")).toBe(false);
  });
});

describe("transport references", () => {
  it("accepts a handle from every provider a binding may resolve through", () => {
    for (const provider of TRANSPORT_REF_PROVIDERS) {
      expect(isTransportReference(`${provider}:mesh.kafka.primary`)).toBe(true);
    }
  });

  it("names configuration first and omits the key-management service", () => {
    expect(TRANSPORT_REF_PROVIDERS[0]).toBe("config");
    expect(TRANSPORT_REF_PROVIDERS).not.toContain("kms");
  });

  it("refuses a value with no recognised provider prefix", () => {
    expect(isTransportReference("localhost:9092")).toBe(false);
    expect(isTransportReference("bootstrap.servers=broker-1:9092")).toBe(false);
    expect(isTransportReference("config")).toBe(false);
  });

  it("refuses an empty provider or an empty name", () => {
    expect(isTransportReference(":mesh.kafka.primary")).toBe(false);
    expect(isTransportReference("config:")).toBe(false);
    expect(isTransportReference("")).toBe(false);
  });

  /**
   * The two shapes an inlined broker configuration actually takes. Whitespace covers a pasted `sasl.jaas.config`
   * line and a PEM block; `://` covers `kafka://user:password@host`, which is a credential in a URL authority.
   */
  it("refuses anything carrying whitespace or a URL authority", () => {
    expect(isTransportReference("config:mesh kafka primary")).toBe(false);
    expect(isTransportReference("config:key\nmore")).toBe(false);
    expect(isTransportReference("kafka://user:password@broker-1:9092")).toBe(false);
    expect(isTransportReference("env:amqp://guest:guest@rabbit:5672")).toBe(false);
  });

  it("refuses an over-long handle", () => {
    expect(isTransportReference(`config:${"a".repeat(MAX_KEY_LENGTH)}`)).toBe(false);
  });
});

describe("delivery semantics", () => {
  it("promises exactly three deliveries and defaults to the one the outbox already keeps", () => {
    expect(DELIVERY_SEMANTICS).toHaveLength(3);
    expect(DELIVERY_SEMANTICS).toContain(DEFAULT_DELIVERY_SEMANTICS);
    expect(DEFAULT_DELIVERY_SEMANTICS).toBe("at_least_once");
  });

  /**
   * The ledger is a cost, and it is paid because the semantics demand it rather than because a code path
   * happened to. Only one member demands it.
   */
  it("obliges a deduplication ledger only under exactly-once", () => {
    expect(DELIVERY_SEMANTICS.filter(requiresDeduplication)).toEqual(["exactly_once"]);
  });

  it("retries everything except at-most-once", () => {
    expect(DELIVERY_SEMANTICS.filter(requiresRetry)).toEqual(["at_least_once", "exactly_once"]);
  });
});

describe("subscriptions", () => {
  it("starts registered and treats only retirement as terminal", () => {
    expect(INITIAL_SUBSCRIPTION_STATUS).toBe("registered");
    expect(SUBSCRIPTION_STATUSES.filter(isTerminalSubscriptionStatus)).toEqual(["retired"]);
  });

  it("delivers only while active, so a pause makes a deployment safe", () => {
    expect(SUBSCRIPTION_STATUSES.filter(isSubscriptionDeliverable)).toEqual(["active"]);
  });

  it("bounds the attempt ceiling and defaults inside the bounds", () => {
    expect(MIN_DELIVERY_ATTEMPTS).toBeLessThan(MAX_DELIVERY_ATTEMPTS);
    expect(DEFAULT_DELIVERY_ATTEMPTS).toBeGreaterThanOrEqual(MIN_DELIVERY_ATTEMPTS);
    expect(DEFAULT_DELIVERY_ATTEMPTS).toBeLessThanOrEqual(MAX_DELIVERY_ATTEMPTS);
  });

  /**
   * An unbounded attempt count turns a permanently poisonous message into a permanently blocked partition. The
   * ceiling is what converts that into a dead letter naming the message and the reason.
   */
  it("permits at least one attempt and never unlimited attempts", () => {
    expect(MIN_DELIVERY_ATTEMPTS).toBe(1);
    expect(Number.isFinite(MAX_DELIVERY_ATTEMPTS)).toBe(true);
  });
});

describe("filters", () => {
  it("offers six decidable operators and no regular expression", () => {
    expect(FILTER_OPERATORS).toHaveLength(6);
    expect(FILTER_OPERATORS).toContain("prefix");
    expect(FILTER_OPERATORS).not.toContain("regex");
    expect(FILTER_OPERATORS).not.toContain("matches");
  });

  it("draws on values for every operator except presence tests", () => {
    expect(FILTER_OPERATORS.filter((operator) => !operatorTakesValues(operator))).toEqual([
      "present",
      "absent",
    ]);
  });

  it("bounds both the predicate count and the values one predicate may carry", () => {
    expect(MAX_FILTER_PREDICATES).toBe(16);
    expect(MAX_FILTER_VALUES).toBe(32);
  });
});

describe("delivery verdicts", () => {
  it("separates a filtered message from a failed one and from a suppressed duplicate", () => {
    expect(DELIVERY_VERDICTS).toContain("filtered");
    expect(DELIVERY_VERDICTS).toContain("duplicate");
    expect(DELIVERY_VERDICTS).toContain("dead_letter");
    expect(DELIVERY_VERDICTS).toContain("abandoned");
  });

  it("names exactly one verdict that hands the message over", () => {
    expect(DELIVERY_VERDICTS.filter((verdict) => verdict === "deliver")).toEqual(["deliver"]);
  });
});

describe("dead letters", () => {
  /**
   * Every reason has a different remedy, which is the test for whether it deserves its own member: fix the
   * consumer, fix the payload, raise the timeout, register the schema, reconcile versions, wait for the backbone.
   */
  it("closes the reason set rather than accepting free text", () => {
    expect(DEAD_LETTER_REASONS).toHaveLength(7);
    expect(DEAD_LETTER_REASONS).toContain("attempts_exhausted");
    expect(DEAD_LETTER_REASONS).toContain("schema_incompatible");
    expect(DEAD_LETTER_REASONS).not.toContain("other");
  });

  it("starts open and offers two terminal settlements and no delete", () => {
    expect(INITIAL_DEAD_LETTER_STATUS).toBe("open");
    expect(DEAD_LETTER_STATUSES.filter(isTerminalDeadLetterStatus)).toEqual([
      "replayed",
      "discarded",
    ]);
    expect(DEAD_LETTER_STATUSES).not.toContain("deleted");
  });

  it("bounds the explanation a settlement carries", () => {
    expect(MIN_REASON_LENGTH).toBeLessThan(MAX_REASON_LENGTH);
    expect(MIN_REASON_LENGTH).toBe(8);
    expect(MAX_REASON_LENGTH).toBe(1_024);
  });
});

describe("checkpoints and lag", () => {
  /**
   * Zero and one must differ, or a mesh either re-delivers the first message of every stream to every new
   * subscription forever or skips it once, depending on the order two conditions were written in.
   */
  it("distinguishes committing nothing from committing the first message", () => {
    expect(UNCOMMITTED_POSITION).toBe(0);
    expect(FIRST_SEQUENCE).toBe(1);
    expect(UNCOMMITTED_POSITION).toBeLessThan(FIRST_SEQUENCE);
  });

  it("names three lag bands and distinguishes behind from stalled", () => {
    expect(LAG_BANDS).toEqual(["current", "behind", "stalled"]);
  });

  it("holds a message threshold and a staleness threshold, because they bound different failures", () => {
    expect(LAG_BEHIND_THRESHOLD).toBe(1_000);
    expect(LAG_STALLED_AFTER_SECONDS).toBe(900);
  });
});

describe("replay", () => {
  it("starts a request unapproved", () => {
    expect(REPLAY_STATUSES).toContain(INITIAL_REPLAY_STATUS);
    expect(INITIAL_REPLAY_STATUS).toBe("requested");
  });

  /**
   * `rejected` is "we would not" and `failed` is "we could not". Collapsing them would lose the difference an
   * operator needs, so both are terminal and both are separately reachable.
   */
  it("treats every settled state as terminal and leaves the working states open", () => {
    expect(REPLAY_STATUSES.filter(isTerminalReplayStatus)).toEqual([
      "rejected",
      "completed",
      "failed",
      "cancelled",
    ]);
    expect(isTerminalReplayStatus("requested")).toBe(false);
    expect(isTerminalReplayStatus("approved")).toBe(false);
    expect(isTerminalReplayStatus("running")).toBe(false);
  });

  it("gives every refusal a reason the requester can act on", () => {
    expect(REPLAY_REFUSAL_REASONS).toHaveLength(7);
    expect(REPLAY_REFUSAL_REASONS).toContain("payload_not_retained");
    expect(REPLAY_REFUSAL_REASONS).toContain("window_outside_retention");
    expect(REPLAY_REFUSAL_REASONS).not.toContain("invalid");
  });

  it("bounds a replay window by duration and by count", () => {
    expect(MAX_REPLAY_WINDOW_SECONDS).toBe(31 * 24 * 60 * 60);
    expect(MAX_REPLAY_MESSAGES).toBe(100_000);
  });

  /**
   * A replay window can never exceed the widest retention a stream may declare, or the ceiling would permit a
   * request that is refused on arrival for a reason the caller could have been told at declaration time.
   */
  it("keeps the widest replay window inside the widest retention", () => {
    expect(MAX_REPLAY_WINDOW_SECONDS).toBeLessThanOrEqual(MAX_RETENTION_SECONDS);
  });
});

describe("frozen catalogues", () => {
  /**
   * Every union in this module is `Object.freeze`d because they are read at module scope by aggregates, engines
   * and adapters alike, and a mutable shared array is a cross-tenant defect waiting for one `push`.
   */
  it("freezes every union the package publishes", () => {
    const catalogues = [
      BINDING_STATUSES,
      COMPATIBILITY_MODES,
      DEAD_LETTER_REASONS,
      DEAD_LETTER_STATUSES,
      DELIVERY_SEMANTICS,
      DELIVERY_VERDICTS,
      EVENT_TYPE_STATUSES,
      FILTER_OPERATORS,
      LAG_BANDS,
      ORDERING_GUARANTEES,
      PAYLOAD_RETENTIONS,
      REPLAY_REFUSAL_REASONS,
      REPLAY_STATUSES,
      SCHEMA_FIELD_TYPES,
      STREAM_STATUSES,
      SUBSCRIPTION_STATUSES,
      TRANSPORT_KINDS,
      TRANSPORT_REF_PROVIDERS,
    ];
    for (const catalogue of catalogues) {
      expect(Object.isFrozen(catalogue)).toBe(true);
    }
  });
});
