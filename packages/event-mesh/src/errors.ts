import { PlatformError } from "@knowget/exceptions";

/**
 * The domain error model for Event Mesh, Streaming & Messaging. Every failure this contract can produce is a
 * typed, operational error carrying a stable code, an HTTP status and structured details — never a bare string
 * and never a boolean that a caller has to interpret.
 *
 * A mesh's errors have a property that a domain's do not: most of them are raised at *configuration* time and
 * paid at *runtime*, by somebody else. Nobody experiences a mis-declared stream when they declare it. The
 * experience arrives weeks later as a consumer that receives nothing, a partition that stopped advancing, or a
 * replay that cannot be performed because the payload was never kept. That asymmetry is the argument for making
 * these refusals loud and specific at the only moment anybody is looking: the moment the declaration is made.
 *
 * Five groups do most of the work, and each is a rule from the contract made unignorable:
 *
 * - {@link EventTypeSchemaFrozenError} and {@link SchemaIncompatibleError} are *a published shape is a promise*.
 *   The first says the schema a consumer wrote their reader against cannot change under them; the second says a
 *   new version cannot break the compatibility mode the type declared. Together they are the difference between
 *   a schema registry and a table of schemas.
 * - {@link PayloadNotRetainedError} is the refusal that keeps the mesh from becoming an undeclared archive. A
 *   stream that declared it keeps no payload cannot be asked for one later, and the request fails rather than
 *   quietly succeeding with an empty body — because a replay that delivers envelopes with no payloads looks like
 *   a successful replay to everything except the consumer.
 * - {@link CheckpointRegressionError} protects the one number in this contract that must only ever move
 *   forward. A checkpoint that can go backwards by accident is a mesh that re-delivers arbitrary history at
 *   arbitrary times, and the symptom is not an error but a duplicate storm nobody can date.
 * - {@link SelfApprovedReplayError} and {@link ReplayNotApprovedError} are the two halves of *replay is
 *   governed*. Re-delivering a month of enrolment events to a consumer that is not idempotent re-sends a month
 *   of emails; the safeguard is that somebody other than the requester agreed, on the record, in advance.
 * - {@link PlaintextTransportCredentialError} is the one refusal here that protects somebody other than the
 *   caller. A binding to a broker is precisely where a connection string with a password in it gets pasted, and
 *   nobody has ever decided to store one — a field typed `string` accepts what was pasted, and the value reaches
 *   a row, a backup and a log before anybody reads the field's name.
 *
 * Two structural choices are worth defending. The key errors are parameterised by `kind` rather than written out
 * once per aggregate, because all six key spaces in this package share one grammar, one length and one
 * normalisation; six identical classes would be six places to update and six chances to miss one. And the
 * non-operational guards at the end are raised rather than clamped, on the argument the gateway's arithmetic
 * guards make: a clamped count still produces a verdict, and that verdict goes on to dead-letter a message or
 * declare a subscription healthy, so absorbing the defect costs an institution a decision nobody can audit.
 */

// --- Keys and references ---------------------------------------------------------

/** A key arrived empty, or as nothing but whitespace. */
export class EmptyMeshKeyError extends PlatformError {
  constructor(kind: string) {
    super(`A ${kind} key is required and cannot be blank`, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      isOperational: true,
      details: { kind },
    });
  }
}

/**
 * A key does not fit the platform's grammar.
 *
 * The offending value travels in the details, which is safe because a key is an identifier the caller chose and
 * never a secret — and necessary, because "invalid key" without the key is the least actionable message an
 * integration can receive.
 */
export class InvalidMeshKeyError extends PlatformError {
  constructor(kind: string, value: string) {
    super(
      `"${value}" is not a valid ${kind} key; use lowercase alphanumeric segments separated by ".", "-" or "_"`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 400,
        isOperational: true,
        details: { kind, value },
      },
    );
  }
}

/** An instant arrived in a form the platform cannot read as a moment in time. */
export class InvalidMeshInstantError extends PlatformError {
  constructor(field: string, value: string) {
    super(`"${field}" must be an ISO-8601 instant; "${value}" is not one`, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      isOperational: true,
      details: { field, value },
    });
  }
}

/** A governance explanation was shorter than the platform accepts for a decision that outlives its author. */
export class ReasonTooShortError extends PlatformError {
  constructor(action: string, length: number, minimum: number) {
    super(`A reason for ${action} must be at least ${minimum} characters; ${length} were given`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { action, length, minimum },
    });
  }
}

/** A governance explanation exceeded the length the platform stores; the record is not the document. */
export class ReasonTooLongError extends PlatformError {
  constructor(action: string, length: number, maximum: number) {
    super(`A reason for ${action} may be at most ${maximum} characters; ${length} were given`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { action, length, maximum },
    });
  }
}

// --- Event types and schemas -----------------------------------------------------

/** The requested event type definition does not exist in the current tenant. */
export class EventTypeDefinitionNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Event type definition "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/**
 * Something referred to an event type the registry does not hold.
 *
 * Separate from {@link EventTypeDefinitionNotFoundError} because the two arrive from opposite directions and have
 * different remedies. That one is an operator fetching a record by id. This one is a stream declaring that it
 * accepts a type, or a subscription asking to receive one, and the type was never registered — which without
 * this refusal is not an error at all but a stream that silently carries nothing and a subscription that is
 * permanently, quietly empty.
 */
export class UnknownEventTypeError extends PlatformError {
  constructor(eventTypeKey: string) {
    super(`No event type "${eventTypeKey}" is registered in this tenant`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { eventTypeKey },
    });
  }
}

/** One event type cannot register the same major version twice; the version is what a consumer pins to. */
export class DuplicateEventTypeVersionError extends PlatformError {
  constructor(eventTypeKey: string, version: number) {
    super(`Event type "${eventTypeKey}" already has a definition at version ${version}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { eventTypeKey, version },
    });
  }
}

/**
 * A version was registered out of sequence.
 *
 * Versions are consecutive and major-only, which is a stricter rule than a registry strictly needs and a much
 * cheaper one to hold. A gap says either that a version was registered and lost or that somebody is numbering by
 * hand, and both are discovered by a replayer walking versions to work out which reader to use.
 */
export class NonSequentialEventTypeVersionError extends PlatformError {
  constructor(eventTypeKey: string, expected: number, given: number) {
    super(`Event type "${eventTypeKey}" expects version ${expected} next, not ${given}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { eventTypeKey, expected, given },
    });
  }
}

/**
 * Somebody tried to change the schema of an event type version that has been published.
 *
 * This is the registry's central promise enforced at the one place it can be. A published schema is the document
 * a consumer wrote their reader against, and editing it does not update their reader — it makes their reader
 * wrong, silently, at the moment the next event arrives. Every change of shape is a new version beside the old
 * one, and the old one keeps flowing until it is deprecated on notice. There is no flag for a small change:
 * *small* is a judgement made by the person changing it and experienced by somebody else.
 */
export class EventTypeSchemaFrozenError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Event type definition "${id}" is ${status}; its schema can no longer be edited`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/** The requested event type status change is not a move the lifecycle permits. */
export class InvalidEventTypeProgressionError extends PlatformError {
  constructor(id: string, from: string, to: string) {
    super(`Event type definition "${id}" cannot move from ${from} to ${to}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, from, to },
    });
  }
}

/** The event type version is retired; nothing moves it again. */
export class EventTypeRetiredError extends PlatformError {
  constructor(id: string) {
    super(`Event type definition "${id}" is retired`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/**
 * A publication named an event type version that the mesh does not carry.
 *
 * `422` and not a silent drop, which is the whole reason the check exists. A mesh that accepted publications of
 * unregistered or retired types would carry them to nobody, and the producer would have no way to tell the
 * difference between an event with no subscribers and an event the mesh refused.
 */
export class EventTypeNotPublishableError extends PlatformError {
  constructor(eventTypeKey: string, version: number, status: string) {
    super(`Event type "${eventTypeKey}" version ${version} is ${status} and is not carried`, {
      code: "CONFLICT",
      httpStatus: 422,
      isOperational: true,
      details: { eventTypeKey, version, status },
    });
  }
}

/** A schema was registered with no fields, which validates everything and describes nothing. */
export class EmptySchemaError extends PlatformError {
  constructor(eventTypeKey: string) {
    super(`The schema for event type "${eventTypeKey}" must declare at least one field`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { eventTypeKey },
    });
  }
}

/** A schema declared more fields than the platform compares; beyond this it is a record, not an event. */
export class TooManySchemaFieldsError extends PlatformError {
  constructor(eventTypeKey: string, count: number, maximum: number) {
    super(`The schema for "${eventTypeKey}" declares ${count} fields; the maximum is ${maximum}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { eventTypeKey, count, maximum },
    });
  }
}

/**
 * One schema declared the same field name twice.
 *
 * Refused rather than deduplicated, because the two declarations usually disagree about the type or the
 * requiredness, and silently keeping one of them makes the compatibility engine's answer depend on which.
 */
export class DuplicateSchemaFieldError extends PlatformError {
  constructor(eventTypeKey: string, fieldName: string) {
    super(`The schema for "${eventTypeKey}" declares "${fieldName}" more than once`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { eventTypeKey, fieldName },
    });
  }
}

/** A schema field name is not usable as a payload attribute. */
export class InvalidSchemaFieldNameError extends PlatformError {
  constructor(eventTypeKey: string, fieldName: string) {
    super(`"${fieldName}" is not a usable field name in the schema for "${eventTypeKey}"`, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      isOperational: true,
      details: { eventTypeKey, fieldName },
    });
  }
}

/**
 * A new version's schema breaks the compatibility mode its event type declared.
 *
 * The itemised changes travel in the details rather than only in the message, and that is the difference between
 * a refusal somebody can act on and one they argue with. "Incompatible" invites a request for an override;
 * "removed the required field `learnerId`, which every consumer of version 3 reads" does not.
 *
 * The mode being enforced rather than recorded is the point of the registry. A platform that stores a
 * compatibility mode and checks it in review has documented an intention, and the failure it was meant to
 * prevent lands on a consumer in a different deployment at the moment the first event of the new shape arrives.
 */
export class SchemaIncompatibleError extends PlatformError {
  constructor(
    eventTypeKey: string,
    version: number,
    mode: string,
    breakingChanges: readonly string[],
  ) {
    super(
      `Version ${version} of "${eventTypeKey}" is not ${mode}-compatible with the version before it`,
      {
        code: "CONFLICT",
        httpStatus: 422,
        isOperational: true,
        details: { eventTypeKey, version, mode, breakingChanges },
      },
    );
  }
}

/**
 * A retirement was announced with less notice than the platform will give.
 *
 * The floor is not negotiable through a parameter, and that is the design. An operator under pressure to retire
 * a version always has a reason why this one is different, and the cost of agreeing lands entirely on consumers
 * who are not in the conversation and will discover the decision when their events stop arriving.
 */
export class DeprecationNoticeTooShortError extends PlatformError {
  constructor(id: string, noticeDays: number, minimumDays: number) {
    super(
      `Event type definition "${id}" was given ${noticeDays} days' notice; at least ${minimumDays} are required`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { id, noticeDays, minimumDays },
      },
    );
  }
}

/** A retirement date precedes the deprecation that was supposed to give notice of it. */
export class RetirementBeforeDeprecationError extends PlatformError {
  constructor(id: string, deprecatedAt: string, retireAt: string) {
    super(
      `Event type definition "${id}" cannot retire at ${retireAt}, before its deprecation at ${deprecatedAt}`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { id, deprecatedAt, retireAt },
      },
    );
  }
}

/** Retirement follows deprecation; a version still in service is deprecated first, on notice. */
export class EventTypeNotDeprecatedError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Event type definition "${id}" is ${status}; deprecate it before retiring it`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

// --- Streams ---------------------------------------------------------------------

/** The requested stream does not exist in the current tenant. */
export class EventStreamNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Event stream "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** Two streams cannot share a key: it is how every binding, subscription and checkpoint refers to one. */
export class DuplicateStreamKeyError extends PlatformError {
  constructor(streamKey: string) {
    super(`An event stream with key "${streamKey}" already exists in this tenant`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { streamKey },
    });
  }
}

/** The requested stream status change is not a move the lifecycle permits. */
export class InvalidStreamProgressionError extends PlatformError {
  constructor(id: string, from: string, to: string) {
    super(`Event stream "${id}" cannot move from ${from} to ${to}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, from, to },
    });
  }
}

/** The stream is retired; nothing moves it again. */
export class StreamRetiredError extends PlatformError {
  constructor(id: string) {
    super(`Event stream "${id}" is retired`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/**
 * Something asked to publish to a stream that is not accepting publications.
 *
 * `503` and not `500`, because nothing is broken: the stream is a draft or has been paused while a downstream is
 * repaired, and the publisher's event was fine. The distinction reaches every retry policy on the other side of
 * this response, and a `500` would tell well-behaved publishers to stop retrying something that will come back.
 */
export class StreamNotPublishableError extends PlatformError {
  constructor(streamKey: string, status: string) {
    super(`Event stream "${streamKey}" is ${status} and is not accepting publications`, {
      code: "UNAVAILABLE",
      httpStatus: 503,
      isOperational: true,
      details: { streamKey, status },
    });
  }
}

/** A stream declared a partition count outside the range the platform supports. */
export class InvalidPartitionCountError extends PlatformError {
  constructor(streamKey: string, partitionCount: number, minimum: number, maximum: number) {
    super(
      `Event stream "${streamKey}" declared ${partitionCount} partitions; the range is ${minimum} to ${maximum}`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { streamKey, partitionCount, minimum, maximum },
      },
    );
  }
}

/**
 * A stream claimed a global order across more than one partition.
 *
 * Refused rather than reconciled, because both reconciliations are a lie. Silently collapsing the stream to one
 * partition gives an operator a throughput ceiling they did not choose; silently downgrading the guarantee to
 * `partition` gives every consumer on the stream a promise the record says they have and the mesh does not keep.
 */
export class GlobalOrderRequiresSinglePartitionError extends PlatformError {
  constructor(streamKey: string, partitionCount: number) {
    super(
      `Event stream "${streamKey}" promises a global order, so it must have one partition, not ${partitionCount}`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { streamKey, partitionCount },
      },
    );
  }
}

/**
 * A stream promised order within a partition without saying what a partition is keyed on.
 *
 * The two halves of the guarantee live in different fields and only mean something together. A partition-ordered
 * stream with no declared key path hashes on nothing, spreads a learner's events across every partition, and
 * delivers them out of order to a consumer holding a record that says they arrive in order.
 */
export class MissingPartitionKeyPathError extends PlatformError {
  constructor(streamKey: string, ordering: string) {
    super(`Event stream "${streamKey}" promises ${ordering} order and must declare a key path`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { streamKey, ordering },
    });
  }
}

/** A stream declared a retention period outside the range the platform supports. */
export class InvalidRetentionError extends PlatformError {
  constructor(streamKey: string, retentionSeconds: number, minimum: number, maximum: number) {
    super(
      `Event stream "${streamKey}" declared ${retentionSeconds}s retention; the range is ${minimum}s to ${maximum}s`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { streamKey, retentionSeconds, minimum, maximum },
      },
    );
  }
}

/** A stream was declared that accepts no event types, so nothing could ever legitimately be published to it. */
export class EmptyStreamEventTypesError extends PlatformError {
  constructor(streamKey: string) {
    super(`Event stream "${streamKey}" must accept at least one event type`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { streamKey },
    });
  }
}

/** A stream accepts more event types than the platform models; past this it is a bus with a name. */
export class TooManyStreamEventTypesError extends PlatformError {
  constructor(streamKey: string, count: number, maximum: number) {
    super(`Event stream "${streamKey}" accepts ${count} event types; the maximum is ${maximum}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { streamKey, count, maximum },
    });
  }
}

/**
 * A publication arrived for an event type the stream does not accept.
 *
 * The stream's accepted-type list is what makes a subscription's filter meaningful — a consumer reasons about
 * the shapes that can appear on the stream it subscribed to. Accepting an unlisted type would put a payload no
 * subscriber has a reader for onto a stream everybody trusts.
 */
export class EventTypeNotAcceptedError extends PlatformError {
  constructor(streamKey: string, eventTypeKey: string) {
    super(`Event stream "${streamKey}" does not accept event type "${eventTypeKey}"`, {
      code: "CONFLICT",
      httpStatus: 422,
      isOperational: true,
      details: { streamKey, eventTypeKey },
    });
  }
}

/**
 * Somebody tried to change the partitioning of a stream that has carried messages.
 *
 * Partitioning is frozen once a stream goes active, and this is the least negotiable rule in the contract.
 * Changing the partition count re-maps every future key to a different partition while the messages already
 * published stay where they were, so a consumer that was reading a learner's enrolment events in order begins
 * reading half of them from a partition it has already passed. Nothing errors. The events arrive out of order
 * and the mesh's record still says they are ordered. A new stream, a new binding and a governed migration are
 * the only honest way to change it.
 */
export class PartitioningFrozenError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Event stream "${id}" is ${status}; its partitioning can no longer be changed`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

// --- Transport bindings ----------------------------------------------------------

/** The requested stream binding does not exist in the current tenant. */
export class StreamBindingNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Stream binding "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** One stream cannot declare the same backbone twice; the second binding would be indistinguishable. */
export class DuplicateBindingError extends PlatformError {
  constructor(streamKey: string, transport: string) {
    super(`Event stream "${streamKey}" already has a binding to ${transport}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { streamKey, transport },
    });
  }
}

/**
 * A second binding was activated on a stream that already has one carrying.
 *
 * Exactly one binding per stream is active, and the reason is the sequence. Sequences are per stream and
 * gapless, so two backbones carrying concurrently means two writers assigning the same numbers to different
 * messages — and every checkpoint in the tenant is a position in a sequence that no longer identifies anything.
 * A swap is: activate the new binding only after the old one has drained.
 */
export class BindingAlreadyActiveError extends PlatformError {
  constructor(streamKey: string, activeTransport: string) {
    super(`Event stream "${streamKey}" is already carried by its ${activeTransport} binding`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { streamKey, activeTransport },
    });
  }
}

/** The requested binding status change is not a move the lifecycle permits. */
export class InvalidBindingProgressionError extends PlatformError {
  constructor(id: string, from: string, to: string) {
    super(`Stream binding "${id}" cannot move from ${from} to ${to}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, from, to },
    });
  }
}

/** The binding is retired; nothing moves it again. */
export class BindingRetiredError extends PlatformError {
  constructor(id: string) {
    super(`Stream binding "${id}" is retired`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/**
 * A binding was retired while messages it accepted had not yet been delivered.
 *
 * Draining is the step that makes a backbone swap survivable, and skipping it is the outage a migration exists
 * to avoid. The count is in the details because the remedy is to wait, and an operator deciding whether to wait
 * needs to know whether it is nine messages or nine hundred thousand.
 */
export class BindingNotDrainedError extends PlatformError {
  constructor(id: string, undeliveredMessages: number) {
    super(`Stream binding "${id}" still has ${undeliveredMessages} undelivered messages to drain`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, undeliveredMessages },
    });
  }
}

/**
 * A binding named a backbone that no transport at the composition root serves.
 *
 * The transport union is a set of declarations and not a set of clients: this package speaks no broker protocol,
 * and which backbones a deployment can actually carry is a property of what was wired in at the composition
 * root. Refused at declaration, because the alternative is a stream that looks bound, accepts publications and
 * delivers to nobody — and the person who notices is a consumer, not the operator who bound it.
 */
export class TransportNotAvailableError extends PlatformError {
  constructor(transport: string, available: readonly string[]) {
    super(`No transport serving ${transport} is registered in this deployment`, {
      code: "UNAVAILABLE",
      httpStatus: 503,
      isOperational: true,
      details: { transport, available },
    });
  }
}

/**
 * A binding's transport reference looks like the connection secret rather than a handle to it.
 *
 * The rejected value is deliberately **not** in the details, and this is the only error in the package that
 * withholds its input. Everywhere else the offending value is the most useful thing a caller can be told; here
 * it is quite possibly a live broker password, and putting it in a structured error field would write it to the
 * exact log the refusal exists to keep it out of. What travels is the field name and the providers that would
 * have been accepted, which is enough to fix the call.
 */
export class PlaintextTransportCredentialError extends PlatformError {
  constructor(field: string, providers: readonly string[]) {
    super(
      `"${field}" must be a configuration reference such as "config:<name>", not the connection secret`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 400,
        isOperational: true,
        details: { field, acceptedProviders: providers },
      },
    );
  }
}

// --- Subscriptions and filters ---------------------------------------------------

/** The requested subscription does not exist in the current tenant. */
export class MeshSubscriptionNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Mesh subscription "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** Two subscriptions cannot share a key: it is how every checkpoint and dead letter refers to one. */
export class DuplicateMeshSubscriptionKeyError extends PlatformError {
  constructor(subscriptionKey: string) {
    super(`A mesh subscription with key "${subscriptionKey}" already exists in this tenant`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { subscriptionKey },
    });
  }
}

/**
 * Two subscriptions on one stream claimed the same consumer group.
 *
 * A consumer group is the unit a checkpoint belongs to. Two subscriptions sharing one on the same stream would
 * commit positions over each other, and each would appear to be advancing while skipping whatever the other had
 * committed past — a message loss that shows up in neither subscription's lag.
 */
export class DuplicateConsumerGroupError extends PlatformError {
  constructor(streamKey: string, consumerGroup: string) {
    super(`Consumer group "${consumerGroup}" is already subscribed to stream "${streamKey}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { streamKey, consumerGroup },
    });
  }
}

/** The requested subscription status change is not a move the lifecycle permits. */
export class InvalidMeshSubscriptionProgressionError extends PlatformError {
  constructor(id: string, from: string, to: string) {
    super(`Mesh subscription "${id}" cannot move from ${from} to ${to}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, from, to },
    });
  }
}

/** The subscription is retired; nothing moves it again. */
export class MeshSubscriptionRetiredError extends PlatformError {
  constructor(id: string) {
    super(`Mesh subscription "${id}" is retired`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/**
 * Something asked the mesh to deliver to a subscription that is not being delivered to.
 *
 * Names the status rather than only refusing, because the three ways to arrive here have three different next
 * actions and the caller cannot tell them apart otherwise: a registered subscription is activated, a paused one
 * is resumed once whatever the consumer was doing has finished, and a retired one is not resumed at all.
 */
export class MeshSubscriptionNotDeliverableError extends PlatformError {
  constructor(subscriptionKey: string, status: string) {
    super(`Mesh subscription "${subscriptionKey}" is ${status} and is not being delivered to`, {
      code: "UNAVAILABLE",
      httpStatus: 503,
      isOperational: true,
      details: { subscriptionKey, status },
    });
  }
}

/** A subscription set an attempt ceiling outside the range the platform supports. */
export class InvalidAttemptCeilingError extends PlatformError {
  constructor(subscriptionKey: string, attempts: number, minimum: number, maximum: number) {
    super(
      `Mesh subscription "${subscriptionKey}" allows ${attempts} attempts; the range is ${minimum} to ${maximum}`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { subscriptionKey, attempts, minimum, maximum },
      },
    );
  }
}

/** A subscription filter holds more predicates than the routing engine will evaluate per message. */
export class TooManyFilterPredicatesError extends PlatformError {
  constructor(subscriptionKey: string, count: number, maximum: number) {
    super(
      `Mesh subscription "${subscriptionKey}" declares ${count} filter predicates; the maximum is ${maximum}`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { subscriptionKey, count, maximum },
      },
    );
  }
}

/** One predicate carries more values than the routing engine will compare per message. */
export class TooManyFilterValuesError extends PlatformError {
  constructor(attribute: string, count: number, maximum: number) {
    super(`Filter on "${attribute}" carries ${count} values; the maximum is ${maximum}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { attribute, count, maximum },
    });
  }
}

/**
 * A predicate's values and its operator disagree.
 *
 * Both directions are refused. An `equals` with no values matches nothing, which turns a subscription into
 * silence; a `present` with values reads as though the values narrow it and they do not, which is worse, because
 * whoever wrote it will believe the subscription is filtered and it is not.
 */
export class FilterValueMismatchError extends PlatformError {
  constructor(attribute: string, operator: string, issue: string) {
    super(`Filter on "${attribute}" using ${operator} ${issue}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { attribute, operator, issue },
    });
  }
}

/**
 * A filter names an attribute that is not on the envelope.
 *
 * Filters are evaluated against envelope attributes only, never the payload, and a mistyped attribute is not a
 * filter that misbehaves — it is a subscription that matches nothing, forever, with nothing logged. Declaration
 * time is the only moment anybody is looking at the string.
 */
export class UnknownFilterAttributeError extends PlatformError {
  constructor(attribute: string, available: readonly string[]) {
    super(`"${attribute}" is not an envelope attribute a filter can read`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { attribute, available },
    });
  }
}

/** A subscription was registered against a stream that will never carry anything again. */
export class SubscriptionStreamNotReadableError extends PlatformError {
  constructor(subscriptionKey: string, streamKey: string, status: string) {
    super(`Stream "${streamKey}" is ${status}; "${subscriptionKey}" cannot subscribe to it`, {
      code: "CONFLICT",
      httpStatus: 422,
      isOperational: true,
      details: { subscriptionKey, streamKey, status },
    });
  }
}

// --- Checkpoints -----------------------------------------------------------------

/** The requested checkpoint does not exist in the current tenant. */
export class SubscriptionCheckpointNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Subscription checkpoint "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** One subscription holds one checkpoint per partition; a second is a bookkeeping fault, not a new position. */
export class DuplicateCheckpointError extends PlatformError {
  constructor(subscriptionId: string, partition: number) {
    super(`Subscription "${subscriptionId}" already has a checkpoint for partition ${partition}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { subscriptionId, partition },
    });
  }
}

/**
 * A commit tried to move a checkpoint backwards.
 *
 * The one number in this contract that must only ever move forward, and the only way to move it back is the
 * governed reset, which is recorded with an actor and a reason. An ordinary commit that regressed would
 * re-deliver arbitrary history at an arbitrary moment, and the symptom is not an error anywhere — it is a
 * duplicate storm that nobody can date and no record explains. Two ordinary causes are worth naming because
 * both look like nothing: a consumer replaying its own in-flight batch after a restart, and two workers holding
 * the same partition because a lease expired without anybody noticing.
 */
export class CheckpointRegressionError extends PlatformError {
  constructor(subscriptionId: string, partition: number, committed: number, proposed: number) {
    super(
      `Subscription "${subscriptionId}" partition ${partition} is committed at ${committed}; ${proposed} regresses it`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { subscriptionId, partition, committed, proposed },
      },
    );
  }
}

/**
 * A commit named a position beyond the last message the stream has.
 *
 * Refused rather than accepted as an optimistic position, because the messages between the head and the
 * committed position are never delivered — the subscription has silently skipped everything published up to a
 * number a consumer made up, and its lag reads as zero the whole time.
 */
export class CheckpointAheadOfStreamError extends PlatformError {
  constructor(subscriptionId: string, partition: number, proposed: number, head: number) {
    super(
      `Partition ${partition} of subscription "${subscriptionId}" cannot commit ${proposed}; the head is ${head}`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { subscriptionId, partition, proposed, head },
      },
    );
  }
}

/** A partition number falls outside the range the stream declared. */
export class PartitionOutOfRangeError extends PlatformError {
  constructor(streamKey: string, partition: number, partitionCount: number) {
    super(
      `Partition ${partition} is outside stream "${streamKey}", which has ${partitionCount} partitions`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { streamKey, partition, partitionCount },
      },
    );
  }
}

// --- Messages and envelopes ------------------------------------------------------

/** The requested mesh message does not exist in the current tenant. */
export class MeshMessageNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Mesh message "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/**
 * Somebody tried to change a message that has been published.
 *
 * A published message is the record of a fact as the institution stated it at a moment, and every checkpoint,
 * dead letter and replay in the tenant refers to it by sequence. Editing one does not correct history; it makes
 * every consumer that already read it disagree with every consumer that reads it next, with nothing to say which
 * of them saw the truth. A correction is a new event.
 */
export class MeshMessageImmutableError extends PlatformError {
  constructor(id: string) {
    super(`Mesh message "${id}" has been published and cannot be changed; publish a correction`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** Two messages cannot hold the same sequence on one stream; the sequence is what a checkpoint points at. */
export class DuplicateSequenceError extends PlatformError {
  constructor(streamKey: string, sequence: number) {
    super(`Event stream "${streamKey}" already has a message at sequence ${sequence}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { streamKey, sequence },
    });
  }
}

/**
 * An event arrived without something the mesh envelope mandates.
 *
 * The platform's `DomainEvent` metadata makes the tenant and the correlation id optional, which is right for an
 * in-process bus where both are usually implicit in the call stack. On a mesh neither is recoverable: a message
 * is read by a consumer in another process, weeks later, possibly during a replay, and an envelope missing its
 * tenant is a fact that cannot be attributed to a school while an envelope missing its correlation is a fact
 * that cannot be joined to the request that caused it. Completing the envelope at the boundary is the one place
 * the information still exists.
 */
export class IncompleteEnvelopeError extends PlatformError {
  constructor(field: string) {
    super(`A mesh envelope must carry "${field}"`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/**
 * A message on a stream that retains digests or payloads arrived without one.
 *
 * The digest is what makes a `digest` stream worth more than a `none` stream: it is how a redelivery is shown to
 * carry what the original carried. A message stored without one on such a stream is indistinguishable from a
 * message on a stream that never promised anything, and the gap is discovered during the investigation the
 * digest existed for.
 */
export class MissingPayloadDigestError extends PlatformError {
  constructor(streamKey: string, retention: string) {
    super(`Event stream "${streamKey}" retains ${retention} and its messages must carry a digest`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { streamKey, retention },
    });
  }
}

/**
 * Something asked for a payload the stream never kept.
 *
 * `409` and never an empty body, because an empty body is what a successful call looks like. A replay that
 * delivered envelopes with nothing in them would report success to the operator who requested it and arrive at
 * the consumer as a month of events with no content — and the consumer's own error handling would report a
 * producer bug. The refusal has to happen where the retention class is known.
 */
export class PayloadNotRetainedError extends PlatformError {
  constructor(streamKey: string, retention: string) {
    super(`Event stream "${streamKey}" retains ${retention}; its payloads are not available`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { streamKey, retention },
    });
  }
}

// --- Dead letters ----------------------------------------------------------------

/** The requested dead letter does not exist in the current tenant. */
export class DeadLetterNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Dead letter "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/**
 * The dead letter has already been dealt with.
 *
 * Both end states are final and neither deletes the record. `replayed` says somebody sent it again and
 * `discarded` says somebody decided not to; a second decision on top of either would overwrite the first, and
 * the question a dead-letter table answers — what did we drop, and who agreed to it — is asked precisely when
 * nobody can remember.
 */
export class DeadLetterSettledError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Dead letter "${id}" is already ${status}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/** Only an open dead letter replays; a discarded one was a decision, and replaying it would reverse it silently. */
export class DeadLetterNotReplayableError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Dead letter "${id}" is ${status}; only an open dead letter can be replayed`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

// --- Replay ----------------------------------------------------------------------

/** The requested replay does not exist in the current tenant. */
export class ReplayRequestNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Replay request "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The requested replay status change is not a move the lifecycle permits. */
export class InvalidReplayProgressionError extends PlatformError {
  constructor(id: string, from: string, to: string) {
    super(`Replay request "${id}" cannot move from ${from} to ${to}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, from, to },
    });
  }
}

/** The replay has reached an end state and nothing moves it again. */
export class ReplaySettledError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Replay request "${id}" is ${status} and will not be acted on again`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/**
 * The mesh will not perform this replay, and the reason code says why.
 *
 * The reason travels as a closed-set member rather than prose because a refused replay is the start of a
 * conversation about a remedy, and each member has a different one: the data is gone, the stream was never an
 * archive, the window needs splitting, the subscription needs resuming. A single "invalid" would send the
 * requester to ask somebody.
 */
export class ReplayRefusedError extends PlatformError {
  constructor(id: string, reason: string) {
    super(`Replay request "${id}" was refused: ${reason}`, {
      code: "CONFLICT",
      httpStatus: 422,
      isOperational: true,
      details: { id, reason },
    });
  }
}

/** A replay window ends before it starts. */
export class ReplayWindowInvertedError extends PlatformError {
  constructor(fromInstant: string, toInstant: string) {
    super(`A replay window cannot run from ${fromInstant} to ${toInstant}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { fromInstant, toInstant },
    });
  }
}

/**
 * A replay window is wider than one request may cover.
 *
 * Splitting a year into twelve requests is a mild inconvenience with a useful property: eleven of them can be
 * stopped after the first one goes wrong. A single unbounded replay has no such moment.
 */
export class ReplayWindowTooWideError extends PlatformError {
  constructor(windowSeconds: number, maximumSeconds: number) {
    super(`A replay window of ${windowSeconds}s exceeds the maximum of ${maximumSeconds}s`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { windowSeconds, maximumSeconds },
    });
  }
}

/**
 * A replay covers more messages than one request may carry.
 *
 * A count ceiling as well as a duration ceiling, because the two bound different failures: a wide window on a
 * quiet stream is harmless, and an hour on a busy one can be a million deliveries. The count is what the
 * consumer on the other end actually experiences.
 */
export class ReplayTooManyMessagesError extends PlatformError {
  constructor(messageCount: number, maximum: number) {
    super(`A replay of ${messageCount} messages exceeds the maximum of ${maximum}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { messageCount, maximum },
    });
  }
}

/** A replay was started before anybody approved it. */
export class ReplayNotApprovedError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Replay request "${id}" is ${status}; it must be approved before it runs`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/**
 * The person approving a replay is the person who requested it.
 *
 * The second pair of eyes is the entire safeguard, and it is the one that is always available to be skipped
 * under time pressure — the requester knows the window is right, and they are usually correct. The cost of being
 * wrong is not theirs: it is a month of duplicate emails, invoices or ledger entries arriving at people who did
 * not ask for them, from a system that will report the replay as a success.
 */
export class SelfApprovedReplayError extends PlatformError {
  constructor(id: string, personId: string) {
    super(`Replay request "${id}" must be approved by somebody other than "${personId}"`, {
      code: "CONFLICT",
      httpStatus: 422,
      isOperational: true,
      details: { id, personId },
    });
  }
}

// --- Engine guards ---------------------------------------------------------------

/**
 * An engine was handed a figure that is not the count it is documented to be: a negative sequence, a fractional
 * attempt number, a partition count of nothing.
 *
 * Non-operational and hidden from clients, because nobody outside the platform contributes to any of these.
 * Sequences are assigned by this package, attempt numbers are incremented by it, partition counts come from a
 * stream record it validated, and a figure that is not a count means the record was written by something that is
 * not the aggregate.
 *
 * Raised rather than clamped, and here the argument is sharper than for a validation error. A clamped figure
 * still produces a verdict, and that verdict goes on to dead-letter a message, declare a subscription current,
 * or route an event to a partition — so the cost of absorbing the defect is not a mis-counted number but a
 * message the institution never processed, or a consumer reported healthy while it is stopped. An operator
 * investigating either would find a perfectly plausible record.
 */
export class InvalidMeshCountError extends PlatformError {
  constructor(name: string, value: number, requirement: string) {
    super(`A mesh ${name} ${requirement}; ${value} was given`, {
      code: "INTERNAL_ERROR",
      httpStatus: 500,
      isOperational: false,
      details: { name, value, requirement },
    });
  }
}
