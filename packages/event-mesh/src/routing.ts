import {
  FilterValueMismatchError,
  TooManyFilterPredicatesError,
  TooManyFilterValuesError,
  UnknownFilterAttributeError,
} from "./errors";
import {
  type FilterOperator,
  type FilterPredicate,
  MAX_FILTER_PREDICATES,
  MAX_FILTER_VALUES,
  compareText,
  isSubscriptionDeliverable,
  operatorTakesValues,
} from "./mesh-value";
import type {
  MeshEnvelope,
  RoutingCandidate,
  RoutingDecision,
  RoutingRefusal,
  RoutingRequest,
  RoutingVerdict,
} from "./mesh-view";

/**
 * The engine that decides which subscriptions a message is entitled to reach, and says why for the rest.
 *
 * Routing is where a mesh either earns its keep or becomes an expensive fan-out. A subscription that takes
 * everything on a stream and throws nine tenths of it away in consumer code has put the filter in the most
 * costly place available: after serialisation, after transport, after the consumer woke up, and inside a
 * process whose author is the only person who can say what it actually ignores. Deciding here makes the rule a
 * record an operator can read, runs the same rule for every consumer on the stream, and reduces a message
 * nobody wanted from a delivery to a function call.
 *
 * **A filter reads the envelope and never the payload.** {@link FILTERABLE_ATTRIBUTES} is a closed list of
 * seven, and the closure is the point rather than a limitation to be relaxed later. A filter that could reach
 * into payload contents would be a filter that decides delivery on a learner's diagnosis or a staff
 * member's salary band, evaluated in a package that has spent two files establishing that it never holds
 * either. The list also excludes three envelope fields it could technically have offered. `tenantId` is absent
 * because row-level security already scopes every read to one institution and a filter on it would be a second,
 * weaker, opt-in copy of that guarantee. `eventId` and `correlationId` are absent because filtering on them
 * describes a query for one particular message rather than a standing interest in a class of them, and a
 * subscription is the wrong object to express that with.
 *
 * **Predicates are conjunctive, and evaluation fails closed.** Every predicate must hold, so a filter narrows
 * monotonically and an operator adding one to a live subscription can only ever reduce what it receives — a
 * disjunction would make the same edit capable of widening it, which is not a thing anybody wants to discover
 * from a graph. An attribute this engine does not recognise makes its predicate false rather than raising,
 * because the alternative is throwing on the per-message path for a defect that was introduced at declaration
 * time; the record that could produce it is refused by {@link validateFilter} in the first place, and if one
 * ever exists the failure is a silent subscription somebody investigates rather than a firehose nobody can stop.
 *
 * **A verdict explains itself.** Every candidate offered comes back with an answer, including the ones that were
 * not reached and the reason they were not, because the question an operator actually arrives with is *why did
 * this consumer not get that event* and a bare list of recipients cannot answer it. The three refusals are
 * genuinely different diagnoses — the subscription is on another stream, the subscription is not in a state
 * that receives anything, the subscription's own filter excluded it — and only the third is something
 * its owner chose.
 *
 * Nothing here reads a clock, a store or a random source. A routing decision is a pure function of one envelope
 * and one candidate list, which means the answer the mesh gave in March is reproducible in November from the
 * two records, and an argument about whether a consumer should have received something is settled by rerunning
 * it rather than by remembering.
 */

// --- Filterable attributes -------------------------------------------------------

/**
 * Every envelope attribute a subscription filter may read.
 *
 * Enumerated as a value rather than left implicit in a `switch`, because this list *is* the closure the module
 * documentation claims, and a closure that exists only as a set of `case` labels is one that drifts the first
 * time somebody adds a branch. The engine's test walks this array, and {@link UnknownFilterAttributeError}
 * carries it, so an integrator who names something else is told what they may name instead rather than only
 * that they were wrong.
 *
 * `causationId` is the member that earns `present` and `absent` their place in the operator vocabulary: it is
 * the only filterable attribute that is legitimately null, and a subscription to the facts that *begin* a chain
 * — an enrolment nothing caused, as against the twenty consequences of one — has no other way to say so.
 */
export const FILTERABLE_ATTRIBUTES = Object.freeze([
  "aggregateId",
  "aggregateType",
  "causationId",
  "eventTypeKey",
  "eventTypeVersion",
  "partitionKey",
  "producerKey",
] as const);

/** One envelope attribute a filter predicate may be written against. */
export type FilterableAttribute = (typeof FILTERABLE_ATTRIBUTES)[number];

/** Whether a stored attribute name is one this engine can read off an envelope. */
const isFilterableAttribute = (attribute: string): attribute is FilterableAttribute =>
  (FILTERABLE_ATTRIBUTES as readonly string[]).includes(attribute);

/**
 * Read one attribute off an envelope as the string a predicate compares against.
 *
 * `eventTypeVersion` is a number on the envelope and is rendered here rather than compared numerically, which
 * is a deliberate narrowing: the operators this package offers are equality, membership and prefix, and none of
 * them means anything ordered. A subscription that wants *version 3 or later* is asking for a range predicate,
 * and a range predicate on a mesh filter is the beginning of a query language — the honest answer is that
 * such a subscription lists the versions it accepts, and re-registers when a fourth appears, which is a
 * conversation somebody has rather than a rule that silently starts including shapes nobody has read.
 */
const readAttribute = (envelope: MeshEnvelope, attribute: FilterableAttribute): string | null => {
  switch (attribute) {
    case "aggregateId":
      return envelope.aggregate.aggregateId;
    case "aggregateType":
      return envelope.aggregate.aggregateType;
    case "causationId":
      return envelope.causationId;
    case "eventTypeKey":
      return envelope.eventTypeKey;
    case "eventTypeVersion":
      return String(envelope.eventTypeVersion);
    case "partitionKey":
      return envelope.partitionKey;
    case "producerKey":
      return envelope.producerKey;
  }
};

// --- Filter validation -----------------------------------------------------------

/**
 * The operators that mean nothing with more than one value.
 *
 * {@link FilterPredicate.values} is a list whatever the operator, so that the shape of a stored predicate does
 * not change with the operator it carries. That decision is right for the store and leaves one thing undecided
 * in the engine: an `equals` carrying three values, which reads as *is one of these* and is therefore an `in`
 * wearing the wrong name. Refusing it at declaration time is what keeps the two operators genuinely different,
 * and is the reason {@link FilterValueMismatchError} exists.
 */
const SINGLE_VALUE_OPERATORS: readonly FilterOperator[] = Object.freeze(["equals", "not_equals"]);

/**
 * Check a filter and hand back a frozen, trimmed copy of it.
 *
 * Every path that stores a filter runs through here, which is what lets {@link matchesFilter} be total: by the
 * time a predicate is evaluated on the delivery path its attribute is known to be readable, its value count is
 * known to suit its operator, and none of its values is blank. That ordering is the whole of the design —
 * validation is a declaration-time cost paid once by the person who can fix it, evaluation is a per-message
 * cost paid forever by every consumer on the stream.
 *
 * Values are trimmed, and the safety of that rests on what a filterable attribute actually holds. All seven are
 * normalised keys, UUIDs or a number rendered as a string, and the envelope engine already trims the partition
 * key on the way in; no legitimate value can carry edge whitespace. What can is a value pasted out of a
 * spreadsheet, and left alone it would produce a subscription that matches nothing, forever, for a reason
 * invisible in every rendering of the record.
 *
 * An empty filter is not an error. It is a subscription to everything on the stream, which is the correct and
 * common case for an archiver or an audit sink, and refusing it would only teach people to write
 * `eventTypeKey present`.
 *
 * @throws {TooManyFilterPredicatesError} beyond {@link MAX_FILTER_PREDICATES}, where a filter has become a query.
 * @throws {UnknownFilterAttributeError} when a predicate names something the mesh cannot read off an envelope.
 * @throws {TooManyFilterValuesError} beyond {@link MAX_FILTER_VALUES} on a single predicate.
 * @throws {FilterValueMismatchError} when the value count or content does not suit the operator.
 */
export function validateFilter(
  subscriptionKey: string,
  predicates: readonly FilterPredicate[],
): readonly FilterPredicate[] {
  if (predicates.length > MAX_FILTER_PREDICATES) {
    throw new TooManyFilterPredicatesError(
      subscriptionKey,
      predicates.length,
      MAX_FILTER_PREDICATES,
    );
  }

  const validated: FilterPredicate[] = [];
  for (const predicate of predicates) {
    const attribute = predicate.attribute.trim();
    if (!isFilterableAttribute(attribute)) {
      throw new UnknownFilterAttributeError(predicate.attribute, FILTERABLE_ATTRIBUTES);
    }

    const { operator } = predicate;
    const values = predicate.values.map((value) => value.trim());

    if (!operatorTakesValues(operator)) {
      if (values.length > 0) {
        throw new FilterValueMismatchError(
          attribute,
          operator,
          "reads only whether the attribute is set, so it must carry no values",
        );
      }
    } else {
      if (values.length === 0) {
        throw new FilterValueMismatchError(attribute, operator, "must carry at least one value");
      }
      if (values.length > MAX_FILTER_VALUES) {
        throw new TooManyFilterValuesError(attribute, values.length, MAX_FILTER_VALUES);
      }
      if (SINGLE_VALUE_OPERATORS.includes(operator) && values.length !== 1) {
        throw new FilterValueMismatchError(
          attribute,
          operator,
          "takes exactly one value; use in for a list",
        );
      }
      if (values.some((value) => value.length === 0)) {
        throw new FilterValueMismatchError(attribute, operator, "cannot carry a blank value");
      }
    }

    validated.push(Object.freeze({ attribute, operator, values: Object.freeze(values) }));
  }
  return Object.freeze(validated);
}

// --- Evaluation ------------------------------------------------------------------

/**
 * Whether one predicate holds for one envelope.
 *
 * `not_equals` is false where the attribute is absent, and that is a decision rather than a consequence. Read
 * literally, *causationId is not equal to X* is true of a fact that has no causation at all, and a subscription
 * written to exclude one producer would silently start receiving every chain-initiating event on the stream.
 * A comparison with nothing is not a match, and `absent` is the operator for the case where somebody means it.
 *
 * The unknown-attribute branch is unreachable through {@link validateFilter} and is not therefore decoration:
 * it is what the engine does with a record written before an attribute was withdrawn, or by a migration, and it
 * makes that case a subscription that receives nothing rather than one that receives everything.
 */
const holds = (envelope: MeshEnvelope, predicate: FilterPredicate): boolean => {
  if (!isFilterableAttribute(predicate.attribute)) {
    return false;
  }
  const value = readAttribute(envelope, predicate.attribute);

  switch (predicate.operator) {
    case "present":
      return value !== null;
    case "absent":
      return value === null;
    case "equals":
    case "in":
      return value !== null && predicate.values.includes(value);
    case "not_equals":
      return value !== null && !predicate.values.includes(value);
    case "prefix":
      return value !== null && predicate.values.some((prefix) => value.startsWith(prefix));
  }
};

/**
 * Whether every predicate in a filter holds for an envelope.
 *
 * Exposed rather than kept private because it answers a question people ask before they commit to a filter
 * rather than after it has been silently receiving nothing for a fortnight — *would this subscription have
 * caught that message?* — and a mesh that can only answer by waiting for the next one is a mesh whose
 * filters get written by trial.
 */
export function matchesFilter(envelope: MeshEnvelope, filter: readonly FilterPredicate[]): boolean {
  return filter.every((predicate) => holds(envelope, predicate));
}

// --- Routing ---------------------------------------------------------------------

/**
 * Why a candidate did not receive the message, or `null` where it did.
 *
 * Checked in this order on purpose, so that the reason reported is the earliest and most structural one. A
 * paused subscription on another stream is reported as being on another stream, because that is the fact that
 * would still be true after somebody resumed it.
 */
const refusalFor = (envelope: MeshEnvelope, candidate: RoutingCandidate): RoutingRefusal | null => {
  if (candidate.streamKey !== envelope.streamKey) {
    return "different_stream";
  }
  if (!isSubscriptionDeliverable(candidate.status)) {
    return "not_deliverable";
  }
  if (!matchesFilter(envelope, candidate.filter)) {
    return "filtered";
  }
  return null;
};

/** One candidate, answered. `refusal` is `null` exactly when `reached` is true, by construction. */
const decide = (envelope: MeshEnvelope, candidate: RoutingCandidate): RoutingDecision => {
  const refusal = refusalFor(envelope, candidate);
  return Object.freeze({
    subscriptionKey: candidate.subscriptionKey,
    reached: refusal === null,
    refusal,
  });
};

/**
 * Answer, for one envelope, which of the offered subscriptions it reaches.
 *
 * The verdict carries the full set of decisions and the reached keys on their own, which is the same shape
 * `assessCompatibility` returns for the same reason: two callers want two different things from one
 * evaluation. The delivery loop wants the recipients and nothing else; the operator looking at a consumer that
 * has gone quiet wants the refusals, and specifically wants to see the subscription in the list with a reason
 * beside it rather than to infer its absence. Deriving either at the call site would be a second implementation
 * of the same rule, and the two would disagree eventually.
 *
 * Candidates are sorted by subscription key before they are decided, so that the verdict reads identically on
 * every machine and a test can assert an exact list rather than a set. The sort is code-point ordering by way
 * of {@link compareText}; the engine has no opinion about which subscription is more important, and imposing
 * one here would be an ordering guarantee this package has not promised and cannot keep once delivery is
 * concurrent.
 *
 * Nothing is thrown. A candidate on the wrong stream is a refusal rather than an error, because the caller that
 * assembles the candidate list is a repository query and the honest response to it having returned one row too
 * many is to say so in the verdict.
 */
export function routeEnvelope(request: RoutingRequest): RoutingVerdict {
  const ordered = [...request.candidates].sort((left, right) =>
    compareText(left.subscriptionKey, right.subscriptionKey),
  );
  const decisions = ordered.map((candidate) => decide(request.envelope, candidate));
  const reached = decisions.filter((entry) => entry.reached).map((entry) => entry.subscriptionKey);

  return Object.freeze({
    streamKey: request.envelope.streamKey,
    decisions: Object.freeze(decisions),
    reached: Object.freeze(reached),
  });
}
