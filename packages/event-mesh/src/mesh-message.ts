import { newUuid, nowIso } from "@knowget/shared";
import type { CorrelationId, ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  InvalidMeshCountError,
  MissingPayloadDigestError,
  PayloadNotRetainedError,
} from "./errors";
import { FIRST_SEQUENCE, type PayloadRetention, isReplayable } from "./mesh-value";
import type { MeshEnvelope, PartitionDeclaration } from "./mesh-view";
import { assignPartition } from "./partitioning";

/**
 * The mesh message: one event, as the mesh holds it.
 *
 * A message is what a stream is made of. The envelope arrived complete from {@link completeEnvelope},
 * the stream said how it partitions, and the service assigned the next sequence; this aggregate turns
 * those three into the row that consumers read, replays re-read, and the retention sweep eventually
 * hollows out. Nothing here decides whether the event was allowed onto the stream. That was settled
 * before the envelope was completed, and re-litigating it at the point of record would let a message
 * be refused for a reason the producer already passed.
 *
 * Four decisions are worth stating, because each of them could reasonably have gone the other way.
 *
 * The partition is computed here rather than supplied. A caller could hand over a
 * {@link PartitionAssignment} it had already obtained, and the aggregate could check that the
 * assignment names the same partition key the envelope carries. But a mismatch between the two is not
 * a condition worth a refusal — it is a condition worth making unrepresentable. Recording the message
 * against a partition computed for a different key would silently break order-per-aggregate, which is
 * the one guarantee a partitioned stream exists to provide, and it would break it in a way no later
 * read could detect. So the aggregate takes the declaration and derives the partition itself from the
 * key the envelope already fixed, and the disagreement cannot be expressed.
 *
 * The tenant comes from the envelope, not from the parameters. A message recorded under a tenant other
 * than the one that produced the event is a cross-tenant leak wearing the shape of an ordinary write,
 * and row-level security would not catch it because the row would carry a tenant the policy accepts.
 * The envelope is the only place the producing tenant is established, so it is the only place this
 * aggregate will read it from.
 *
 * Retention decides what the message keeps, and it decides it by discarding rather than refusing. A
 * publisher on a `none` stream still has a payload — the payload is the event, it exists whether the
 * stream wants it or not — so refusing the call because a payload was offered would force every
 * publisher to learn each stream's retention and strip its own event before handing it over. Storing
 * it instead would mean a stream that promised to keep nothing kept everything. The aggregate takes
 * the payload, keeps it only where retention is `full`, and drops it otherwise; the promise the stream
 * made is kept by the code that records the message rather than by the discipline of every caller. The
 * digest follows the same rule for the same reason: `none` is documented as the envelope only, and a
 * digest is a derivative of the content, so a digest offered to a `none` stream is discarded too.
 *
 * Immutability and sequence uniqueness are somebody else's. There is no operation in this module that
 * edits a recorded message, so {@link MeshMessageImmutableError} has nothing here to guard; and
 * {@link DuplicateSequenceError} asks whether some other row already holds this sequence on this
 * stream, which is a question about the directory rather than about this record. Both are raised by
 * the service that owns the table. What this module guarantees is narrower and worth having on its
 * own: a recorded message is internally consistent with the envelope it came from and with the
 * retention its stream declared.
 */

// --- The aggregate ---------------------------------------------------------------

/**
 * One event as the mesh holds it: the envelope flattened, the partition resolved, the sequence fixed,
 * and as much of the payload as the stream's retention allows the mesh to keep.
 *
 * `recordedAt` and `createdAt` are both instants and they are not the same instant. `recordedAt` came
 * from the envelope and says when the mesh accepted the event, which is the value a replay must
 * reproduce; `createdAt` says when this row was written, which a replay will not reproduce and should
 * not try to. Reading the first where the second was meant is the ordinary way a replay silently
 * stops being a replay.
 */
export interface MeshMessage {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly streamKey: string;
  readonly partition: number;
  readonly partitionCount: number;
  readonly partitionKey: string;
  readonly sequence: number;
  readonly eventId: Uuid;
  readonly eventTypeKey: string;
  readonly eventTypeVersion: number;
  readonly aggregateType: string;
  readonly aggregateId: Uuid;
  readonly producerKey: string;
  readonly correlationId: CorrelationId;
  readonly causationId: Uuid | null;
  readonly traceId: string;
  readonly occurredAt: ISODateString;
  readonly recordedAt: ISODateString;
  readonly retention: PayloadRetention;
  readonly payloadDigest: string | null;
  readonly payload: unknown;
  readonly payloadForgottenAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

/**
 * What recording a message needs beyond the envelope: which organization the stream belongs to, how
 * the stream partitions, which sequence the service assigned, and what the stream keeps.
 *
 * `payloadDigest` and `payload` are optional because a `none` stream needs neither. Supplying either
 * to a stream that does not keep it is not an error — see the module note on discarding rather than
 * refusing — but omitting a digest on a stream that keeps one is, because the digest is the only thing
 * a `digest` stream retains and a message without it retains nothing at all.
 */
export interface RecordMeshMessageParams {
  readonly organizationId: Uuid;
  readonly envelope: MeshEnvelope;
  readonly partitioning: PartitionDeclaration;
  readonly sequence: number;
  readonly retention: PayloadRetention;
  readonly payloadDigest?: string;
  readonly payload?: unknown;
}

// --- Guards ----------------------------------------------------------------------

/**
 * A sequence is the position this message occupies on its stream, so it is a whole number and it
 * starts at {@link FIRST_SEQUENCE}. Zero is reserved: it is the position a checkpoint holds before it
 * has committed anything, and a message sitting at a position no consumer can be behind would make
 * every lag calculation on the stream read one short.
 */
function requireSequence(value: number): number {
  if (!Number.isInteger(value) || value < FIRST_SEQUENCE) {
    throw new InvalidMeshCountError("sequence", value, "must be a whole number of at least 1");
  }
  return value;
}

/**
 * The digest a stream keeps, or `null` where the stream keeps none.
 *
 * A `none` stream discards the digest along with the payload. Every other retention keeps it, and
 * offering a blank one is refused rather than stored, because a `digest` stream whose digest column is
 * empty has recorded that an event happened and nothing whatsoever about what was in it.
 */
function resolveDigest(
  streamKey: string,
  retention: PayloadRetention,
  digest: string | undefined,
): string | null {
  if (retention === "none") return null;
  const trimmed = (digest ?? "").trim();
  if (trimmed.length === 0) throw new MissingPayloadDigestError(streamKey, retention);
  return trimmed;
}

// --- Recording -------------------------------------------------------------------

/**
 * Record one completed envelope as a message on its stream.
 *
 * The tenant, the aggregate, the correlation and the two instants are taken from the envelope, which
 * is the record of what the producer actually published. The partition is derived here from the
 * envelope's partition key and the stream's declaration, so the message cannot be filed against a
 * partition computed for some other key. The payload and its digest are kept only as far as the
 * stream's retention allows.
 *
 * @throws {InvalidMeshCountError} when the sequence is not a whole number of at least 1, and every refusal
 *   {@link assignPartition} names for a blank partition key or a count the stream's ordering forbids.
 * @throws {MissingPayloadDigestError} when a stream that keeps a digest was offered a blank one.
 */
export function recordMeshMessage(params: RecordMeshMessageParams): MeshMessage {
  const envelope = params.envelope;
  const sequence = requireSequence(params.sequence);
  const assignment = assignPartition(envelope.partitionKey, params.partitioning);
  const digest = resolveDigest(envelope.streamKey, params.retention, params.payloadDigest);
  const payload = params.retention === "full" ? (params.payload ?? null) : null;
  const now = nowIso();

  return {
    id: newUuid(),
    tenantId: envelope.tenantId,
    organizationId: params.organizationId,
    streamKey: envelope.streamKey,
    partition: assignment.partition,
    partitionCount: assignment.partitionCount,
    partitionKey: assignment.partitionKey,
    sequence,
    eventId: envelope.eventId,
    eventTypeKey: envelope.eventTypeKey,
    eventTypeVersion: envelope.eventTypeVersion,
    aggregateType: envelope.aggregate.aggregateType,
    aggregateId: envelope.aggregate.aggregateId,
    producerKey: envelope.producerKey,
    correlationId: envelope.correlationId,
    causationId: envelope.causationId,
    traceId: envelope.traceId,
    occurredAt: envelope.occurredAt,
    recordedAt: envelope.recordedAt,
    retention: params.retention,
    payloadDigest: digest,
    payload,
    payloadForgottenAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

// --- Retention -------------------------------------------------------------------

/**
 * Drop a message's payload once the stream's retention window has passed over it.
 *
 * The envelope survives; that is the point of the distinction between a message and its payload. What
 * is left afterwards still says that the event happened, on which stream, at which sequence, and under
 * which correlation, so the audit trail outlives the content it described.
 *
 * A message that has already been hollowed out is returned unchanged rather than stamped again. A
 * sweep that runs twice over the same page would otherwise move `payloadForgottenAt` forward every
 * time, and the one question that column exists to answer — when did we stop holding this — would be
 * answered with the date of the most recent sweep.
 */
export function forgetMeshMessagePayload(message: MeshMessage): MeshMessage {
  if (message.payload === null) return message;
  const now = nowIso();
  return { ...message, payload: null, payloadForgottenAt: now, updatedAt: now };
}

// --- Reading ---------------------------------------------------------------------

/**
 * Whether this message can be replayed with its payload intact.
 *
 * Both halves matter. {@link isReplayable} answers whether the stream ever promised to keep the
 * content, and the payload check answers whether it still holds it — a `full` stream's message becomes
 * unreplayable the moment the retention sweep reaches it, and a replay planned against the promise
 * rather than against the row would be planned against payloads that are already gone.
 */
export function isMeshMessageReplayable(message: MeshMessage): boolean {
  return isReplayable(message.retention) && message.payload !== null;
}

/**
 * The retained payload, or a refusal.
 *
 * Callers that want the payload go through here rather than reading the field, so that the decision
 * {@link isMeshMessageReplayable} describes and the act of reading cannot disagree. A stream that
 * keeps digests only, and a `full` message the sweep has already reached, both refuse identically:
 * from the reader's side there is no useful difference between content that was never kept and content
 * that is no longer held.
 *
 * @throws {PayloadNotRetainedError} when the stream does not keep payloads, or this message's payload
 *   has already been forgotten.
 */
export function meshMessagePayload(message: MeshMessage): unknown {
  if (!isMeshMessageReplayable(message)) {
    throw new PayloadNotRetainedError(message.streamKey, message.retention);
  }
  return message.payload;
}
