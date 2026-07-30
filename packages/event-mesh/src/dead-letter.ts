import { isValidIso, newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { FIRST_ATTEMPT, isRetriableFailure } from "./delivery";
import {
  DeadLetterNotReplayableError,
  DeadLetterSettledError,
  EmptyMeshKeyError,
  InvalidMeshCountError,
  InvalidMeshInstantError,
  InvalidMeshKeyError,
  ReasonTooLongError,
  ReasonTooShortError,
} from "./errors";
import { inspectDeadLetterTransition } from "./lifecycle";
import {
  type DeadLetterReason,
  type DeadLetterStatus,
  FIRST_SEQUENCE,
  INITIAL_DEAD_LETTER_STATUS,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  fixedWidthInstant,
  isTerminalDeadLetterStatus,
  isValidKey,
  normalizeKey,
} from "./mesh-value";
import { FIRST_PARTITION } from "./partitioning";

/**
 * A dead letter: one message one subscription could not process, and what somebody decided to do about it.
 *
 * This is the record the institution is actually audited on. Everything else in the package describes what the
 * mesh intends to do; this describes what it failed to do, and it is the only place a fact the platform
 * accepted and never processed leaves a trace. So the shape is chosen around a question asked long afterwards
 * — what did we drop, and who agreed to it — rather than around what is convenient to write at the moment of
 * failure.
 *
 * **It keeps a trace rather than a message.** No payload, no digest, and — the tempting one — no consumer error
 * text. A consumer explaining why it rejected a fact almost always quotes the fact, so a free-text detail column
 * here would quietly become the one place in the platform where payload fragments accumulate outside every
 * retention rule the streams declare, on a table nothing sweeps. What is kept instead is the closed-set
 * {@link DeadLetterReason}, which is what an operator groups by, and {@link DeadLetter.traceId}, which is where
 * the consumer's own account of the failure already lives in full and under its own retention.
 *
 * **The attempt count arrives rather than being counted here.** The delivery loop tries, {@link decideDelivery}
 * decides that the ceiling is reached, and this records the number that was reached. An aggregate that
 * incremented its own counter would be a second tally of the same thing, and the two would disagree the first
 * time a delivery crashed between the attempt and the write.
 *
 * **Both end states are terminal, neither deletes the row, and there is no way back from either.** A message
 * that was replayed and failed again is a *new* dead letter rather than a reopened one. That is more rows and
 * it is the right number of rows: two failures of one message are two events, and collapsing them would lose
 * the fact that somebody tried.
 *
 * **A discard carries a reason and a replay does not.** The asymmetry is deliberate. Replaying is asking the
 * mesh to do again what it was always meant to do, and the justification for it sits on the replay request
 * alongside the approval; discarding is the decision to lose the fact permanently, and this record is the only
 * place anybody will ever look for why that was acceptable.
 *
 * Nothing here asks what else the tenant holds. Whether this subscription already has an open dead letter for
 * this message is a directory question, and by the rule above the answer would not change what is written: the
 * same message failing twice is two rows on purpose.
 */

// --- The aggregate ---------------------------------------------------------------

export interface DeadLetter {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The subscription that could not process the message, by identity, which is what the refusals name. */
  readonly subscriptionId: Uuid;
  /** And by key, so the query an operator runs first — what is failing, grouped — needs no join to be read. */
  readonly subscriptionKey: string;
  readonly streamKey: string;
  /** The recorded message this is about. Held because it is what a replay of this dead letter would send. */
  readonly messageId: Uuid;
  /** And the event it carried, which is the id every other capability in the platform knows the fact by. */
  readonly eventId: Uuid;
  readonly eventTypeKey: string;
  /** Where on the stream it sat. Kept because a partition that fails wholesale is a different fault. */
  readonly partition: number;
  readonly sequence: number;
  readonly reason: DeadLetterReason;
  /** How many deliveries were tried before the mesh gave up. Counted by the loop, recorded here. */
  readonly attempts: number;
  /** The trace the failed delivery belongs to: the handle on the consumer's own account of what went wrong. */
  readonly traceId: string;
  /** When the last attempt failed. Supplied, because the failure happened before this record was written. */
  readonly failedAt: ISODateString;
  readonly status: DeadLetterStatus;
  /** When somebody decided what to do about it. Null for as long as nobody has. */
  readonly settledAt: ISODateString | null;
  readonly settledBy: Uuid | null;
  /** Why it was given up on. Set on a discard and null on a replay, which needs no separate justification. */
  readonly discardReason: string | null;
  /** The replay that sent it again, where one did. Null on an open or discarded record. */
  readonly replayId: Uuid | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RecordDeadLetterParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subscriptionId: Uuid;
  readonly subscriptionKey: string;
  readonly streamKey: string;
  readonly messageId: Uuid;
  readonly eventId: Uuid;
  readonly eventTypeKey: string;
  readonly partition: number;
  readonly sequence: number;
  readonly reason: DeadLetterReason;
  /** How many deliveries were tried. At least one, since a message nobody attempted has not failed. */
  readonly attempts: number;
  readonly traceId: string;
  readonly failedAt: ISODateString;
}

export interface DiscardDeadLetterParams {
  readonly discardedBy: Uuid;
  /** Why losing this fact permanently is acceptable. The only place that question is ever answered. */
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
 * A figure that has to be a whole number at or above a floor.
 *
 * Non-operational, like every count guard in the package, because nobody outside the platform contributes any of
 * these: the partition was assigned by the partitioner, the sequence by the message store, the attempt number by
 * the delivery loop. A figure that is not one of those means the caller is not the mesh.
 */
function requireWhole(name: string, value: number, floor: number): number {
  if (!Number.isInteger(value) || value < floor) {
    throw new InvalidMeshCountError(name, value, `must be a whole number of at least ${floor}`);
  }
  return value;
}

/**
 * An instant, normalised to fixed width so that the column it lands in sorts chronologically as text.
 *
 * The same guard the envelope engine applies, and for the same reason: `failedAt` is what a sweep and a *what
 * broke last week* query both range over, and ISO strings only compare correctly as strings when every one of
 * them has the same shape.
 */
function requireInstant(field: string, value: ISODateString): ISODateString {
  if (!isValidIso(value)) {
    throw new InvalidMeshInstantError(field, value);
  }
  return fixedWidthInstant(value);
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

/**
 * Ask the lifecycle engine whether a status move is permitted, and raise the refusal that reads best.
 *
 * With one live state and two terminal ones, every refusal this can see means the same thing — somebody already
 * settled the record — so the choice is not between causes but between two ways of saying so. A refused replay
 * gets {@link DeadLetterNotReplayableError}, which names the rule the caller ran into: a discarded dead letter is
 * a decision, and replaying it would reverse that decision without anybody recording that they had. A refused
 * discard gets {@link DeadLetterSettledError}, because there is no rule to explain, only a first decision that
 * already stands.
 */
function requireDeadLetterTransition(letter: DeadLetter, to: DeadLetterStatus): void {
  const verdict = inspectDeadLetterTransition(letter.status, to);
  if (verdict.allowed) return;
  if (to === "replayed") {
    throw new DeadLetterNotReplayableError(letter.id, letter.status);
  }
  throw new DeadLetterSettledError(letter.id, letter.status);
}

// --- Definition ------------------------------------------------------------------

/**
 * Record a message that a subscription could not process, open for somebody to decide about.
 *
 * It starts open and no parameter settles it on creation, which is the same argument the binding makes about
 * activation: the one thing that must never happen by default is the institution losing a fact without anybody
 * choosing to. An open dead letter is a work item; a record written straight into `discarded` would be a work
 * item nobody was asked about.
 *
 * @throws {EmptyMeshKeyError} when the subscription, stream or event type key is blank.
 * @throws {InvalidMeshKeyError} when any of them does not fit the platform's grammar.
 * @throws {InvalidMeshCountError} when the partition, sequence or attempt count is not the figure it must be.
 * @throws {InvalidMeshInstantError} when the failure instant is not readable as a moment in time.
 */
export function recordDeadLetter(params: RecordDeadLetterParams): DeadLetter {
  const subscriptionKey = requireKey("subscription", params.subscriptionKey);
  const streamKey = requireKey("stream", params.streamKey);
  const eventTypeKey = requireKey("event type", params.eventTypeKey);
  const partition = requireWhole("partition", params.partition, FIRST_PARTITION);
  const sequence = requireWhole("sequence", params.sequence, FIRST_SEQUENCE);
  const attempts = requireWhole("delivery attempts", params.attempts, FIRST_ATTEMPT);
  const failedAt = requireInstant("failedAt", params.failedAt);

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    subscriptionId: params.subscriptionId,
    subscriptionKey,
    streamKey,
    messageId: params.messageId,
    eventId: params.eventId,
    eventTypeKey,
    partition,
    sequence,
    reason: params.reason,
    attempts,
    traceId: params.traceId,
    failedAt,
    status: INITIAL_DEAD_LETTER_STATUS,
    settledAt: null,
    settledBy: null,
    discardReason: null,
    replayId: null,
    createdAt: now,
    updatedAt: now,
  };
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Close the record because the message was sent again, under a replay that is itself on the record.
 *
 * The replay id is required rather than optional, and that is the whole of the attribution. A dead letter marked
 * replayed with nothing to point at says a message was re-sent by somebody, at some point, over some window,
 * with no way to find out which — and the request it names carries the reason, the approver and the outcome.
 * Marking this settled is the last step of that replay rather than a separate decision anybody makes.
 *
 * Whether the replay actually succeeded is deliberately not asked. A replay that ran and failed leaves its own
 * failure on its own record, and a message that fails again arrives here as a new dead letter.
 *
 * @throws {DeadLetterNotReplayableError} when the record was already settled, whichever way it was settled.
 */
export function replayDeadLetter(letter: DeadLetter, replayId: Uuid, replayedBy: Uuid): DeadLetter {
  requireDeadLetterTransition(letter, "replayed");
  const now = nowIso();
  return {
    ...letter,
    status: "replayed",
    settledAt: now,
    settledBy: replayedBy,
    replayId,
    updatedAt: now,
  };
}

/**
 * Close the record because somebody decided the message will not be processed, and said why.
 *
 * Terminal and irreversible, and the reason is mandatory for a reason that is worth stating plainly: this is the
 * operation by which an institution loses a fact it accepted. Every other refusal in this package protects
 * against that happening by accident. This one is how it happens on purpose, and the only thing separating the
 * two, months later, is a sentence somebody had to type.
 *
 * @throws {DeadLetterSettledError} when the record was already settled, whichever way it was settled.
 * @throws {ReasonTooShortError} when no real explanation was given.
 * @throws {ReasonTooLongError} when the explanation is a document rather than a record.
 */
export function discardDeadLetter(letter: DeadLetter, params: DiscardDeadLetterParams): DeadLetter {
  requireDeadLetterTransition(letter, "discarded");
  const reason = requireReason("discarding a dead letter", params.reason);
  const now = nowIso();
  return {
    ...letter,
    status: "discarded",
    settledAt: now,
    settledBy: params.discardedBy,
    discardReason: reason,
    updatedAt: now,
  };
}

// --- Reading ---------------------------------------------------------------------

/** Still waiting on a decision: open, and nothing else. The work queue an operator is meant to empty. */
export const isDeadLetterOpen = (letter: DeadLetter): boolean =>
  !isTerminalDeadLetterStatus(letter.status);

/**
 * Whether the failure is one a further attempt could plausibly fix.
 *
 * Delegated to {@link isRetriableFailure} rather than restated, so that the answer a triage screen shows and the
 * answer the delivery engine acted on cannot drift apart. It is a hint about the reason and not a statement
 * about this record: a retriable dead letter that has been discarded stays discarded.
 */
export const isDeadLetterRetriable = (letter: DeadLetter): boolean =>
  isRetriableFailure(letter.reason);
