import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyGatewayKeyError,
  IdempotencyKeyConflictError,
  IdempotencyKeyTooLongError,
  IdempotencyRecordSettledError,
  InvalidGatewayKeyError,
  InvalidRecordedStatusError,
  OperationInFlightError,
} from "./errors";
import {
  type HttpMethod,
  IDEMPOTENCY_RETENTION_SECONDS,
  type IdempotencyState,
  MAX_IDEMPOTENCY_KEY_LENGTH,
  isHttpStatusCode,
  isValidKey,
  normalizeKey,
} from "./gateway-value";
import type { IdempotencyProbe, IdempotencyVerdict } from "./gateway-view";

/**
 * The platform's memory that a named operation has already been attempted, and what came of it.
 *
 * A record exists so that the second arrival of a request the caller has already sent produces the first one's
 * answer instead of a second enrolment, a second invoice or a second payment. That is the whole of its purpose,
 * and everything below follows from taking it literally.
 *
 * **The request never arrives here, only a digest of it.** The same stance the delivery aggregate takes, for the
 * same reason: comparing two requests requires only that they can be told apart, and a ledger holding request
 * bodies is a second copy of every mutation the institution has made, sitting in a table nobody thinks of as
 * sensitive. `responseRef` is a handle for the same reason — a replay needs the stored response, and this package
 * needs only to know that one exists.
 *
 * **The key is the caller's, and is preserved as they wrote it.** Every other key in this package is normalised
 * to lowercase and checked against the platform's grammar, and this one is deliberately neither. A capability key
 * is a name the platform issues and resolves, so two spellings of it must mean one thing. An idempotency key is
 * an opaque token the client generated — usually a UUID, sometimes a hash of their own order number — and the
 * platform's only interest in it is whether two of them are the same string. Folding case would silently merge
 * two keys a client believes are distinct, which turns their correct code into a lost mutation. It is trimmed,
 * because surrounding whitespace is a transport artefact rather than a choice, and it is length-limited, because
 * a key of a hundred kilobytes is not a key.
 *
 * **`conflicted` is entered only from `in_flight`, and that asymmetry is the design.** When a key is reused with
 * a different request, what the ledger does about the *existing* record depends on whether that record has an
 * answer yet. A `completed` record is unambiguous — its result is bound to the fingerprint that produced it — so
 * the conflicting request is refused and the record is left exactly as it was, and the original caller's retry
 * still replays correctly. An `in_flight` record has no answer and no way to acquire an honest one: two different
 * requests are now outstanding under one key, and whichever finishes first will complete a record the other
 * caller will then read as theirs. There is no version of that which is not a lie, so the key is marked
 * conflicted, the completion is refused when it arrives, and both callers are told plainly that they collided.
 * The alternative — poisoning a completed record too — is tidier to describe and worse to live with: it converts
 * one caller's bug into a failure for the innocent retry that was already in flight.
 *
 * **Nothing here deletes, and expiry is read rather than enforced.** A record past
 * {@link IDEMPOTENCY_RETENTION_SECONDS} is treated as absent by {@link inspectIdempotency}, so a key recycled a
 * week later by an unrelated operation proceeds normally. Removing the row is the adapter's housekeeping, and it
 * can run late without changing a single answer this module gives.
 */

// --- The aggregate ---------------------------------------------------------------

export interface IdempotencyRecord {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The consumer that presented the key. Keys are unique within a consumer, never across the tenant. */
  readonly consumerId: Uuid;
  /** The caller's token, trimmed and otherwise verbatim. */
  readonly idempotencyKey: string;
  /** The capability the key was spent on, so an operator can say what a key was for. */
  readonly capabilityKey: string;
  /** The method it was spent under, because one capability is published under more than one. */
  readonly method: HttpMethod;
  /** A digest of the request this key belongs to. The request itself never reaches this package. */
  readonly payloadFingerprint: string;
  readonly state: IdempotencyState;
  /** The status a replay answers with, present exactly when the record is completed. */
  readonly recordedStatus: number | null;
  /** A handle to the stored response, or null where the operation produced no body. */
  readonly responseRef: string | null;
  readonly completedAt: ISODateString | null;
  readonly conflictedAt: ISODateString | null;
  /** When the record stops being honoured, stamped at the start so the row explains its own lifetime. */
  readonly expiresAt: ISODateString;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface BeginIdempotentOperationParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly consumerId: Uuid;
  readonly idempotencyKey: string;
  readonly capabilityKey: string;
  readonly method: HttpMethod;
  readonly payloadFingerprint: string;
  /** The instant the operation began. Retention is measured from here, never from a clock read inside. */
  readonly asOf: ISODateString;
}

/** What an operation ended in, as the composition root observed it. */
export interface OperationResult {
  readonly statusCode: number;
  /** A handle to the stored response, or null where there is nothing to replay but a status. */
  readonly responseRef: string | null;
}

// --- Guards ----------------------------------------------------------------------

const MILLISECONDS_PER_SECOND = 1_000;

/**
 * Accept a caller's key on the only two terms the platform has: that it is not empty and not enormous.
 *
 * Refused rather than hashed when it is too long. Hashing would keep the request working and would mean the key
 * an integrator sees in their own logs is not the key the platform stored, so the first support conversation
 * about a duplicate charge is spent establishing that the two systems are talking about the same thing.
 */
export function requireIdempotencyKey(value: string): string {
  const key = value.trim();
  if (key.length === 0) throw new EmptyGatewayKeyError("idempotency key");
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new IdempotencyKeyTooLongError(key.length, MAX_IDEMPOTENCY_KEY_LENGTH);
  }
  return key;
}

/** Normalise a platform key and refuse it if it is blank or does not fit the platform's grammar. */
function requireKey(kind: string, value: string): string {
  const key = normalizeKey(value);
  if (key.length === 0) throw new EmptyGatewayKeyError(kind);
  if (!isValidKey(key)) throw new InvalidGatewayKeyError(kind, key);
  return key;
}

/**
 * Require a digest without saying anything about its grammar.
 *
 * The algorithm belongs to whoever computes it, and this module's only interest is that two digests of the same
 * request are the same string. Checking for hex of a fixed width would make changing the digest a change to this
 * file, which is precisely the coupling the fingerprint exists to avoid.
 */
function requireFingerprint(value: string): string {
  const fingerprint = value.trim();
  if (fingerprint.length === 0) throw new EmptyGatewayKeyError("payload fingerprint");
  return fingerprint;
}

/** A handle to a stored response, or null. A completion with no body is ordinary, not an error. */
function optionalResponseRef(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Refuse to write against a record that has already reached an end. */
function requireInFlight(record: IdempotencyRecord): void {
  if (record.state !== "in_flight") {
    throw new IdempotencyRecordSettledError(record.idempotencyKey, record.state);
  }
}

// --- Beginning -------------------------------------------------------------------

/**
 * Open the ledger against a key, claiming it for one request.
 *
 * Called only after {@link inspectIdempotency} has said `proceed`, and deliberately not merged with it: the
 * lookup and the claim are two statements in the adapter's transaction, and the unique constraint on
 * `(tenant, consumer, key)` is what actually resolves a race between two nodes that both read nothing. This
 * function's job is to produce the row that constraint is applied to.
 */
export function beginIdempotentOperation(
  params: BeginIdempotentOperationParams,
): IdempotencyRecord {
  const timestamp = nowIso();
  const expiresAt = new Date(
    Date.parse(params.asOf) + IDEMPOTENCY_RETENTION_SECONDS * MILLISECONDS_PER_SECOND,
  ).toISOString() as ISODateString;

  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    consumerId: params.consumerId,
    idempotencyKey: requireIdempotencyKey(params.idempotencyKey),
    capabilityKey: requireKey("capability key", params.capabilityKey),
    method: params.method,
    payloadFingerprint: requireFingerprint(params.payloadFingerprint),
    state: "in_flight",
    recordedStatus: null,
    responseRef: null,
    completedAt: null,
    conflictedAt: null,
    expiresAt,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

// --- Ending ----------------------------------------------------------------------

/**
 * Record what the operation produced, so the next arrival of the same request is answered rather than repeated.
 *
 * The status is refused rather than absorbed if it is not a status, because this number is replayed to a caller
 * as their response code. Everything else about the response stays behind the handle.
 */
export function completeIdempotentOperation(
  record: IdempotencyRecord,
  result: OperationResult,
  at: ISODateString,
): IdempotencyRecord {
  requireInFlight(record);
  if (!isHttpStatusCode(result.statusCode)) {
    throw new InvalidRecordedStatusError(record.idempotencyKey, result.statusCode);
  }

  return {
    ...record,
    state: "completed",
    recordedStatus: result.statusCode,
    responseRef: optionalResponseRef(result.responseRef),
    completedAt: at,
    updatedAt: nowIso(),
  };
}

/**
 * Mark a key as collided, because two different requests are outstanding under it and neither can be answered.
 *
 * Only reachable from `in_flight`, which is the rule the module comment argues for at length: a completed record
 * has an answer that belongs to a known request and is left alone, and a record that has already collided has
 * nothing left to say. Both of those arrive here as {@link IdempotencyRecordSettledError} rather than as a
 * quietly repeated write.
 */
export function markIdempotencyConflict(
  record: IdempotencyRecord,
  at: ISODateString,
): IdempotencyRecord {
  requireInFlight(record);

  return { ...record, state: "conflicted", conflictedAt: at, updatedAt: nowIso() };
}

// --- Reading ---------------------------------------------------------------------

/** Whether the record has reached an end, and so cannot be written against again. */
export const isIdempotencyRecordSettled = (record: IdempotencyRecord): boolean =>
  record.state !== "in_flight";

/** Whether retention has run out, at an instant the caller names. The expiry instant itself counts as expired. */
export const isIdempotencyRecordExpired = (
  record: IdempotencyRecord,
  asOf: ISODateString,
): boolean => Date.parse(asOf) >= Date.parse(record.expiresAt);

// --- The ledger ------------------------------------------------------------------

const settledVerdict = (
  disposition: "proceed" | "conflict" | "in_flight",
  expired: boolean,
): IdempotencyVerdict =>
  Object.freeze({ disposition, recordedStatus: null, recordedAt: null, expired });

/**
 * What the ledger says about a key: go ahead, here is the earlier answer, wait, or you have a bug.
 *
 * `record` is `null` when nothing was found, and the null case and the expired case give the same disposition
 * for a reason worth stating — a caller acts identically on both, and the `expired` flag exists so that the
 * *platform* can tell them apart in a metric. A rise in expired proceeds is a client whose retries outlive the
 * retention window, which is a conversation worth having and is invisible if both cases look like an empty
 * lookup.
 *
 * The checks are ordered expiry, identity, collision, difference, state, and each earns its place.
 *
 * Expiry is first because an expired record is absent, and a key recycled a week later must not be judged
 * against what an unrelated operation did with it.
 *
 * Identity is second and looks redundant, because the record was found *by* this key. It is here because every
 * other key in this package is case-folded and this one is not, and the store is where that difference gets
 * lost: a case-insensitive collation, or an index built over `lower(idempotency_key)`, hands back a record whose
 * key is not the key that was asked for. Answering `conflict` is the safe reading — under the store's collation
 * these two keys genuinely collide — and the remedy the error names, use a distinct key, is the right one.
 *
 * Collision comes before difference because a conflicted key has no honest answer for anybody, including a
 * caller whose fingerprint happens to match the one stored.
 */
export function inspectIdempotency(
  record: IdempotencyRecord | null,
  probe: IdempotencyProbe,
): IdempotencyVerdict {
  const key = requireIdempotencyKey(probe.idempotencyKey);
  const fingerprint = requireFingerprint(probe.payloadFingerprint);

  if (record === null) return settledVerdict("proceed", false);
  if (isIdempotencyRecordExpired(record, probe.asOf)) return settledVerdict("proceed", true);
  if (record.idempotencyKey !== key) return settledVerdict("conflict", false);
  if (record.state === "conflicted") return settledVerdict("conflict", false);
  if (record.payloadFingerprint !== fingerprint) return settledVerdict("conflict", false);
  if (record.state === "in_flight") return settledVerdict("in_flight", false);

  return Object.freeze({
    disposition: "replay" as const,
    recordedStatus: record.recordedStatus,
    recordedAt: record.completedAt,
    expired: false,
  });
}

/**
 * Turn the two dispositions that are failures into the errors that carry them out of the platform.
 *
 * `proceed` and `replay` both return, because both are successful outcomes that the caller then acts on
 * differently. Only waiting and colliding are errors, and they are separate ones: an integrator whose retry
 * arrived too early should retry again, and an integrator who reused a key must change their code.
 */
export function requireUsableIdempotency(
  verdict: IdempotencyVerdict,
  idempotencyKey: string,
): void {
  if (verdict.disposition === "in_flight") throw new OperationInFlightError(idempotencyKey);
  if (verdict.disposition === "conflict") throw new IdempotencyKeyConflictError(idempotencyKey);
}
