import { toIso } from "@knowget/shared";
import type { Uuid } from "@knowget/types";
import { InvalidAttemptNumberError } from "./errors";
import { BACKOFF_BASE_SECONDS, BACKOFF_JITTER_RATIO, MAX_DELIVERY_ATTEMPTS } from "./gateway-value";
import type { BackoffPlan, BackoffRequest } from "./gateway-view";

/**
 * When a failed delivery should be tried again, and when it should stop being tried.
 *
 * The schedule itself is a table rather than a formula, and the reason it is worth having an engine around a
 * table at all is the jitter. A vendor's forty-minute outage fails every delivery the institution had queued for
 * them; without jitter all of those deliveries come back at the same second, and the receiver — which has just
 * finished recovering — is knocked over by the thundering herd of things that were waiting for it. Spreading the
 * return is not an optimisation, it is the difference between an outage that ends and one that repeats.
 *
 * **The jitter is derived, not drawn.** It comes from a hash of the delivery's own identifier mixed with the
 * attempt number, and there is no random source anywhere in this package. Two properties follow, and the second
 * is the one that matters on a support call: deliveries spread across the interval because their identifiers
 * differ, and any one delivery's whole schedule can be recomputed from its row months later. A platform that
 * jittered randomly could tell an integrator that their webhook was late, and could never tell them by how much
 * it was supposed to be.
 *
 * Mixing the attempt in rather than hashing the identifier alone is deliberate. A per-delivery offset held
 * constant across attempts would spread the first wave and then have that same wave arrive in exactly the same
 * order, at exactly the same relative offsets, at every subsequent step — a herd that has been reshuffled once
 * and never again. Varying by attempt re-draws the order at each step.
 *
 * **Nothing here reads a clock or throws for anything a receiver did.** The instant a plan is measured from
 * arrives on the request, and the only error raised is for an attempt counter that is not a count, which no
 * consumer and no receiver can cause.
 */

// --- The schedule ----------------------------------------------------------------

const MILLISECONDS_PER_SECOND = 1_000;

/**
 * The published interval after `attempt` attempts have been made, before jitter.
 *
 * Indexed one behind the attempt count, because the interval that follows the *first* attempt is the first
 * entry. Six attempts have five waits between them, so the table's last entry is never consumed: it is there
 * because {@link MAX_DELIVERY_ATTEMPTS} derives from the same literal that supplies the intervals, which is what
 * makes lengthening the schedule a single edit that raises the allowance and provides the new interval together
 * rather than two edits that can disagree.
 *
 * The fallback is unreachable — an exhausted plan never asks — and exists because an index into a readonly array
 * is checked rather than assumed under this repository's compiler settings.
 */
const baseSecondsAfter = (attempt: number): number => BACKOFF_BASE_SECONDS[attempt - 1] ?? 0;

// --- Derived jitter --------------------------------------------------------------

/** FNV-1a offset basis and prime. A hash chosen for spread and speed over short strings, not for secrecy. */
const FNV_OFFSET_BASIS = 2_166_136_261;
const FNV_PRIME = 16_777_619;

/** The granularity the jitter fraction is quantised to. Fine enough to spread, coarse enough to reason about. */
const JITTER_STEPS = 1_000;

/**
 * A stable number in `[0, 1)` derived from a delivery and one of its attempts.
 *
 * FNV-1a rather than anything cryptographic: nothing here is a secret, nobody gains by predicting when their own
 * webhook retries, and a hash an engineer can reimplement in four lines is a hash a support engineer can check a
 * disputed schedule against.
 */
function spreadOf(deliveryId: Uuid, attempt: number): number {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < deliveryId.length; index += 1) {
    hash = Math.imul(hash ^ deliveryId.charCodeAt(index), FNV_PRIME);
  }
  hash = Math.imul(hash ^ attempt, FNV_PRIME);
  return (hash >>> 0) % JITTER_STEPS;
}

/**
 * The base interval moved by up to {@link BACKOFF_JITTER_RATIO} in either direction.
 *
 * Symmetric rather than additive, which is what keeps the published schedule honest. Jitter that only ever
 * lengthened an interval would make every documented figure a floor that is never met, and an integrator reading
 * *thirty seconds* would be measuring thirty-six.
 *
 * Floored at one second. A jittered interval that rounded to zero would return a delivery to a receiver that has
 * had no time at all to recover, which is the one outcome the jitter exists to prevent.
 */
function jittered(baseSeconds: number, deliveryId: Uuid, attempt: number): number {
  const fraction = (spreadOf(deliveryId, attempt) / JITTER_STEPS) * 2 - 1;
  return Math.max(1, Math.round(baseSeconds * (1 + BACKOFF_JITTER_RATIO * fraction)));
}

// --- Planning --------------------------------------------------------------------

/**
 * When to try a delivery next, or that there is no next time.
 *
 * `attempt` counts attempts already made, so a plan is always about the one after it — the field of the same
 * name on the returned plan is the attempt being scheduled, and it is present even on an exhausted plan, where
 * it names the attempt that will not happen. An exhausted plan is not an error: running out of attempts is the
 * ordinary end of a delivery to a receiver that stayed down, and the caller dead-letters it and moves on.
 *
 * A delivery with no attempts behind it is due immediately rather than after the first interval. The backoff
 * schedule is a schedule of *retries*; the first attempt is dispatched when the outbox drains, and delaying it
 * would put half a minute between an institution admitting a student and their integrator hearing about it.
 */
export function planBackoff(request: BackoffRequest): BackoffPlan {
  if (!Number.isInteger(request.attempt) || request.attempt < 0) {
    throw new InvalidAttemptNumberError(request.deliveryId, request.attempt);
  }

  const attemptsRemaining = Math.max(0, MAX_DELIVERY_ATTEMPTS - request.attempt);
  const exhausted = attemptsRemaining === 0;

  if (exhausted) {
    return Object.freeze({
      attempt: request.attempt + 1,
      exhausted: true,
      delaySeconds: 0,
      nextAttemptAt: null,
      attemptsRemaining: 0,
    });
  }

  const delaySeconds =
    request.attempt === 0
      ? 0
      : jittered(baseSecondsAfter(request.attempt), request.deliveryId, request.attempt);

  return Object.freeze({
    attempt: request.attempt + 1,
    exhausted: false,
    delaySeconds,
    nextAttemptAt: toIso(
      new Date(Date.parse(request.lastAttemptedAt) + delaySeconds * MILLISECONDS_PER_SECOND),
    ),
    attemptsRemaining,
  });
}
