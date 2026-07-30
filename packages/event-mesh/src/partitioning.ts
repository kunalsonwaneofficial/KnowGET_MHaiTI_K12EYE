import {
  EmptyMeshKeyError,
  GlobalOrderRequiresSinglePartitionError,
  InvalidMeshCountError,
  InvalidMeshKeyError,
  InvalidPartitionCountError,
  MissingPartitionKeyPathError,
} from "./errors";
import {
  GLOBAL_ORDER_PARTITION_COUNT,
  MAX_KEY_LENGTH,
  MAX_PARTITION_COUNT,
  MIN_PARTITION_COUNT,
} from "./mesh-value";
import type { PartitionAssignment, PartitionDeclaration } from "./mesh-view";

/**
 * The engine that decides where a message lands, and the reason ordering on this mesh is a promise anybody can
 * check.
 *
 * A mesh orders messages within a partition and not across them, so the entire value of the guarantee rests on
 * one property: the same key has to reach the same partition every time, from every node, in every process, for
 * as long as the stream exists. Not usually. Not on a given deployment. Every time — because the first
 * violation is a withdrawal arriving before the enrolment it withdraws, on a consumer holding a record that says
 * that cannot happen.
 *
 * That is why the assignment is an FNV-1a hash of the declared key rather than a counter, a round robin, or
 * anything drawn from a random source. A counter depends on which process is publishing; a round robin depends
 * on how many have published before; and both would put two facts about one learner in two partitions on a busy
 * afternoon and in one on a quiet one. A hash depends on the key and nothing else, which makes the partition a
 * function of the record rather than of the history of the process that wrote it.
 *
 * FNV-1a specifically, and non-cryptographically, for the reason {@link `@knowget/gateway`}'s backoff jitter
 * chose it: nothing here is secret, nobody gains from predicting which partition their own event lands in, and a
 * hash that is four lines of arithmetic is a hash a support engineer can reimplement in a scratch file to settle
 * an argument about where a message went. A cryptographic digest would buy secrecy nobody needs at the cost of
 * an answer nobody can check by hand.
 *
 * Three things this engine deliberately does not do.
 *
 * **It does not read a payload.** It hashes {@link MeshEnvelope.partitionKey}, which the envelope engine has
 * already settled — the aggregate id unless a publisher overrode it. A partitioner that reached into payload
 * fields would be the one component in the package that had to be trusted with content, and it would be on the
 * hot path of every publication.
 *
 * **It does not verify the declared key path.** A stream says what it is keyed on and the mesh records the
 * claim, because verifying it means reading payloads. What the mesh can enforce, and does, is that a stream
 * promising order per partition has said what a partition is keyed on at all — the failure being prevented is a
 * stream that promises ordering, declares nothing, and spreads a learner across eight partitions.
 *
 * **It does not repartition.** There is no function here that moves a stream from eight partitions to sixteen,
 * and its absence is the contract rather than an omission. Everything already published stays where it was
 * while every future key maps somewhere new, so a consumer mid-stream begins finding messages in partitions it
 * has already read past. Nothing errors and the record still claims the stream is ordered. A new stream and a
 * governed migration are the only honest route, which is what {@link PartitioningFrozenError} exists to say.
 */

// --- Hashing ---------------------------------------------------------------------

/**
 * FNV-1a's offset basis and prime, in the 32-bit form.
 *
 * Thirty-two bits rather than sixty-four because the result is immediately taken modulo at most sixty-four
 * partitions, so the extra width buys nothing and `Math.imul` keeps the arithmetic exact without `BigInt`.
 */
const FNV_OFFSET_BASIS = 2_166_136_261;
const FNV_PRIME = 16_777_619;

/**
 * The unsigned 32-bit FNV-1a digest of a partition key.
 *
 * Exported rather than kept private, and the reason is operational rather than architectural. When an
 * institution asks why two facts about one learner arrived out of order, the answer is either *they were in
 * different partitions* or *they were not*, and settling it means recomputing the digest for a key that may no
 * longer be on any live message. A hash somebody can call is a hash somebody can check.
 *
 * @throws {EmptyMeshKeyError} when the key is empty, which would hash to the offset basis and quietly collect
 *   every keyless message into one partition.
 */
export function hashPartitionKey(partitionKey: string): number {
  if (partitionKey.length === 0) {
    throw new EmptyMeshKeyError("partition");
  }
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < partitionKey.length; index += 1) {
    hash = Math.imul(hash ^ partitionKey.charCodeAt(index), FNV_PRIME);
  }
  return hash >>> 0;
}

/**
 * The partition a key maps to, given how many there are.
 *
 * Modulo rather than a rejection loop, and the bias that introduces is worth naming rather than hiding: with a
 * partition count that is not a power of two, the low partitions receive a marginally larger share of the
 * 2^32 possible digests. The excess is under one part in sixty million at the largest count this platform
 * permits, which is smaller than the imbalance any real institution's keys produce on their own — a school with
 * four hundred learners has four hundred keys, not four billion, and their distribution across eight partitions
 * is decided by the keys rather than by the modulus.
 *
 * The guard is {@link InvalidMeshCountError} rather than {@link InvalidPartitionCountError} because by the time
 * a message is being partitioned the count has come from a stream record this package validated on the way in.
 * A bad one here is not an integrator's mistake; it is a row written by something that is not the aggregate.
 *
 * @throws {InvalidMeshCountError} when the count is not a whole number the platform permits.
 * @throws {EmptyMeshKeyError} when there is no key to hash.
 */
export function partitionFor(partitionKey: string, partitionCount: number): number {
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
  return hashPartitionKey(partitionKey) % partitionCount;
}

// --- Declarations ----------------------------------------------------------------

/**
 * The index the first partition takes.
 *
 * Zero, while {@link FIRST_SEQUENCE} is one, and the inconsistency is deliberate in both directions. A partition
 * is an index into a modulus and the arithmetic that produces it yields zero for a whole class of keys; shifting
 * it to be one-based would mean adding one on write and subtracting it on every comparison against a broker that
 * numbers from zero. A sequence is a count of messages, and there is no zeroth message.
 */
export const FIRST_PARTITION = 0;

/**
 * Check a stream's partitioning declaration and hand back a frozen, normalised copy of it.
 *
 * Every rule that couples the three fields is enforced here and nowhere else, which is what stops them from
 * being three independently plausible settings that contradict each other. A stream may be spread across
 * sixty-four partitions or one; it may promise a global order only if it is the latter; and it must say what a
 * partition is keyed on if it promises order within one.
 *
 * The global-order rule is refused rather than reconciled, and both available reconciliations are worse than the
 * refusal. Collapsing the stream to a single partition hands an operator a throughput ceiling they never chose.
 * Downgrading the guarantee to `partition` hands every consumer on the stream a promise the record says they
 * have and the mesh does not keep — and they will find out during the incident the ordering was there for.
 *
 * A key path is normalised to `null` when blank, so that *not declared* is one value rather than three. It is
 * required only under `partition` ordering: `global` is a single partition and orders everything on it by
 * construction, and `none` promises nothing that a key could carry.
 *
 * @throws {InvalidPartitionCountError} when the count is outside the range the platform supports.
 * @throws {GlobalOrderRequiresSinglePartitionError} when a total order is claimed across several partitions.
 * @throws {MissingPartitionKeyPathError} when order per partition is promised without saying keyed on what.
 * @throws {InvalidMeshKeyError} when the declared key path is longer than the column that holds it.
 */
export function validatePartitioning(declaration: PartitionDeclaration): PartitionDeclaration {
  const { streamKey, ordering, partitionCount } = declaration;

  if (
    !Number.isInteger(partitionCount) ||
    partitionCount < MIN_PARTITION_COUNT ||
    partitionCount > MAX_PARTITION_COUNT
  ) {
    throw new InvalidPartitionCountError(
      streamKey,
      partitionCount,
      MIN_PARTITION_COUNT,
      MAX_PARTITION_COUNT,
    );
  }
  if (ordering === "global" && partitionCount !== GLOBAL_ORDER_PARTITION_COUNT) {
    throw new GlobalOrderRequiresSinglePartitionError(streamKey, partitionCount);
  }

  const keyPath = (declaration.partitionKeyPath ?? "").trim();
  if (ordering === "partition" && keyPath.length === 0) {
    throw new MissingPartitionKeyPathError(streamKey, ordering);
  }
  if (keyPath.length > MAX_KEY_LENGTH) {
    throw new InvalidMeshKeyError("partition key path", keyPath);
  }

  return Object.freeze({
    streamKey,
    ordering,
    partitionCount,
    partitionKeyPath: keyPath.length > 0 ? keyPath : null,
  });
}

// --- Assignment ------------------------------------------------------------------

/**
 * Place one message on a stream, under the promise that stream made.
 *
 * A globally ordered stream is not hashed at all. It has one partition, everything on it is already totally
 * ordered, and computing a digest to take it modulo one would be arithmetic performed to reach a foregone
 * conclusion. The count is checked anyway, because a globally ordered record carrying a count other than one is
 * a record the aggregate could not have written, and continuing would spread a stream that promises a total
 * order across partitions that cannot keep it.
 *
 * The assignment carries the key and the modulus alongside the index so that it can be recomputed from itself.
 * A stored partition number is not a checkable claim; a stored key, count and number is.
 *
 * @throws {EmptyMeshKeyError} when the message carries no partition key.
 * @throws {InvalidMeshCountError} when the stream record's partition count is not one the aggregate could have
 *   written, including a count above one on a stream promising a global order.
 */
export function assignPartition(
  partitionKey: string,
  declaration: PartitionDeclaration,
): PartitionAssignment {
  const key = partitionKey.trim();
  if (key.length === 0) {
    throw new EmptyMeshKeyError("partition");
  }

  if (declaration.ordering === "global") {
    if (declaration.partitionCount !== GLOBAL_ORDER_PARTITION_COUNT) {
      throw new InvalidMeshCountError(
        "partition count",
        declaration.partitionCount,
        "must be 1 on a stream promising a global order",
      );
    }
    return Object.freeze({
      partitionKey: key,
      partition: FIRST_PARTITION,
      partitionCount: GLOBAL_ORDER_PARTITION_COUNT,
      ordering: declaration.ordering,
    });
  }

  return Object.freeze({
    partitionKey: key,
    partition: partitionFor(key, declaration.partitionCount),
    partitionCount: declaration.partitionCount,
    ordering: declaration.ordering,
  });
}
