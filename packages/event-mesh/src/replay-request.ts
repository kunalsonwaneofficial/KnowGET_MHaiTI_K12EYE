import { isValidIso, newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyMeshKeyError,
  InvalidMeshCountError,
  InvalidMeshInstantError,
  InvalidMeshKeyError,
  InvalidReplayProgressionError,
  ReasonTooLongError,
  ReasonTooShortError,
  ReplayNotApprovedError,
  ReplayRefusedError,
  ReplaySettledError,
  ReplayWindowInvertedError,
  SelfApprovedReplayError,
} from "./errors";
import { inspectReplayTransition } from "./lifecycle";
import {
  INITIAL_REPLAY_STATUS,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  type ReplayStatus,
  fixedWidthInstant,
  isTerminalReplayStatus,
  isValidKey,
  normalizeKey,
} from "./mesh-value";
import type { ReplayWindowVerdict } from "./mesh-view";
import { inspectReplayApproval } from "./replay";

/**
 * A replay request: somebody asking the mesh to send a window of already-published facts to one subscription
 * again, and the record of who agreed to it and what happened.
 *
 * Replay is the most dangerous operation in the package, and it is dangerous in a way that does not look
 * dangerous while it is being requested. Every other refusal here protects a consumer from missing a fact. This
 * one can hand a consumer a month of facts it has already acted on, and the consumers on the other end are
 * ledgers, invoicing runs and notification senders. A replay that goes wrong does not fail; it succeeds, twice.
 * The shape of this aggregate follows from that single observation.
 *
 * **It records a decision rather than a job.** Who asked, why, who agreed, when it ran and how it ended. There
 * is no progress figure, no cursor, no attempt count and no next-run instant, because the running of a replay
 * belongs to `@knowget/jobs` and a second copy of a job's state here would be a second copy that disagrees the
 * first time a worker dies mid-window.
 *
 * **Two people are structural.** {@link approveReplay} consults {@link inspectReplayApproval}, which compares
 * identities rather than roles, so the separation holds even where the requester is the institution's most
 * senior administrator. This is the one safeguard that is always available to be waived under time pressure, by
 * somebody who is usually right, at a cost that lands on people who were not in the conversation.
 *
 * **The aggregate checks only that the window is a window.** Whether the payload was retained, whether the
 * stream can be read, whether the subscription is receiving, whether the window is still inside retention and
 * whether it is too wide are all judged by {@link inspectReplayWindow} at the moment of approval, against
 * records this aggregate does not hold. That separation is not tidiness: a window comfortably inside retention
 * when it is asked for can be outside it by the time anybody approves, and the answer that matters is the one
 * given by the person taking responsibility, not the one shown to the person asking.
 *
 * **An approval is granted against a verdict, not against a boolean.** {@link ApproveReplayParams} carries the
 * whole {@link ReplayWindowVerdict}, which makes "approved against a verdict that refused" unrepresentable
 * rather than merely forbidden. It is the same move {@link recordMeshMessage} makes by computing its own
 * partition instead of accepting one.
 *
 * **The count the approver was shown is kept.** Agreeing to replay twelve messages and agreeing to replay eighty
 * thousand are different decisions, and six months later the only evidence of which one was made is the figure
 * that was on the screen. It is stored on approval rather than on request for the same reason the window is
 * judged then.
 *
 * **Rejected and failed are different endings, and so are their settlers.** Rejected means the institution would
 * not; failed means the mesh could not. A person settles a rejection or a cancellation and is named; a
 * completion or a failure is settled by the run itself and names nobody, which is why
 * {@link ReplayRequest.settledBy} is null on both.
 *
 * Nothing here asks what else the tenant holds. Whether an overlapping window is already approved is a directory
 * question, and two approved replays of the same window are two decisions two people made.
 */

// --- The aggregate ---------------------------------------------------------------

export interface ReplayRequest {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The one subscription the window will be sent to. A replay is never a broadcast. */
  readonly subscriptionId: Uuid;
  readonly subscriptionKey: string;
  readonly streamKey: string;
  /** The first instant to replay, normalised to fixed width so the column sorts chronologically as text. */
  readonly fromInstant: ISODateString;
  /** The last instant, inclusive: a window from a moment to itself is a legitimate request for that moment. */
  readonly toInstant: ISODateString;
  /** Why the replay is wanted. Mandatory, because an approver with no question in front of them approves. */
  readonly reason: string;
  readonly status: ReplayStatus;
  /** Who asked. When they asked is `createdAt`, the same instant, which is not worth storing twice. */
  readonly requestedBy: Uuid;
  readonly approvedBy: Uuid | null;
  readonly approvedAt: ISODateString | null;
  /** How many messages the approver was told the window covers. Null until somebody has been told. */
  readonly messageCount: number | null;
  readonly startedAt: ISODateString | null;
  readonly settledAt: ISODateString | null;
  /** Who ended it, where a person did. Null on a completion or a failure, which the run settles itself. */
  readonly settledBy: Uuid | null;
  /** Why it ended as it did: the rejection, the cancellation, or what stopped a run that had started. */
  readonly settlementReason: string | null;
  /** How many messages were sent again. Recorded when a run stops, whether or not it finished. */
  readonly deliveredCount: number | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RequestReplayParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subscriptionId: Uuid;
  readonly subscriptionKey: string;
  readonly streamKey: string;
  readonly fromInstant: ISODateString;
  readonly toInstant: ISODateString;
  readonly reason: string;
  readonly requestedBy: Uuid;
}

export interface ApproveReplayParams {
  readonly approvedBy: Uuid;
  /** The window verdict this approval is granted against, which carries both the refusal and the count. */
  readonly verdict: ReplayWindowVerdict;
}

/**
 * A person ending a request, and their explanation.
 *
 * One shape for rejection and cancellation because they are one act under two names: somebody decided the
 * replay will not happen and has to say why. Which of the two it was is the status, and duplicating the
 * parameter type to rename the field would only invite the two to drift.
 */
export interface SettleReplayParams {
  readonly settledBy: Uuid;
  readonly reason: string;
}

export interface FailReplayParams {
  /** How many messages went out before the run stopped. Nought is a legitimate answer. */
  readonly deliveredCount: number;
  /** What stopped it, in the words of whoever or whatever gave up: a transport, a ceiling, an operator. */
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
 * Non-operational, like every count guard in the package: a delivered-message count is tallied by the run and
 * never contributed by a caller outside the platform, so a figure that is not a count means the record is being
 * written by something that is not the mesh.
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
 * Normalising both bounds before anything compares them is what lets the inversion test below be a plain string
 * comparison, and it is the same guard the envelope engine applies for the same reason: ISO instants only
 * compare correctly as text when every one of them has the same shape.
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
 * A settled request is reported as settled rather than as an illegal move, because the caller who tries to
 * approve a cancelled request has not made a mistake about the lifecycle; they are looking at a page that was
 * accurate when it loaded. Everything else names both ends of the move it refused, which is what a caller needs
 * to work out whether they are early or somebody else was faster.
 */
function requireReplayTransition(request: ReplayRequest, to: ReplayStatus): void {
  const verdict = inspectReplayTransition(request.status, to);
  if (verdict.allowed) return;
  if (verdict.refusal === "terminal_status" || isTerminalReplayStatus(request.status)) {
    throw new ReplaySettledError(request.id, request.status);
  }
  throw new InvalidReplayProgressionError(request.id, request.status, to);
}

// --- Definition ------------------------------------------------------------------

/**
 * Raise a request to send a window of one stream to one subscription again.
 *
 * Two things are settled here and nothing else is. The keys have to be keys, and the window has to be a window:
 * a request whose end precedes its start is refused outright rather than carried to an approver, because there
 * is no version of it anybody could sensibly agree to. Everything else the mesh will eventually want to know
 * about this window is a question about records the aggregate does not hold, and is asked at approval.
 *
 * A window that starts and ends at the same instant is accepted, matching {@link inspectReplayWindow}: both
 * bounds are inclusive, so it is a request for whatever was recorded at that moment.
 *
 * @throws {EmptyMeshKeyError} when the subscription or stream key is blank.
 * @throws {InvalidMeshKeyError} when either does not fit the platform's grammar.
 * @throws {InvalidMeshInstantError} when either bound is not readable as a moment in time.
 * @throws {ReplayWindowInvertedError} when the window ends before it starts.
 * @throws {ReasonTooShortError} when no real justification was given.
 * @throws {ReasonTooLongError} when the justification is a document rather than a record.
 */
export function requestReplay(params: RequestReplayParams): ReplayRequest {
  const subscriptionKey = requireKey("subscription", params.subscriptionKey);
  const streamKey = requireKey("stream", params.streamKey);
  const fromInstant = requireInstant("fromInstant", params.fromInstant);
  const toInstant = requireInstant("toInstant", params.toInstant);
  if (toInstant < fromInstant) {
    throw new ReplayWindowInvertedError(fromInstant, toInstant);
  }
  const reason = requireReason("replaying a window of a stream", params.reason);

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    subscriptionId: params.subscriptionId,
    subscriptionKey,
    streamKey,
    fromInstant,
    toInstant,
    reason,
    status: INITIAL_REPLAY_STATUS,
    requestedBy: params.requestedBy,
    approvedBy: null,
    approvedAt: null,
    messageCount: null,
    startedAt: null,
    settledAt: null,
    settledBy: null,
    settlementReason: null,
    deliveredCount: null,
    createdAt: now,
    updatedAt: now,
  };
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Agree, as somebody other than the requester, that this window may be sent again.
 *
 * Three refusals in a deliberate order. The lifecycle is checked first, so a stale page is told the request has
 * moved on rather than told the approver is the wrong person. The separation of duties is checked next, because
 * who may approve is answerable from the request alone and does not depend on a single other record. The window
 * verdict is checked last, and it is checked by inspection of a value the caller had to compute rather than by
 * a flag the caller could assert: an approval reached with a refusing verdict in hand cannot be expressed.
 *
 * The {@link ReplayWindowVerdict} arrives rather than being computed here because judging it needs the stream's
 * retention, the subscription's status and an estimate of how many messages the window covers, none of which
 * this aggregate holds and none of which it should reach for. What it keeps from the verdict is the count, so
 * that what the approver was shown outlives the screen it was shown on.
 *
 * @throws {ReplaySettledError} when the request has already ended, whichever way it ended.
 * @throws {InvalidReplayProgressionError} when the request is running or was already approved.
 * @throws {SelfApprovedReplayError} when the approver is the person who asked.
 * @throws {ReplayRefusedError} when the window verdict refuses, naming the reason the requester can act on.
 */
export function approveReplay(request: ReplayRequest, params: ApproveReplayParams): ReplayRequest {
  requireReplayTransition(request, "approved");
  const approval = inspectReplayApproval({
    replayId: request.id,
    status: request.status,
    requestedBy: request.requestedBy,
    approvedBy: params.approvedBy,
  });
  if (!approval.allowed) {
    throw new SelfApprovedReplayError(request.id, params.approvedBy);
  }
  if (params.verdict.refusal !== null) {
    throw new ReplayRefusedError(request.id, params.verdict.refusal);
  }

  const now = nowIso();
  return {
    ...request,
    status: "approved",
    approvedBy: params.approvedBy,
    approvedAt: now,
    messageCount: params.verdict.messageCount,
    updatedAt: now,
  };
}

/**
 * Decline the request, permanently, and say why.
 *
 * Terminal on purpose and distinct from cancelling: a rejection is a judgement about the request itself, and a
 * requester who still wants the window raises a new one that carries the new argument. Reopening this one would
 * leave a record whose reason belongs to a decision that was overturned.
 *
 * @throws {ReplaySettledError} when the request has already ended.
 * @throws {InvalidReplayProgressionError} when the request has moved past the point where it can be declined.
 * @throws {ReasonTooShortError} when no real explanation was given.
 * @throws {ReasonTooLongError} when the explanation is a document rather than a record.
 */
export function rejectReplay(request: ReplayRequest, params: SettleReplayParams): ReplayRequest {
  requireReplayTransition(request, "rejected");
  const reason = requireReason("rejecting a replay", params.reason);

  const now = nowIso();
  return {
    ...request,
    status: "rejected",
    settledAt: now,
    settledBy: params.settledBy,
    settlementReason: reason,
    updatedAt: now,
  };
}

/**
 * Mark the approved request as running, which is the moment the messages start going out.
 *
 * An unapproved request is reported as unapproved rather than as an illegal move. The lifecycle table would
 * refuse it either way, but the two refusals send the caller to different places: one says the request needs a
 * second person, the other says the caller misread the state machine. Only the first is ever true here.
 *
 * @throws {ReplayNotApprovedError} when nobody has approved the request yet.
 * @throws {ReplaySettledError} when the request has already ended.
 * @throws {InvalidReplayProgressionError} when the request is already running.
 */
export function startReplay(request: ReplayRequest): ReplayRequest {
  if (request.status === INITIAL_REPLAY_STATUS) {
    throw new ReplayNotApprovedError(request.id, request.status);
  }
  requireReplayTransition(request, "running");

  const now = nowIso();
  return { ...request, status: "running", startedAt: now, updatedAt: now };
}

/**
 * Record that the run reached the end of its window, and how many messages went out.
 *
 * No person is named. A completion is not a decision anybody made; it is what happened, and attributing it to
 * whichever operator's session the worker happened to run under would put a name on a record that reads, months
 * later, as though somebody chose the outcome.
 *
 * The delivered count is kept even though the approved count is beside it, and the gap between them is the
 * useful part: a replay approved for eight thousand messages that delivered six is a replay somebody should
 * look at, and neither figure says so alone.
 *
 * @throws {ReplaySettledError} when the request has already ended.
 * @throws {InvalidReplayProgressionError} when the run never started.
 * @throws {InvalidMeshCountError} when the delivered count is not a count.
 */
export function completeReplay(request: ReplayRequest, deliveredCount: number): ReplayRequest {
  requireReplayTransition(request, "completed");
  const delivered = requireWhole("delivered messages", deliveredCount, 0);

  const now = nowIso();
  return {
    ...request,
    status: "completed",
    settledAt: now,
    deliveredCount: delivered,
    updatedAt: now,
  };
}

/**
 * Record that the run stopped short, what stopped it, and how far it had got.
 *
 * The count matters more on a failure than on a completion, because it is the whole of the answer to the
 * question the next person asks: is it safe to run this window again. A failure with six thousand delivered is
 * a duplicate risk on re-run; a failure with none is a clean retry. A `failed` row without the figure sends
 * somebody to count the messages by hand.
 *
 * The reason is free text and that is the one place in this package where it is, because what stops a run is a
 * transport, a ceiling or a person, and none of those is a closed set the mesh could have enumerated in
 * advance. It is prose about the run rather than about any message, so nothing in it quotes a payload.
 *
 * @throws {ReplaySettledError} when the request has already ended.
 * @throws {InvalidReplayProgressionError} when the run never started.
 * @throws {InvalidMeshCountError} when the delivered count is not a count.
 * @throws {ReasonTooShortError} when no real explanation was given.
 * @throws {ReasonTooLongError} when the explanation is a document rather than a record.
 */
export function failReplay(request: ReplayRequest, params: FailReplayParams): ReplayRequest {
  requireReplayTransition(request, "failed");
  const delivered = requireWhole("delivered messages", params.deliveredCount, 0);
  const reason = requireReason("failing a replay", params.reason);

  const now = nowIso();
  return {
    ...request,
    status: "failed",
    settledAt: now,
    settlementReason: reason,
    deliveredCount: delivered,
    updatedAt: now,
  };
}

/**
 * Call the whole thing off, from any point before it has ended.
 *
 * Reachable from all three live states, including `running`, because the request that most needs cancelling is
 * the one somebody is watching go wrong. What it does not do is record a delivered count: the figure at the
 * instant somebody clicks cancel is not the figure when the run actually stops, and a number that is wrong in
 * the direction of *fewer than really went out* is worse than no number at all. Whoever stops the run records
 * what it managed through {@link failReplay} if the distinction matters.
 *
 * @throws {ReplaySettledError} when the request has already ended.
 * @throws {ReasonTooShortError} when no real explanation was given.
 * @throws {ReasonTooLongError} when the explanation is a document rather than a record.
 */
export function cancelReplay(request: ReplayRequest, params: SettleReplayParams): ReplayRequest {
  requireReplayTransition(request, "cancelled");
  const reason = requireReason("cancelling a replay", params.reason);

  const now = nowIso();
  return {
    ...request,
    status: "cancelled",
    settledAt: now,
    settledBy: params.settledBy,
    settlementReason: reason,
    updatedAt: now,
  };
}

// --- Reading ---------------------------------------------------------------------

/** Sending right now: the state in which a consumer is receiving facts it has seen before. */
export const isReplayRunning = (request: ReplayRequest): boolean => request.status === "running";

/** Ended, whichever of the four endings it reached. Nothing moves it again. */
export const isReplaySettled = (request: ReplayRequest): boolean =>
  isTerminalReplayStatus(request.status);

/** Waiting on a second person. The queue an approver is meant to work through. */
export const replayNeedsApproval = (request: ReplayRequest): boolean =>
  request.status === INITIAL_REPLAY_STATUS;
