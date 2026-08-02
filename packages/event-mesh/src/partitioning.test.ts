import { describe, expect, it } from "vitest";
import {
  EmptyMeshKeyError,
  GlobalOrderRequiresSinglePartitionError,
  InvalidMeshCountError,
  InvalidMeshKeyError,
  InvalidPartitionCountError,
  MissingPartitionKeyPathError,
} from "./errors";
import {
  DEFAULT_PARTITION_COUNT,
  GLOBAL_ORDER_PARTITION_COUNT,
  MAX_KEY_LENGTH,
  MAX_PARTITION_COUNT,
  MIN_PARTITION_COUNT,
  ORDERING_GUARANTEES,
  type OrderingGuarantee,
} from "./mesh-value";
import type { PartitionDeclaration } from "./mesh-view";
import {
  FIRST_PARTITION,
  assignPartition,
  hashPartitionKey,
  partitionFor,
  validatePartitioning,
} from "./partitioning";

const STREAM_KEY = "student-lifecycle.enrolment";
const KEY_PATH = "aggregate.aggregateId";

const declaration = (overrides: Partial<PartitionDeclaration> = {}): PartitionDeclaration => ({
  streamKey: STREAM_KEY,
  ordering: "partition",
  partitionCount: DEFAULT_PARTITION_COUNT,
  partitionKeyPath: KEY_PATH,
  ...overrides,
});

/** A reproducible spread of keys, so distribution claims are checked rather than asserted. */
const sampleKeys = (count: number): readonly string[] =>
  Array.from({ length: count }, (_unused, index) => `learner-${index}`);

describe("hashPartitionKey", () => {
  it("gives the same key the same hash every time it is asked", () => {
    for (const key of sampleKeys(50)) {
      expect(hashPartitionKey(key)).toBe(hashPartitionKey(key));
    }
  });

  it("gives an unsigned 32-bit whole number", () => {
    for (const key of sampleKeys(200)) {
      const hash = hashPartitionKey(key);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("separates keys that differ only in their last character", () => {
    expect(hashPartitionKey("learner-1")).not.toBe(hashPartitionKey("learner-2"));
  });

  it("separates keys that differ only in the order of their characters", () => {
    expect(hashPartitionKey("ab")).not.toBe(hashPartitionKey("ba"));
  });

  it("refuses an empty key rather than hashing the offset basis", () => {
    expect(() => hashPartitionKey("")).toThrow(EmptyMeshKeyError);
  });
});

describe("partitionFor", () => {
  it("lands inside the partition range at every permitted count", () => {
    for (let count = MIN_PARTITION_COUNT; count <= MAX_PARTITION_COUNT; count += 1) {
      for (const key of sampleKeys(20)) {
        const partition = partitionFor(key, count);
        expect(partition).toBeGreaterThanOrEqual(FIRST_PARTITION);
        expect(partition).toBeLessThan(count);
      }
    }
  });

  it("sends everything to the first partition when there is only one", () => {
    for (const key of sampleKeys(20)) {
      expect(partitionFor(key, MIN_PARTITION_COUNT)).toBe(FIRST_PARTITION);
    }
  });

  it("actually spreads a realistic key set across the default count", () => {
    const partitions = new Set(
      sampleKeys(500).map((key) => partitionFor(key, DEFAULT_PARTITION_COUNT)),
    );
    expect(partitions.size).toBe(DEFAULT_PARTITION_COUNT);
  });

  it("refuses a count that could not have come from a validated stream", () => {
    for (const count of [0, -1, 1.5, MAX_PARTITION_COUNT + 1, Number.NaN]) {
      expect(() => partitionFor("learner-1", count)).toThrow(InvalidMeshCountError);
    }
  });
});

describe("validatePartitioning", () => {
  it("accepts a partition-ordered stream that has said what a partition is keyed on", () => {
    const validated = validatePartitioning(declaration());
    expect(validated.partitionCount).toBe(DEFAULT_PARTITION_COUNT);
    expect(validated.partitionKeyPath).toBe(KEY_PATH);
    expect(Object.isFrozen(validated)).toBe(true);
  });

  it("trims the declared key path and reads a blank one as absent", () => {
    expect(
      validatePartitioning(declaration({ partitionKeyPath: `  ${KEY_PATH}  ` })).partitionKeyPath,
    ).toBe(KEY_PATH);
    expect(
      validatePartitioning(declaration({ ordering: "none", partitionKeyPath: "   " }))
        .partitionKeyPath,
    ).toBe(null);
  });

  it("refuses a partition count outside the declared bounds", () => {
    for (const partitionCount of [0, -1, 2.5, MAX_PARTITION_COUNT + 1]) {
      expect(() => validatePartitioning(declaration({ partitionCount }))).toThrow(
        InvalidPartitionCountError,
      );
    }
  });

  it("refuses a globally ordered stream that claims more than one partition", () => {
    expect(() =>
      validatePartitioning(
        declaration({ ordering: "global", partitionCount: GLOBAL_ORDER_PARTITION_COUNT + 1 }),
      ),
    ).toThrow(GlobalOrderRequiresSinglePartitionError);
  });

  it("accepts a globally ordered stream at exactly one partition", () => {
    const validated = validatePartitioning(
      declaration({
        ordering: "global",
        partitionCount: GLOBAL_ORDER_PARTITION_COUNT,
        partitionKeyPath: null,
      }),
    );
    expect(validated.partitionCount).toBe(GLOBAL_ORDER_PARTITION_COUNT);
    expect(validated.partitionKeyPath).toBe(null);
  });

  it("insists on a key path only where the ordering promise depends on one", () => {
    const withoutPath: Record<OrderingGuarantee, boolean> = {
      none: true,
      partition: false,
      global: true,
    };
    for (const ordering of ORDERING_GUARANTEES) {
      const partitionCount =
        ordering === "global" ? GLOBAL_ORDER_PARTITION_COUNT : DEFAULT_PARTITION_COUNT;
      const attempt = (): PartitionDeclaration =>
        validatePartitioning(declaration({ ordering, partitionCount, partitionKeyPath: null }));

      if (withoutPath[ordering]) {
        expect(attempt().partitionKeyPath).toBe(null);
      } else {
        expect(attempt).toThrow(MissingPartitionKeyPathError);
      }
    }
  });

  it("refuses a key path longer than the column that stores it", () => {
    expect(() =>
      validatePartitioning(declaration({ partitionKeyPath: "a".repeat(MAX_KEY_LENGTH + 1) })),
    ).toThrow(InvalidMeshKeyError);
  });
});

describe("assignPartition", () => {
  it("sends every key to the first partition on a globally ordered stream", () => {
    const global = declaration({
      ordering: "global",
      partitionCount: GLOBAL_ORDER_PARTITION_COUNT,
      partitionKeyPath: null,
    });
    for (const key of sampleKeys(50)) {
      const assignment = assignPartition(key, global);
      expect(assignment.partition).toBe(FIRST_PARTITION);
      expect(assignment.partitionCount).toBe(GLOBAL_ORDER_PARTITION_COUNT);
      expect(assignment.ordering).toBe("global");
    }
  });

  it("agrees with the hash it delegates to on a partitioned stream", () => {
    const partitioned = declaration();
    for (const key of sampleKeys(50)) {
      expect(assignPartition(key, partitioned).partition).toBe(
        partitionFor(key, DEFAULT_PARTITION_COUNT),
      );
    }
  });

  it("keeps the same key on the same partition across repeated assignment", () => {
    const partitioned = declaration();
    const first = assignPartition("class-9-b", partitioned);
    const second = assignPartition("class-9-b", partitioned);
    expect(second).toEqual(first);
  });

  it("records the key it hashed, trimmed, so the assignment can be recomputed", () => {
    const assignment = assignPartition("  class-9-b  ", declaration());
    expect(assignment.partitionKey).toBe("class-9-b");
    expect(assignment.partition).toBe(partitionFor("class-9-b", DEFAULT_PARTITION_COUNT));
    expect(Object.isFrozen(assignment)).toBe(true);
  });

  it("refuses a key that is blank once trimmed", () => {
    expect(() => assignPartition("   ", declaration())).toThrow(EmptyMeshKeyError);
  });

  it("refuses a stored global declaration that lost its single-partition constraint", () => {
    const corrupted = declaration({ ordering: "global", partitionCount: 4 });
    expect(() => assignPartition("class-9-b", corrupted)).toThrow(InvalidMeshCountError);
  });

  it("numbers partitions from zero, unlike sequences, which start at one", () => {
    expect(FIRST_PARTITION).toBe(0);
  });
});
