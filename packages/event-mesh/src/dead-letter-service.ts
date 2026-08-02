import type { EventBus } from "@knowget/events";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type DeadLetter,
  discardDeadLetter,
  isDeadLetterOpen,
  recordDeadLetter,
  replayDeadLetter,
} from "./dead-letter";
import {
  DeadLetterNotFoundError,
  MeshMessageNotFoundError,
  MeshSubscriptionNotFoundError,
  PersonNotFoundForMeshError,
  ReplayRequestNotFoundError,
} from "./errors";
import { deadLetterDiscarded, deadLetterRecorded, deadLetterReplayed } from "./mesh-events";
import type { MeshMessage } from "./mesh-message";
import type { MeshSubscription } from "./mesh-subscription";
import type { DeadLetterReason } from "./mesh-value";
import type {
  DeadLetterRepository,
  MeshMessageRepository,
  MeshSubscriptionRepository,
  PersonDirectory,
  ReplayRequestRepository,
} from "./ports";

/**
 * One delivery the mesh gave up on, described with only what the delivery loop itself is in a position to know.
 */
export interface RecordFailureRequest {
  readonly tenantId: TenantId;
  /** The consumer that could not process it. Its institution and key are read off the subscription. */
  readonly subscriptionId: Uuid;
  /** The message it failed on. Its stream, partition, sequence and event are read off the message. */
  readonly messageId: Uuid;
  readonly reason: DeadLetterReason;
  /** How many deliveries were tried, counted by the loop that tried them. */
  readonly attempts: number;
  /** The trace the failed delivery belongs to, which is where the consumer's own account of it lives. */
  readonly traceId: string;
  /** When the last attempt failed, which is before this record is written and sometimes well before. */
  readonly failedAt: ISODateString;
}

/**
 * Application service for dead letters — the facts the mesh accepted and could not deliver, and what somebody
 * decided to do about each one.
 *
 * The aggregate settles what a dead letter can settle alone: both endings are terminal, a discard carries a
 * written justification and a replay carries the request it was sent under, and neither ending is reachable
 * twice. Four rules need the rest of the tenant, and all four exist because this table is the one an institution
 * is eventually audited on.
 *
 * **Nothing describing the failure is taken from the caller.** The institution and the subscription key come off
 * the subscription; the stream, partition, sequence, event id and event type come off the message. What the
 * delivery loop supplies is what only it knows — which reason, how many attempts, which trace, and when the last
 * attempt failed. A dead letter is read months later by somebody reconstructing what was lost, and a record whose
 * sequence was passed in by the same code that failed to deliver it is a record that cannot contradict the caller.
 *
 * **One open dead letter per message per subscription, and a second recording hands the first one back.** The
 * aggregate is right that two failures of one message are two rows: they are two events and collapsing them would
 * lose the fact that somebody tried in between. That argument is about a message that failed, was settled, and
 * failed again. It says nothing about a consumer being restarted every ninety seconds against a message it will
 * never process, which is the ordinary cause of this call arriving repeatedly, and which would otherwise fill the
 * morning worklist with a thousand rows describing one broken projector. So while a record is open — while nobody
 * has decided anything — a further recording is the same undecided work item and returns it unchanged, announcing
 * nothing. Once it is settled, a fresh failure opens a fresh row.
 *
 * **A replay names a replay that exists.** {@link replayDeadLetter} requires the id and the aggregate explains
 * why: a record marked replayed with nothing to point at says the message was re-sent by somebody, at some point,
 * over some window, with no way to find out which. An id that points at nothing is worth precisely as much, and
 * is harder to spot, because the field is populated.
 *
 * **A discard is attributed to a person who exists.** It is the operation by which an institution deliberately
 * loses something it recorded, and the whole of the accountability is a name and a sentence. Both are checked
 * here rather than trusted, because the record outlives everybody who could be asked about it.
 *
 * Every one of the three announces, which is the opposite of {@link MeshMessageService}, and for a reason worth
 * stating: a message being recorded is the mesh working, and the message is its own announcement. A message the
 * mesh could not deliver is the mesh failing, and the teams that need to know are precisely the ones that will
 * never see the fact arrive.
 */
export interface DeadLetterServiceDeps {
  readonly repository: DeadLetterRepository;
  readonly subscriptions: MeshSubscriptionRepository;
  readonly messages: MeshMessageRepository;
  readonly replays: ReplayRequestRepository;
  readonly people: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class DeadLetterService {
  private readonly repository: DeadLetterRepository;
  private readonly subscriptions: MeshSubscriptionRepository;
  private readonly messages: MeshMessageRepository;
  private readonly replays: ReplayRequestRepository;
  private readonly people: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: DeadLetterServiceDeps) {
    this.repository = deps.repository;
    this.subscriptions = deps.subscriptions;
    this.messages = deps.messages;
    this.replays = deps.replays;
    this.people = deps.people;
    this.events = deps.events;
  }

  // --- Definition ------------------------------------------------------------------

  /**
   * Record that a subscription could not process a message, open for somebody to decide about.
   *
   * The subscription and the message are both read before anything is written, because between them they answer
   * every question the record asks except the four the delivery loop is uniquely placed to answer. The stream key
   * is taken from the message rather than the subscription, since the sequence and partition on the record are
   * positions on the stream the message actually sat on, and a record whose three stream facts came from two
   * places could disagree with itself.
   *
   * An open record for the same message and the same consumer is returned as it stands and nothing is published.
   */
  async record(request: RecordFailureRequest): Promise<DeadLetter> {
    const subscription = await this.requireSubscription(request.tenantId, request.subscriptionId);
    const message = await this.requireMessage(request.tenantId, request.messageId);
    const open = await this.openFor(request.tenantId, subscription.id, message.id);
    if (open) {
      return open;
    }

    const letter = recordDeadLetter({
      tenantId: request.tenantId,
      organizationId: subscription.organizationId,
      subscriptionId: subscription.id,
      subscriptionKey: subscription.subscriptionKey,
      streamKey: message.streamKey,
      messageId: message.id,
      eventId: message.eventId,
      eventTypeKey: message.eventTypeKey,
      partition: message.partition,
      sequence: message.sequence,
      reason: request.reason,
      attempts: request.attempts,
      traceId: request.traceId,
      failedAt: request.failedAt,
    });
    await this.repository.save(letter);
    await this.emit(deadLetterRecorded(letter));
    return letter;
  }

  // --- Lifecycle -------------------------------------------------------------------

  /** Close the record because the message went out again, under a replay that is itself on the record. */
  async replay(
    tenantId: TenantId,
    id: Uuid,
    replayId: Uuid,
    replayedBy: Uuid,
  ): Promise<DeadLetter> {
    await this.requirePerson(tenantId, replayedBy, "person replaying the dead letter");
    await this.requireReplay(tenantId, replayId);
    const next = replayDeadLetter(await this.require(tenantId, id), replayId, replayedBy);
    await this.repository.save(next);
    await this.emit(deadLetterReplayed(next));
    return next;
  }

  /** Close the record because somebody decided the fact will never be processed, and said why. */
  async discard(
    tenantId: TenantId,
    id: Uuid,
    discardedBy: Uuid,
    reason: string,
  ): Promise<DeadLetter> {
    await this.requirePerson(tenantId, discardedBy, "person discarding the dead letter");
    const next = discardDeadLetter(await this.require(tenantId, id), { discardedBy, reason });
    await this.repository.save(next);
    await this.emit(deadLetterDiscarded(next));
    return next;
  }

  // --- Reading ---------------------------------------------------------------------

  /** One dead letter, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<DeadLetter> {
    return this.require(tenantId, id);
  }

  /**
   * The dead letter one consumer holds for one message, in whatever state it has reached.
   *
   * What a delivery loop asks before it decides whether it is looking at a fresh failure or the one it already
   * recorded, and what an operator following a message through the mesh asks last.
   */
  async getByMessage(
    tenantId: TenantId,
    subscriptionId: Uuid,
    messageId: Uuid,
  ): Promise<DeadLetter> {
    const letter = await this.repository.findByMessage(tenantId, subscriptionId, messageId);
    if (!letter) {
      throw new DeadLetterNotFoundError(`${subscriptionId} message ${messageId}`);
    }
    return letter;
  }

  /** The worklist: everything currently stuck across one institution, oldest failure first. */
  async listOpen(tenantId: TenantId, organizationId: Uuid): Promise<readonly DeadLetter[]> {
    return this.repository.listOpen(tenantId, organizationId);
  }

  /**
   * Everything one consumer has ever failed on, settled records included.
   *
   * The worklist above cannot answer whether a consumer has been failing quietly for a month, because somebody
   * discarding each failure as it arrives keeps the queue clean and the consumer looking healthy.
   */
  async listBySubscription(
    tenantId: TenantId,
    subscriptionId: Uuid,
  ): Promise<readonly DeadLetter[]> {
    return this.repository.listBySubscription(tenantId, subscriptionId);
  }

  /** Every dead letter in the tenant, in every state. */
  async list(tenantId: TenantId): Promise<readonly DeadLetter[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The dead letter under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<DeadLetter> {
    const letter = await this.repository.findById(tenantId, id);
    if (!letter) {
      throw new DeadLetterNotFoundError(id);
    }
    return letter;
  }

  /** The consumer that failed, which is where the institution and the key on the record come from. */
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

  /** The message that failed, which is where every position and identity on the record comes from. */
  private async requireMessage(tenantId: TenantId, messageId: Uuid): Promise<MeshMessage> {
    const message = await this.messages.findById(tenantId, messageId);
    if (!message) {
      throw new MeshMessageNotFoundError(messageId);
    }
    return message;
  }

  /** One person, checked against the directory. */
  private async requirePerson(tenantId: TenantId, personId: Uuid, role: string): Promise<void> {
    if (!(await this.people.exists(tenantId, personId))) {
      throw new PersonNotFoundForMeshError(personId, role);
    }
  }

  /** The replay the record will point at exists in this tenant, so the attribution cannot dangle. */
  private async requireReplay(tenantId: TenantId, replayId: Uuid): Promise<void> {
    if (!(await this.replays.findById(tenantId, replayId))) {
      throw new ReplayRequestNotFoundError(replayId);
    }
  }

  /** The undecided record this consumer already holds for this message, where there is one. */
  private async openFor(
    tenantId: TenantId,
    subscriptionId: Uuid,
    messageId: Uuid,
  ): Promise<DeadLetter | null> {
    const existing = await this.repository.findByMessage(tenantId, subscriptionId, messageId);
    return existing && isDeadLetterOpen(existing) ? existing : null;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
