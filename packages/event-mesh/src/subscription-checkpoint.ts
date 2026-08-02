import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { lagBandFor } from "./delivery";
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
  MAX_PARTITION_COUNT,
  MAX_REASON_LENGTH,
  MIN_PARTITION_COUNT,
  MIN_REASON_LENGTH,
  UNCOMMITTED_POSITION,
  isValidKey,
  normalizeKey,
} from "./mesh-value";
import type { LagAssessment } from "./mesh-view";
import { FIRST_PARTITION } from "./partitioning";

/**
 * A checkpoint: how far one subscription has read one partition of one stream.
 *
 * This is the smallest aggregate in the contract and the one with the least room for error. Everything else
 * here can be wrong and be noticed — a binding pointed at the wrong broker stops delivering, a filter that
 * excludes too much produces a consumer that never runs. A checkpoint that is wrong keeps working. It reports a
 * healthy lag while skipping a fortnight of enrolments, or re-delivers a month of fee postings to a consumer
 * whose own logs will say it processed them correctly, because it did.
 *
 * **Per partition, never per subscription.** A subscription reading eight partitions holds eight of these, and
 * the reason is in {@link lagBandFor}'s doc as much as here: a subscription that is level on seven partitions
 * and stopped on the eighth has one dead consumer and a summary figure that reads as healthy. There is no
 * aggregate position anywhere in this package, because the aggregate position is the number that hides the
 * failure.
 *
 * **The position moves forward under {@link commitCheckpoint} and moves any other way under exactly one other
 * operation**, {@link resetSubscriptionCheckpoint}, which takes an actor and a reason and records both. A reset
 * is a legitimate and occasionally urgent thing to do — rewinding after a consumer bug, or skipping past a
 * message that will never be processed — and the governance is not there to discourage it. It is there because
 * the operation is indistinguishable, afterwards, from the accident it resembles, and the record of who chose
 * it is the only thing that tells the two apart.
 *
 * **A commit at the position already held changes nothing at all, including the instant.** That is the subtlest
 * rule in the file and it exists because {@link LagAssessment} calls a subscription `stalled` when its position
 * has not moved for a while. A consumer that re-acknowledges the same batch after every restart, or a worker
 * polling an empty partition, would otherwise keep refreshing an instant that is supposed to record movement,
 * and a partition whose consumer died holding it would read as freshly advanced forever.
 *
 * **Zero is a position and not an absence.** {@link UNCOMMITTED_POSITION} is nought while the first sequence is
 * one, so a subscription that has committed nothing and one that has committed the first message are different
 * records rather than the same null.
 *
 * The stream head arrives as an argument wherever it is needed, because how far a stream has been published is
 * a fact about the message store and this package holds no store. Whether a second checkpoint already exists
 * for this subscription and partition is likewise a question about what else the tenant holds:
 * `DuplicateCheckpointError` belongs to the service that can look.
 */

// --- The aggregate ---------------------------------------------------------------

export interface SubscriptionCheckpoint {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The subscription this position belongs to, by identity, which is what the refusals name. */
  readonly subscriptionId: Uuid;
  /** And by key, so the one query that matters — which partitions are stalled — needs no join to be read. */
  readonly subscriptionKey: string;
  /** The stream being read. Held for the same reason, and because a partition number needs its stream. */
  readonly streamKey: string;
  /** Which partition of that stream, numbered from zero. */
  readonly partition: number;
  /** The last sequence the consumer confirmed, or {@link UNCOMMITTED_POSITION} where it has confirmed none. */
  readonly committedPosition: number;
  /** When the position last actually advanced. Not refreshed by a commit that moves nothing. */
  readonly positionMovedAt: ISODateString;
  /** When the position was last moved by hand rather than by a consumer. Null on a checkpoint never reset. */
  readonly resetAt: ISODateString | null;
  readonly resetBy: Uuid | null;
  /** Why. Kept because the question is asked long after the person who decided has moved on. */
  readonly resetReason: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface OpenSubscriptionCheckpointParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subscriptionId: Uuid;
  readonly subscriptionKey: string;
  readonly streamKey: string;
  readonly partition: number;
  /** How many partitions the stream declares. Supplied because it is what makes the partition checkable. */
  readonly partitionCount: number;
}

export interface ResetCheckpointParams {
  /** Where the position is being moved to. Anywhere from nothing committed to the head, including backwards. */
  readonly position: number;
  /** The highest sequence the stream holds on this partition, so a reset cannot skip past what exists. */
  readonly streamHead: number;
  readonly resetBy: Uuid;
  readonly reason: string;
}

// --- Guards ----------------------------------------------------------------------

/** Normalise a key and refuse it if it is blank or does not fit the platform's grammar. */
function requireKey(kind: string, value: string): string {
  const key = normalizeKey(value);
  if (key.length === 0) throw new EmptyMeshKeyError(kind);
  if (!isValidKey(key)) throw new InvalidMeshKeyError(kind, key);
  return key;
}

/**
 * Refuse a partition that is not one of the stream's, and a partition count no stream record could hold.
 *
 * Two different faults with two different errors, because they have two different culprits. A count outside the
 * platform's range did not come from a validated stream record and is a bookkeeping fault; a number outside a
 * plausible count is a caller opening a checkpoint on a partition the stream does not have, which is an
 * integrator's mistake and is the one an operator can act on.
 */
function requirePartition(streamKey: string, partition: number, partitionCount: number): number {
  if (
    !Number.isInteger(partitionCount) ||
    partitionCount < MIN_PARTITION_COUNT ||
    partitionCount > MAX_PARTITION_COUNT
  ) {
    throw new InvalidMeshCountError(
      "partition count",
      partitionCount,
      `must be a whole number between ${MIN_PARTITION_COUNT} and ${MAX_PARTITION_COUNT}`,
    );
  }
  if (!Number.isInteger(partition) || partition < FIRST_PARTITION || partition >= partitionCount) {
    throw new PartitionOutOfRangeError(streamKey, partition, partitionCount);
  }
  return partition;
}

/**
 * Refuse a position that is not a position.
 *
 * Non-operational, like every count guard here, because neither number is contributed by anybody outside the
 * platform: a consumer commits a sequence this mesh gave it, and a head is read from this mesh's own store.
 */
function requirePosition(name: string, value: number): number {
  if (!Number.isInteger(value) || value < UNCOMMITTED_POSITION) {
    throw new InvalidMeshCountError(
      name,
      value,
      `must be ${UNCOMMITTED_POSITION} or a whole sequence the stream has reached`,
    );
  }
  return value;
}

/** Insist on an explanation long enough to be one and short enough to be a record rather than a document. */
function requireReason(action: string, value: string): string {
  const reason = value.trim();
  if (reason.length < MIN_REASON_LENGTH) {
    throw new ReasonTooShortError(action, reason.length, MIN_REASON_LENGTH);
  }
  if (reason.length > MAX_REASON_LENGTH) {
    throw new ReasonTooLongError(action, reason.length, MAX_REASON_LENGTH);
  }
  return reason;
}

// --- Definition ------------------------------------------------------------------

/**
 * Open a checkpoint at the beginning of a partition.
 *
 * It starts at {@link UNCOMMITTED_POSITION} rather than at the head, and that is the safe direction: a
 * subscription registered today against a stream with a year of history will read the year. The alternative —
 * starting level with the head — is the setting that silently loses everything published before somebody
 * happened to subscribe, and it is available by committing the head immediately, which is a decision on the
 * record rather than a default nobody chose.
 *
 * `positionMovedAt` starts at the moment of opening, which is what {@link LagAssessment} needs: a fresh
 * checkpoint with a lag and no movement yet is idle from when it was created, not from the epoch.
 *
 * @throws {EmptyMeshKeyError} when the subscription or stream key is blank.
 * @throws {InvalidMeshKeyError} when either does not fit the platform's grammar.
 * @throws {InvalidMeshCountError} when the partition count is not one a stream record could hold.
 * @throws {PartitionOutOfRangeError} when the partition is not one of that stream's.
 */
export function openSubscriptionCheckpoint(
  params: OpenSubscriptionCheckpointParams,
): SubscriptionCheckpoint {
  const subscriptionKey = requireKey("subscription", params.subscriptionKey);
  const streamKey = requireKey("stream", params.streamKey);
  const partition = requirePartition(streamKey, params.partition, params.partitionCount);

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    subscriptionId: params.subscriptionId,
    subscriptionKey,
    streamKey,
    partition,
    committedPosition: UNCOMMITTED_POSITION,
    positionMovedAt: now,
    resetAt: null,
    resetBy: null,
    resetReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Record that the consumer has finished with everything up to a sequence.
 *
 * Three outcomes, and the middle one is the interesting one.
 *
 * A position beyond what the checkpoint holds advances it and stamps the movement. A position behind it is
 * refused: the checkpoint is the one number in this contract that an ordinary operation may only ever push
 * forward, and the two commonest causes of a regression both look like nothing from the consumer's side — a
 * worker replaying its own in-flight batch after a restart, and two workers holding the same partition because
 * a lease expired quietly.
 *
 * A position equal to the one already held returns the checkpoint exactly as it arrived, down to the object,
 * so that a caller can write it back or not without either choice changing anything. It is not an error,
 * because re-acknowledging the same batch is what a well-behaved consumer does after a restart, and it does not
 * touch `positionMovedAt`, because that instant records movement and nothing moved. A commit that refreshed it
 * would let a consumer that is doing nothing but polling keep its partition looking freshly advanced, which is
 * exactly the state {@link LagAssessment} exists to notice.
 *
 * The head is checked last, after the regression, because a position both behind the checkpoint and ahead of
 * the stream is a caller with one wrong number rather than two, and the regression is the fault worth naming.
 *
 * @throws {InvalidMeshCountError} when the position or the head is not a whole, non-negative sequence.
 * @throws {CheckpointRegressionError} when the position is behind the one already committed.
 * @throws {CheckpointAheadOfStreamError} when it is beyond the last sequence the stream holds.
 */
export function commitCheckpoint(
  checkpoint: SubscriptionCheckpoint,
  position: number,
  streamHead: number,
): SubscriptionCheckpoint {
  requirePosition("committed position", position);
  requirePosition("stream head", streamHead);

  if (position < checkpoint.committedPosition) {
    throw new CheckpointRegressionError(
      checkpoint.subscriptionId,
      checkpoint.partition,
      checkpoint.committedPosition,
      position,
    );
  }
  if (position === checkpoint.committedPosition) {
    return checkpoint;
  }
  if (position > streamHead) {
    throw new CheckpointAheadOfStreamError(
      checkpoint.subscriptionId,
      checkpoint.partition,
      position,
      streamHead,
    );
  }

  const now = nowIso();
  return { ...checkpoint, committedPosition: position, positionMovedAt: now, updatedAt: now };
}

/**
 * Move the position by hand, with an actor and an explanation on the record.
 *
 * The only operation in this package that may move a checkpoint backwards, and it may equally move it forwards
 * past messages nobody will ever process, which is the same operation wearing different clothes: both are
 * somebody deciding that the mesh's own bookkeeping should be overruled. The governance is the whole of the
 * safeguard, since the effect is otherwise indistinguishable from the two accidents {@link commitCheckpoint}
 * refuses.
 *
 * A reset to the position already held is written rather than ignored, unlike the equivalent commit. It is a
 * decision somebody made and defended, the reason belongs on the record whatever the arithmetic did, and
 * `positionMovedAt` moves because a deliberate reaffirmation of a position is movement in the sense the lag
 * bands care about: somebody has looked.
 *
 * @throws {ReasonTooShortError} when the explanation is shorter than the platform keeps.
 * @throws {ReasonTooLongError} when it is longer than the record stores.
 * @throws {InvalidMeshCountError} when the position or the head is not a whole, non-negative sequence.
 * @throws {CheckpointAheadOfStreamError} when the position is beyond the last sequence the stream holds.
 */
export function resetSubscriptionCheckpoint(
  checkpoint: SubscriptionCheckpoint,
  params: ResetCheckpointParams,
): SubscriptionCheckpoint {
  const reason = requireReason("resetting a checkpoint", params.reason);
  requirePosition("committed position", params.position);
  requirePosition("stream head", params.streamHead);

  if (params.position > params.streamHead) {
    throw new CheckpointAheadOfStreamError(
      checkpoint.subscriptionId,
      checkpoint.partition,
      params.position,
      params.streamHead,
    );
  }

  const now = nowIso();
  return {
    ...checkpoint,
    committedPosition: params.position,
    positionMovedAt: now,
    resetAt: now,
    resetBy: params.resetBy,
    resetReason: reason,
    updatedAt: now,
  };
}

// --- Reading ---------------------------------------------------------------------

/** Whether the consumer has confirmed anything at all, which nought and one cannot be asked to say. */
export const hasCheckpointCommitted = (checkpoint: SubscriptionCheckpoint): boolean =>
  checkpoint.committedPosition !== UNCOMMITTED_POSITION;

/**
 * Read the checkpoint against its stream and name the state it is in.
 *
 * A delegation rather than an implementation, so that the thresholds live in one place and a dashboard, an
 * alert and a support answer cannot disagree about whether a partition is stalled. Both the head and the
 * instant to judge against arrive as arguments: the first because this package holds no message store, the
 * second because nothing here reads a clock on behalf of a caller who may be assessing a moment in the past.
 *
 * @throws {InvalidMeshCountError} when the head is not a whole count, or is behind the committed position, and
 *   every refusal {@link lagBandFor} names.
 */
export function assessCheckpointLag(
  checkpoint: SubscriptionCheckpoint,
  streamHead: number,
  asOf: ISODateString,
): LagAssessment {
  return lagBandFor({
    subscriptionKey: checkpoint.subscriptionKey,
    partition: checkpoint.partition,
    committedPosition: checkpoint.committedPosition,
    streamHead,
    positionMovedAt: checkpoint.positionMovedAt,
    asOf,
  });
}
