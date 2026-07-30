import { isValidIso, parseIso } from "@knowget/shared";
import type { ISODateString } from "@knowget/types";
import { InvalidMeshCountError, InvalidMeshInstantError } from "./errors";
import {
  INITIAL_REPLAY_STATUS,
  MAX_REPLAY_MESSAGES,
  MAX_REPLAY_WINDOW_SECONDS,
  type ReplayRefusalReason,
  type StreamStatus,
  isReplayable,
  isSubscriptionDeliverable,
} from "./mesh-value";
import type {
  ReplayApprovalRequest,
  ReplayApprovalVerdict,
  ReplayWindowRequest,
  ReplayWindowVerdict,
} from "./mesh-view";
import { isRetained, retentionCutoff } from "./retention";

/**
 * Whether a stretch of history may be sent to a consumer again, and whether the person authorising it is allowed
 * to be the person who asked.
 *
 * Replay is the most dangerous capability in this contract and it is dangerous in an unusual way: it does not
 * fail, it succeeds. A replay of a month of enrolments against a consumer that turns out not to be idempotent
 * reissues a month of invoices, emails and ledger entries, reports itself complete, and is discovered by the
 * families who received them. Nothing in the mesh notices, because from the mesh's side every delivery worked.
 * That asymmetry is why this engine refuses rather than trims, and why the second pair of eyes is a rule here
 * rather than a recommendation in a runbook.
 *
 * **A partially expired window is refused, not truncated.** If the requested window starts before retention
 * reaches, the honest answers are *refuse* or *return what survives*, and the second is the failure mode
 * {@link isRetained} exists to prevent — a replay that reports success while silently omitting the oldest part
 * of exactly the period somebody was trying to reconstruct. So the refusal carries
 * {@link ReplayWindowVerdict.retentionCutoff}, and the requester can re-ask with a window that starts after it
 * without having to find out from anybody what retention the stream declared.
 *
 * **The retention arithmetic is borrowed rather than repeated.** This is the one engine in the package that
 * imports another, and deliberately: {@link isRetained} and {@link retentionCutoff} are what the sweep uses, so
 * a window this engine calls replayable cannot be a window the sweep has already deleted. Two independent
 * derivations of the same boundary would agree until somebody changed one of them, and the disagreement would
 * surface as a replay that ran and returned nothing.
 *
 * **Refusals are ordered so the reported reason is the one worth acting on.** An inverted window is settled
 * first because it is uninterpretable — and because a negative width would sail straight under the width
 * ceiling. Then the permanent obstacles, which no reworded request can get around: a stream that kept no
 * payload, a stream that cannot be read, a subscription that cannot be delivered to. Then what the world is
 * like — the window has aged out — before what policy says about the request, its width and its count. Width
 * before count because the width is what the requester typed and the count came from the store, so the first
 * of the two is the one they can act on unaided.
 *
 * Nothing here reads a clock, and `asOf` travels on the request for the same reason it does everywhere else in
 * this package: a replay refused in March can be re-judged in November and give the same answer, which is the
 * only way to settle an argument about whether it should have been allowed.
 */

// --- Guards ----------------------------------------------------------------------

/** An instant, refused rather than coerced when it is not one. `Invalid Date` arithmetic yields `NaN`. */
const instantAt = (field: string, value: ISODateString): number => {
  if (!isValidIso(value)) {
    throw new InvalidMeshInstantError(field, value);
  }
  return parseIso(value).getTime();
};

/**
 * The message count, guarded as a count rather than refused as a bad request.
 *
 * {@link InvalidMeshCountError} because nobody outside the platform contributes this figure: the caller counts
 * it from the store over the window it is about to ask for. A fractional or negative count means the count query
 * is wrong, and comparing it against {@link MAX_REPLAY_MESSAGES} would answer a broken query with a policy
 * verdict — most likely an approval, since a negative number is under every ceiling.
 */
const checkedCount = (messageCount: number): number => {
  if (!Number.isInteger(messageCount) || messageCount < 0) {
    throw new InvalidMeshCountError(
      "replay message count",
      messageCount,
      "must be a whole, non-negative count of messages in the window",
    );
  }
  return messageCount;
};

/**
 * Whether history may be read from a stream in this state.
 *
 * Deliberately not {@link isSubscriptionDeliverable}'s counterpart for streams. A replay reads what a stream
 * carried rather than writing to it, and the vocabulary is explicit that a retired stream's messages remain
 * readable until retention drops them. Refusing a replay on a retired stream would refuse exactly the replay
 * that matters most — the one reconstructing a consumer's state from a backbone that has just been decommissioned
 * — and there is no other way to get those messages back.
 *
 * A `draft` stream is the one refusal, and it is a statement about the record rather than about policy: nothing
 * has ever been published to it, so a replay over it is a request for messages that do not exist.
 */
const isStreamReadable = (status: StreamStatus): boolean => status !== "draft";

// --- Windows ---------------------------------------------------------------------

/**
 * One verdict shape for every outcome, so that a refused requester and an approved one read the same fields.
 *
 * The width and the count travel on refusals as well as approvals for the reason the deprecation engine puts its
 * notice period on both: the figure is the argument. A requester told their window was too wide, and told it was
 * forty days against a ceiling they can look up, splits it themselves.
 */
const verdictFor = (
  request: ReplayWindowRequest,
  refusal: ReplayRefusalReason | null,
  windowSeconds: number,
  cutoff: ISODateString,
): ReplayWindowVerdict =>
  Object.freeze({
    subscriptionKey: request.subscriptionKey,
    allowed: refusal === null,
    refusal,
    windowSeconds,
    messageCount: request.messageCount,
    retentionCutoff: cutoff,
  });

/**
 * Judge a proposed replay window against retention, the two records it spans, and the platform's ceilings.
 *
 * The retention test is applied to {@link ReplayWindowRequest.fromInstant} alone, which is the whole of the
 * partial-expiry decision. The oldest instant asked for is the one that ages out first, so a window whose start
 * is outside retention is refused entire even though most of it survives. Trimming it to what remains would hand
 * back a shorter period than was asked for, under a verdict that said the replay was allowed.
 *
 * The width is floored to whole seconds and a window covering a single instant is zero seconds wide rather than
 * one. Both bounds are inclusive of the instants named, so a window from a moment to itself is a legitimate
 * request for whatever was recorded at it.
 *
 * @throws {InvalidMeshInstantError} when any of the three instants is not readable as a moment in time.
 * @throws {InvalidMeshCountError} when the message count is not a count, or the stream record's retention window
 *   is not one the platform permits.
 */
export function inspectReplayWindow(request: ReplayWindowRequest): ReplayWindowVerdict {
  checkedCount(request.messageCount);
  const cutoff = retentionCutoff(request.asOf, request.retentionSeconds);
  const from = instantAt("fromInstant", request.fromInstant);
  const to = instantAt("toInstant", request.toInstant);

  if (to < from) {
    return verdictFor(request, "window_inverted", 0, cutoff);
  }

  const windowSeconds = Math.floor((to - from) / 1_000);

  if (!isReplayable(request.retention)) {
    return verdictFor(request, "payload_not_retained", windowSeconds, cutoff);
  }
  if (!isStreamReadable(request.streamStatus)) {
    return verdictFor(request, "stream_not_readable", windowSeconds, cutoff);
  }
  if (!isSubscriptionDeliverable(request.subscriptionStatus)) {
    return verdictFor(request, "subscription_not_deliverable", windowSeconds, cutoff);
  }
  if (!isRetained(request.fromInstant, request.retentionSeconds, request.asOf)) {
    return verdictFor(request, "window_outside_retention", windowSeconds, cutoff);
  }
  if (windowSeconds > MAX_REPLAY_WINDOW_SECONDS) {
    return verdictFor(request, "window_too_wide", windowSeconds, cutoff);
  }
  if (request.messageCount > MAX_REPLAY_MESSAGES) {
    return verdictFor(request, "window_too_many_messages", windowSeconds, cutoff);
  }
  return verdictFor(request, null, windowSeconds, cutoff);
}

// --- Approval --------------------------------------------------------------------

/**
 * Whether an approval of a replay request stands.
 *
 * Two checks, and the order between them is the one that gives the better answer to somebody clicking a stale
 * page. A request that has already been approved, rejected or cancelled is not awaiting anybody, and reporting
 * that first means a second approver who arrives late is told the decision was made rather than told they are
 * the wrong person.
 *
 * The separation rule is enforced on identity rather than on role, and it holds even where the requester is the
 * institution's most senior administrator. The safeguard is worth exactly as much as the number of times it is
 * waived: the requester always knows the window is right, and is usually correct, and the cost of the one time
 * they are not lands on people who were not in the conversation.
 */
export function inspectReplayApproval(request: ReplayApprovalRequest): ReplayApprovalVerdict {
  if (request.status !== INITIAL_REPLAY_STATUS) {
    return Object.freeze({ allowed: false, refusal: "not_awaiting_approval" as const });
  }
  if (request.approvedBy === request.requestedBy) {
    return Object.freeze({ allowed: false, refusal: "self_approval" as const });
  }
  return Object.freeze({ allowed: true, refusal: null });
}
