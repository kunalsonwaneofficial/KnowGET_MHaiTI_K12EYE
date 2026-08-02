import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  EmptyMeshKeyError,
  EmptyStreamEventTypesError,
  EventTypeNotAcceptedError,
  GlobalOrderRequiresSinglePartitionError,
  InvalidMeshKeyError,
  InvalidPartitionCountError,
  InvalidRetentionError,
  InvalidStreamProgressionError,
  MissingPartitionKeyPathError,
  PartitioningFrozenError,
  StreamRetiredError,
  TooManyStreamEventTypesError,
} from "./errors";
import {
  type DefineEventStreamParams,
  type EventStream,
  acceptEventType,
  activateEventStream,
  defineEventStream,
  isEventStreamPublishable,
  pauseEventStream,
  repartitionEventStream,
  retireEventStream,
  reviseStreamRetention,
  streamAcceptsEventType,
  streamPartitioning,
  withdrawEventType,
} from "./event-stream";
import {
  DEFAULT_ORDERING_GUARANTEE,
  DEFAULT_PARTITION_COUNT,
  DEFAULT_PAYLOAD_RETENTION,
  DEFAULT_RETENTION_SECONDS,
  INITIAL_STREAM_STATUS,
  MAX_PARTITION_COUNT,
  MAX_RETENTION_SECONDS,
  MAX_STREAM_EVENT_TYPES,
  MIN_PARTITION_COUNT,
  MIN_RETENTION_SECONDS,
  ORDERING_GUARANTEES,
  PAYLOAD_RETENTIONS,
} from "./mesh-value";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const OPERATOR = "person-1" as Uuid;

const KEY_PATH = "payload.studentId";

const params = (overrides: Partial<DefineEventStreamParams> = {}): DefineEventStreamParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  streamKey: "student-lifecycle.enrolment",
  title: "Enrolment",
  summary: "Every fact recorded about a learner joining, moving within or leaving the institution.",
  partitionKeyPath: KEY_PATH,
  eventTypeKeys: ["student.enrolled", "student.transferred"],
  ...overrides,
});

const drafted = (overrides: Partial<DefineEventStreamParams> = {}): EventStream =>
  defineEventStream(params(overrides));

const active = (overrides: Partial<DefineEventStreamParams> = {}): EventStream =>
  activateEventStream(drafted(overrides), OPERATOR);

const paused = (): EventStream => pauseEventStream(active());

const retired = (): EventStream => retireEventStream(active());

/** As many event type keys as the ceiling permits, plus however many more are asked for. */
const manyKeys = (count: number): readonly string[] =>
  Array.from({ length: count }, (_unused, index) => `student.event-${index}`);

describe("declaring a stream", () => {
  it("starts as a draft, carrying nothing", () => {
    const stream = drafted();

    expect(stream.status).toBe(INITIAL_STREAM_STATUS);
    expect(stream.activatedAt).toBeNull();
    expect(stream.activatedBy).toBeNull();
    expect(stream.retiredAt).toBeNull();
    expect(isEventStreamPublishable(stream)).toBe(false);
  });

  it("takes the conservative default for every setting nobody chose", () => {
    const stream = drafted();

    expect(stream.ordering).toBe(DEFAULT_ORDERING_GUARANTEE);
    expect(stream.partitionCount).toBe(DEFAULT_PARTITION_COUNT);
    expect(stream.retention).toBe(DEFAULT_PAYLOAD_RETENTION);
    expect(stream.retentionSeconds).toBe(DEFAULT_RETENTION_SECONDS);
  });

  it("normalises the stream key and the prose beside it", () => {
    const stream = drafted({
      streamKey: "  Student-Lifecycle.Enrolment  ",
      title: "  Enrolment  ",
      summary: "  Enrolment facts.  ",
    });

    expect(stream.streamKey).toBe("student-lifecycle.enrolment");
    expect(stream.title).toBe("Enrolment");
    expect(stream.summary).toBe("Enrolment facts.");
  });

  it("deduplicates the accepted types and orders them by code point", () => {
    const stream = drafted({
      eventTypeKeys: ["student.transferred", "Student.Enrolled", "student.enrolled"],
    });

    expect(stream.eventTypeKeys).toEqual(["student.enrolled", "student.transferred"]);
  });

  it("accepts every ordering guarantee and payload class the vocabulary names", () => {
    for (const ordering of ORDERING_GUARANTEES) {
      const count = ordering === "global" ? 1 : DEFAULT_PARTITION_COUNT;
      expect(drafted({ ordering, partitionCount: count }).ordering).toBe(ordering);
    }
    for (const retention of PAYLOAD_RETENTIONS) {
      expect(drafted({ retention }).retention).toBe(retention);
    }
  });

  it("drops the key path a stream that promises no order per partition would not use", () => {
    const stream = drafted({ ordering: "none", partitionKeyPath: null });

    expect(stream.partitionKeyPath).toBeNull();
  });

  it("refuses a blank key, and one that does not fit the platform's grammar", () => {
    expect(() => drafted({ streamKey: "   " })).toThrow(EmptyMeshKeyError);
    expect(() => drafted({ streamKey: "student lifecycle" })).toThrow(InvalidMeshKeyError);
    expect(() => drafted({ eventTypeKeys: ["student enrolled"] })).toThrow(InvalidMeshKeyError);
  });

  it("refuses a channel that could never carry anything", () => {
    expect(() => drafted({ eventTypeKeys: [] })).toThrow(EmptyStreamEventTypesError);
  });

  it("refuses a stream carrying more types than a stream should", () => {
    expect(() => drafted({ eventTypeKeys: manyKeys(MAX_STREAM_EVENT_TYPES + 1) })).toThrow(
      TooManyStreamEventTypesError,
    );
    expect(drafted({ eventTypeKeys: manyKeys(MAX_STREAM_EVENT_TYPES) }).eventTypeKeys).toHaveLength(
      MAX_STREAM_EVENT_TYPES,
    );
  });

  it("refuses partitioning the mesh could not honour", () => {
    expect(() => drafted({ partitionCount: MIN_PARTITION_COUNT - 1 })).toThrow(
      InvalidPartitionCountError,
    );
    expect(() => drafted({ partitionCount: MAX_PARTITION_COUNT + 1 })).toThrow(
      InvalidPartitionCountError,
    );
    expect(() => drafted({ ordering: "global", partitionCount: 4 })).toThrow(
      GlobalOrderRequiresSinglePartitionError,
    );
    expect(() => drafted({ partitionKeyPath: null })).toThrow(MissingPartitionKeyPathError);
  });

  it("refuses a retention window outside the range the platform supports", () => {
    expect(() => drafted({ retentionSeconds: MIN_RETENTION_SECONDS - 1 })).toThrow(
      InvalidRetentionError,
    );
    expect(() => drafted({ retentionSeconds: MAX_RETENTION_SECONDS + 1 })).toThrow(
      InvalidRetentionError,
    );
  });
});

describe("repartitioning a stream", () => {
  it("changes all three settings together, while nobody is reading", () => {
    const stream = repartitionEventStream(drafted(), {
      ordering: "global",
      partitionCount: 1,
      partitionKeyPath: null,
    });

    expect(stream.ordering).toBe("global");
    expect(stream.partitionCount).toBe(1);
    expect(stream.partitionKeyPath).toBeNull();
  });

  it("refuses once the stream has left draft, whatever it went on to become", () => {
    const move = { ordering: "none", partitionCount: 4, partitionKeyPath: null } as const;

    expect(() => repartitionEventStream(active(), move)).toThrow(PartitioningFrozenError);
    expect(() => repartitionEventStream(paused(), move)).toThrow(PartitioningFrozenError);
    expect(() => repartitionEventStream(retired(), move)).toThrow(PartitioningFrozenError);
  });

  it("still refuses partitioning the mesh could not honour", () => {
    expect(() =>
      repartitionEventStream(drafted(), {
        ordering: "global",
        partitionCount: 8,
        partitionKeyPath: null,
      }),
    ).toThrow(GlobalOrderRequiresSinglePartitionError);
  });

  it("reads the declaration back in the shape the partitioning engine takes", () => {
    const stream = drafted();
    const declaration = streamPartitioning(stream);

    expect(declaration).toEqual({
      streamKey: stream.streamKey,
      ordering: stream.ordering,
      partitionCount: stream.partitionCount,
      partitionKeyPath: KEY_PATH,
    });
    expect(Object.isFrozen(declaration)).toBe(true);
  });
});

describe("revising what a stream keeps", () => {
  it("is permitted on a live stream, because it binds what the stream carries next", () => {
    const stream = reviseStreamRetention(active(), "full", MIN_RETENTION_SECONDS);

    expect(stream.retention).toBe("full");
    expect(stream.retentionSeconds).toBe(MIN_RETENTION_SECONDS);
    expect(stream.status).toBe("active");
  });

  it("refuses a window outside the range the platform supports", () => {
    expect(() => reviseStreamRetention(active(), "full", 0)).toThrow(InvalidRetentionError);
  });

  it("refuses a retired stream, whose retention is now only a countdown", () => {
    expect(() => reviseStreamRetention(retired(), "none", DEFAULT_RETENTION_SECONDS)).toThrow(
      StreamRetiredError,
    );
  });
});

describe("what a stream accepts", () => {
  it("adds a type on a live stream, invalidating nothing already published", () => {
    const stream = acceptEventType(active(), "Student.Withdrawn");

    expect(stream.eventTypeKeys).toEqual([
      "student.enrolled",
      "student.transferred",
      "student.withdrawn",
    ]);
    expect(streamAcceptsEventType(stream, "  STUDENT.WITHDRAWN  ")).toBe(true);
  });

  it("treats accepting a type twice as a form filled in twice", () => {
    const once = acceptEventType(drafted(), "student.withdrawn");
    const twice = acceptEventType(once, "student.withdrawn");

    expect(twice.eventTypeKeys).toEqual(once.eventTypeKeys);
  });

  it("removes a type it accepted, and refuses one it never did", () => {
    const stream = withdrawEventType(drafted(), "student.transferred");

    expect(stream.eventTypeKeys).toEqual(["student.enrolled"]);
    expect(streamAcceptsEventType(stream, "student.transferred")).toBe(false);
    expect(() => withdrawEventType(stream, "student.transferred")).toThrow(
      EventTypeNotAcceptedError,
    );
  });

  it("refuses to withdraw the last type, leaving a channel that carries nothing", () => {
    const stream = drafted({ eventTypeKeys: ["student.enrolled"] });

    expect(() => withdrawEventType(stream, "student.enrolled")).toThrow(EmptyStreamEventTypesError);
  });

  it("refuses to add beyond the ceiling", () => {
    const stream = drafted({ eventTypeKeys: manyKeys(MAX_STREAM_EVENT_TYPES) });

    expect(() => acceptEventType(stream, "student.enrolled")).toThrow(TooManyStreamEventTypesError);
  });

  it("refuses both on a retired stream, which will carry nothing further", () => {
    expect(() => acceptEventType(retired(), "student.withdrawn")).toThrow(StreamRetiredError);
    expect(() => withdrawEventType(retired(), "student.enrolled")).toThrow(StreamRetiredError);
  });
});

describe("moving a stream through its life", () => {
  it("opens for publication and records who opened it", () => {
    const stream = active();

    expect(stream.status).toBe("active");
    expect(stream.activatedBy).toBe(OPERATOR);
    expect(stream.activatedAt).not.toBeNull();
    expect(isEventStreamPublishable(stream)).toBe(true);
  });

  it("pauses reversibly, and resumes through the same edge", () => {
    const halted = paused();

    expect(halted.status).toBe("paused");
    expect(isEventStreamPublishable(halted)).toBe(false);
    expect(activateEventStream(halted, OPERATOR).status).toBe("active");
  });

  it("keeps the instant it first went live across every pause after it", () => {
    const first = active();
    const resumed = activateEventStream(pauseEventStream(first), "person-2" as Uuid);

    expect(resumed.activatedAt).toBe(first.activatedAt);
    expect(resumed.activatedBy).toBe(OPERATOR);
  });

  it("refuses to activate a stream that is already active", () => {
    expect(() => activateEventStream(active(), OPERATOR)).toThrow(InvalidStreamProgressionError);
  });

  it("refuses to pause a draft, which is not carrying anything to stop", () => {
    expect(() => pauseEventStream(drafted())).toThrow(InvalidStreamProgressionError);
  });

  it("closes permanently, from a draft as readily as from a live stream", () => {
    const withdrawn = retireEventStream(drafted());

    expect(withdrawn.status).toBe("retired");
    expect(withdrawn.retiredAt).toBe(withdrawn.updatedAt);
    expect(retired().status).toBe("retired");
    expect(retireEventStream(paused()).status).toBe("retired");
  });

  it("refuses every move out of retirement", () => {
    expect(() => activateEventStream(retired(), OPERATOR)).toThrow(StreamRetiredError);
    expect(() => pauseEventStream(retired())).toThrow(StreamRetiredError);
    expect(() => retireEventStream(retired())).toThrow(StreamRetiredError);
  });
});
