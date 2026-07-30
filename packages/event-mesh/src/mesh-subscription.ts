import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { validateAttemptCeiling } from "./delivery";
import {
  EmptyMeshKeyError,
  InvalidMeshKeyError,
  InvalidMeshSubscriptionProgressionError,
  MeshSubscriptionRetiredError,
} from "./errors";
import { inspectMeshSubscriptionTransition } from "./lifecycle";
import {
  DEFAULT_DELIVERY_ATTEMPTS,
  DEFAULT_DELIVERY_SEMANTICS,
  type DeliverySemantics,
  type FilterPredicate,
  INITIAL_SUBSCRIPTION_STATUS,
  type SubscriptionStatus,
  isSubscriptionDeliverable,
  isValidKey,
  normalizeKey,
  requiresDeduplication,
  requiresRetry,
} from "./mesh-value";
import { validateFilter } from "./routing";

/**
 * A durable subscription: who reads a stream, what of it they want, and what the mesh promises them about it.
 *
 * Durable is the word that carries the weight. A subscription is a record with a lifecycle, not a callback
 * registered at start-up, and the difference is what happens while the consumer is not running. A registered
 * subscription that is paused holds its checkpoint still while the stream advances past it, so a deployment is
 * pause, deploy, resume, and the mesh hands over the backlog. A subscription that existed only as a live
 * connection would instead have a gap in it shaped exactly like the deployment, and nothing anywhere would
 * record that the gap was there.
 *
 * **The consumer group is the unit a checkpoint belongs to, and it is the field most easily got wrong.** Two
 * subscriptions on one stream sharing a group would commit positions over each other, each appearing to advance
 * while skipping whatever the other had committed past — a message loss that shows up in neither one's lag and
 * is therefore found months later by somebody reconciling totals. That uniqueness is a question about what else
 * the tenant holds, so `DuplicateConsumerGroupError` belongs to the service; this aggregate validates the group
 * as a key and no more.
 *
 * **The filter is conjunctive and is replaced whole.** Every predicate must hold, so a longer filter is a
 * narrower one, and {@link validateFilter} holds the rules about what an envelope can be asked. There is no
 * add-a-predicate operation, because a filter is read as a set by whoever is working out why a subscription is
 * empty, and an interface that let one predicate in at a time would make the record's meaning depend on the
 * order the edits arrived in.
 *
 * **Semantics and the attempt ceiling are revisable, and they bind what is delivered next.** Neither rewrites
 * what has already happened, which is the same asymmetry a stream's retention has and for the same reason.
 * Moving to `exactly_once` starts a deduplication ledger that is empty, so it suppresses redeliveries from that
 * point rather than retrospectively; moving away from it means a consumer that stopped being idempotent will
 * see duplicates again. Both are decisions somebody makes with the record in front of them, which is what makes
 * them acceptable to permit.
 *
 * Nothing here checks that the stream exists, that it is readable, or that the subscription key is unused.
 * Those are questions about what else the tenant holds; this package keeps no directory of its own records, and
 * `SubscriptionStreamNotReadableError` is raised by the service that can actually look.
 */

// --- The aggregate ---------------------------------------------------------------

export interface MeshSubscription {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** How every checkpoint and dead letter refers to this subscription. Public and immutable. */
  readonly subscriptionKey: string;
  /** The stream being read. Immutable: reading a different stream is a different subscription. */
  readonly streamKey: string;
  /** The group the checkpoint belongs to. Unique per stream, which the service enforces, not this. */
  readonly consumerGroup: string;
  readonly title: string;
  /** What the mesh promises about delivery count. Revisable, and it binds what is delivered next. */
  readonly semantics: DeliverySemantics;
  /** How many attempts a message gets before it is dead-lettered. Never reached under `at_most_once`. */
  readonly maxAttempts: number;
  /** The predicates a message must satisfy, all of them. Empty means everything on the stream. */
  readonly filter: readonly FilterPredicate[];
  readonly status: SubscriptionStatus;
  /** When the subscription first began receiving. Kept across a pause; it is not activated twice. */
  readonly activatedAt: ISODateString | null;
  readonly activatedBy: Uuid | null;
  /** When it was last paused, and null while it is not. How long a backlog has been accruing. */
  readonly pausedAt: ISODateString | null;
  readonly retiredAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RegisterMeshSubscriptionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subscriptionKey: string;
  readonly streamKey: string;
  readonly consumerGroup: string;
  readonly title: string;
  /** Defaults to delivery until acknowledged: the promise the existing outbox relay already keeps. */
  readonly semantics?: DeliverySemantics;
  readonly maxAttempts?: number;
  /** Defaults to no predicates, which is everything the stream carries. */
  readonly filter?: readonly FilterPredicate[];
}

// --- Guards ----------------------------------------------------------------------

/** Normalise a key and refuse it if it is blank or does not fit the platform's grammar. */
function requireKey(kind: string, value: string): string {
  const key = normalizeKey(value);
  if (key.length === 0) throw new EmptyMeshKeyError(kind);
  if (!isValidKey(key)) throw new InvalidMeshKeyError(kind, key);
  return key;
}

/** Refuse a change to a subscription that is finished. A retired subscription is read, never reconfigured. */
function requireNotRetired(subscription: MeshSubscription): void {
  if (subscription.status === "retired") {
    throw new MeshSubscriptionRetiredError(subscription.id);
  }
}

/**
 * Ask the lifecycle engine whether a status move is permitted, and raise the refusal it names.
 *
 * A retired subscription gets its own error, which also covers the engine's `same_status` refusal once the
 * subscription is retired. The engine distinguishes a resubmitted request from a finished record because for a
 * subscription being paused those have different remedies; for one that has been closed they do not.
 */
function requireSubscriptionTransition(
  subscription: MeshSubscription,
  to: SubscriptionStatus,
): void {
  const verdict = inspectMeshSubscriptionTransition(subscription.status, to);
  if (verdict.allowed) return;
  if (verdict.refusal === "terminal_status" || subscription.status === "retired") {
    throw new MeshSubscriptionRetiredError(subscription.id);
  }
  throw new InvalidMeshSubscriptionProgressionError(subscription.id, subscription.status, to);
}

// --- Definition ------------------------------------------------------------------

/**
 * Register a subscription. It receives nothing until it is activated.
 *
 * The registered state is what lets a consumer's filter and semantics be reviewed before a single message is
 * handed over, and it is why there is no parameter that activates on creation: a subscription that began
 * delivering the instant it was written would have its first delivery decided by whatever the defaults were.
 *
 * The ceiling is recorded even under `at_most_once`, where it is never reached, rather than being refused as
 * meaningless. {@link validateAttemptCeiling} is the same check the delivery engine applies on every decision,
 * so a subscription whose semantics later move to one that retries is already carrying a ceiling somebody
 * chose, instead of acquiring a default at the moment the promise changed.
 *
 * @throws {EmptyMeshKeyError} when the subscription key, the stream key or the consumer group is blank.
 * @throws {InvalidMeshKeyError} when one of them does not fit the platform's grammar, and every ceiling
 *   refusal {@link validateAttemptCeiling} names, and every filter refusal {@link validateFilter} names.
 */
export function registerMeshSubscription(params: RegisterMeshSubscriptionParams): MeshSubscription {
  const subscriptionKey = requireKey("subscription", params.subscriptionKey);
  const streamKey = requireKey("stream", params.streamKey);
  const consumerGroup = requireKey("consumer group", params.consumerGroup);
  const maxAttempts = validateAttemptCeiling(
    subscriptionKey,
    params.maxAttempts ?? DEFAULT_DELIVERY_ATTEMPTS,
  );
  const filter = validateFilter(subscriptionKey, params.filter ?? []);

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    subscriptionKey,
    streamKey,
    consumerGroup,
    title: params.title.trim(),
    semantics: params.semantics ?? DEFAULT_DELIVERY_SEMANTICS,
    maxAttempts,
    filter,
    status: INITIAL_SUBSCRIPTION_STATUS,
    activatedAt: null,
    activatedBy: null,
    pausedAt: null,
    retiredAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Replace what the subscription wants off its stream.
 *
 * Whole filter rather than one predicate at a time, and permitted on a live subscription. Narrowing a filter
 * does not retract messages already handed over and widening it does not fetch the ones that were excluded
 * while it was narrow — a filter decides what is delivered next, and a consumer that needs the history it
 * filtered out asks for a replay, which is a governed request with an approver rather than a side effect of
 * editing a form.
 *
 * @throws {MeshSubscriptionRetiredError} when the subscription is finished and will receive nothing further,
 *   and every filter refusal {@link validateFilter} names.
 */
export function refilterMeshSubscription(
  subscription: MeshSubscription,
  filter: readonly FilterPredicate[],
): MeshSubscription {
  requireNotRetired(subscription);
  return {
    ...subscription,
    filter: validateFilter(subscription.subscriptionKey, filter),
    updatedAt: nowIso(),
  };
}

/**
 * Change what the mesh promises the consumer, and how hard it tries.
 *
 * Both fields together, because the ceiling only means anything against the semantics: a subscription moving to
 * `at_most_once` keeps a ceiling nothing will reach, and one moving away from it starts retrying up to whatever
 * number was last recorded. Revising them in two operations would leave a window in which the promise had
 * changed and the effort had not, and the window is exactly as long as it takes somebody to be interrupted.
 *
 * @throws {MeshSubscriptionRetiredError} when the subscription is finished, and every ceiling refusal
 *   {@link validateAttemptCeiling} names.
 */
export function reviseSubscriptionDelivery(
  subscription: MeshSubscription,
  semantics: DeliverySemantics,
  maxAttempts: number,
): MeshSubscription {
  requireNotRetired(subscription);
  return {
    ...subscription,
    semantics,
    maxAttempts: validateAttemptCeiling(subscription.subscriptionKey, maxAttempts),
    updatedAt: nowIso(),
  };
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Begin delivering, from `registered` or from `paused`.
 *
 * One operation for both, because resuming and starting differ in nothing the mesh does afterwards. What they
 * do differ in is recorded rather than branched on: `activatedAt` and `activatedBy` are stamped on the first
 * activation and kept across every pause after it, so *when did this consumer start reading* stays answerable
 * after a year of deployments. `pausedAt` is cleared, because it answers a question about the present.
 *
 * @throws {MeshSubscriptionRetiredError} when the subscription is finished.
 * @throws {InvalidMeshSubscriptionProgressionError} when it is already active, which nobody meant to ask.
 */
export function activateMeshSubscription(
  subscription: MeshSubscription,
  activatedBy: Uuid,
): MeshSubscription {
  requireSubscriptionTransition(subscription, "active");
  const now = nowIso();
  return {
    ...subscription,
    status: "active",
    activatedAt: subscription.activatedAt ?? now,
    activatedBy: subscription.activatedBy ?? activatedBy,
    pausedAt: null,
    updatedAt: now,
  };
}

/**
 * Stop delivering, and hold the checkpoint where it is.
 *
 * The state that makes a consumer deployment safe: the stream advances, the committed position does not, and
 * the backlog is delivered on resume. It is reversible and retirement is not, which is the distinction an
 * operator under pressure should not have to remember — hence two words rather than one with a flag.
 *
 * @throws {MeshSubscriptionRetiredError} when the subscription is finished.
 * @throws {InvalidMeshSubscriptionProgressionError} when it is not currently receiving anything.
 */
export function pauseMeshSubscription(subscription: MeshSubscription): MeshSubscription {
  requireSubscriptionTransition(subscription, "paused");
  const now = nowIso();
  return { ...subscription, status: "paused", pausedAt: now, updatedAt: now };
}

/**
 * Close the subscription permanently and release its checkpoint.
 *
 * Terminal, and unlike a pause it does not hold a position: a retired subscription's checkpoint is not
 * something anybody resumes from, and keeping it would leave the mesh unable to tell a consumer that is coming
 * back from one that has gone. Reachable from every other state, including `registered`, which is how a
 * subscription that was never activated is withdrawn.
 *
 * @throws {MeshSubscriptionRetiredError} when the subscription is already finished.
 */
export function retireMeshSubscription(subscription: MeshSubscription): MeshSubscription {
  requireSubscriptionTransition(subscription, "retired");
  const now = nowIso();
  return { ...subscription, status: "retired", retiredAt: now, updatedAt: now };
}

// --- Reading ---------------------------------------------------------------------

/** Receiving deliveries: active, and nothing else. */
export const isMeshSubscriptionDeliverable = (subscription: MeshSubscription): boolean =>
  isSubscriptionDeliverable(subscription.status);

/** Whether this subscription's promise obliges the mesh to keep a deduplication ledger for it. */
export const subscriptionRequiresDeduplication = (subscription: MeshSubscription): boolean =>
  requiresDeduplication(subscription.semantics);

/** Whether its promise obliges the mesh to retry a failed delivery, or to give up after the first. */
export const subscriptionRequiresRetry = (subscription: MeshSubscription): boolean =>
  requiresRetry(subscription.semantics);
