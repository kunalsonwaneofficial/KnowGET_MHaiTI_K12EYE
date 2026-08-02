import { isValidIso } from "@knowget/shared";
import type { DomainEvent, ISODateString, Uuid } from "@knowget/types";
import {
  IncompleteEnvelopeError,
  InvalidMeshCountError,
  InvalidMeshInstantError,
  InvalidMeshKeyError,
} from "./errors";
import {
  FIRST_EVENT_TYPE_VERSION,
  MAX_KEY_LENGTH,
  fixedWidthInstant,
  isValidKey,
  normalizeKey,
} from "./mesh-value";
import type { EnvelopeContext, MeshEnvelope } from "./mesh-view";

/**
 * The boundary at which a platform domain event becomes something a mesh is willing to carry.
 *
 * Thirty-six contracts publish `DomainEvent`s today, and they are well-formed for the thing they were built
 * for: an in-process bus, where the tenant is whatever tenant the request was already running under and the
 * correlation is whatever correlation is still on the call stack. Both of those are true right up until the
 * event leaves the process, and then neither is recoverable. A message read by another service three weeks
 * later, or by a replay next year, carries exactly what was written into it and nothing that was ambient when
 * it was written.
 *
 * So this engine does not validate a `DomainEvent`. It **completes** one, and refuses the completion when
 * something the mesh mandates is missing from both the event and the context offered alongside it. The
 * distinction matters because it decides where the strictness lands. Tightening `EventMetadata` so that tenant
 * and correlation were required platform-wide would have been the cleanest possible change and would have
 * broken every existing publisher at once, in service of a package none of them import; completing here breaks
 * nobody and still makes the guarantee unconditional for anything that reaches a governed stream.
 *
 * Three properties are worth stating before the code says them less clearly.
 *
 * **The payload is never read.** `event.payload` is not touched by any line in this file. An envelope describes
 * a fact and does not contain it, so nothing that handles an envelope — a log line, a trace span, a dead
 * letter, a replay plan — can leak content that a stream's retention class never agreed to keep.
 *
 * **Nothing is defaulted that a caller could get wrong silently.** There is exactly one default in the engine,
 * and it is {@link MeshEnvelope.partitionKey} falling back to the aggregate id, which is the value that makes
 * order-per-aggregate work without any publisher having to know that partitions exist. Every other absence is a
 * refusal naming the field, because the alternative to refusing is a message attributed to no tenant that
 * nobody notices until an audit asks which school it belonged to.
 *
 * **A refusal names one field at a time.** The first missing thing throws, rather than a list of everything
 * missing being collected and returned. That is the right shape here and not merely the simpler one: an
 * incomplete envelope is a defect in publishing code rather than a form a human filled in badly, it is found in
 * a test run rather than in production, and a developer fixing one field at a time is not slowed by it.
 */

// --- Field guards ----------------------------------------------------------------

/**
 * The envelope fields that no default can supply, in the order the engine checks them.
 *
 * Enumerated rather than left implicit in the control flow, because this list *is* the mandate the contract
 * describes, and a mandate that exists only as a sequence of `if` statements is one that drifts the first time
 * somebody adds a field and forgets a check. The engine's test walks this array and removes each field in turn,
 * which is what makes the list and the behaviour provably the same thing.
 *
 * Two envelope fields are deliberately absent. `partitionKey` has a default — the aggregate id — so it cannot
 * be missing once the aggregate is present. `causationId` is genuinely optional, because a fact that begins a
 * chain has nothing before it, and it is carried as an explicit `null` rather than as an omission.
 */
export const MANDATORY_ENVELOPE_FIELDS = Object.freeze([
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
] as const);

/** One field of the mesh envelope that a publication has to supply from somewhere. */
export type MandatoryEnvelopeField = (typeof MANDATORY_ENVELOPE_FIELDS)[number];

/**
 * Insist that something arrived, preserving whatever brand it arrived with.
 *
 * Generic over `T extends string` rather than taking a plain `string`, so a `TenantId` goes in and a `TenantId`
 * comes out. Narrowing to `string` here would have forced every call site to cast the brand back on, and a file
 * full of casts is a file in which the one wrong cast is invisible.
 */
const requirePresent = <T extends string>(value: T | undefined, field: string): T => {
  if (value === undefined || value.trim().length === 0) {
    throw new IncompleteEnvelopeError(field);
  }
  return value;
};

/** Insist that an identifier arrived and fits the platform's key grammar, normalised on the way through. */
const requireKey = (value: string | undefined, field: string, kind: string): string => {
  const key = normalizeKey(requirePresent(value, field));
  if (!isValidKey(key)) {
    throw new InvalidMeshKeyError(kind, key);
  }
  return key;
};

/**
 * Insist that an instant arrived, is readable as a moment, and is stored at a fixed width.
 *
 * The normalisation is not cosmetic. Retention sweeps, replay windows and lag bands all compare instants, and
 * some of those comparisons happen lexically in a database column rather than numerically in a process. Two
 * spellings of the same moment sort differently under a text comparison, so the mesh keeps one spelling.
 */
const requireInstant = (value: ISODateString | undefined, field: string): ISODateString => {
  const instant = requirePresent(value, field);
  if (!isValidIso(instant)) {
    throw new InvalidMeshInstantError(field, instant);
  }
  return fixedWidthInstant(instant);
};

/**
 * Insist that the schema version is a version.
 *
 * Absent is a publisher that did not fill the envelope in, and gets the same refusal every other missing field
 * gets. Present but not a whole number at or above the first version is something else entirely: versions are
 * assigned by this platform, so a fractional or negative one means the record was written by something that is
 * not the registry, and {@link InvalidMeshCountError} is non-operational for exactly that reason.
 */
const requireVersion = (value: number | undefined): number => {
  if (value === undefined) {
    throw new IncompleteEnvelopeError("eventTypeVersion");
  }
  if (!Number.isInteger(value) || value < FIRST_EVENT_TYPE_VERSION) {
    throw new InvalidMeshCountError(
      "event type version",
      value,
      `must be a whole number of at least ${FIRST_EVENT_TYPE_VERSION}`,
    );
  }
  return value;
};

/**
 * Settle what the partitioner will hash.
 *
 * The aggregate id is the default because ordering on a mesh is a promise about a partition, and the only
 * ordering an institution needs is that two facts about the same thing keep their sequence — that a withdrawal
 * does not overtake the enrolment it withdraws. A caller may override it, and the case that justifies the
 * option is real: a stream of attendance marks keyed by class rather than by learner keeps a whole register in
 * one partition, which a consumer that writes a session summary needs and a per-learner key would deny it.
 *
 * Unlike every other identifier here it is not held to the key grammar, and that is deliberate rather than
 * lax. A partition key is hashed and never parsed, so its only real obligations are to fit the column and to be
 * the same string every time the same thing is published. Imposing a grammar on it would refuse legitimate
 * external identifiers to no benefit anybody could name.
 */
const partitionKeyFor = (declared: string | undefined, aggregateId: Uuid): string => {
  const offered = (declared ?? "").trim();
  const key = offered.length > 0 ? offered : aggregateId;
  if (key.length > MAX_KEY_LENGTH) {
    throw new InvalidMeshKeyError("partition", key);
  }
  return key;
};

// --- Completion ------------------------------------------------------------------

/**
 * Complete a domain event into a mesh envelope, or refuse it by name.
 *
 * The event supplies what it knows: its type, its schema version, its identity and the moment it occurred. The
 * context supplies what only the mesh boundary knows: which governed stream is carrying it, which capability is
 * publishing it, what it is about, which trace it belongs to, and the moment the mesh accepted it. Tenant,
 * correlation and causation may come from either, because a publisher that already set them in metadata should
 * not have to repeat itself and one that did not must be able to supply them here. The engine does not care
 * which of the two provided a value; it cares only that one of them did.
 *
 * `recordedAt` arrives as an argument for the same reason nothing else in this package reads a clock: an
 * envelope completed from the same event and the same context has to be the same envelope on every node and in
 * every process, including during a replay performed a year after the fact.
 *
 * @throws {IncompleteEnvelopeError} when a field in {@link MANDATORY_ENVELOPE_FIELDS} is absent from both.
 * @throws {InvalidMeshKeyError} when an identifier is present but not usable as a key.
 * @throws {InvalidMeshInstantError} when an instant is present but not readable as a moment in time.
 * @throws {InvalidMeshCountError} when the schema version is present but is not a version.
 */
export function completeEnvelope(event: DomainEvent, context: EnvelopeContext): MeshEnvelope {
  const { metadata } = event;

  const eventId = requirePresent(metadata.eventId, "eventId");
  const eventTypeKey = requireKey(event.type, "eventTypeKey", "event type");
  const eventTypeVersion = requireVersion(metadata.version);

  const tenantId = requirePresent(context.tenantId ?? metadata.tenantId, "tenantId");
  const correlationId = requirePresent(
    context.correlationId ?? metadata.correlationId,
    "correlationId",
  );
  const traceId = requireKey(context.traceId, "traceId", "trace");

  const offeredCausation = context.causationId ?? metadata.causationId;
  const causationId =
    offeredCausation !== undefined && offeredCausation.trim().length > 0 ? offeredCausation : null;

  const aggregateType = requireKey(
    context.aggregate.aggregateType,
    "aggregateType",
    "aggregate type",
  );
  const aggregateId = requirePresent(context.aggregate.aggregateId, "aggregateId");
  const producerKey = requireKey(context.producerKey, "producerKey", "producer");
  const streamKey = requireKey(context.streamKey, "streamKey", "stream");

  return Object.freeze({
    eventId,
    eventTypeKey,
    eventTypeVersion,
    tenantId,
    aggregate: Object.freeze({ aggregateType, aggregateId }),
    producerKey,
    correlationId,
    causationId,
    traceId,
    streamKey,
    partitionKey: partitionKeyFor(context.partitionKey, aggregateId),
    occurredAt: requireInstant(metadata.occurredAt, "occurredAt"),
    recordedAt: requireInstant(context.recordedAt, "recordedAt"),
  });
}
