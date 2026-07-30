import { toIso } from "@knowget/shared";
import type { ISODateString } from "@knowget/types";
import { InvalidQuotaFigureError } from "./errors";
import { QUOTA_WINDOW_SECONDS, type QuotaWindow } from "./gateway-value";
import type { QuotaRequest, QuotaVerdict } from "./gateway-view";

/**
 * Whether a request fits in the allowance its policy grants, and when the allowance comes back.
 *
 * The engine does not count. Counting — the atomic increment, the shared state, the race between two replicas
 * serving the same consumer in the same millisecond — belongs to the platform's rate limiter, which already
 * exists and already solves it. What is left over is the part that limiter cannot do: read a consumption figure
 * against a policy, decide what it means, and say when the consumer may come back. That is arithmetic over
 * plain values, and it lives here so that it is testable without a clock, a store or a network.
 *
 * **Fixed windows, not a sliding one.** A window has a start and a size, and the count inside it resets when it
 * turns over. A sliding window is more accurate and would cost the platform a per-request history per consumer;
 * more to the point, it cannot be explained. *You may make a hundred calls a minute* is a sentence an integrator
 * can hold in their head and design against, and *your calls in any trailing sixty-second interval must not
 * exceed a hundred* is one that produces a support ticket the first time a burst at the boundary is refused.
 * The known cost is the boundary: a consumer can spend a full allowance at the end of one window and another at
 * the start of the next, briefly running at twice the rate. The burst allowance exists partly so operators can
 * price that in deliberately rather than discover it.
 *
 * **The window is realigned rather than restarted.** When a recorded window has elapsed — a consumer went quiet
 * for an afternoon, or for a month — the request falls into a later window whose start is a whole number of
 * periods after the recorded one. {@link assessQuota} computes that boundary and reports it, so a ledger rolling
 * a stale row keeps the original phase. Restarting from the current instant instead would let a consumer who
 * paused reset their window to a moment of their choosing, which is a rate limit that anybody who reads the
 * documentation can decline to be bound by.
 *
 * **Nothing here denies.** Every quota refusal is a `throttle`, because every quota refusal is temporary: the
 * window turns over and the same request in the same form succeeds. `deny` belongs to admission, where it means
 * what it says — the consumer is not active, the scope was never granted, the version is gone — and a client
 * library can tell the two apart without parsing prose. What the reason distinguishes instead is the *shape* of
 * the wait: `rate_limit_exceeded` on a minute or an hour is a caller going too fast, and `quota_exhausted` on a
 * day or a month is a caller who has spent an allocation. A client should back off for the first and stop for
 * the second, and telling it only that it was rejected leaves it retrying a monthly quota every thirty seconds
 * for three weeks.
 */

// --- Time ------------------------------------------------------------------------

const MILLISECONDS_PER_SECOND = 1_000;

/** The size of a window in milliseconds. */
const windowMilliseconds = (window: QuotaWindow): number =>
  QUOTA_WINDOW_SECONDS[window] * MILLISECONDS_PER_SECOND;

/**
 * The start of the window `asOf` falls in, counting whole periods from the recorded start.
 *
 * A single division rather than a loop, so a row left untouched for a year costs the same as one from a minute
 * ago. An `asOf` before the recorded start — a replay, a clock disagreement between two nodes — floors to the
 * recorded window rather than walking backwards into windows that were never opened.
 */
const alignedWindowStart = (
  windowStartedAt: ISODateString,
  asOf: ISODateString,
  sizeMs: number,
): number => {
  const startedMs = Date.parse(windowStartedAt);
  const elapsed = Date.parse(asOf) - startedMs;
  if (elapsed < 0) return startedMs;
  return startedMs + Math.floor(elapsed / sizeMs) * sizeMs;
};

/** Whole seconds until an instant, rounded up and floored at one: nobody is told to retry in zero seconds. */
const secondsUntil = (instantMs: number, asOf: ISODateString): number =>
  Math.max(1, Math.ceil((instantMs - Date.parse(asOf)) / MILLISECONDS_PER_SECOND));

// --- Figures ---------------------------------------------------------------------

const isWholeNumber = (value: number): boolean => Number.isInteger(value);

/** Refuse a consumption or a cost that is not a count, before any of it reaches the arithmetic. */
function requireFigures(request: QuotaRequest): void {
  if (!isWholeNumber(request.consumed) || request.consumed < 0) {
    throw new InvalidQuotaFigureError(
      "consumption",
      request.consumed,
      "must be a whole number of units and cannot be negative",
    );
  }
  if (!isWholeNumber(request.cost) || request.cost < 1) {
    throw new InvalidQuotaFigureError("cost", request.cost, "must be at least one whole unit");
  }
}

// --- Assessment ------------------------------------------------------------------

/**
 * The verdict for an unmetered request: served, counting nothing, with no window to report.
 *
 * `windowExpired` is false rather than true. There is no window, so nothing about it has elapsed, and a ledger
 * reading this flag to decide whether to roll a row would otherwise roll one that does not exist.
 */
const unmetered = (): QuotaVerdict =>
  Object.freeze({
    decision: "allow" as const,
    reason: "within_limits" as const,
    remaining: null,
    windowResetsAt: null,
    currentWindowStartedAt: null,
    retryAfterSeconds: null,
    windowExpired: false,
  });

/**
 * Which of the two refusal reasons a window earns.
 *
 * Split on the window size rather than on how far over the caller is, because the two say different things to
 * the client that has to act on them. A minute or an hour is a pace problem and backing off fixes it. A day or a
 * month is an allocation problem: no amount of patience within the window helps, and the remedy is a
 * conversation about the policy.
 */
const refusalReason = (window: QuotaWindow): "rate_limit_exceeded" | "quota_exhausted" =>
  window === "minute" || window === "hour" ? "rate_limit_exceeded" : "quota_exhausted";

/**
 * Assess one request against the allowance its policy grants.
 *
 * The order is: figures first, then whether anything is being counted at all, then where in time the request
 * falls, and only then the comparison. Checking the arithmetic before the policy means a defect in the caller
 * surfaces on every request rather than only on the metered ones, which is the difference between finding it in
 * a test and finding it when a policy is first attached to a consumer in production.
 *
 * `consumed` is read as zero when the recorded window has elapsed. The alternative — carrying a stale count into
 * a new window — throttles a consumer for traffic they sent yesterday, and does it for exactly as long as
 * nobody notices the ledger row was never rolled.
 */
export function assessQuota(request: QuotaRequest): QuotaVerdict {
  requireFigures(request);

  const { limit, window } = request;
  if (limit === null || window === null) return unmetered();

  const sizeMs = windowMilliseconds(window);
  const currentStartMs = alignedWindowStart(request.windowStartedAt, request.asOf, sizeMs);
  const resetsAtMs = currentStartMs + sizeMs;
  const windowExpired = currentStartMs !== Date.parse(request.windowStartedAt);

  const consumed = windowExpired ? 0 : request.consumed;
  const after = consumed + request.cost;
  const ceiling = request.burstAllowance ?? limit;

  const shared = {
    windowResetsAt: toIso(new Date(resetsAtMs)),
    currentWindowStartedAt: toIso(new Date(currentStartMs)),
    windowExpired,
  };

  if (after > ceiling) {
    return Object.freeze({
      ...shared,
      decision: "throttle" as const,
      reason: refusalReason(window),
      remaining: 0,
      retryAfterSeconds: secondsUntil(resetsAtMs, request.asOf),
    });
  }

  return Object.freeze({
    ...shared,
    decision: "allow" as const,
    reason: "within_limits" as const,
    remaining: Math.max(0, limit - after),
    retryAfterSeconds: null,
  });
}
