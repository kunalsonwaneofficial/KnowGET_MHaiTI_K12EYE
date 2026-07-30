import { isValidIso, parseIso } from "@knowget/shared";
import type { ISODateString } from "@knowget/types";
import {
  InvalidAttemptCeilingError,
  InvalidMeshCountError,
  InvalidMeshInstantError,
} from "./errors";
import {
  DEAD_LETTER_REASONS,
  type DeadLetterReason,
  type DeliveryVerdict,
  LAG_BEHIND_THRESHOLD,
  LAG_STALLED_AFTER_SECONDS,
  type LagBand,
  MAX_DELIVERY_ATTEMPTS,
  MIN_DELIVERY_ATTEMPTS,
  UNCOMMITTED_POSITION,
  requiresDeduplication,
  requiresRetry,
} from "./mesh-value";
import type { DeliveryDecision, DeliveryRequest, LagAssessment, LagRequest } from "./mesh-view";

/**
 * The engine that decides what happens to one message for one subscription, and the engine that says whether a
 * subscription is keeping up.
 *
 * Two questions in one module because they are the same question at two timescales. *What do I do with this
 * message now* is answered per message; *is this consumer alive* is answered per checkpoint, on a schedule; and
 * both are read from the subscription's side of the mesh, by the same operator, during the same investigation.
 * Splitting them would mean two files that share a vocabulary, a set of thresholds and an audience.
 *
 * **Nothing here delivers anything.** The engine returns a verdict and something else acts on it, which is the
 * house rule for engines and earns its keep in this contract more than in any other. A delivery loop that
 * decided and acted in the same statement could only be tested by delivering, so the awkward cases — the
 * message that failed nine times, the `exactly_once` redelivery, the subscription paused mid-retry — would be
 * tested by whoever encountered them in production. Here they are literals in a test file.
 *
 * **The order the conditions are asked in is the design.** Five verdicts and a handful of inputs admit many
 * orderings, most of which produce a defensible answer and a different one, so the sequence is fixed once here
 * and argued at {@link decideDelivery} rather than emerging from how the branches happened to be written. The
 * short form: a message that never reached the subscription is not a delivery that failed; a suppressed
 * duplicate is not an attempt; a failure that will not become a success is not worth the attempts remaining;
 * and only then does the ceiling decide.
 *
 * **A retry is a decision about the failure, not only about the count.** Retrying a `payload_rejected` five
 * times sends the same rejected payload five times, fails five times, and reaches the dead letter with the
 * reason `attempts_exhausted` — which is the one reason that tells an operator nothing about what went wrong.
 * {@link RETRIABLE_FAILURE_REASONS} exists so that the reason on the record is the reason the message failed.
 *
 * Nothing here reads a clock or a random source. `asOf` is an argument, which is what lets an operator ask why
 * a subscription was declared stalled at nine on Tuesday and get the same answer on Friday.
 */

// --- Failure kinds ---------------------------------------------------------------

/**
 * The failures that a second attempt could plausibly turn into a success.
 *
 * Three members, and each is a failure *of the attempt* rather than of the message. A consumer that threw may
 * have thrown because a dependency was briefly gone; a timeout may have been a slow query behind a lock; a
 * transport that was unavailable is the backbone being restarted. The message is unchanged and the next attempt
 * is a different attempt.
 *
 * Everything else is a property of the message or of the schema registry, and is the same on every attempt. A
 * payload the consumer rejected will be rejected again. An event type that is not registered will not become
 * registered because the mesh asked a fifth time. Retrying those spends the attempt budget to arrive at the
 * same place with a worse reason attached.
 */
export const RETRIABLE_FAILURE_REASONS: readonly DeadLetterReason[] = Object.freeze([
  "consumer_error",
  "timeout",
  "transport_unavailable",
] as const);

/**
 * The failures that will not become successes, computed as the complement rather than written out.
 *
 * The same argument the compatibility engine makes for deriving its `full` list. Adding an eighth dead-letter
 * reason is a decision about whether it is retriable, and deriving this list means that decision is made in one
 * place — the new member is terminal unless somebody deliberately puts it in the retriable set. A hand-written
 * complement would let a new reason be added to neither list, or to both.
 *
 * `attempts_exhausted` is in here, which reads oddly at first: it is the reason this engine *produces* rather
 * than one it is ever handed as a cause. Being terminal is what makes a re-decision idempotent — asking again
 * about a message already dead-lettered returns the same verdict and the same reason, instead of restarting its
 * attempt budget.
 */
export const TERMINAL_FAILURE_REASONS: readonly DeadLetterReason[] = Object.freeze(
  DEAD_LETTER_REASONS.filter((reason) => !RETRIABLE_FAILURE_REASONS.includes(reason)),
);

/** Whether another attempt at this failure is worth one of the attempts the subscription has left. */
export const isRetriableFailure = (reason: DeadLetterReason): boolean =>
  RETRIABLE_FAILURE_REASONS.includes(reason);

// --- Attempt ceilings ------------------------------------------------------------

/**
 * The number the first attempt takes.
 *
 * One rather than zero, and unlike `FIRST_PARTITION` that is not an inconsistency. An attempt is a count
 * of things tried, so "attempt 0" would be an attempt that did not happen, and an operator reading *failed on
 * attempt 0 of 5* would be reading a sentence about nothing.
 */
export const FIRST_ATTEMPT = 1;

/**
 * Check the attempt ceiling a subscription declared.
 *
 * The floor is one rather than zero because a subscription that permits no attempts is not a subscription with
 * a strict policy, it is a subscription that dead-letters everything on the stream without trying. That is
 * expressible — a retired subscription, or none at all — and expressing it as a ceiling of zero would produce a
 * dead-letter table with a day of an institution's events in it and no failure anywhere to explain them.
 *
 * The ceiling is checked here rather than trusted from the record because it arrives from an integrator and
 * this is where it arrives. {@link decideDelivery} calls it on every decision, which costs three comparisons
 * and means a subscription row edited by hand cannot silently grant itself unlimited attempts.
 *
 * @throws {InvalidAttemptCeilingError} when the ceiling is not a whole number in the range the platform allows.
 */
export function validateAttemptCeiling(subscriptionKey: string, attempts: number): number {
  if (
    !Number.isInteger(attempts) ||
    attempts < MIN_DELIVERY_ATTEMPTS ||
    attempts > MAX_DELIVERY_ATTEMPTS
  ) {
    throw new InvalidAttemptCeilingError(
      subscriptionKey,
      attempts,
      MIN_DELIVERY_ATTEMPTS,
      MAX_DELIVERY_ATTEMPTS,
    );
  }
  return attempts;
}

// --- Decision --------------------------------------------------------------------

/** One verdict, frozen, with the subscription it is about carried alongside it. */
const decision = (
  request: DeliveryRequest,
  verdict: DeliveryVerdict,
  attempt: number | null,
  reason: DeadLetterReason | null,
): DeliveryDecision =>
  Object.freeze({ subscriptionKey: request.subscriptionKey, verdict, attempt, reason });

/**
 * Decide what the mesh does with one message for one subscription.
 *
 * The conditions are asked in an order that is the substance of the engine, so each step is worth its sentence.
 *
 * **A message that did not match is not a failed delivery.** `filtered` comes first because everything after it
 * would otherwise charge an attempt, consult a ledger or record a dead letter for a message the subscription
 * was never entitled to. A subscription filtering out ninety-nine per cent of a stream is doing exactly what it
 * declared, and its attempt counters should read zero.
 *
 * **A suppressed duplicate is not an attempt either.** Under `exactly_once` the ledger has already seen this
 * message reach this subscription, and the second hand-over is the thing the semantics were chosen to prevent.
 * It is asked before the failure branches because a redelivery arriving after a partial failure is the ordinary
 * shape of the problem: the consumer processed it and the acknowledgement was lost.
 *
 * **A failure that will not become a success ends it, whatever the budget says.** This is the branch that makes
 * the dead letter useful. Four more attempts at a rejected payload produce four more rejections and a record
 * saying `attempts_exhausted`, which names the mesh's bookkeeping rather than the fault; ending it now records
 * `payload_rejected`, which names the fault and the person who can fix it.
 *
 * **Semantics that do not retry end it too, and say so differently.** `at_most_once` chose to lose a message
 * rather than to see it twice, so `abandoned` rather than `dead_letter`: nothing here is awaiting a decision,
 * and putting it in the dead-letter queue would fill that queue with messages the subscription asked not to be
 * retried. The reason travels anyway, because *why* it was lost is still worth knowing.
 *
 * **Only then does the ceiling apply.** By this point the failure was retriable and the semantics retry, so a
 * message at the ceiling has genuinely been tried as often as the subscription allows, and `attempts_exhausted`
 * is the honest reason rather than the default one.
 *
 * The attempt number is returned rather than incremented in place, because the caller writes it to the same row
 * it writes the outcome to and an engine that mutated a counter would make the two orderings differ.
 *
 * @throws {InvalidAttemptCeilingError} when the subscription's ceiling is not one the platform permits.
 * @throws {InvalidMeshCountError} when the attempts already made is not a whole, non-negative count.
 */
export function decideDelivery(request: DeliveryRequest): DeliveryDecision {
  const ceiling = validateAttemptCeiling(request.subscriptionKey, request.attemptCeiling);
  if (!Number.isInteger(request.attemptsMade) || request.attemptsMade < 0) {
    throw new InvalidMeshCountError(
      "attempt count",
      request.attemptsMade,
      "must be a whole, non-negative number of attempts already made",
    );
  }

  if (!request.matched) {
    return decision(request, "filtered", null, null);
  }
  if (requiresDeduplication(request.semantics) && request.alreadyDelivered) {
    return decision(request, "duplicate", null, null);
  }

  const failure = request.lastFailure;
  if (failure !== null) {
    if (!isRetriableFailure(failure)) {
      return decision(request, "dead_letter", null, failure);
    }
    if (!requiresRetry(request.semantics)) {
      return decision(request, "abandoned", null, failure);
    }
  }
  if (request.attemptsMade >= ceiling) {
    return decision(request, "dead_letter", null, "attempts_exhausted");
  }
  return decision(request, "deliver", request.attemptsMade + FIRST_ATTEMPT, null);
}

// --- Lag -------------------------------------------------------------------------

/** An instant, read as a number of milliseconds, refused rather than coerced when it is not one. */
const instantAt = (field: string, value: ISODateString): number => {
  if (!isValidIso(value)) {
    throw new InvalidMeshInstantError(field, value);
  }
  return parseIso(value).getTime();
};

/**
 * Which band a lag and an idle time fall into.
 *
 * The order of the three tests is the whole of the policy.
 *
 * A subscription level with the head is `current` whatever its idle time, and that test comes first
 * deliberately. A consumer on a quiet stream that has had nothing to do since Friday has an idle time of days
 * and is working perfectly; calling it stalled would make every low-volume stream in an institution page
 * somebody every weekend, and the alerts would be turned off within a fortnight.
 *
 * Given a non-zero lag, not advancing is worse than being far behind, so `stalled` is tested before
 * {@link LAG_BEHIND_THRESHOLD}. Note that it is tested at *any* non-zero lag rather than only past the
 * threshold: a consumer that died holding a partition with five messages outstanding is stopped, and a
 * definition requiring it to first accumulate a thousand would mean the quieter the stream the longer a dead
 * consumer goes unnoticed. That is exactly backwards — a thousand messages behind on a busy stream is fifteen
 * seconds of traffic, and five messages behind on a quiet one is a consumer that has stopped.
 */
const bandFor = (lag: number, idleSeconds: number): LagBand => {
  if (lag === 0) {
    return "current";
  }
  if (idleSeconds >= LAG_STALLED_AFTER_SECONDS) {
    return "stalled";
  }
  return lag > LAG_BEHIND_THRESHOLD ? "behind" : "current";
};

/**
 * Read one checkpoint against its stream and name the state it is in.
 *
 * The lag is a subtraction, and the two guards around it are what make the subtraction mean something. A
 * committed position ahead of the head is not a small lag, it is a record that could not have been written by
 * this package — a checkpoint committed against a stream that has been rewound, or a head read from a different
 * stream — and returning `current` for it would report the healthiest possible state for the most broken
 * possible record. {@link InvalidMeshCountError} names that as internal, because nobody outside the platform
 * contributes either number.
 *
 * The idle time is floored at zero rather than refused when `asOf` precedes the last movement. Two nodes whose
 * clocks disagree by a second will produce that, and the consequence of the floor is that such a checkpoint
 * reads as recently moved and therefore never `stalled` — a monitoring surface that under-reports during clock
 * skew, rather than one that refuses to answer at the moment the cluster is least well.
 *
 * @throws {InvalidMeshCountError} when either position is not a whole count, or the checkpoint is ahead of the
 *   stream it is a position in.
 * @throws {InvalidMeshInstantError} when either instant is not readable as a moment in time.
 */
export function lagBandFor(request: LagRequest): LagAssessment {
  const { subscriptionKey, partition, committedPosition, streamHead } = request;

  if (!Number.isInteger(committedPosition) || committedPosition < UNCOMMITTED_POSITION) {
    throw new InvalidMeshCountError(
      "committed position",
      committedPosition,
      `must be ${UNCOMMITTED_POSITION} or a sequence the subscription has reached`,
    );
  }
  if (!Number.isInteger(streamHead) || streamHead < UNCOMMITTED_POSITION) {
    throw new InvalidMeshCountError(
      "stream head",
      streamHead,
      "must be a whole, non-negative count of messages published",
    );
  }
  if (committedPosition > streamHead) {
    throw new InvalidMeshCountError(
      "committed position",
      committedPosition,
      `must not be ahead of the stream head of ${streamHead}`,
    );
  }

  const movedAt = instantAt("positionMovedAt", request.positionMovedAt);
  const asOf = instantAt("asOf", request.asOf);
  const idleSeconds = Math.max(0, Math.floor((asOf - movedAt) / 1_000));
  const lag = streamHead - committedPosition;

  return Object.freeze({
    subscriptionKey,
    partition,
    band: bandFor(lag, idleSeconds),
    lag,
    idleSeconds,
  });
}
