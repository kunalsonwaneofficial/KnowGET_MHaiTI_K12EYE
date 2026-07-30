import type { ISODateString } from "@knowget/types";
import { InvalidOutcomeCountError } from "./errors";
import {
  CIRCUIT_CONSECUTIVE_FAILURE_THRESHOLD,
  CIRCUIT_DEGRADED_RATIO,
  CIRCUIT_FAILURE_RATIO,
  CIRCUIT_HALF_OPEN_SUCCESSES,
  CIRCUIT_MIN_OBSERVATIONS,
  CIRCUIT_PROBE_AFTER_SECONDS,
  type CircuitPosture,
  type EndpointHealth,
} from "./gateway-value";
import type { CircuitVerdict, OutcomeWindow } from "./gateway-view";

/**
 * What a window of outcomes says about an endpoint: whether to keep calling it, and what to tell an operator.
 *
 * **This is not the runtime circuit breaker.** `@knowget/reliability` owns that one — it wraps a call in flight,
 * counts in memory and short-circuits the next attempt in microseconds, and nothing here duplicates or replaces
 * it. What this engine produces is the *registered* conclusion: the posture that is written to the endpoint row,
 * carried on an event, shown in a console and still true after a process restart. The two are computed from
 * different data over different horizons and they will sometimes disagree, which is why the vocabulary calls
 * this one a posture and leaves `state` to the breaker. An operator who sees them differ is looking at a
 * process that has been up for four minutes next to a record of the last hour, and both are right.
 *
 * **Two ways to open, because one outage does not look like the other.** A consecutive run of
 * {@link CIRCUIT_CONSECUTIVE_FAILURE_THRESHOLD} failures opens the circuit outright: an endpoint that has just
 * begun refusing everything produces very few observations, and any ratio rule with an honest minimum sample
 * spends that sample discovering what the run already established. A failure *ratio* over at least
 * {@link CIRCUIT_MIN_OBSERVATIONS} calls catches the other shape — the endpoint that fails a third of the time,
 * never in a row, and would keep a consecutive counter at two forever. Neither rule alone covers both, and the
 * minimum sample is what stops the ratio from opening a circuit on the strength of an unlucky pair of timeouts
 * after a quiet afternoon.
 *
 * **A half-open window contains only the probes.** When the posture is `half_open`, the successes and failures
 * handed in are the calls made since the posture changed — the probes, not the history that opened the circuit.
 * That is what makes the recovery rule readable: one failure among them and the circuit re-opens, because a
 * probe is a question with a yes-or-no answer and a failed probe is a no; and
 * {@link CIRCUIT_HALF_OPEN_SUCCESSES} of them must succeed before it closes, because a single success is exactly
 * what a partly recovered endpoint produces on the node that came back.
 *
 * **Nothing here reads a clock or decides a status.** `asOf` and `postureSince` arrive on the window, so the
 * posture the platform recorded last Tuesday can be recomputed from the row that produced it. And the verdict
 * says what was observed, never what to do about it: taking an endpoint out of service is a lifecycle move made
 * explicitly on the aggregate, so that no path exists by which a burst of timeouts silently stops an
 * integration that an operator believes is running.
 */

// --- Observations ----------------------------------------------------------------

const MILLISECONDS_PER_SECOND = 1_000;

/** Whether at least `seconds` have passed between two instants. Equal instants count as no time at all. */
const elapsedAtLeast = (since: ISODateString, asOf: ISODateString, seconds: number): boolean =>
  Date.parse(asOf) - Date.parse(since) >= seconds * MILLISECONDS_PER_SECOND;

/** Refuse a tally that is not a tally, before any of it reaches a posture. */
function requireCounts(window: OutcomeWindow): void {
  const counts: readonly (readonly [string, number])[] = [
    ["successes", window.successes],
    ["failures", window.failures],
    ["consecutive failure count", window.consecutiveFailures],
  ];
  for (const [name, value] of counts) {
    if (!Number.isInteger(value) || value < 0) throw new InvalidOutcomeCountError(name, value);
  }
  if (window.consecutiveFailures > window.failures) {
    throw new InvalidOutcomeCountError("consecutive failure count", window.consecutiveFailures);
  }
}

// --- Posture ---------------------------------------------------------------------

/**
 * Whether a closed circuit has seen enough to open.
 *
 * The run is checked first and without reference to the sample size, because a run of five is its own evidence:
 * five calls in a row that failed is not a small sample of a healthy endpoint, it is five calls the platform
 * made knowing less each time.
 */
const shouldOpen = (
  window: OutcomeWindow,
  observed: number,
  failureRatio: number | null,
): boolean =>
  window.consecutiveFailures >= CIRCUIT_CONSECUTIVE_FAILURE_THRESHOLD ||
  (failureRatio !== null &&
    observed >= CIRCUIT_MIN_OBSERVATIONS &&
    failureRatio >= CIRCUIT_FAILURE_RATIO);

/**
 * Where the posture goes from where it is.
 *
 * An open circuit moves itself to `half_open` once {@link CIRCUIT_PROBE_AFTER_SECONDS} have passed, rather than
 * waiting to be told. The alternative is a scheduler that has to remember to ask, and an endpoint whose recovery
 * therefore depends on a cron job nobody notices has stopped running.
 */
function nextPosture(
  window: OutcomeWindow,
  observed: number,
  failureRatio: number | null,
): CircuitPosture {
  switch (window.posture) {
    case "closed":
      return shouldOpen(window, observed, failureRatio) ? "open" : "closed";
    case "open":
      return elapsedAtLeast(window.postureSince, window.asOf, CIRCUIT_PROBE_AFTER_SECONDS)
        ? "half_open"
        : "open";
    case "half_open":
      if (window.failures > 0) return "open";
      return window.successes >= CIRCUIT_HALF_OPEN_SUCCESSES ? "closed" : "half_open";
  }
}

/**
 * What the posture and the observed ratio amount to in a word an operator reads.
 *
 * Health is reported from the posture first because the posture is the decision that governs traffic: an open
 * circuit is `unreachable` whatever the ratio behind it says, and a half-open one is `degraded` because it is
 * being probed rather than served. Only a closed circuit is described by its ratio, and there the
 * {@link CIRCUIT_DEGRADED_RATIO} threshold sits far below the one that opens anything — one call in ten failing
 * is invisible to everyone except the integration it breaks, and it is precisely the condition worth surfacing
 * while it is still cheap to act on.
 */
const healthFor = (posture: CircuitPosture, failureRatio: number | null): EndpointHealth => {
  if (posture === "open") return "unreachable";
  if (posture === "half_open") return "degraded";
  if (failureRatio === null) return "unknown";
  return failureRatio >= CIRCUIT_DEGRADED_RATIO ? "degraded" : "healthy";
};

// --- Assessment ------------------------------------------------------------------

/**
 * Read one window of outcomes and say what it means.
 *
 * `failureRatio` is `null` rather than zero when nothing was observed, and the distinction earns its keep twice
 * over. A quiet endpoint reports `unknown` health instead of `healthy`, so a console does not show a green tick
 * beside an integration nobody has exercised since it was configured; and the ratio rule cannot fire on an empty
 * window, which it would if a zero denominator had been papered over.
 *
 * `probeDue` is true exactly when the verdict is `half_open`, including the case where the endpoint was already
 * half-open and its probes are still inconclusive. A caller that stopped probing on the second attempt would
 * leave the circuit open for as long as the probes remained inconclusive, which is indefinitely.
 */
export function inspectCircuit(window: OutcomeWindow): CircuitVerdict {
  requireCounts(window);

  const observed = window.successes + window.failures;
  const failureRatio = observed === 0 ? null : window.failures / observed;
  const posture = nextPosture(window, observed, failureRatio);

  return Object.freeze({
    posture,
    health: healthFor(posture, failureRatio),
    changed: posture !== window.posture,
    probeDue: posture === "half_open",
    observed,
    failureRatio,
  });
}
