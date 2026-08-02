import type { EventBus } from "@knowget/events";
import { parseIso } from "@knowget/shared";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  ConcurrentReplayError,
  EventStreamNotFoundError,
  MeshSubscriptionNotDeliverableError,
  MeshSubscriptionNotFoundError,
  PersonNotFoundForMeshError,
  ReplayRequestNotFoundError,
  ReplayTooManyMessagesError,
  ReplayWindowTooWideError,
} from "./errors";
import type { EventStream } from "./event-stream";
import {
  replayApproved,
  replayCancelled,
  replayCompleted,
  replayFailed,
  replayRejected,
  replayRequested,
  replayStarted,
} from "./mesh-events";
import type { MeshSubscription } from "./mesh-subscription";
import {
  MAX_REPLAY_MESSAGES,
  MAX_REPLAY_WINDOW_SECONDS,
  isSubscriptionDeliverable,
} from "./mesh-value";
import type { ReplayWindowVerdict } from "./mesh-view";
import type {
  EventStreamRepository,
  MeshMessageRepository,
  MeshSubscriptionRepository,
  PersonDirectory,
  ReplayRequestRepository,
} from "./ports";
import { inspectReplayWindow } from "./replay";
import {
  type ReplayRequest,
  approveReplay,
  cancelReplay,
  completeReplay,
  failReplay,
  rejectReplay,
  requestReplay,
  startReplay,
} from "./replay-request";

/**
 * One stretch of a stream, and the consumer somebody wants it sent to again.
 *
 * The institution, the subscription key and the stream key are absent on purpose: all three are read off the
 * subscription, so a request cannot name a window on one stream and a consumer that reads another.
 */
export interface RaiseReplayRequest {
  readonly tenantId: TenantId;
  readonly subscriptionId: Uuid;
  readonly fromInstant: ISODateString;
  readonly toInstant: ISODateString;
  readonly reason: string;
  readonly requestedBy: Uuid;
}

/**
 * Application service for replay requests — asking for a stretch of history to be sent to a consumer again,
 * getting a second person to agree to it, and recording what the run did.
 *
 * Replay is the capability in this contract with the worst failure mode, and the reason is that it does not
 * fail. A month of enrolments sent again to a consumer that turns out not to be idempotent reissues a month of
 * invoices and letters, reports itself complete, and is discovered by the families who received them. Every
 * rule below exists because there is no later moment at which any of it can be caught.
 *
 * **The window is judged by the engine, and the engine is given facts rather than claims.** Retention, the
 * stream status, the subscription status and the message count are read off the two records and the message
 * table at the moment of approval. A caller able to supply them is a caller able to have a window approved
 * against a retention the stream never promised, and the approval would be recorded as sound.
 *
 * **The two ceilings are enforced when the window is typed; retention is judged when it is approved.**
 * {@link MAX_REPLAY_WINDOW_SECONDS} and {@link MAX_REPLAY_MESSAGES} are policy constants that do not move, so
 * a window past either of them is refused at request time rather than queued for an approver who could not
 * sensibly agree to it — the same argument the aggregate makes for refusing an inverted window. Retention is
 * the opposite kind of fact: a window comfortably inside it when it is asked for can be outside it by the time
 * anybody looks, so it is judged once, late, against the instant the approver is actually deciding at.
 *
 * **A replay is not started into a consumer that cannot receive it.** Approval and start are separated by
 * however long an approver takes, and a subscription paused or retired in between is one whose team has
 * deliberately stopped delivery. Starting anyway would resume it with a month of history, which is the
 * opposite of what pausing it meant.
 *
 * **One replay runs into a consumer at a time.** Two concurrent runs interleave two stretches of history in an
 * order neither requester asked for, and the consumer on the far side — written to read a stream forwards —
 * has no way to tell it is being handed two. Both report themselves complete, and what is left is a projection
 * built from a sequence of facts that never occurred in that order. {@link ConcurrentReplayError} is the only
 * moment at which that is preventable.
 *
 * **Every operation announces.** This is the low-volume surface in the package and the one whose events other
 * teams most need: a team that knows a replay has started can hold a reconciliation or expect the duplicates,
 * and a team that finds out from the duplicates cannot.
 */
export interface ReplayRequestServiceDeps {
  readonly repository: ReplayRequestRepository;
  readonly subscriptions: MeshSubscriptionRepository;
  readonly streams: EventStreamRepository;
  readonly messages: MeshMessageRepository;
  readonly people: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class ReplayRequestService {
  private readonly repository: ReplayRequestRepository;
  private readonly subscriptions: MeshSubscriptionRepository;
  private readonly streams: EventStreamRepository;
  private readonly messages: MeshMessageRepository;
  private readonly people: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ReplayRequestServiceDeps) {
    this.repository = deps.repository;
    this.subscriptions = deps.subscriptions;
    this.streams = deps.streams;
    this.messages = deps.messages;
    this.people = deps.people;
    this.events = deps.events;
  }

  // --- Definition ------------------------------------------------------------------

  /**
   * Raise a request for a window. Nothing is sent until somebody else agrees to it.
   *
   * The subscription is resolved first because the request is described against it, and then the aggregate
   * runs before any further read: a malformed instant, an inverted window and a missing reason are all
   * answerable from what was typed, and somebody working through a form should learn about them without the
   * message table being counted over. The requester is checked next, and the two ceilings last, because that
   * pair is the only part of the request that needs the store.
   *
   * @throws {ReplayWindowTooWideError} when the window is wider than the platform ever replays at once.
   * @throws {ReplayTooManyMessagesError} when the window covers more messages than the platform ever replays.
   */
  async request(request: RaiseReplayRequest): Promise<ReplayRequest> {
    const subscription = await this.requireSubscription(request.tenantId, request.subscriptionId);
    const raised = requestReplay({
      tenantId: request.tenantId,
      organizationId: subscription.organizationId,
      subscriptionId: subscription.id,
      subscriptionKey: subscription.subscriptionKey,
      streamKey: subscription.streamKey,
      fromInstant: request.fromInstant,
      toInstant: request.toInstant,
      reason: request.reason,
      requestedBy: request.requestedBy,
    });
    await this.requirePerson(request.tenantId, raised.requestedBy, "person requesting the replay");
    await this.requireWithinCeilings(raised);
    await this.repository.save(raised);
    await this.emit(replayRequested(raised));
    return raised;
  }

  // --- Decision --------------------------------------------------------------------

  /**
   * Agree, as somebody other than the requester, that the window may be sent again.
   *
   * The verdict is computed here and handed to the aggregate rather than asserted, so an approval reached
   * against a refusing window cannot be expressed. `asOf` arrives explicitly because retention is judged
   * against it: an approver deciding today and an auditor re-judging the same request in November are asking
   * different questions, and both deserve the answer for the moment they name.
   */
  async approve(
    tenantId: TenantId,
    id: Uuid,
    approvedBy: Uuid,
    asOf: ISODateString,
  ): Promise<ReplayRequest> {
    await this.requirePerson(tenantId, approvedBy, "person approving the replay");
    const request = await this.require(tenantId, id);
    const verdict = await this.judgeWindow(request, asOf);
    const approved = approveReplay(request, { approvedBy, verdict });
    await this.repository.save(approved);
    await this.emit(replayApproved(approved));
    return approved;
  }

  /** Decline the request permanently, in the name of whoever declined it and with their reason. */
  async reject(
    tenantId: TenantId,
    id: Uuid,
    settledBy: Uuid,
    reason: string,
  ): Promise<ReplayRequest> {
    await this.requirePerson(tenantId, settledBy, "person rejecting the replay");
    const rejected = rejectReplay(await this.require(tenantId, id), { settledBy, reason });
    await this.repository.save(rejected);
    await this.emit(replayRejected(rejected));
    return rejected;
  }

  /** Call the whole thing off, from any point before it has ended, including mid-run. */
  async cancel(
    tenantId: TenantId,
    id: Uuid,
    settledBy: Uuid,
    reason: string,
  ): Promise<ReplayRequest> {
    await this.requirePerson(tenantId, settledBy, "person cancelling the replay");
    const cancelled = cancelReplay(await this.require(tenantId, id), { settledBy, reason });
    await this.repository.save(cancelled);
    await this.emit(replayCancelled(cancelled));
    return cancelled;
  }

  // --- Run -------------------------------------------------------------------------

  /**
   * Begin sending. This is the moment the consumer starts receiving facts it has seen before.
   *
   * The pure transition runs first, so a request nobody approved and a request that already ended are both
   * refused without a further read — the two cheapest refusals, and the two most likely. Only then are the
   * two facts that can have changed since approval checked: whether the consumer is still being delivered to,
   * and whether it is already being replayed into.
   *
   * @throws {MeshSubscriptionNotDeliverableError} when the consumer was paused or retired after approval.
   * @throws {ConcurrentReplayError} when another replay into the same consumer is already running.
   */
  async start(tenantId: TenantId, id: Uuid): Promise<ReplayRequest> {
    const started = startReplay(await this.require(tenantId, id));
    await this.requireDeliverableConsumer(started);
    await this.requireNoRunningReplay(started);
    await this.repository.save(started);
    await this.emit(replayStarted(started));
    return started;
  }

  /**
   * Record that the run reached the end of its window, and how many messages went out.
   *
   * Nobody is named, because a completion is not a decision anybody made. The delivered count is kept beside
   * the approved count, and the gap between the two is the part worth reading.
   */
  async complete(tenantId: TenantId, id: Uuid, deliveredCount: number): Promise<ReplayRequest> {
    const completed = completeReplay(await this.require(tenantId, id), deliveredCount);
    await this.repository.save(completed);
    await this.emit(replayCompleted(completed));
    return completed;
  }

  /** Record that the run stopped short, how far it had got, and what stopped it. */
  async fail(
    tenantId: TenantId,
    id: Uuid,
    deliveredCount: number,
    reason: string,
  ): Promise<ReplayRequest> {
    const failed = failReplay(await this.require(tenantId, id), { deliveredCount, reason });
    await this.repository.save(failed);
    await this.emit(replayFailed(failed));
    return failed;
  }

  // --- Reading ---------------------------------------------------------------------

  /** One request, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<ReplayRequest> {
    return this.require(tenantId, id);
  }

  /** The replay currently running into one consumer, or `null` where none is. */
  async running(tenantId: TenantId, subscriptionId: Uuid): Promise<ReplayRequest | null> {
    return this.repository.findRunning(tenantId, subscriptionId);
  }

  /** Every request ever raised against one consumer, oldest first: what has been sent to it twice. */
  async listBySubscription(
    tenantId: TenantId,
    subscriptionId: Uuid,
  ): Promise<readonly ReplayRequest[]> {
    return this.repository.listBySubscription(tenantId, subscriptionId);
  }

  /** Every request in the tenant, in every status. The approver queue is filtered out of this. */
  async list(tenantId: TenantId): Promise<readonly ReplayRequest[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The request under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<ReplayRequest> {
    const request = await this.repository.findById(tenantId, id);
    if (!request) {
      throw new ReplayRequestNotFoundError(id);
    }
    return request;
  }

  /** The consumer the window is being replayed to, or a 404 naming it. */
  private async requireSubscription(
    tenantId: TenantId,
    subscriptionId: Uuid,
  ): Promise<MeshSubscription> {
    const subscription = await this.subscriptions.findById(tenantId, subscriptionId);
    if (!subscription) {
      throw new MeshSubscriptionNotFoundError(subscriptionId);
    }
    return subscription;
  }

  /** The stream the window is a stretch of, or a 404 naming its key. */
  private async requireStream(tenantId: TenantId, streamKey: string): Promise<EventStream> {
    const stream = await this.streams.findByKey(tenantId, streamKey);
    if (!stream) {
      throw new EventStreamNotFoundError(streamKey);
    }
    return stream;
  }

  /** One person, checked against the directory. */
  private async requirePerson(tenantId: TenantId, personId: Uuid, role: string): Promise<void> {
    if (!(await this.people.exists(tenantId, personId))) {
      throw new PersonNotFoundForMeshError(personId, role);
    }
  }

  /**
   * The two ceilings, checked against what the requester typed and what the store holds.
   *
   * Both instants are already known to be readable, because the aggregate refused the request otherwise, so
   * the width is arithmetic rather than a parse. Width is reported before count for the reason the engine
   * orders them that way: the width is what the requester typed, and the count came from somewhere they
   * cannot see.
   */
  private async requireWithinCeilings(request: ReplayRequest): Promise<void> {
    const from = parseIso(request.fromInstant).getTime();
    const to = parseIso(request.toInstant).getTime();
    const windowSeconds = Math.floor((to - from) / 1_000);
    if (windowSeconds > MAX_REPLAY_WINDOW_SECONDS) {
      throw new ReplayWindowTooWideError(windowSeconds, MAX_REPLAY_WINDOW_SECONDS);
    }
    const messageCount = await this.messages.countWindow(
      request.tenantId,
      request.streamKey,
      request.fromInstant,
      request.toInstant,
    );
    if (messageCount > MAX_REPLAY_MESSAGES) {
      throw new ReplayTooManyMessagesError(messageCount, MAX_REPLAY_MESSAGES);
    }
  }

  /**
   * Everything the window verdict needs, gathered from the records that actually hold it.
   *
   * The count is taken again here rather than reused from the request-time pre-flight, and the difference
   * between the two figures is the point: the pre-flight asked whether the window was ever approvable, and
   * this asks how much an approver is agreeing to right now. What the approver was shown is then kept on the
   * request, so it outlives the screen it was shown on.
   */
  private async judgeWindow(
    request: ReplayRequest,
    asOf: ISODateString,
  ): Promise<ReplayWindowVerdict> {
    const stream = await this.requireStream(request.tenantId, request.streamKey);
    const subscription = await this.requireSubscription(request.tenantId, request.subscriptionId);
    const messageCount = await this.messages.countWindow(
      request.tenantId,
      request.streamKey,
      request.fromInstant,
      request.toInstant,
    );
    return inspectReplayWindow({
      subscriptionKey: request.subscriptionKey,
      streamKey: request.streamKey,
      fromInstant: request.fromInstant,
      toInstant: request.toInstant,
      messageCount,
      retention: stream.retention,
      retentionSeconds: stream.retentionSeconds,
      streamStatus: stream.status,
      subscriptionStatus: subscription.status,
      asOf,
    });
  }

  /** The consumer is still one the mesh delivers to, checked at the moment the run would begin. */
  private async requireDeliverableConsumer(request: ReplayRequest): Promise<void> {
    const subscription = await this.requireSubscription(request.tenantId, request.subscriptionId);
    if (!isSubscriptionDeliverable(subscription.status)) {
      throw new MeshSubscriptionNotDeliverableError(
        subscription.subscriptionKey,
        subscription.status,
      );
    }
  }

  /**
   * No other replay is already running into this consumer.
   *
   * No self-exclusion is needed. The pure transition runs before this, and the lifecycle refuses a request
   * that is already running, so the request being started can never be the one this read returns.
   */
  private async requireNoRunningReplay(request: ReplayRequest): Promise<void> {
    const running = await this.repository.findRunning(request.tenantId, request.subscriptionId);
    if (running) {
      throw new ConcurrentReplayError(request.subscriptionKey, running.id);
    }
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
