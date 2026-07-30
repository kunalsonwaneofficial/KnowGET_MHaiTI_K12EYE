import type { ISODateString } from "@knowget/types";
import {
  type BindingStatus,
  type DeadLetterStatus,
  type EventTypeStatus,
  MIN_DEPRECATION_NOTICE_DAYS,
  type ReplayStatus,
  type StreamStatus,
  type SubscriptionStatus,
  isTerminalBindingStatus,
  isTerminalDeadLetterStatus,
  isTerminalEventTypeStatus,
  isTerminalReplayStatus,
  isTerminalStreamStatus,
  isTerminalSubscriptionStatus,
} from "./mesh-value";
import type {
  EventTypeDeprecationRequest,
  EventTypeDeprecationVerdict,
  PublicationRequest,
  PublicationVerdict,
  TransitionVerdict,
} from "./mesh-view";

/**
 * What may move where, whether a version still publishes, and whether a retirement gives enough notice.
 *
 * Six records in this package have a lifecycle and every one of them is written down here rather than in the
 * aggregate that owns it. The reason is that a progression map is the only artefact in a domain package that a
 * non-engineer can be walked through: an operator asking why a retired stream cannot be reopened, or why a
 * running replay cannot go back to being requested, is asking about one line of one frozen object, and a rule
 * spread across six `switch` statements in six aggregates cannot be shown to them at all. Writing them together
 * also makes the differences between them legible, which is where the argument actually lives — a subscription
 * may be paused and resumed, a binding may not, and the asymmetry is a decision somebody made rather than an
 * accident of which file was written first.
 *
 * **No map has a reverse edge out of its terminal status.** Not one of the six, and for the same reason each
 * time: a decommissioning that can be undone is one nobody ever finishes. A retired event type whose schema
 * could be revived is a shape consumers keep coding against; a retired binding that could resume is a
 * connection string that stays live in somebody's configuration; a discarded dead letter that could reopen is a
 * record whose meaning depends on who last touched it. The record of the decision stays either way — nothing
 * here deletes — so the cost of the refusal is a new record rather than lost history.
 *
 * **Nothing here reads a clock.** {@link inspectPublication} answers about the instant it is handed, including
 * instants before a deprecation was announced, at which point the version was merely published and the verdict
 * says so. That is what lets an audit of last term's traffic report what producers were actually told rather
 * than today's answer applied backwards.
 *
 * **The notice floor is not a parameter.** {@link inspectEventTypeDeprecation} refuses a retirement announced
 * with less than {@link MIN_DEPRECATION_NOTICE_DAYS} days of warning and offers no override, because an
 * operator under pressure to retire a version always has a reason why this one is different, and the cost of
 * agreeing lands entirely on consumers who are not in the conversation.
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
 * Where a registered event type may go from where it is.
 *
 * A draft reaches `retired` directly, which is how a shape that was designed and then abandoned is withdrawn
 * without ever having been published. Nothing consumed it, so there is nobody to give notice to.
 *
 * There is no edge from `published` straight to `retired`, and that absence is where the notice floor actually
 * lives. {@link MIN_DEPRECATION_NOTICE_DAYS} is enforced on the move into `deprecated`, so a version that could
 * reach `retired` without passing through it would leave the floor as something the platform checks only when
 * asked — ninety days for an operator who deprecates, none at all for one who skips the step. The route out of
 * service for anything that was ever published therefore runs through the notice, without exception.
 *
 * There is no edge from `deprecated` back to `published` either. Un-deprecating is not a correction any
 * consumer benefits from — they have been told to move and some of them already have — and a notice that can be
 * withdrawn is a notice the next one gets read as.
 */
const EVENT_TYPE_PROGRESSION: Readonly<Record<EventTypeStatus, readonly EventTypeStatus[]>> =
  Object.freeze({
    draft: Object.freeze(["published", "retired"]) as readonly EventTypeStatus[],
    published: Object.freeze(["deprecated"]) as readonly EventTypeStatus[],
    deprecated: Object.freeze(["retired"]) as readonly EventTypeStatus[],
    retired: Object.freeze([]) as readonly EventTypeStatus[],
  });

/**
 * Where a stream may go from where it is.
 *
 * The only fully reversible pair in the six is `active` and `paused`, and it earns that because pausing is what
 * an operator does while something downstream is being repaired. A pause that could not be lifted would be an
 * outage rather than a control.
 *
 * `retired` refuses publication permanently and does not delete anything. The messages already on a retired
 * stream stay readable until retention drops them, which is why `inspectReplayWindow` asks whether a
 * stream is readable rather than whether it is publishable — retiring a stream is not a licence to lose its
 * history, and the replay that reconstructs a consumer's state from a stream that has just been retired is
 * precisely the replay that matters most.
 */
const STREAM_PROGRESSION: Readonly<Record<StreamStatus, readonly StreamStatus[]>> = Object.freeze({
  draft: Object.freeze(["active", "retired"]) as readonly StreamStatus[],
  active: Object.freeze(["paused", "retired"]) as readonly StreamStatus[],
  paused: Object.freeze(["active", "retired"]) as readonly StreamStatus[],
  retired: Object.freeze([]) as readonly StreamStatus[],
});

/**
 * Where a stream's binding to a backbone may go from where it is.
 *
 * The one map with no way out of `active` except through `draining`, and that single missing edge is the whole
 * value of the status. A binding being replaced does not stop carrying what it already accepted; it stops
 * accepting new messages while its consumers catch up, and only then retires. Allowing `active` straight to
 * `retired` would make the drain optional, which is to say it would make it something that happens when the
 * migration is unhurried and gets skipped when it is not — and the migrations that are not unhurried are the
 * ones with messages in flight.
 *
 * A `declared` binding reaches `retired` directly, because it never carried anything and there is nothing to
 * drain. That asymmetry is the point: the drain is required exactly where something would otherwise be lost.
 *
 * There is no edge from `draining` back to `active`. Only one binding per stream may be carrying, so resuming a
 * drained binding requires whatever replaced it to stand down first — an ordering no per-record transition map
 * can express. A migration called off is undone by declaring a fresh binding to the original backbone, which
 * costs a row and leaves the record of what was attempted intact.
 */
const BINDING_PROGRESSION: Readonly<Record<BindingStatus, readonly BindingStatus[]>> =
  Object.freeze({
    declared: Object.freeze(["active", "retired"]) as readonly BindingStatus[],
    active: Object.freeze(["draining"]) as readonly BindingStatus[],
    draining: Object.freeze(["retired"]) as readonly BindingStatus[],
    retired: Object.freeze([]) as readonly BindingStatus[],
  });

/**
 * Where a durable subscription may go from where it is.
 *
 * Pausing holds the checkpoint still and lets the stream advance past it, which is what makes a consumer
 * deployment safe: pause, deploy, resume, and the mesh delivers the backlog. So the pair is reversible for the
 * same reason a stream's is, and for one more — a subscription that had to be retired and re-registered to
 * survive a deployment would lose its position every time it was released.
 *
 * `retired` releases the checkpoint, which is the fact that makes it terminal here rather than merely
 * conventional. There is no position left to resume from, so an edge back to `active` would produce a
 * subscription that silently restarts from the beginning of retention and re-delivers everything on the stream.
 */
const SUBSCRIPTION_PROGRESSION: Readonly<
  Record<SubscriptionStatus, readonly SubscriptionStatus[]>
> = Object.freeze({
  registered: Object.freeze(["active", "retired"]) as readonly SubscriptionStatus[],
  active: Object.freeze(["paused", "retired"]) as readonly SubscriptionStatus[],
  paused: Object.freeze(["active", "retired"]) as readonly SubscriptionStatus[],
  retired: Object.freeze([]) as readonly SubscriptionStatus[],
});

/**
 * Where a dead-letter record may go from where it is.
 *
 * Two terminal states and no way back from either, which makes this the shortest map and the one whose absences
 * matter most. `replayed` says somebody sent the message again; `discarded` says somebody decided not to. Both
 * carry who and why, and neither can be revised, because the question a dead-letter table answers — what did we
 * drop — is asked precisely when nobody can remember, and a record that can be reopened is a record whose
 * meaning depends on who last touched it.
 *
 * A message that was replayed and failed again is a new dead letter rather than a reopened one. That is more
 * rows and it is the right number of rows: two failures of the same message are two events, and collapsing them
 * would lose the fact that somebody tried.
 */
const DEAD_LETTER_PROGRESSION: Readonly<Record<DeadLetterStatus, readonly DeadLetterStatus[]>> =
  Object.freeze({
    open: Object.freeze(["replayed", "discarded"]) as readonly DeadLetterStatus[],
    replayed: Object.freeze([]) as readonly DeadLetterStatus[],
    discarded: Object.freeze([]) as readonly DeadLetterStatus[],
  });

/**
 * Where a replay request may go from where it is.
 *
 * The longest map, guarding the most dangerous capability in the contract, and its three terminal failures are
 * kept apart because they name three different causes rather than three different moments. `rejected` is the
 * mesh refusing: the window is outside retention, the stream kept no payload, the request was too wide.
 * `failed` is the mesh unable: something started and did not finish. `cancelled` is a person changing their
 * mind, and it is reachable from all three live states — including `running`, which is the stop button.
 *
 * That last edge is worth the sentence it costs. A replay re-sending a month of enrolments to a consumer that
 * turns out not to be idempotent has to be stoppable, and recording the stop as `failed` would fire the on-call
 * runbook for a broken replay every time somebody deliberately halted one. Splitting by cause rather than by
 * timing keeps *we would not*, *we could not* and *we changed our mind* distinguishable a year later, which is
 * when somebody asks why a month of invoices was reissued.
 *
 * There is no edge from `rejected` to anything. A refused request is answered rather than parked, and a
 * requester with a narrower window raises a new one — which keeps the refused window and its reason on the
 * record instead of overwriting them with the request that eventually succeeded.
 */
const REPLAY_PROGRESSION: Readonly<Record<ReplayStatus, readonly ReplayStatus[]>> = Object.freeze({
  requested: Object.freeze(["approved", "rejected", "cancelled"]) as readonly ReplayStatus[],
  approved: Object.freeze(["running", "cancelled"]) as readonly ReplayStatus[],
  rejected: Object.freeze([]) as readonly ReplayStatus[],
  running: Object.freeze(["completed", "failed", "cancelled"]) as readonly ReplayStatus[],
  completed: Object.freeze([]) as readonly ReplayStatus[],
  failed: Object.freeze([]) as readonly ReplayStatus[],
  cancelled: Object.freeze([]) as readonly ReplayStatus[],
});

/**
 * The one transition rule, applied to whichever map was handed in.
 *
 * The order of the three checks is the order the caller can act on. Being told a record is already in the state
 * asked for is a duplicate submission and needs no action at all; being told it is terminal says no action
 * exists; only the last case is a genuine request for a move the lifecycle declines. Checking permission first
 * would answer a resubmitted form with an error about the shape of the lifecycle.
 */
function inspectTransition<TStatus extends string>(
  from: TStatus,
  to: TStatus,
  isTerminal: (status: TStatus) => boolean,
  permitted: readonly TStatus[],
): TransitionVerdict {
  if (from === to) return Object.freeze({ allowed: false, refusal: "same_status" as const });
  if (isTerminal(from))
    return Object.freeze({ allowed: false, refusal: "terminal_status" as const });
  if (!permitted.includes(to)) {
    return Object.freeze({ allowed: false, refusal: "not_permitted" as const });
  }
  return Object.freeze({ allowed: true, refusal: null });
}

/** Whether a registered event type may move from one status to another. */
export const inspectEventTypeTransition = (
  from: EventTypeStatus,
  to: EventTypeStatus,
): TransitionVerdict =>
  inspectTransition(from, to, isTerminalEventTypeStatus, EVENT_TYPE_PROGRESSION[from]);

/** Whether a stream may move from one status to another. */
export const inspectStreamTransition = (from: StreamStatus, to: StreamStatus): TransitionVerdict =>
  inspectTransition(from, to, isTerminalStreamStatus, STREAM_PROGRESSION[from]);

/** Whether a stream-to-backbone binding may move from one status to another. */
export const inspectBindingTransition = (
  from: BindingStatus,
  to: BindingStatus,
): TransitionVerdict =>
  inspectTransition(from, to, isTerminalBindingStatus, BINDING_PROGRESSION[from]);

/** Whether a durable subscription may move from one status to another. */
export const inspectMeshSubscriptionTransition = (
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): TransitionVerdict =>
  inspectTransition(from, to, isTerminalSubscriptionStatus, SUBSCRIPTION_PROGRESSION[from]);

/** Whether a dead-letter record may move from one status to another. */
export const inspectDeadLetterTransition = (
  from: DeadLetterStatus,
  to: DeadLetterStatus,
): TransitionVerdict =>
  inspectTransition(from, to, isTerminalDeadLetterStatus, DEAD_LETTER_PROGRESSION[from]);

/** Whether a replay request may move from one status to another. */
export const inspectReplayTransition = (from: ReplayStatus, to: ReplayStatus): TransitionVerdict =>
  inspectTransition(from, to, isTerminalReplayStatus, REPLAY_PROGRESSION[from]);

// --- Publication -----------------------------------------------------------------

/**
 * Whether an event type version accepts a publication as of a named instant, and on what terms.
 *
 * The `asOf` parameter does more work here than it looks like it does. A deprecated version asked about an
 * instant *before* its announcement is reported as publishable and not deprecated, with no countdown, because
 * that is what was true then and what the producer was told at the time. Anything else would let a review of
 * last term's publications conclude that a team had been warned when they had not been.
 *
 * A version whose retirement instant has arrived is refused although its stored status may still read
 * `deprecated`, because the calendar is the decision and the status column catches up whenever the retirement
 * job next runs. A mesh that waited for the row to be updated would keep accepting publications of a shape it
 * had already told every consumer it would stop carrying, for however long the job was behind.
 *
 * `daysUntilRetirement` is clamped at zero rather than going negative. A date in the past has no days left, and
 * a countdown that runs backwards past zero reads as a system that has lost track of the date rather than as a
 * version that stopped on schedule.
 */
export function inspectPublication(request: PublicationRequest): PublicationVerdict {
  if (request.status === "retired") {
    return Object.freeze({
      publishable: false,
      deprecated: false,
      daysUntilRetirement: 0,
      reason: "event_type_retired",
    });
  }
  if (request.status === "draft") {
    return Object.freeze({
      publishable: false,
      deprecated: false,
      daysUntilRetirement: null,
      reason: "event_type_not_publishable",
    });
  }

  const announced =
    request.status === "deprecated" &&
    request.deprecatedAt !== null &&
    hasArrived(request.deprecatedAt, request.asOf);

  if (!announced) {
    return Object.freeze({
      publishable: true,
      deprecated: false,
      daysUntilRetirement: null,
      reason: "within_notice",
    });
  }

  if (request.retireAt === null) {
    return Object.freeze({
      publishable: true,
      deprecated: true,
      daysUntilRetirement: null,
      reason: "within_notice",
    });
  }

  if (hasArrived(request.retireAt, request.asOf)) {
    return Object.freeze({
      publishable: false,
      deprecated: true,
      daysUntilRetirement: 0,
      reason: "event_type_retired",
    });
  }

  return Object.freeze({
    publishable: true,
    deprecated: true,
    daysUntilRetirement: Math.max(0, daysBetween(request.asOf, request.retireAt)),
    reason: "within_notice",
  });
}

// --- Deprecation -----------------------------------------------------------------

/**
 * Whether a deprecation may be announced on the terms proposed.
 *
 * Three checks in the order a caller can fix them. A version that is not published cannot be deprecated at all,
 * so the status is settled before either date is read; a retirement earlier than its own announcement is a
 * transposed pair of arguments rather than a short notice period, and reporting it as *too short* would send
 * somebody to argue about the floor when what they have is a bug; and only then is the notice measured.
 *
 * `noticeDays` travels on every verdict, refusals included, because the number is the argument. An operator
 * told they gave sixty days when ninety are required knows exactly what to change; one told only *not enough*
 * has to guess.
 */
export function inspectEventTypeDeprecation(
  request: EventTypeDeprecationRequest,
): EventTypeDeprecationVerdict {
  if (request.status !== "published") {
    return Object.freeze({ allowed: false, noticeDays: 0, refusal: "not_published" as const });
  }

  const noticeDays = daysBetween(request.announcedAt, request.retireAt);
  if (noticeDays < 0) {
    return Object.freeze({
      allowed: false,
      noticeDays: 0,
      refusal: "retirement_before_announcement" as const,
    });
  }
  if (noticeDays < MIN_DEPRECATION_NOTICE_DAYS) {
    return Object.freeze({ allowed: false, noticeDays, refusal: "notice_too_short" as const });
  }
  return Object.freeze({ allowed: true, noticeDays, refusal: null });
}
