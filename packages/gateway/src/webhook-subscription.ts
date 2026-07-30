import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateSubscriptionKeyError,
  EmptyGatewayKeyError,
  InvalidGatewayKeyError,
  InvalidSubscriptionProgressionError,
  NoEventTypesSubscribedError,
  PlaintextCredentialError,
  SubscriptionNotSendingError,
  SubscriptionRevokedError,
} from "./errors";
import {
  CREDENTIAL_PROVIDERS,
  DEFAULT_DELIVERY_MODE,
  type DeliveryMode,
  type SubscriptionStatus,
  isCredentialReference,
  isSubscriptionSending,
  isValidKey,
  normalizeKey,
} from "./gateway-value";
import type { SubscriptionView } from "./gateway-view";
import { inspectSubscriptionTransition } from "./lifecycle";

/**
 * A standing request from a consumer to be told when named things happen, and the record of how that has gone.
 *
 * A subscription is a filter and a destination, and it deliberately owns only the filter. Where the platform
 * sends is an {@link IntegrationEndpoint}, referred to by id, and that indirection is the reason a consumer can
 * move their receiver to a new address, put a queue in front of it, or change vendors without every subscription
 * they hold being rewritten — and the reason the circuit breaker, the adapter binding and the credential handle
 * exist once rather than once per subscription. A subscription that carried its own URL would be a second,
 * quieter copy of the outbound endpoint with none of its health machinery.
 *
 * **Event types are a set, held sorted.** The order a consumer lists them in is not information — subscribing to
 * enrolment and attendance is the same subscription as attendance and enrolment — and storing the order would
 * make two identical subscriptions compare unequal, which matters the first time somebody diffs a tenant's
 * configuration against another's. Duplicates collapse for the same reason: naming an event twice does not
 * deliver it twice, and a record that suggested it might is a record somebody will eventually act on.
 *
 * **A subscription starts active, and an endpoint does not.** The asymmetry is not an oversight. Registering an
 * endpoint introduces a new outbound address and a new credential, and the gap before activation is where
 * somebody confirms both. A subscription introduces neither: it selects from events the platform already
 * produces and sends them to an endpoint that has already been verified, so there is nothing between creating it
 * and using it that anybody would check.
 *
 * **Failure counting here is not the circuit.** {@link recordSubscriptionOutcome} keeps a consecutive-failure
 * run so that an operator can see which subscriptions are struggling, and it never changes the status. Whether
 * to stop sending is a decision about the *endpoint*, taken by the circuit engine over every subscription
 * sharing it, because a receiver that is down is down for all of them and five subscriptions to one dead address
 * should not each discover that separately.
 */

// --- The aggregate ---------------------------------------------------------------

export interface WebhookSubscription {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The consumer this subscription belongs to. Deliveries are theirs; nobody else may read or move them. */
  readonly consumerId: Uuid;
  /** How the consumer refers to this subscription. Unique within the consumer, and immutable. */
  readonly subscriptionKey: string;
  readonly displayName: string;
  /** The outbound endpoint deliveries are sent through. Rebindable while the subscription is alive. */
  readonly endpointId: Uuid;
  /** The events subscribed to: a sorted, de-duplicated, non-empty set of event type keys. */
  readonly eventTypes: readonly string[];
  readonly deliveryMode: DeliveryMode;
  /** A handle to the secret payloads are signed with, or null where the consumer verifies another way. */
  readonly secretRef: string | null;
  readonly status: SubscriptionStatus;
  /** Deliveries failed in a row. Reset by any success, and by a resumption. */
  readonly consecutiveFailures: number;
  readonly lastDeliveryAt: ISODateString | null;
  readonly lastSuccessAt: ISODateString | null;
  readonly pausedAt: ISODateString | null;
  readonly suspendedAt: ISODateString | null;
  readonly suspendedReason: string | null;
  readonly revokedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateWebhookSubscriptionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly consumerId: Uuid;
  readonly subscriptionKey: string;
  readonly displayName: string;
  readonly endpointId: Uuid;
  readonly eventTypes: readonly string[];
  readonly deliveryMode?: DeliveryMode;
  /**
   * A handle to the signing secret, or null.
   *
   * Explicitly null rather than omitted where there is none, for the reason an endpoint's credential is: a
   * consumer who chose to verify deliveries by mutual TLS and a consumer whose signing secret was never filled
   * in produce the same record otherwise, and only one of them should be sent unsigned payloads.
   */
  readonly secretRef: string | null;
}

/** What one delivery attempt ended in, as far as the subscription is concerned. */
export type SubscriptionOutcome = "succeeded" | "failed";

// --- Guards ----------------------------------------------------------------------

/** Normalise a key and refuse it if it is blank or does not fit the platform's grammar. */
function requireKey(kind: string, value: string): string {
  const key = normalizeKey(value);
  if (key.length === 0) throw new EmptyGatewayKeyError(kind);
  if (!isValidKey(key)) throw new InvalidGatewayKeyError(kind, key);
  return key;
}

/**
 * Reduce a list of event types to the set it means, refusing an empty one.
 *
 * The refusal is the point. A subscription with no event types is syntactically fine, stores cleanly, appears in
 * every listing and delivers nothing forever — and the consumer who created it will spend a day believing the
 * platform is broken before anybody looks at the row. Refusing at creation costs them one error message.
 */
function requireEventTypes(subscriptionKey: string, values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const key = normalizeKey(value);
    if (key.length === 0) continue;
    if (!isValidKey(key)) throw new InvalidGatewayKeyError("event type", key);
    seen.add(key);
  }
  if (seen.size === 0) throw new NoEventTypesSubscribedError(subscriptionKey);
  return Object.freeze([...seen].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)));
}

/** Refuse a signing secret that is not a handle to one, while permitting the absence of a secret. */
function requireSecretRef(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (!isCredentialReference(trimmed)) {
    throw new PlaintextCredentialError("secretRef", CREDENTIAL_PROVIDERS);
  }
  return trimmed;
}

/** Refuse any edit to a revoked subscription. The consumer ended it; nothing about it is worth correcting. */
function requireNotRevoked(subscription: WebhookSubscription): void {
  if (subscription.status === "revoked") throw new SubscriptionRevokedError(subscription.id);
}

/**
 * Ask the lifecycle engine whether a status move is permitted, and raise the refusal it names.
 *
 * A resubmission collapses into the progression error, as it does for a route and an endpoint. Pausing an
 * already-paused subscription and pausing one the lifecycle will not pause both leave the consumer in the same
 * place — nothing is being sent — and a second error type would distinguish two situations with one remedy.
 */
function requireSubscriptionTransition(
  subscription: WebhookSubscription,
  to: SubscriptionStatus,
): void {
  const verdict = inspectSubscriptionTransition(subscription.status, to);
  if (verdict.allowed) return;
  if (verdict.refusal === "terminal_status" || subscription.status === "revoked") {
    throw new SubscriptionRevokedError(subscription.id);
  }
  throw new InvalidSubscriptionProgressionError(subscription.id, subscription.status, to);
}

// --- Creation --------------------------------------------------------------------

/**
 * Subscribe a consumer to a set of events, delivered through an endpoint they already hold.
 *
 * The delivery mode defaults rather than being required, and it defaults to retrying. A consumer who has not
 * thought about the question is far better served by a webhook that arrives late than by one that silently never
 * arrives, and the consumers who genuinely want at-most-once — the ones whose handler is not idempotent and who
 * would rather miss an event than process it twice — are the ones who know to ask for it.
 */
export function createWebhookSubscription(
  params: CreateWebhookSubscriptionParams,
): WebhookSubscription {
  const subscriptionKey = requireKey("subscription", params.subscriptionKey);
  const eventTypes = requireEventTypes(subscriptionKey, params.eventTypes);
  const secretRef = requireSecretRef(params.secretRef);

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    consumerId: params.consumerId,
    subscriptionKey,
    displayName: params.displayName.trim(),
    endpointId: params.endpointId,
    eventTypes,
    deliveryMode: params.deliveryMode ?? DEFAULT_DELIVERY_MODE,
    secretRef,
    status: "active",
    consecutiveFailures: 0,
    lastDeliveryAt: null,
    lastSuccessAt: null,
    pausedAt: null,
    suspendedAt: null,
    suspendedReason: null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Refuse a subscription key already in use by the same consumer.
 *
 * Scoped to the consumer rather than the tenant, because the key is how *they* refer to their own subscription
 * and two consumers both calling theirs `enrolments` are not in conflict with each other. A tenant-wide
 * uniqueness rule would make one integrator's naming choices constrain another's.
 */
export function requireUnusedSubscriptionKey(
  existing: readonly WebhookSubscription[],
  consumerId: Uuid,
  subscriptionKey: string,
): void {
  const key = normalizeKey(subscriptionKey);
  const clash = existing.some(
    (subscription) =>
      subscription.consumerId === consumerId && subscription.subscriptionKey === key,
  );
  if (clash) throw new DuplicateSubscriptionKeyError(key);
}

/** Change the label a consumer sees. The key is what deliveries are attributed to and does not move. */
export function renameWebhookSubscription(
  subscription: WebhookSubscription,
  displayName: string,
): WebhookSubscription {
  requireNotRevoked(subscription);
  return { ...subscription, displayName: displayName.trim(), updatedAt: nowIso() };
}

/**
 * Replace the set of events subscribed to.
 *
 * A replacement rather than an add and a remove, because the set is the subscription's whole meaning and a
 * consumer reasoning about *what am I subscribed to* should be able to state the answer rather than reconstruct
 * it from a history of amendments. Deliveries already scheduled are unaffected: they were selected against the
 * set that was in force when the event happened, which is the set the consumer had asked for at the time.
 */
export function resubscribeWebhookSubscription(
  subscription: WebhookSubscription,
  eventTypes: readonly string[],
): WebhookSubscription {
  requireNotRevoked(subscription);
  return {
    ...subscription,
    eventTypes: requireEventTypes(subscription.subscriptionKey, eventTypes),
    updatedAt: nowIso(),
  };
}

/** Send this subscription's deliveries through a different endpoint, without disturbing the filter. */
export function rebindSubscriptionEndpoint(
  subscription: WebhookSubscription,
  endpointId: Uuid,
): WebhookSubscription {
  requireNotRevoked(subscription);
  return { ...subscription, endpointId, updatedAt: nowIso() };
}

/**
 * Point the subscription at a different signing secret, or at none.
 *
 * The aggregate learns that the handle changed and never what it resolves to. A rotation here is expected to
 * overlap on the consumer's side — they verify against both secrets for a window — and that overlap is managed
 * in the secret store, which is the one place that can hold two values without either of them being in a row
 * somebody can select.
 */
export function rotateSubscriptionSecret(
  subscription: WebhookSubscription,
  secretRef: string | null,
): WebhookSubscription {
  requireNotRevoked(subscription);
  return { ...subscription, secretRef: requireSecretRef(secretRef), updatedAt: nowIso() };
}

// --- Lifecycle -------------------------------------------------------------------

/** Stop sending at the consumer's own request. Their choice, cleared by them, and no reason is asked for. */
export function pauseWebhookSubscription(subscription: WebhookSubscription): WebhookSubscription {
  requireSubscriptionTransition(subscription, "paused");
  const now = nowIso();
  return { ...subscription, status: "paused", pausedAt: now, updatedAt: now };
}

/**
 * Stop sending because the receiver has been refusing everything.
 *
 * The reason is required, and unlike a pause this one is written by the platform rather than by a person — the
 * caller passes what the sweep concluded. A consumer discovering that their subscription stopped needs to be
 * told which of the two absences they are in and what the platform saw, because the alternative is a support
 * conversation that begins with them asserting their endpoint is fine.
 */
export function suspendWebhookSubscription(
  subscription: WebhookSubscription,
  reason: string,
): WebhookSubscription {
  requireSubscriptionTransition(subscription, "suspended");
  const trimmed = reason.trim();
  if (trimmed.length === 0) throw new EmptyGatewayKeyError("suspension reason");
  const now = nowIso();
  return {
    ...subscription,
    status: "suspended",
    suspendedAt: now,
    suspendedReason: trimmed,
    updatedAt: now,
  };
}

/**
 * Start sending again, from a pause or a suspension alike.
 *
 * The failure run resets, on the same argument that resets an endpoint's circuit on activation: whoever resumed
 * this is asserting that the receiver is ready, and a count carried over from before the fix would suspend the
 * subscription again on the strength of deliveries that failed for a reason that no longer exists.
 */
export function resumeWebhookSubscription(subscription: WebhookSubscription): WebhookSubscription {
  requireSubscriptionTransition(subscription, "active");
  const now = nowIso();
  return {
    ...subscription,
    status: "active",
    consecutiveFailures: 0,
    pausedAt: null,
    suspendedAt: null,
    suspendedReason: null,
    updatedAt: now,
  };
}

/** End the subscription. Terminal, from any status, and the record stays readable for the deliveries it owns. */
export function revokeWebhookSubscription(subscription: WebhookSubscription): WebhookSubscription {
  requireSubscriptionTransition(subscription, "revoked");
  const now = nowIso();
  return { ...subscription, status: "revoked", revokedAt: now, updatedAt: now };
}

// --- Observation -----------------------------------------------------------------

/**
 * Record how one delivery attempt ended, without deciding anything about whether to keep sending.
 *
 * `lastDeliveryAt` moves on either outcome and `lastSuccessAt` only on a success, and holding both is what lets
 * an operator tell a subscription nobody has sent to in a week from one that has been failing every five minutes
 * all week. A single stamp would make those two look identical at exactly the moment they need telling apart.
 */
export function recordSubscriptionOutcome(
  subscription: WebhookSubscription,
  outcome: SubscriptionOutcome,
  at: ISODateString,
): WebhookSubscription {
  requireNotRevoked(subscription);
  const succeeded = outcome === "succeeded";
  return {
    ...subscription,
    consecutiveFailures: succeeded ? 0 : subscription.consecutiveFailures + 1,
    lastDeliveryAt: at,
    lastSuccessAt: succeeded ? at : subscription.lastSuccessAt,
    updatedAt: nowIso(),
  };
}

// --- Reading ---------------------------------------------------------------------

/** Whether the fabric will send anything for this subscription. Only one status is sent to. */
export const isWebhookSubscriptionSending = (subscription: WebhookSubscription): boolean =>
  isSubscriptionSending(subscription.status);

/**
 * Whether this subscription asked for an event of the given type.
 *
 * An exact match against a normalised key, with no wildcards. A subscription to `student.*` reads as a
 * convenience until the day a new `student.medical_note.created` event is added and every consumer who wrote
 * that pattern years ago begins receiving records nobody decided to send them. Widening a subscription should be
 * something a consumer does, on a date that appears in the record.
 */
export const isSubscriptionInterestedIn = (
  subscription: WebhookSubscription,
  eventType: string,
): boolean => subscription.eventTypes.includes(normalizeKey(eventType));

/**
 * Refuse a send to a subscription that is not being sent to, naming the status.
 *
 * The key rather than the id, because this refusal is read by whoever is working out why a consumer stopped
 * receiving events, and an identifier they have to look up first is one more query between them and the answer.
 */
export function requireSendingSubscription(subscription: WebhookSubscription): void {
  if (!isWebhookSubscriptionSending(subscription)) {
    throw new SubscriptionNotSendingError(subscription.subscriptionKey, subscription.status);
  }
}

/**
 * The subscription as its owning consumer sees it.
 *
 * The secret handle does not cross. A consumer knows their own signing secret — they were given it — and the
 * name of the vault entry the institution keeps it under is the institution's operational detail, of no use to
 * them and of considerable use to anybody who should not have it.
 */
export const toSubscriptionView = (subscription: WebhookSubscription): SubscriptionView =>
  Object.freeze({
    subscriptionId: subscription.id,
    subscriptionKey: subscription.subscriptionKey,
    eventTypes: subscription.eventTypes,
    deliveryMode: subscription.deliveryMode,
    status: subscription.status,
    consecutiveFailures: subscription.consecutiveFailures,
  });
