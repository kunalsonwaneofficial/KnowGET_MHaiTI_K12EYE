import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { planBackoff } from "./backoff";
import {
  DeliveryAttemptsExhaustedError,
  DeliveryNotReplayableError,
  DeliverySettledError,
  EmptyGatewayKeyError,
  InvalidGatewayKeyError,
} from "./errors";
import {
  type DeliveryMode,
  type DeliveryOutcome,
  INITIAL_DELIVERY_OUTCOME,
  MAX_DELIVERY_ATTEMPTS,
  isReplayableOutcome,
  isTerminalDeliveryOutcome,
  isValidKey,
  normalizeKey,
} from "./gateway-value";
import type { DeliveryView } from "./gateway-view";

/**
 * One event, on its way to one subscriber, and everything that has happened to it so far.
 *
 * A delivery is the unit an operator actually works with. When an integrator says *we never got the enrolment
 * for this student*, the row that answers them is this one: it names the event, the subscription that selected
 * it, the endpoint it was sent through, how many times it has been tried, what came back each time and when it
 * will next be tried. A platform that kept only a queue would be able to say the message is gone and nothing
 * else, which turns every such question into an engineering investigation.
 *
 * **The payload never reaches this package.** Only a fingerprint of it does, which is the same stance
 * {@link IdempotencyProbe} takes and for the same reason. Two deliveries of the same event can be told apart by
 * their digests, a corrupted body can be detected by comparing one, and neither of those needs an institution's
 * student records to be sitting in a table that support staff read all day. The body lives with the outbox that
 * produced it, under whatever retention that data is governed by, and is fetched at dispatch time.
 *
 * **The delivery mode is snapshotted at schedule time.** A consumer who switches a subscription to at-most-once
 * this afternoon is stating what they want from *future* events, not asking the platform to abandon the fourteen
 * retries already in flight — and a consumer who switches the other way is not asking for six attempts at
 * something the platform already promised to try once. Reading the mode from the subscription at attempt time
 * would make both of those happen, retroactively, to deliveries the consumer cannot see.
 *
 * **Dead-lettered and abandoned are different ends.** A dead-lettered delivery ran out of attempts against a
 * receiver that stayed down; it is kept because the ordinary remedy is to fix the receiver and replay it. An
 * abandoned delivery was given up on by a decision — the subscription was revoked, the event stopped being one
 * the institution wanted sent — and replaying it would deliver, to somebody who may have been offboarded, an
 * event that was deliberately withheld. Collapsing the two would put things nobody may ever send into the queue
 * of things somebody is about to send.
 */

// --- The aggregate ---------------------------------------------------------------

export interface OutboundDelivery {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The subscription whose filter selected this event. Deliveries belong to it and are read through it. */
  readonly subscriptionId: Uuid;
  /** The endpoint this attempt is aimed at, snapshotted so a later rebinding does not rewrite history. */
  readonly endpointId: Uuid;
  readonly eventType: string;
  /** The event in the outbox this delivery carries. Many deliveries of one event share this identifier. */
  readonly eventId: Uuid;
  /** A digest of the body, computed elsewhere. The body itself is never held here. */
  readonly payloadFingerprint: string;
  /** The guarantee in force when this delivery was scheduled, not the subscription's current one. */
  readonly deliveryMode: DeliveryMode;
  readonly outcome: DeliveryOutcome;
  /** Attempts made. Zero until the dispatcher has tried once. */
  readonly attempts: number;
  /** When the next attempt becomes due, or null once the delivery has settled. */
  readonly nextAttemptAt: ISODateString | null;
  readonly lastAttemptedAt: ISODateString | null;
  /** What the receiver answered with. Null where it did not answer at all. */
  readonly lastStatusCode: number | null;
  readonly lastError: string | null;
  readonly deliveredAt: ISODateString | null;
  readonly deadLetteredAt: ISODateString | null;
  readonly abandonedAt: ISODateString | null;
  readonly abandonedReason: string | null;
  /** The delivery this one replays, where it is a replay. Null for an original. */
  readonly replayOfDeliveryId: Uuid | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ScheduleOutboundDeliveryParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subscriptionId: Uuid;
  readonly endpointId: Uuid;
  readonly eventType: string;
  readonly eventId: Uuid;
  readonly payloadFingerprint: string;
  readonly deliveryMode: DeliveryMode;
}

/** What one attempt against a receiver ended in, as the adapter observed it. */
export interface DeliveryFailure {
  /** The response status, or null where the attempt never got a response — a timeout, a refused connection. */
  readonly statusCode: number | null;
  /** What went wrong, in the words the adapter has. Truncated rather than refused if it is enormous. */
  readonly error: string;
}

// --- Guards ----------------------------------------------------------------------

/**
 * The longest failure text retained.
 *
 * Truncated rather than refused, because the alternative is losing the whole failure record over the size of
 * its diagnostic field. A receiver that answers a webhook with four megabytes of rendered error page has done
 * something unhelpful but not something that should cost the institution the knowledge that the delivery failed
 * at all — and the first kilobyte of that page contains the status line an operator actually needs.
 */
const MAX_ERROR_LENGTH = 1_000;

/** The range a response status has to be in to be worth recording as one. */
const MIN_STATUS_CODE = 100;
const MAX_STATUS_CODE = 599;

/** Normalise an event type and refuse it if it is blank or does not fit the platform's grammar. */
function requireEventType(value: string): string {
  const key = normalizeKey(value);
  if (key.length === 0) throw new EmptyGatewayKeyError("event type");
  if (!isValidKey(key)) throw new InvalidGatewayKeyError("event type", key);
  return key;
}

/**
 * Refuse a blank payload fingerprint, without asserting what shape a digest takes.
 *
 * The grammar is deliberately not checked. Which digest the outbox computes is the outbox's decision, and a
 * gateway that validated the hex length of a SHA-256 would have to be edited the day that changes — for no gain,
 * because nothing here interprets the value. It is compared for equality and shown to an operator, and both of
 * those work for any non-empty string.
 */
function requireFingerprint(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new EmptyGatewayKeyError("payload fingerprint");
  return trimmed;
}

/**
 * Reduce a receiver's status code to one worth recording, or to nothing.
 *
 * Absorbed rather than raised, and the argument is narrow enough to state exactly: nothing branches on this
 * field. It is carried so a person triaging a dead-letter queue can sort the 401s from the 502s, and refusing to
 * record a failure because the diagnostic number attached to it was out of range would discard the failure
 * itself — the thing the platform is actually obliged to remember — in order to protect a column nobody
 * computes with.
 */
const recordableStatus = (statusCode: number | null): number | null =>
  statusCode !== null &&
  Number.isInteger(statusCode) &&
  statusCode >= MIN_STATUS_CODE &&
  statusCode <= MAX_STATUS_CODE
    ? statusCode
    : null;

/** Reduce a failure message to the text retained for it, or to nothing where there is no text. */
function recordableError(error: string): string | null {
  const trimmed = error.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > MAX_ERROR_LENGTH ? trimmed.slice(0, MAX_ERROR_LENGTH) : trimmed;
}

/** Refuse any further attempt on a delivery that has reached an end. */
function requireUnsettled(delivery: OutboundDelivery): void {
  if (isTerminalDeliveryOutcome(delivery.outcome)) {
    throw new DeliverySettledError(delivery.id, delivery.outcome);
  }
}

// --- Scheduling ------------------------------------------------------------------

/**
 * Queue one event for one subscriber.
 *
 * Due immediately rather than after the first backoff interval. The backoff schedule is a schedule of retries,
 * and putting thirty seconds between an institution admitting a student and their integrator hearing about it
 * would be a delay nobody asked for, applied to the case where nothing has gone wrong.
 *
 * One delivery per subscription, not one per event. Five subscriptions selecting the same enrolment produce five
 * rows, because they will succeed and fail independently, retry on independent schedules and be replayed by
 * different people — and a single row with five outcomes hung off it is that same structure with the identity
 * removed.
 */
export function scheduleOutboundDelivery(params: ScheduleOutboundDeliveryParams): OutboundDelivery {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    subscriptionId: params.subscriptionId,
    endpointId: params.endpointId,
    eventType: requireEventType(params.eventType),
    eventId: params.eventId,
    payloadFingerprint: requireFingerprint(params.payloadFingerprint),
    deliveryMode: params.deliveryMode,
    outcome: INITIAL_DELIVERY_OUTCOME,
    attempts: 0,
    nextAttemptAt: now,
    lastAttemptedAt: null,
    lastStatusCode: null,
    lastError: null,
    deliveredAt: null,
    deadLetteredAt: null,
    abandonedAt: null,
    abandonedReason: null,
    replayOfDeliveryId: null,
    createdAt: now,
    updatedAt: now,
  };
}

// --- Attempts --------------------------------------------------------------------

/**
 * Refuse to attempt a delivery that should not be attempted, before anything is sent.
 *
 * Two refusals, and the second is not defensive padding. A dispatcher runs on more than one node, and the write
 * that dead-letters an exhausted delivery can lose a race with the read that claimed it — leaving a record that
 * still says `failed` while its attempt count says every allowance has been spent. Attempting it would send an
 * institution's event to a receiver a seventh time after the platform told the consumer it had stopped at six.
 * Checking the count rather than trusting the outcome closes that window at the only point where it matters.
 */
export function requireAttemptableDelivery(delivery: OutboundDelivery): void {
  requireUnsettled(delivery);
  if (delivery.attempts >= MAX_DELIVERY_ATTEMPTS) {
    throw new DeliveryAttemptsExhaustedError(delivery.id, delivery.attempts);
  }
}

/**
 * Record that the receiver accepted the delivery.
 *
 * The failure text is cleared. A delivered row carrying the message from the attempt before it reads, to every
 * operator scanning that column, as a delivery that failed — and the attempt count already says the receiver
 * took three goes to accept it, which is the part worth keeping.
 */
export function recordDeliverySuccess(
  delivery: OutboundDelivery,
  statusCode: number | null,
  at: ISODateString,
): OutboundDelivery {
  requireUnsettled(delivery);
  return {
    ...delivery,
    outcome: "delivered",
    attempts: delivery.attempts + 1,
    nextAttemptAt: null,
    lastAttemptedAt: at,
    lastStatusCode: recordableStatus(statusCode),
    lastError: null,
    deliveredAt: at,
    updatedAt: nowIso(),
  };
}

/**
 * Record that an attempt failed, and settle or reschedule the delivery accordingly.
 *
 * The schedule is computed here rather than handed in. A caller that planned the backoff itself would be
 * planning against the record it read, and between that read and this write the attempt count can have moved —
 * producing a plan whose `exhausted` flag decides dead-lettering on the strength of a stale number. Planning
 * from the aggregate's own count removes the question.
 *
 * **An at-most-once delivery dead-letters on its first failure**, whatever its allowance says. That is what the
 * consumer asked for: the *platform* will not try again, because their handler is not safe to run twice. It does
 * not follow that the event is gone — the row is retained and replayable, and a person who has looked at it and
 * decided the receiver is now safe may send it again. The distinction is between an automatic retry, which the
 * consumer refused, and a deliberate one, which they did not.
 */
export function recordDeliveryFailure(
  delivery: OutboundDelivery,
  failure: DeliveryFailure,
  at: ISODateString,
): OutboundDelivery {
  requireUnsettled(delivery);

  const attempts = delivery.attempts + 1;
  const plan = planBackoff({ deliveryId: delivery.id, attempt: attempts, lastAttemptedAt: at });
  const settled = plan.exhausted || delivery.deliveryMode === "at_most_once";

  return {
    ...delivery,
    outcome: settled ? "dead_lettered" : "failed",
    attempts,
    nextAttemptAt: settled ? null : plan.nextAttemptAt,
    lastAttemptedAt: at,
    lastStatusCode: recordableStatus(failure.statusCode),
    lastError: recordableError(failure.error),
    deadLetteredAt: settled ? at : delivery.deadLetteredAt,
    updatedAt: nowIso(),
  };
}

// --- Ending ----------------------------------------------------------------------

/**
 * Give up on a delivery deliberately, and record who decided that and why.
 *
 * The reason is required because this end is the only one nobody can reconstruct. A dead-lettered delivery
 * explains itself — six attempts, a status code, a message from the receiver — while an abandoned one has a
 * complete attempt history that stops for no visible cause, and the consumer asking why they never received it
 * deserves better than an empty column.
 */
export function abandonOutboundDelivery(
  delivery: OutboundDelivery,
  reason: string,
): OutboundDelivery {
  requireUnsettled(delivery);
  const trimmed = reason.trim();
  if (trimmed.length === 0) throw new EmptyGatewayKeyError("abandonment reason");
  const now = nowIso();
  return {
    ...delivery,
    outcome: "abandoned",
    nextAttemptAt: null,
    abandonedAt: now,
    abandonedReason: trimmed,
    updatedAt: now,
  };
}

/**
 * Send a dead-lettered delivery again, as a new delivery.
 *
 * A new record rather than a reset of the old one. Resetting would erase the evidence of the failure that
 * prompted the replay, which is the thing somebody will want when the replay fails too — and it would leave the
 * institution unable to answer *how many times did we send this*, which for an event that moves money or grades
 * is not a question the platform may shrug at. The chain is walkable through
 * {@link OutboundDelivery.replayOfDeliveryId}, and it names the immediate parent rather than the original so
 * that a delivery replayed three times reads as three replays and not as three unrelated retries.
 *
 * The endpoint is supplied rather than copied, because a replay goes where the subscription points *now*. The
 * ordinary reason a delivery dead-lettered is that its receiver was unreachable, and the ordinary remedy is that
 * the consumer moved it — so replaying to the address that failed would reliably fail again.
 */
export function replayOutboundDelivery(
  delivery: OutboundDelivery,
  endpointId: Uuid,
): OutboundDelivery {
  if (!isReplayableOutcome(delivery.outcome)) {
    throw new DeliveryNotReplayableError(delivery.id, delivery.outcome);
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: delivery.tenantId,
    organizationId: delivery.organizationId,
    subscriptionId: delivery.subscriptionId,
    endpointId,
    eventType: delivery.eventType,
    eventId: delivery.eventId,
    payloadFingerprint: delivery.payloadFingerprint,
    deliveryMode: delivery.deliveryMode,
    outcome: INITIAL_DELIVERY_OUTCOME,
    attempts: 0,
    nextAttemptAt: now,
    lastAttemptedAt: null,
    lastStatusCode: null,
    lastError: null,
    deliveredAt: null,
    deadLetteredAt: null,
    abandonedAt: null,
    abandonedReason: null,
    replayOfDeliveryId: delivery.id,
    createdAt: now,
    updatedAt: now,
  };
}

// --- Reading ---------------------------------------------------------------------

/** Whether the delivery has reached an end and will not be attempted again under this record. */
export const isOutboundDeliverySettled = (delivery: OutboundDelivery): boolean =>
  isTerminalDeliveryOutcome(delivery.outcome);

/**
 * Whether the dispatcher should pick this delivery up at the given instant.
 *
 * `asOf` is supplied rather than read, so that a sweep evaluates every candidate against one instant. A due
 * check that read the clock per row would let a delivery scheduled for the boundary fall on either side of it
 * depending on where in the batch it happened to sit.
 */
export function isOutboundDeliveryDue(delivery: OutboundDelivery, asOf: ISODateString): boolean {
  if (isOutboundDeliverySettled(delivery)) return false;
  if (delivery.nextAttemptAt === null) return false;
  if (delivery.attempts >= MAX_DELIVERY_ATTEMPTS) return false;
  return Date.parse(delivery.nextAttemptAt) <= Date.parse(asOf);
}

/**
 * The delivery as an operator working a queue sees it.
 *
 * `attemptsRemaining` reports zero for anything settled rather than the arithmetic remainder. A delivered
 * delivery has four attempts left in the same sense that a finished journey has four hours left in it, and a
 * queue view that showed the number would invite somebody to go looking for the retries that never came.
 */
export const toDeliveryView = (delivery: OutboundDelivery): DeliveryView =>
  Object.freeze({
    deliveryId: delivery.id,
    subscriptionId: delivery.subscriptionId,
    eventType: delivery.eventType,
    outcome: delivery.outcome,
    attempts: delivery.attempts,
    attemptsRemaining: isOutboundDeliverySettled(delivery)
      ? 0
      : Math.max(0, MAX_DELIVERY_ATTEMPTS - delivery.attempts),
    nextAttemptAt: delivery.nextAttemptAt,
    lastAttemptedAt: delivery.lastAttemptedAt,
    lastStatusCode: delivery.lastStatusCode,
    lastError: delivery.lastError,
    replayable: isReplayableOutcome(delivery.outcome),
  });
