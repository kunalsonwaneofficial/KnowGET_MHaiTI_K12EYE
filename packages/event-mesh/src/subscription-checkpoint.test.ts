import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  CheckpointAheadOfStreamError,
  CheckpointRegressionError,
  EmptyMeshKeyError,
  InvalidMeshCountError,
  InvalidMeshKeyError,
  PartitionOutOfRangeError,
  ReasonTooLongError,
  ReasonTooShortError,
} from "./errors";
import {
  FIRST_SEQUENCE,
  LAG_BEHIND_THRESHOLD,
  LAG_STALLED_AFTER_SECONDS,
  MAX_PARTITION_COUNT,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  UNCOMMITTED_POSITION,
} from "./mesh-value";
import {
  type OpenSubscriptionCheckpointParams,
  type ResetCheckpointParams,
  type SubscriptionCheckpoint,
  assessCheckpointLag,
  commitCheckpoint,
  hasCheckpointCommitted,
  openSubscriptionCheckpoint,
  resetSubscriptionCheckpoint,
} from "./subscription-checkpoint";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const SUBSCRIPTION = "subscription-1" as Uuid;
const OPERATOR = "person-1" as Uuid;
const PARTITION_COUNT = 8;

/** One fixed instant, so no assertion below depends on when the suite happens to run. */
const ASSESSED_AT = "2027-01-02T09:15:00.000Z" as ISODateString;
const MOVED_A_MINUTE_AGO = "2027-01-02T09:14:00.000Z" as ISODateString;
const MOVED_AN_HOUR_AGO = "2027-01-02T08:15:00.000Z" as ISODateString;

const params = (
  overrides: Partial<OpenSubscriptionCheckpointParams> = {},
): OpenSubscriptionCheckpointParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  subscriptionId: SUBSCRIPTION,
  subscriptionKey: "finance.ledger-projector",
  streamKey: "student-lifecycle.enrolment",
  partition: 3,
  partitionCount: PARTITION_COUNT,
  ...overrides,
});

const opened = (
  overrides: Partial<OpenSubscriptionCheckpointParams> = {},
): SubscriptionCheckpoint => openSubscriptionCheckpoint(params(overrides));

const resetParams = (overrides: Partial<ResetCheckpointParams> = {}): ResetCheckpointParams => ({
  position: 100,
  streamHead: 1_000,
  resetBy: OPERATOR,
  reason: "reprocessing after the projector bug shipped in release 4.2",
  ...overrides,
});

/** Backdate the movement instant, since a checkpoint stamps itself from the clock when it moves. */
const movedAt = (
  checkpoint: SubscriptionCheckpoint,
  instant: ISODateString,
): SubscriptionCheckpoint => ({ ...checkpoint, positionMovedAt: instant });

describe("opening a checkpoint", () => {
  it("opens at the beginning of the partition rather than level with the head", () => {
    const checkpoint = opened();

    expect(checkpoint.committedPosition).toBe(UNCOMMITTED_POSITION);
    expect(hasCheckpointCommitted(checkpoint)).toBe(false);
    expect(checkpoint.positionMovedAt).toBe(checkpoint.createdAt);
    expect(checkpoint.resetAt).toBeNull();
    expect(checkpoint.resetBy).toBeNull();
    expect(checkpoint.resetReason).toBeNull();
  });

  it("carries the subscription, the stream and the partition it belongs to", () => {
    const checkpoint = opened();

    expect(checkpoint.tenantId).toBe(TENANT);
    expect(checkpoint.organizationId).toBe(ORG);
    expect(checkpoint.subscriptionId).toBe(SUBSCRIPTION);
    expect(checkpoint.subscriptionKey).toBe("finance.ledger-projector");
    expect(checkpoint.streamKey).toBe("student-lifecycle.enrolment");
    expect(checkpoint.partition).toBe(3);
  });

  it("normalises the keys it is opened against", () => {
    const checkpoint = opened({ subscriptionKey: "  Finance.Ledger-Projector  " });

    expect(checkpoint.subscriptionKey).toBe("finance.ledger-projector");
  });

  it("refuses a blank subscription or stream key", () => {
    expect(() => opened({ subscriptionKey: "   " })).toThrow(EmptyMeshKeyError);
    expect(() => opened({ streamKey: "" })).toThrow(EmptyMeshKeyError);
  });

  it("refuses a key the platform's grammar does not allow", () => {
    expect(() => opened({ subscriptionKey: "finance ledger" })).toThrow(InvalidMeshKeyError);
    expect(() => opened({ streamKey: "student-lifecycle..enrolment" })).toThrow(
      InvalidMeshKeyError,
    );
  });

  it("refuses a partition count no stream record could hold", () => {
    expect(() => opened({ partitionCount: 0 })).toThrow(InvalidMeshCountError);
    expect(() => opened({ partitionCount: MAX_PARTITION_COUNT + 1 })).toThrow(
      InvalidMeshCountError,
    );
    expect(() => opened({ partitionCount: 8.5 })).toThrow(InvalidMeshCountError);
  });

  it("refuses a partition the stream does not have", () => {
    expect(() => opened({ partition: PARTITION_COUNT })).toThrow(PartitionOutOfRangeError);
    expect(() => opened({ partition: -1 })).toThrow(PartitionOutOfRangeError);
    expect(() => opened({ partition: 1.5 })).toThrow(PartitionOutOfRangeError);
  });

  it("opens against every partition the stream declares", () => {
    const partitions = Array.from({ length: PARTITION_COUNT }, (_unused, index) => index);

    for (const partition of partitions) {
      expect(opened({ partition }).partition).toBe(partition);
    }
  });
});

describe("committing a position", () => {
  it("advances the position and records that it moved", () => {
    const checkpoint = opened();
    const advanced = commitCheckpoint(checkpoint, 42, 100);

    expect(advanced.committedPosition).toBe(42);
    expect(hasCheckpointCommitted(advanced)).toBe(true);
    expect(advanced.positionMovedAt).toBe(advanced.updatedAt);
    expect(advanced.id).toBe(checkpoint.id);
  });

  it("accepts a commit level with the head", () => {
    expect(commitCheckpoint(opened(), 100, 100).committedPosition).toBe(100);
  });

  it("accepts the first sequence a stream can hold", () => {
    const advanced = commitCheckpoint(opened(), FIRST_SEQUENCE, FIRST_SEQUENCE);

    expect(advanced.committedPosition).toBe(FIRST_SEQUENCE);
    expect(hasCheckpointCommitted(advanced)).toBe(true);
  });

  it("hands back the same checkpoint when the commit moves nothing", () => {
    const advanced = commitCheckpoint(opened(), 42, 100);

    expect(commitCheckpoint(advanced, 42, 100)).toBe(advanced);
  });

  it("leaves the movement instant alone when a consumer re-acknowledges what it holds", () => {
    const stale = movedAt(commitCheckpoint(opened(), 42, 100), MOVED_AN_HOUR_AGO);

    expect(commitCheckpoint(stale, 42, 100).positionMovedAt).toBe(MOVED_AN_HOUR_AGO);
  });

  it("refuses a position behind the one already committed", () => {
    const advanced = commitCheckpoint(opened(), 42, 100);

    expect(() => commitCheckpoint(advanced, 41, 100)).toThrow(CheckpointRegressionError);
    expect(() => commitCheckpoint(advanced, UNCOMMITTED_POSITION, 100)).toThrow(
      CheckpointRegressionError,
    );
  });

  it("names the regression rather than the head when the caller has both numbers wrong", () => {
    const advanced = commitCheckpoint(opened(), 42, 100);

    expect(() => commitCheckpoint(advanced, 20, 10)).toThrow(CheckpointRegressionError);
  });

  it("refuses a position beyond the last sequence the stream holds", () => {
    expect(() => commitCheckpoint(opened(), 101, 100)).toThrow(CheckpointAheadOfStreamError);
  });

  it("refuses a position or a head that is not a sequence", () => {
    const checkpoint = opened();

    expect(() => commitCheckpoint(checkpoint, -1, 100)).toThrow(InvalidMeshCountError);
    expect(() => commitCheckpoint(checkpoint, 1.5, 100)).toThrow(InvalidMeshCountError);
    expect(() => commitCheckpoint(checkpoint, 10, -1)).toThrow(InvalidMeshCountError);
    expect(() => commitCheckpoint(checkpoint, 10, 10.5)).toThrow(InvalidMeshCountError);
  });
});

describe("resetting a checkpoint", () => {
  it("moves the position backwards and records who chose it and why", () => {
    const advanced = commitCheckpoint(opened(), 900, 1_000);
    const reset = resetSubscriptionCheckpoint(advanced, resetParams());

    expect(reset.committedPosition).toBe(100);
    expect(reset.resetBy).toBe(OPERATOR);
    expect(reset.resetReason).toBe("reprocessing after the projector bug shipped in release 4.2");
    expect(reset.resetAt).toBe(reset.updatedAt);
    expect(reset.positionMovedAt).toBe(reset.updatedAt);
  });

  it("moves the position forwards past messages nobody is going to process", () => {
    const advanced = commitCheckpoint(opened(), 100, 1_000);
    const reset = resetSubscriptionCheckpoint(
      advanced,
      resetParams({ position: 1_000, reason: "skipping the poison batch raised in INC-4471" }),
    );

    expect(reset.committedPosition).toBe(1_000);
  });

  it("resets a subscription back to having committed nothing", () => {
    const advanced = commitCheckpoint(opened(), 900, 1_000);
    const reset = resetSubscriptionCheckpoint(
      advanced,
      resetParams({ position: UNCOMMITTED_POSITION }),
    );

    expect(reset.committedPosition).toBe(UNCOMMITTED_POSITION);
    expect(hasCheckpointCommitted(reset)).toBe(false);
  });

  it("records a reset to the position already held, unlike the equivalent commit", () => {
    const advanced = commitCheckpoint(opened(), 100, 1_000);
    const reset = resetSubscriptionCheckpoint(advanced, resetParams({ position: 100 }));

    expect(reset).not.toBe(advanced);
    expect(reset.committedPosition).toBe(100);
    expect(reset.resetAt).not.toBeNull();
  });

  it("trims the explanation it keeps", () => {
    const reset = resetSubscriptionCheckpoint(
      opened(),
      resetParams({ reason: "   rewound for the enrolment reconciliation   " }),
    );

    expect(reset.resetReason).toBe("rewound for the enrolment reconciliation");
  });

  it("refuses an explanation too short to be one", () => {
    const reason = "x".repeat(MIN_REASON_LENGTH - 1);

    expect(() => resetSubscriptionCheckpoint(opened(), resetParams({ reason }))).toThrow(
      ReasonTooShortError,
    );
  });

  it("refuses an explanation longer than the record stores", () => {
    const reason = "x".repeat(MAX_REASON_LENGTH + 1);

    expect(() => resetSubscriptionCheckpoint(opened(), resetParams({ reason }))).toThrow(
      ReasonTooLongError,
    );
  });

  it("refuses a reset beyond the last sequence the stream holds", () => {
    expect(() => resetSubscriptionCheckpoint(opened(), resetParams({ position: 1_001 }))).toThrow(
      CheckpointAheadOfStreamError,
    );
  });

  it("refuses a position or a head that is not a sequence", () => {
    expect(() => resetSubscriptionCheckpoint(opened(), resetParams({ position: -1 }))).toThrow(
      InvalidMeshCountError,
    );
    expect(() => resetSubscriptionCheckpoint(opened(), resetParams({ streamHead: 1.5 }))).toThrow(
      InvalidMeshCountError,
    );
  });
});

describe("reading a checkpoint against its stream", () => {
  it("reads level when the consumer holds everything the stream does", () => {
    const checkpoint = movedAt(commitCheckpoint(opened(), 100, 100), MOVED_AN_HOUR_AGO);
    const assessment = assessCheckpointLag(checkpoint, 100, ASSESSED_AT);

    expect(assessment.band).toBe("current");
    expect(assessment.lag).toBe(0);
    expect(assessment.subscriptionKey).toBe(checkpoint.subscriptionKey);
    expect(assessment.partition).toBe(checkpoint.partition);
  });

  it("reads behind when the backlog is large and the consumer is still moving", () => {
    const checkpoint = movedAt(commitCheckpoint(opened(), 100, 100), MOVED_A_MINUTE_AGO);
    const head = 100 + LAG_BEHIND_THRESHOLD + 1;

    expect(assessCheckpointLag(checkpoint, head, ASSESSED_AT).band).toBe("behind");
  });

  it("reads stalled when the position has not moved for long enough", () => {
    const checkpoint = movedAt(commitCheckpoint(opened(), 100, 200), MOVED_AN_HOUR_AGO);
    const assessment = assessCheckpointLag(checkpoint, 200, ASSESSED_AT);

    expect(assessment.band).toBe("stalled");
    expect(assessment.lag).toBe(100);
    expect(assessment.idleSeconds).toBeGreaterThanOrEqual(LAG_STALLED_AFTER_SECONDS);
  });

  it("reads current while a small backlog is being worked through", () => {
    const checkpoint = movedAt(commitCheckpoint(opened(), 100, 200), MOVED_A_MINUTE_AGO);

    expect(assessCheckpointLag(checkpoint, 200, ASSESSED_AT).band).toBe("current");
  });
});
