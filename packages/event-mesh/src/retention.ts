import { isValidIso, parseIso, toIso } from "@knowget/shared";
import type { ISODateString } from "@knowget/types";
import { InvalidMeshCountError, InvalidMeshInstantError, InvalidRetentionError } from "./errors";
import { MAX_RETENTION_SECONDS, MIN_RETENTION_SECONDS, isReplayable } from "./mesh-value";
import type { RetentionRequest, RetentionVerdict } from "./mesh-view";

/**
 * The engine that says how long the mesh keeps what it carried, and therefore what can still be replayed.
 *
 * Retention is the quietest consequential decision in this contract. Nobody notices it while it is working;
 * the two ways it fails are noticed a year apart and by different people. Set too short, a reconciliation
 * arrives to find the month it was reconciling already swept, and there is no recovering it. Set too long, or
 * left unset, the mesh becomes an undeclared archive of every fact the institution has ever recorded —
 * safeguarding notes, wellbeing observations, payroll amounts — held by nobody's decision and discovered during
 * a subject access request. The ceiling in the vocabulary exists because "keep it forever" is not a retention
 * policy, and this engine exists so that the policy is applied by one function rather than by each caller's
 * arithmetic.
 *
 * **The window is half-open, `[recordedAt, expiresAt)`.** A message retained for an hour is gone at the three
 * thousand six hundredth second rather than at the next one. The choice matters less than its being made once:
 * the sweep that deletes and the read that refuses both come through here, so a message cannot be deleted by
 * one boundary and still be offered by the other, which is the shape of the bug that produces a replay
 * returning fewer messages than it promised without failing.
 *
 * **Retention runs from when the mesh took custody.** {@link RetentionRequest.recordedAt} rather than the
 * moment the fact occurred, because a message published late by a relay that had been down would otherwise
 * arrive already expired and be swept before any consumer read it — the failure mode being that an outage
 * silently deletes exactly the messages the outage delayed.
 *
 * **Retention and payload class are separate questions with one answer surface.** A message can be inside its
 * window on a stream that never kept a payload, and the requester who is told only "cannot replay" will ask
 * somebody which of the two it was. {@link assessRetention} answers both at once, which is the only reason it
 * exists alongside the predicates.
 *
 * Nothing here reads a clock. `asOf` is an argument, so a sweep that ran last night can be re-derived exactly,
 * and an operator asking why a message was gone on Tuesday gets the same answer on Friday.
 */

// --- Windows ---------------------------------------------------------------------

/**
 * Check the retention window a stream declared.
 *
 * Both bounds are refusals rather than clamps and the reasons differ. Below the floor, a stream retaining less
 * than an hour cannot survive a consumer restart, so the subscription is losing messages by configuration and
 * the mesh's guarantee is void for it. Above the ceiling, the institution has quietly acquired an archive; the
 * refusal is what makes somebody choose the number, and a stream that genuinely needs a decade of history needs
 * a data product built for it rather than a broker holding everything by default.
 *
 * @throws {InvalidRetentionError} when the window is not a whole number of seconds in the supported range.
 */
export function validateRetention(streamKey: string, retentionSeconds: number): number {
  if (
    !Number.isInteger(retentionSeconds) ||
    retentionSeconds < MIN_RETENTION_SECONDS ||
    retentionSeconds > MAX_RETENTION_SECONDS
  ) {
    throw new InvalidRetentionError(
      streamKey,
      retentionSeconds,
      MIN_RETENTION_SECONDS,
      MAX_RETENTION_SECONDS,
    );
  }
  return retentionSeconds;
}

/**
 * The same range, guarded where the figure has come from a stream record rather than from an integrator.
 *
 * {@link InvalidMeshCountError} rather than {@link InvalidRetentionError}, for the reason the partitioning
 * engine draws the same distinction: by the time a message is being aged, the window has come from a row this
 * package validated on the way in, so a bad one is not somebody's mistake to correct but a row written by
 * something that is not the aggregate. Absorbing it would compute an expiry from a nonsense number and sweep
 * messages nobody agreed to lose.
 */
const checkedSeconds = (retentionSeconds: number): number => {
  if (
    !Number.isInteger(retentionSeconds) ||
    retentionSeconds < MIN_RETENTION_SECONDS ||
    retentionSeconds > MAX_RETENTION_SECONDS
  ) {
    throw new InvalidMeshCountError(
      "retention window",
      retentionSeconds,
      `must be a whole number of seconds between ${MIN_RETENTION_SECONDS} and ${MAX_RETENTION_SECONDS}`,
    );
  }
  return retentionSeconds;
};

// --- Expiry ----------------------------------------------------------------------

/** An instant, refused rather than coerced when it is not one. `Invalid Date` arithmetic yields `NaN`. */
const instantAt = (field: string, value: ISODateString): number => {
  if (!isValidIso(value)) {
    throw new InvalidMeshInstantError(field, value);
  }
  return parseIso(value).getTime();
};

/**
 * When a message recorded at a given moment stops being retained.
 *
 * Computed and stored on the message rather than derived at read time, which is the point of exposing it. A
 * sweep that recomputed the expiry of every row from its stream's current window would silently re-age a year
 * of history the moment somebody shortened the window — deleting, in one job, messages that were inside their
 * window when they were accepted. Stamping the expiry at write time means a change to a stream's retention
 * applies to what the stream carries next, and the messages already on it keep the promise they were given.
 *
 * The result is in the fixed width every comparison in this package assumes, because the column it lands in is
 * compared lexically by the store.
 *
 * @throws {InvalidMeshInstantError} when `recordedAt` is not readable as a moment in time.
 * @throws {InvalidMeshCountError} when the window is not one the platform permits.
 */
export function retentionExpiry(
  recordedAt: ISODateString,
  retentionSeconds: number,
): ISODateString {
  const recorded = instantAt("recordedAt", recordedAt);
  return toIso(new Date(recorded + checkedSeconds(retentionSeconds) * 1_000));
}

/**
 * The instant before which everything on a stream with this window has expired.
 *
 * The bound a sweep compares against, expressed as one value so that the comparison is a single indexed range
 * scan rather than a computation per row. The caller deletes where `recordedAt` is at or before this, which is
 * the half-open window read from the other end.
 *
 * @throws {InvalidMeshInstantError} when `asOf` is not readable as a moment in time.
 * @throws {InvalidMeshCountError} when the window is not one the platform permits.
 */
export function retentionCutoff(asOf: ISODateString, retentionSeconds: number): ISODateString {
  const now = instantAt("asOf", asOf);
  return toIso(new Date(now - checkedSeconds(retentionSeconds) * 1_000));
}

/**
 * Whether a message is still inside its window at a given moment.
 *
 * The predicate every read path asks, so that a message the sweep would have deleted is not served by a query
 * that ran a minute before the sweep did. Sweeps are periodic and expiry is continuous; without this, the
 * window an institution actually gets is its declared window plus however long it is until the job next runs,
 * which is not a number anybody agreed to.
 */
export function isRetained(
  recordedAt: ISODateString,
  retentionSeconds: number,
  asOf: ISODateString,
): boolean {
  const expiry = instantAt("recordedAt", recordedAt) + checkedSeconds(retentionSeconds) * 1_000;
  return instantAt("asOf", asOf) < expiry;
}

// --- Assessment ------------------------------------------------------------------

/**
 * Everything the mesh can say about one message at one moment.
 *
 * `replayable` is the conjunction that a replay request is actually refused on, and having it computed here
 * rather than at each caller is what keeps the two halves of it together. A message inside its window on a
 * `none` stream is retained and not replayable; a message on a `full` stream that has aged out is neither; and
 * a requester told only that their replay was refused would have to guess which, with the two remedies being
 * *ask for a shorter window* and *there is nothing to ask for*.
 *
 * `remainingSeconds` is floored at zero rather than going negative, because it is read as "how long do I have"
 * and a negative answer to that question is a subtraction rather than a fact. How long ago a message expired is
 * derivable from `expiresAt`, which is on the verdict for exactly that reason.
 *
 * @throws {InvalidMeshInstantError} when either instant is not readable as a moment in time.
 * @throws {InvalidMeshCountError} when the stream record's window is not one the platform permits.
 */
export function assessRetention(request: RetentionRequest): RetentionVerdict {
  const recorded = instantAt("recordedAt", request.recordedAt);
  const asOf = instantAt("asOf", request.asOf);
  const expiry = recorded + checkedSeconds(request.retentionSeconds) * 1_000;
  const retained = asOf < expiry;

  return Object.freeze({
    streamKey: request.streamKey,
    expiresAt: toIso(new Date(expiry)),
    retained,
    replayable: retained && isReplayable(request.retention),
    remainingSeconds: Math.max(0, Math.floor((expiry - asOf) / 1_000)),
  });
}
