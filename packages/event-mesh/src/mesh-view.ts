import type { CorrelationId, ISODateString, TenantId, Uuid } from "@knowget/types";
import type { CompatibilityMode, SchemaField, SchemaFieldType } from "./mesh-value";

/**
 * The shapes the mesh's engines take in and hand back.
 *
 * Every type here is a plain record with no behaviour and no identity, which is what lets the engines be tested
 * without a database, a broker, a clock or a network — and, more importantly, what makes this contract's rules
 * enforceable by the type system rather than by review. Two of those rules are visible in the declarations
 * below and are worth stating once rather than at each of them.
 *
 * **Nothing here carries a payload.** A mesh envelope describes a fact completely — who it happened to, in
 * which tenant, under which schema version, on whose authority, at what moment — and contains not one field for
 * the fact's contents. That is deliberate to the point of being the design. An envelope type with a payload
 * field would be logged, traced, echoed into a dead letter and copied into a replay plan, and every one of
 * those is a place a learner's medical note or a staff member's salary would come to rest without anybody
 * deciding that it should. What a stream is permitted to retain is a property of the stream, decided at
 * declaration time, and the aggregates that hold retained content are the only types in this package that carry
 * any.
 *
 * **Every instant is an argument.** {@link EnvelopeContext.recordedAt} is supplied by the caller rather than
 * read from a clock, so an envelope completed from the same event and the same context is byte-for-byte the
 * same envelope on every node, in every process, during a replay a year later. The same discipline runs through
 * the rest of the package's engines, and it is the reason a verdict this platform gave an institution in March
 * can be reproduced in November from the record alone.
 */

// --- Envelopes -------------------------------------------------------------------

/**
 * The thing an event happened to.
 *
 * The contract mandates aggregate identity on every message, and the reason is not tidiness. Ordering on a mesh
 * is a promise about a partition rather than about a stream, and the only ordering an institution actually
 * needs is that two facts about the *same* thing arrive in the order they occurred — that an enrolment is not
 * overtaken by its own withdrawal. Carrying the aggregate makes that promise derivable: the partition key
 * defaults to {@link AggregateReference.aggregateId}, so same-aggregate events land in the same partition
 * without any publisher having to know that partitions exist.
 *
 * `aggregateType` is a key rather than free text because it is read by operators triaging dead letters, and a
 * column holding both `enrolment` and `Enrolment` is a column that has to be normalised at every query.
 */
export interface AggregateReference {
  /** The kind of thing, in the platform's key grammar — for example `student-lifecycle.enrolment`. */
  readonly aggregateType: string;
  /** The identity of the specific thing the event is about. */
  readonly aggregateId: Uuid;
}

/**
 * A domain event completed into everything the mesh mandates before it may be carried.
 *
 * The platform's `EventMetadata` was built for an in-process bus, where the tenant and the correlation are
 * usually implicit in the call stack that is still on the stack. On a mesh neither survives: the event is read
 * by another process, possibly weeks later, possibly during a replay, and by then an envelope missing its
 * tenant is a fact that cannot be attributed to a school while an envelope missing its correlation is a fact
 * that cannot be joined to the request that caused it. This type is where those become non-negotiable, and the
 * envelope engine is the one boundary at which the information still exists to supply them.
 *
 * `causationId` is the one identity here that is legitimately absent, because a fact that begins a chain has
 * nothing before it. It is typed `Uuid | null` rather than optional so that *absent* is a value somebody
 * decided on rather than a property nobody set.
 */
export interface MeshEnvelope {
  readonly eventId: Uuid;
  /** The registered event type, normalised — for example `student-lifecycle.enrolment.confirmed`. */
  readonly eventTypeKey: string;
  /** The schema version this fact was written under; a consumer pins to it. */
  readonly eventTypeVersion: number;
  readonly tenantId: TenantId;
  readonly aggregate: AggregateReference;
  /** The capability that published the fact, for attribution when a stream carries several. */
  readonly producerKey: string;
  readonly correlationId: CorrelationId;
  /** The event this one was caused by, or `null` where this fact begins the chain. */
  readonly causationId: Uuid | null;
  /** The distributed trace this publication belongs to. The mesh stores it and never parses it. */
  readonly traceId: string;
  readonly streamKey: string;
  /** What the partitioning engine hashes. Defaults to the aggregate id, which is what preserves order. */
  readonly partitionKey: string;
  /** When the fact occurred, as the producer observed it. */
  readonly occurredAt: ISODateString;
  /** When the mesh accepted it. Supplied by the caller, because nothing in this package reads a clock. */
  readonly recordedAt: ISODateString;
}

/**
 * What the mesh boundary supplies that a `DomainEvent` cannot.
 *
 * The split between this and the event itself is the whole of decision 3 in ADR-0051 made concrete. Tightening
 * `EventMetadata` so that these were required platform-wide is the technically cleanest answer and it would
 * break thirty-six contracts at once for the benefit of a package none of them import yet; completing the
 * envelope here gets the same enforcement at the only place the mesh can enforce anything, and disturbs no
 * existing publisher.
 *
 * `tenantId`, `correlationId` and `causationId` are optional *here* and mandatory in the envelope, which is not
 * a contradiction: the event's own metadata may already carry them, and the context is where a caller supplies
 * what it did not. Something has to provide each of them, and the engine does not care which.
 */
export interface EnvelopeContext {
  /** The governed stream the fact is being published onto. */
  readonly streamKey: string;
  /** The capability publishing it. */
  readonly producerKey: string;
  /** The trace this publication belongs to. */
  readonly traceId: string;
  /** What the fact is about. */
  readonly aggregate: AggregateReference;
  /** The moment of acceptance, supplied rather than read. */
  readonly recordedAt: ISODateString;
  /** Supplied only when the event's own metadata does not carry it. */
  readonly tenantId?: TenantId;
  /** Supplied only when the event's own metadata does not carry it. */
  readonly correlationId?: CorrelationId;
  /** Supplied only when the event's own metadata does not carry it. */
  readonly causationId?: Uuid;
  /** Overrides the aggregate id as the value the partitioner hashes. Rarely wanted; occasionally necessary. */
  readonly partitionKey?: string;
}

// --- Schema compatibility --------------------------------------------------------

/**
 * One difference between a schema and the version before it.
 *
 * Seven kinds and not three, because requiredness is half of what makes a change breaking and a vocabulary
 * that says only *added*, *removed* and *changed* cannot express the two that matter most: a field that became
 * required, and a field that stopped being. Both are edits to an existing field that leave its name and its
 * type alone, and both break a reader — in opposite directions.
 *
 * The kinds are named from the perspective of the change rather than of its victim, so that the same
 * vocabulary describes a diff nobody is judging and a refusal somebody has to act on.
 */
export type SchemaChangeKind =
  | "added_required"
  | "added_optional"
  | "removed_required"
  | "removed_optional"
  | "tightened"
  | "loosened"
  | "retyped";

/**
 * A single difference, with the sentence an operator will read.
 *
 * `description` is built by the engine rather than by whatever presents the refusal, and that is the point of
 * putting it here. `SchemaIncompatibleError` carries these strings into its details, and the difference between
 * a refusal somebody acts on and one they argue with is the difference between "incompatible" and "removed the
 * required field `learnerId`". A caller that had to compose that sentence itself would compose a different one
 * in each of the places it is shown.
 *
 * `from` and `to` are the field's declared type on either side of the change, `null` where the field did not
 * exist on that side. For a requiredness change both hold the same type, which is exactly what says that the
 * shape did not move and only the promise about it did.
 */
export interface SchemaChange {
  readonly kind: SchemaChangeKind;
  readonly field: string;
  readonly from: SchemaFieldType | null;
  readonly to: SchemaFieldType | null;
  readonly description: string;
}

/** A proposed schema, the one it would stand beside, and the promise the event type made about the pair. */
export interface CompatibilityRequest {
  readonly eventTypeKey: string;
  readonly mode: CompatibilityMode;
  /** The schema of the version already registered. A first version has no predecessor and is not assessed. */
  readonly previous: readonly SchemaField[];
  /** The schema being proposed. */
  readonly next: readonly SchemaField[];
}

/**
 * What the compatibility engine concluded.
 *
 * `changes` is every difference found and `breakingChanges` is the subset the declared mode forbids, which
 * means a `full`-mode assessment and a `none`-mode assessment of the same pair of schemas produce identical
 * `changes` and different verdicts. Keeping both is what lets a registry show an author what they altered even
 * when it is refusing them, and what lets a `none`-mode type still be diffed by anybody reviewing it.
 */
export interface CompatibilityVerdict {
  readonly mode: CompatibilityMode;
  readonly compatible: boolean;
  readonly changes: readonly SchemaChange[];
  /** The `description` of each breaking change, in the order the changes were found. */
  readonly breakingChanges: readonly string[];
}
