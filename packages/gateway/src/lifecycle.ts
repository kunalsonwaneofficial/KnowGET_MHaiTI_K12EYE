import type { ISODateString } from "@knowget/types";
import {
  type ConsumerStatus,
  type ContractStatus,
  MIN_DEPRECATION_NOTICE_DAYS,
  isTerminalConsumerStatus,
  isTerminalContractStatus,
} from "./gateway-value";
import type {
  DeprecationRequest,
  DeprecationVerdict,
  ServingRequest,
  ServingVerdict,
  TransitionVerdict,
} from "./gateway-view";

/**
 * What may move where, whether a version still answers, and whether a sunset gives enough notice.
 *
 * This is the first of the package's engines and it holds the rules that decide the fate of every integration
 * built against the platform. Nothing here reads a clock, touches a repository or throws: each function takes a
 * record of plain values and hands back a verdict, which is what lets a serving decision made eight months ago
 * be reproduced exactly by replaying the row it was made from. That property is not decoration. The commonest
 * question an integration support conversation has to answer is *why did this call stop working on the
 * fourteenth*, and an engine that consulted `Date.now()` could only ever answer it with a reconstruction.
 *
 * **The progression maps are the whole lifecycle, written once.** A consumer moves through registration,
 * activation, suspension and retirement; a contract through draft, publication, deprecation and sunset. Neither
 * map has a reverse edge out of its terminal status, and that is deliberate in both cases for the same reason:
 * a decommissioning that can be undone is one that nobody ever finishes, and the credential reference or the
 * integrator's pinned version stays live in somebody's configuration on the strength of it.
 *
 * **Serving is a question about an instant, not about now.** {@link inspectServing} takes `asOf` and answers for
 * that moment, including moments before the deprecation was announced — at which point the contract was merely
 * published and the verdict says so. A caller reconstructing what a consumer was told last quarter gets what
 * they were actually told rather than today's answer applied backwards.
 *
 * **The notice floor is not a parameter.** {@link inspectDeprecation} refuses a sunset announced with less than
 * {@link MIN_DEPRECATION_NOTICE_DAYS} days of warning and offers no override, because an operator under pressure
 * to retire a version always has a reason why this one is different and the cost of agreeing lands entirely on
 * integrators who are not in the conversation.
 */

// --- Time ------------------------------------------------------------------------

/** Whole days in milliseconds. Notice periods are counted in days because that is how notice is given. */
const MILLISECONDS_PER_DAY = 86_400_000;

/** Whole days from `from` to `to`, floored. Negative when `to` precedes `from`. */
const daysBetween = (from: ISODateString, to: ISODateString): number =>
  Math.floor((Date.parse(to) - Date.parse(from)) / MILLISECONDS_PER_DAY);

/** Whether `instant` has arrived as of `asOf`. Equal instants count as arrived. */
const hasArrived = (instant: ISODateString, asOf: ISODateString): boolean =>
  Date.parse(asOf) >= Date.parse(instant);

// --- Status progression ----------------------------------------------------------

/**
 * Where an API consumer may go from where it is.
 *
 * Suspension is reversible and retirement is not, and the asymmetry carries the meaning. Suspension answers
 * something happening now — a runaway loop, an expired contract, an incident — and is expected to be undone.
 * Retirement is the institution's statement that an integration is over, and a retired consumer that could be
 * revived would leave the reference to its credential looking temporarily dormant rather than finished.
 */
const CONSUMER_PROGRESSION: Readonly<Record<ConsumerStatus, readonly ConsumerStatus[]>> =
  Object.freeze({
    registered: Object.freeze(["active", "retired"]) as readonly ConsumerStatus[],
    active: Object.freeze(["suspended", "retired"]) as readonly ConsumerStatus[],
    suspended: Object.freeze(["active", "retired"]) as readonly ConsumerStatus[],
    retired: Object.freeze([]) as readonly ConsumerStatus[],
  });

/**
 * Where a capability contract may go from where it is.
 *
 * A draft may reach `sunset` without ever being published, which is how a version that will not ship is
 * withdrawn. Sunset describes whether a version answers rather than how it stopped answering, and a fifth
 * status meaning *never shipped* would give routing one more thing to check and tell an integrator nothing they
 * could act on: a version that was never published is a version they never saw.
 *
 * There is no edge from `deprecated` back to `published`. Un-deprecating is not a correction an integrator can
 * benefit from — they have already been told to move, and some of them already have — and a notice that can be
 * withdrawn is a notice the next one gets read as.
 */
const CONTRACT_PROGRESSION: Readonly<Record<ContractStatus, readonly ContractStatus[]>> =
  Object.freeze({
    draft: Object.freeze(["published", "sunset"]) as readonly ContractStatus[],
    published: Object.freeze(["deprecated", "sunset"]) as readonly ContractStatus[],
    deprecated: Object.freeze(["sunset"]) as readonly ContractStatus[],
    sunset: Object.freeze([]) as readonly ContractStatus[],
  });

/**
 * The one transition rule, applied to whichever map was handed in.
 *
 * The order of the three checks is the order the caller can act on. Being told a record is already active is a
 * duplicate submission and needs no action at all; being told it is terminal says no action exists; only the
 * last case is a genuine request for a move the lifecycle declines. Checking permission first would answer the
 * resubmitted form with an error about the shape of the lifecycle.
 */
function inspectTransition<TStatus extends string>(
  from: TStatus,
  to: TStatus,
  isTerminal: (status: TStatus) => boolean,
  permitted: readonly TStatus[],
): TransitionVerdict {
  if (from === to) return { allowed: false, refusal: "same_status" };
  if (isTerminal(from)) return { allowed: false, refusal: "terminal_status" };
  if (!permitted.includes(to)) return { allowed: false, refusal: "not_permitted" };
  return { allowed: true, refusal: null };
}

/** Whether an API consumer may move from one status to another. */
export const inspectConsumerTransition = (
  from: ConsumerStatus,
  to: ConsumerStatus,
): TransitionVerdict =>
  inspectTransition(from, to, isTerminalConsumerStatus, CONSUMER_PROGRESSION[from]);

/** Whether a capability contract may move from one status to another. */
export const inspectContractTransition = (
  from: ContractStatus,
  to: ContractStatus,
): TransitionVerdict =>
  inspectTransition(from, to, isTerminalContractStatus, CONTRACT_PROGRESSION[from]);

// --- Serving ---------------------------------------------------------------------

/**
 * Whether a contract answers as of a named instant, and on what terms.
 *
 * The `asOf` parameter does more work here than it looks like it does. A deprecated contract asked about an
 * instant *before* its announcement is reported as served and not deprecated, with no sunset date, because that
 * is what was true then and what the consumer was told at the time. Anything else would let an audit of last
 * quarter's traffic conclude that callers had been warned when they had not been.
 *
 * `daysUntilSunset` is clamped at zero rather than going negative. A date in the past has no days remaining, and
 * a countdown that runs backwards past zero reads as a system that has lost track of the date rather than as a
 * version that stopped answering on schedule.
 */
export function inspectServing(request: ServingRequest): ServingVerdict {
  if (request.status === "sunset") {
    return { served: false, deprecated: false, daysUntilSunset: 0, reason: "contract_sunset" };
  }
  if (request.status === "draft") {
    return {
      served: false,
      deprecated: false,
      daysUntilSunset: null,
      reason: "contract_not_servable",
    };
  }

  const announced =
    request.status === "deprecated" &&
    request.deprecatedAt !== null &&
    hasArrived(request.deprecatedAt, request.asOf);

  if (!announced) {
    return { served: true, deprecated: false, daysUntilSunset: null, reason: "within_limits" };
  }

  if (request.sunsetAt === null) {
    return { served: true, deprecated: true, daysUntilSunset: null, reason: "within_limits" };
  }

  if (hasArrived(request.sunsetAt, request.asOf)) {
    return { served: false, deprecated: true, daysUntilSunset: 0, reason: "contract_sunset" };
  }

  return {
    served: true,
    deprecated: true,
    daysUntilSunset: Math.max(0, daysBetween(request.asOf, request.sunsetAt)),
    reason: "within_limits",
  };
}

// --- Deprecation -----------------------------------------------------------------

/**
 * Whether a deprecation may be announced on the terms proposed.
 *
 * Three checks in the order a caller can fix them. A draft cannot be deprecated at all, so the status is settled
 * before the dates are read; a sunset earlier than its own announcement is a transposed pair of arguments rather
 * than a short notice period, and reporting it as *too short* would send somebody to argue about the floor when
 * what they have is a bug; and only then is the notice measured against the floor.
 *
 * `noticeDays` travels on every verdict, including the refusals, because the number is the argument. An operator
 * told they gave sixty days when ninety are required knows exactly what to change, and an operator told only
 * *not enough* has to guess.
 */
export function inspectDeprecation(request: DeprecationRequest): DeprecationVerdict {
  if (request.status !== "published") {
    return { allowed: false, noticeDays: 0, refusal: "contract_not_published" };
  }

  const noticeDays = daysBetween(request.announcedAt, request.sunsetAt);
  if (noticeDays < 0) {
    return { allowed: false, noticeDays: 0, refusal: "sunset_before_announcement" };
  }
  if (noticeDays < MIN_DEPRECATION_NOTICE_DAYS) {
    return { allowed: false, noticeDays, refusal: "notice_too_short" };
  }
  return { allowed: true, noticeDays, refusal: null };
}
