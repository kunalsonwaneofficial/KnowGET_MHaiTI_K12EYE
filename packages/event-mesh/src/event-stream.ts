import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyMeshKeyError,
  EmptyStreamEventTypesError,
  EventTypeNotAcceptedError,
  InvalidMeshKeyError,
  InvalidStreamProgressionError,
  PartitioningFrozenError,
  StreamRetiredError,
  TooManyStreamEventTypesError,
} from "./errors";
import { inspectStreamTransition } from "./lifecycle";
import {
  DEFAULT_ORDERING_GUARANTEE,
  DEFAULT_PARTITION_COUNT,
  DEFAULT_PAYLOAD_RETENTION,
  DEFAULT_RETENTION_SECONDS,
  INITIAL_STREAM_STATUS,
  MAX_STREAM_EVENT_TYPES,
  type OrderingGuarantee,
  type PayloadRetention,
  type StreamStatus,
  compareText,
  isStreamPublishable,
  isValidKey,
  normalizeKey,
} from "./mesh-value";
import type { PartitionDeclaration } from "./mesh-view";
import { validatePartitioning } from "./partitioning";
import { validateRetention } from "./retention";

/**
 * A stream: one named channel, the event types it accepts, the order it promises and how long it keeps what it
 * carried.
 *
 * Where an event type says what a fact looks like, a stream says what happens to it — and the four settings that
 * decide are deliberately on one aggregate rather than spread across a configuration surface, because three of
 * them only mean anything together. A partition count without an ordering guarantee is a throughput number; an
 * ordering guarantee without a key path is a promise nothing keeps; a retention window read apart from the
 * payload class it applies to is a number of seconds attached to nothing. {@link validatePartitioning} holds
 * the rules that couple them and this aggregate is the only thing that calls it.
 *
 * **Partitioning is frozen once the stream leaves draft, and this is the least negotiable rule in the contract.**
 * Changing the partition count re-maps every future key while the messages already published stay where they
 * were, so a consumer that was reading a learner's enrolments in order begins reading half of them from a
 * partition it has already passed. Nothing errors. The events arrive out of order and the record still says they
 * are ordered. A new stream, a new binding and a governed migration are the only honest way to change it.
 *
 * **Retention is not frozen, and that asymmetry is the point.** A window applies to what the stream carries next;
 * the messages already on it keep the expiry they were stamped with, which {@link retentionExpiry} computes at
 * write time for exactly this reason. Shortening a window is therefore a decision about the future rather than a
 * job that quietly deletes a year of history the moment somebody saves the form.
 *
 * **The accepted-type list is what makes a subscription's filter mean anything.** A consumer reasons about the
 * shapes that can appear on the stream it subscribed to, so a stream that accepted anything would put payloads
 * no subscriber has a reader for onto a channel everybody trusts. Types can be added and withdrawn while the
 * stream is live — both are additive from the point of view of what has already been published — but the list
 * can never be emptied, because a stream accepting nothing is a channel that silently carries nothing.
 *
 * `retired` is terminal and refuses publication permanently. It is not a delete: the messages already on the
 * stream stay readable until retention drops them, because retiring a stream is not a licence to lose its
 * history, and a replay of last term is a legitimate thing to ask of a channel that has since been closed.
 *
 * Nothing here checks that a stream key is unused or that an accepted event type is registered. Both are
 * questions about what else the tenant holds; this package keeps no directory of its own streams, and
 * `UnknownEventTypeError` is raised by the service that can actually look.
 */

// --- The aggregate ---------------------------------------------------------------

export interface EventStream {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The channel's name, e.g. `admissions.applications`. Public and immutable. */
  readonly streamKey: string;
  readonly title: string;
  readonly summary: string;
  readonly status: StreamStatus;
  /** What the stream promises about message order. Frozen with the partitioning it depends on. */
  readonly ordering: OrderingGuarantee;
  /** How many partitions the stream is spread across. Exactly one where the ordering is `global`. */
  readonly partitionCount: number;
  /** What a partition is keyed on, e.g. `aggregate.aggregateId`. `null` where nothing was declared. */
  readonly partitionKeyPath: string | null;
  /** What the stream keeps of the messages it carried. Only `full` is replayable with a payload. */
  readonly retention: PayloadRetention;
  /** How long it keeps them, in seconds. Revisable: it binds what the stream carries next. */
  readonly retentionSeconds: number;
  /** The types the stream accepts, deduplicated and in code-point order. Never empty. */
  readonly eventTypeKeys: readonly string[];
  /** When the stream first went live. Kept across a pause, because it is not activated twice. */
  readonly activatedAt: ISODateString | null;
  readonly activatedBy: Uuid | null;
  readonly retiredAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DefineEventStreamParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly streamKey: string;
  readonly title: string;
  readonly summary: string;
  /** Defaults to order within a partition: the guarantee a consumer of one learner's events actually needs. */
  readonly ordering?: OrderingGuarantee;
  readonly partitionCount?: number;
  readonly partitionKeyPath?: string | null;
  /** Defaults to a digest: provable, not reconstructable. A stream opts *into* being an archive. */
  readonly retention?: PayloadRetention;
  readonly retentionSeconds?: number;
  readonly eventTypeKeys: readonly string[];
}

export interface RepartitionEventStreamParams {
  readonly ordering: OrderingGuarantee;
  readonly partitionCount: number;
  readonly partitionKeyPath?: string | null;
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
 * Normalise, deduplicate and order the types a stream accepts, then check the list is one a stream could have.
 *
 * Deduplication rather than refusal, because a repeated key in a submitted list is a form filled in twice and
 * not a decision anybody made; the set is the meaning, and the ceiling is measured against the set so that a
 * list of forty entries naming thirty types is accepted rather than refused for a length it does not have.
 * Ordering is by code point through {@link compareText}, so that two tenants declaring the same types in
 * different orders store the same list and a diff between them reads as empty rather than as a reshuffle.
 *
 * @throws {EmptyMeshKeyError} when one of the keys is blank.
 * @throws {InvalidMeshKeyError} when one of them does not fit the platform's grammar.
 * @throws {EmptyStreamEventTypesError} when nothing is left, so nothing could ever be published.
 * @throws {TooManyStreamEventTypesError} beyond the ceiling, where a stream becomes a bus with a name.
 */
function requireEventTypeKeys(streamKey: string, keys: readonly string[]): readonly string[] {
  const accepted = [...new Set(keys.map((key) => requireKey("event type", key)))].sort(compareText);
  if (accepted.length === 0) {
    throw new EmptyStreamEventTypesError(streamKey);
  }
  if (accepted.length > MAX_STREAM_EVENT_TYPES) {
    throw new TooManyStreamEventTypesError(streamKey, accepted.length, MAX_STREAM_EVENT_TYPES);
  }
  return Object.freeze(accepted);
}

/**
 * Refuse any change to the partitioning of a stream that has left draft.
 *
 * The check is on the status rather than on whether the stream has actually carried anything, and the stricter
 * rule is the cheaper one. *Has it carried a message* is a question about another table, answered a moment
 * before a publisher answers it differently; *is it a draft* is a fact about the row in hand.
 */
function requirePartitioningEditable(stream: EventStream): void {
  if (stream.status !== "draft") {
    throw new PartitioningFrozenError(stream.id, stream.status);
  }
}

/** Refuse a change to a stream that is finished. A retired stream is read, never reconfigured. */
function requireNotRetired(stream: EventStream): void {
  if (stream.status === "retired") {
    throw new StreamRetiredError(stream.id);
  }
}

/**
 * Ask the lifecycle engine whether a status move is permitted, and raise the refusal it names.
 *
 * A retired stream gets its own error, which also covers the engine's `same_status` refusal once the stream is
 * retired. The engine distinguishes a resubmitted request from a finished record because for a stream being
 * paused those have different remedies; for one that has been closed they do not.
 */
function requireStreamTransition(stream: EventStream, to: StreamStatus): void {
  const verdict = inspectStreamTransition(stream.status, to);
  if (verdict.allowed) return;
  if (verdict.refusal === "terminal_status" || stream.status === "retired") {
    throw new StreamRetiredError(stream.id);
  }
  throw new InvalidStreamProgressionError(stream.id, stream.status, to);
}

// --- Definition ------------------------------------------------------------------

/**
 * Declare a stream. It carries nothing until it is activated.
 *
 * The draft state exists for the same reason the partitioning freeze does: the settings that cannot be changed
 * afterwards have to have a state in which they are still being argued about, and it has to be the state a
 * stream is born in. There is no parameter that activates on creation.
 *
 * Every default here is the conservative one. Order within a partition rather than none, because it is the
 * guarantee a consumer of a learner's events actually needs and the one they will otherwise assume they have. A
 * digest rather than the full payload, because a mesh that retains everything by default is an archive of every
 * institutional fact assembled by nobody's decision. Thirty days rather than the ceiling, for the same reason.
 *
 * @throws {EmptyMeshKeyError} when the stream key or one of the event type keys is blank.
 * @throws {InvalidMeshKeyError} when one of them does not fit the platform's grammar, and every partitioning
 *   refusal {@link validatePartitioning} names, and every window refusal {@link validateRetention} names.
 */
export function defineEventStream(params: DefineEventStreamParams): EventStream {
  const streamKey = requireKey("stream", params.streamKey);
  const eventTypeKeys = requireEventTypeKeys(streamKey, params.eventTypeKeys);
  const partitioning = validatePartitioning({
    streamKey,
    ordering: params.ordering ?? DEFAULT_ORDERING_GUARANTEE,
    partitionCount: params.partitionCount ?? DEFAULT_PARTITION_COUNT,
    partitionKeyPath: params.partitionKeyPath ?? null,
  });
  const retentionSeconds = validateRetention(
    streamKey,
    params.retentionSeconds ?? DEFAULT_RETENTION_SECONDS,
  );

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    streamKey,
    title: params.title.trim(),
    summary: params.summary.trim(),
    status: INITIAL_STREAM_STATUS,
    ordering: partitioning.ordering,
    partitionCount: partitioning.partitionCount,
    partitionKeyPath: partitioning.partitionKeyPath,
    retention: params.retention ?? DEFAULT_PAYLOAD_RETENTION,
    retentionSeconds,
    eventTypeKeys,
    activatedAt: null,
    activatedBy: null,
    retiredAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Change how the stream is partitioned, while it is still a draft and nobody is reading it.
 *
 * All three fields together rather than one at a time, because the rules that bind them are checked as a set: a
 * caller lowering the partition count to one and switching to a global order in two operations would be refused
 * halfway through whichever they did first, and would reasonably conclude the combination was unsupported.
 *
 * @throws {PartitioningFrozenError} once the stream has left draft, which is the rule this aggregate exists
 *   for, and every partitioning refusal {@link validatePartitioning} names.
 */
export function repartitionEventStream(
  stream: EventStream,
  params: RepartitionEventStreamParams,
): EventStream {
  requirePartitioningEditable(stream);
  const partitioning = validatePartitioning({
    streamKey: stream.streamKey,
    ordering: params.ordering,
    partitionCount: params.partitionCount,
    partitionKeyPath: params.partitionKeyPath ?? null,
  });
  return {
    ...stream,
    ordering: partitioning.ordering,
    partitionCount: partitioning.partitionCount,
    partitionKeyPath: partitioning.partitionKeyPath,
    updatedAt: nowIso(),
  };
}

/**
 * Change what the stream keeps, and for how long.
 *
 * Permitted on a live stream, unlike partitioning, because the change binds what the stream carries next and the
 * messages already on it keep the expiry they were stamped with. Both fields move together: a window revised
 * without the payload class beside it is how a stream ends up promising a year of replay on a channel that has
 * never kept a payload.
 *
 * @throws {StreamRetiredError} when the stream is finished, and its retention is now only a countdown, and
 *   every window refusal {@link validateRetention} names.
 */
export function reviseStreamRetention(
  stream: EventStream,
  retention: PayloadRetention,
  retentionSeconds: number,
): EventStream {
  requireNotRetired(stream);
  return {
    ...stream,
    retention,
    retentionSeconds: validateRetention(stream.streamKey, retentionSeconds),
    updatedAt: nowIso(),
  };
}

/**
 * Accept an event type onto the stream.
 *
 * Adding is safe on a live stream: nothing already published becomes invalid, and no subscription's filter stops
 * meaning what it meant. Accepting a type the stream already accepts is not an error — the accepted list is a
 * set, and a form submitted twice is not a decision to refuse.
 *
 * @throws {StreamRetiredError} when the stream is finished, and will carry nothing further of any type.
 * @throws {TooManyStreamEventTypesError} beyond the ceiling, where the honest modelling is several streams.
 */
export function acceptEventType(stream: EventStream, eventTypeKey: string): EventStream {
  requireNotRetired(stream);
  const key = requireKey("event type", eventTypeKey);
  return {
    ...stream,
    eventTypeKeys: requireEventTypeKeys(stream.streamKey, [...stream.eventTypeKeys, key]),
    updatedAt: nowIso(),
  };
}

/**
 * Stop accepting an event type on the stream.
 *
 * Withdrawing a type the stream never accepted is refused rather than absorbed, because the caller believes
 * something about this stream that is not true and the two ways they got there — a typo, or the wrong stream —
 * are both worth finding out about now rather than when the publications they meant to stop keep arriving.
 *
 * @throws {StreamRetiredError} when the stream is finished.
 * @throws {EventTypeNotAcceptedError} when the stream does not accept the type being withdrawn.
 * @throws {EmptyStreamEventTypesError} when it was the last one, leaving a channel that carries nothing.
 */
export function withdrawEventType(stream: EventStream, eventTypeKey: string): EventStream {
  requireNotRetired(stream);
  const key = requireKey("event type", eventTypeKey);
  if (!stream.eventTypeKeys.includes(key)) {
    throw new EventTypeNotAcceptedError(stream.streamKey, key);
  }
  const remaining = stream.eventTypeKeys.filter((accepted) => accepted !== key);
  return {
    ...stream,
    eventTypeKeys: requireEventTypeKeys(stream.streamKey, remaining),
    updatedAt: nowIso(),
  };
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Open the stream for publication, from `draft` or from `paused`.
 *
 * One operation for both, and the alternative was two names for one edge. Resuming a paused stream and opening a
 * new one differ in exactly nothing the mesh does afterwards, and a separate `resume` would have to either
 * repeat this or refuse a transition the lifecycle permits. What the two cases do differ in is recorded rather
 * than branched on: `activatedAt` and `activatedBy` are stamped on the first activation and kept across every
 * pause after it, because *when did this stream go live* is a question about the channel and not about the most
 * recent time somebody unpaused it.
 *
 * @throws {StreamRetiredError} when the stream is finished.
 * @throws {InvalidStreamProgressionError} when it is already active, which is a request nobody meant to make.
 */
export function activateEventStream(stream: EventStream, activatedBy: Uuid): EventStream {
  requireStreamTransition(stream, "active");
  const now = nowIso();
  return {
    ...stream,
    status: "active",
    activatedAt: stream.activatedAt ?? now,
    activatedBy: stream.activatedBy ?? activatedBy,
    updatedAt: now,
  };
}

/**
 * Stop accepting publications, and lose nothing already published.
 *
 * The state an operator wants while a downstream is repaired, and the reason it exists as a status rather than
 * as a retirement somebody intends to undo: pausing is reversible and retiring is not, and an operator under
 * pressure at two in the morning should not have to know that the difference is permanent.
 */
export function pauseEventStream(stream: EventStream): EventStream {
  requireStreamTransition(stream, "paused");
  return { ...stream, status: "paused", updatedAt: nowIso() };
}

/**
 * Close the stream permanently.
 *
 * Terminal, and not a delete. What was published stays readable until retention drops it, so a replay of last
 * term over a channel that has since been closed is a legitimate request with a legitimate answer. Reachable
 * from every other state, including `draft`, which is how a stream that will never carry anything is withdrawn.
 */
export function retireEventStream(stream: EventStream): EventStream {
  requireStreamTransition(stream, "retired");
  const now = nowIso();
  return { ...stream, status: "retired", retiredAt: now, updatedAt: now };
}

// --- Reading ---------------------------------------------------------------------

/** Accepting publications: active, and nothing else. */
export const isEventStreamPublishable = (stream: EventStream): boolean =>
  isStreamPublishable(stream.status);

/** Whether the stream accepts a type, asked with a key in whatever form the caller happens to hold it. */
export const streamAcceptsEventType = (stream: EventStream, eventTypeKey: string): boolean =>
  stream.eventTypeKeys.includes(normalizeKey(eventTypeKey));

/**
 * The stream's partitioning, in the shape the partitioning engine takes.
 *
 * Exists so that a publisher assigning a message to a partition reads the declaration off the stream record
 * rather than assembling one from three fields at the call site, which is where the three would drift apart.
 */
export const streamPartitioning = (stream: EventStream): PartitionDeclaration =>
  Object.freeze({
    streamKey: stream.streamKey,
    ordering: stream.ordering,
    partitionCount: stream.partitionCount,
    partitionKeyPath: stream.partitionKeyPath,
  });
