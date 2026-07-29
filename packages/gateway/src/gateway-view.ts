import type { ISODateString, Uuid } from "@knowget/types";
import type {
  AuthScheme,
  CircuitPosture,
  ContractStatus,
  ContractStyle,
  DeliveryMode,
  EndpointStatus,
  EnforcementDecision,
  EnforcementReason,
  HttpMethod,
  IntegrationProtocol,
  PolicyScope,
  QuotaWindow,
  RouteStatus,
} from "./gateway-value";

/**
 * The shapes the gateway's engines take in and hand back, and the projections this package will let out of
 * itself.
 *
 * Every type here is a plain record with no behaviour and no identity. That is what makes the engines testable
 * without a database, a clock or a network, and it is also what makes the contract's rule enforceable: if a
 * request type has no field for an internal target, no engine can accidentally decide on one, and if a verdict
 * type has no field for one, no caller can accidentally return one to the outside.
 *
 * Two properties hold across the whole module and are worth stating once rather than at every declaration.
 *
 * **Every request that depends on when it is carries `asOf` explicitly.** Not one type here has a default, and
 * not one engine reads a clock. A serving decision, a quota verdict and a circuit posture are all functions of
 * their inputs alone, which means the answer the platform gave a consumer three months ago can be reproduced
 * exactly from the record — and a support conversation about a throttled integration is a matter of reading
 * rather than of reconstruction.
 *
 * **Nothing here carries a payload, a header, a body or a secret.** The gateway decides *about* requests; it
 * does not need their contents to do so, and a verdict type with a body field would be an invitation to log
 * one. The single exception is {@link IdempotencyProbe.payloadFingerprint}, which is a digest computed by the
 * caller precisely so that the payload itself never has to arrive here.
 */

// --- Status progression ----------------------------------------------------------

/**
 * Why a status change was refused.
 *
 * Three refusals rather than one because they have three different remedies. `same_status` is a resubmitted
 * form and nothing is wrong. `terminal_status` says the record has finished and no remedy exists. Only
 * `not_permitted` means the caller asked for something the lifecycle genuinely disallows.
 */
export type TransitionRefusal = "same_status" | "terminal_status" | "not_permitted";

/**
 * Whether a status change is permitted.
 *
 * One shape serves all five progressions here — consumers, contracts, routes, endpoints and subscriptions —
 * because they differ in which moves they allow and not at all in how a refusal is shaped. Five identical
 * verdict types would be five places to forget the same fix.
 */
export interface TransitionVerdict {
  readonly allowed: boolean;
  readonly refusal: TransitionRefusal | null;
}

// --- Routing ---------------------------------------------------------------------

/**
 * A published route as the outside world is permitted to see it.
 *
 * This is the projection the contract's rule reduces to in practice, and the important thing about it is what
 * it lacks: there is no internal target, no module name, no handler, no upstream host. The route aggregate
 * holds all of that because the composition root needs it to dispatch; nothing that crosses this boundary does.
 * A consumer holding a {@link PublicRouteView} knows the capability, the version, the method and the external
 * path, which is everything required to call it and nothing at all about what answers.
 */
export interface PublicRouteView {
  readonly capabilityKey: string;
  readonly contractVersion: string;
  readonly method: HttpMethod;
  /** The externally published path template, e.g. `/v2/admissions/applications/{applicationId}`. */
  readonly externalPath: string;
  readonly status: RouteStatus;
  /** The permission scope a caller must hold. Published because an integrator has to request it. */
  readonly requiredScope: string;
  readonly style: ContractStyle;
  /** Whether repeat calls are protected by the idempotency ledger. */
  readonly idempotent: boolean;
}

/**
 * One route the resolver is allowed to consider, paired with the identifier that finds it again.
 *
 * The engine is handed candidates rather than a repository, which is what keeps it pure, and it is handed
 * *public views* rather than route records, which is what keeps it honest. A resolver that held the full route
 * could return the internal target by accident; this one has never seen it.
 */
export interface RouteCandidate {
  readonly routeId: Uuid;
  readonly view: PublicRouteView;
}

/** What the routing engine is asked to resolve: an inbound call, described in external terms only. */
export interface RouteResolutionRequest {
  readonly capabilityKey: string;
  readonly contractVersion: string;
  readonly method: HttpMethod;
}

/** Why the routing engine could not resolve a call. */
export type RouteRefusal = "unknown_capability" | "unknown_version" | "method_not_published";

/**
 * What the routing engine concluded.
 *
 * `route` is the *identifier* of the matched route rather than the route itself, and that indirection is the
 * enforcement point for the whole contract. A caller that wants to dispatch looks the route up inside the
 * platform, where the internal target lives; a caller that wants to answer the consumer has an id and a public
 * view and could not leak a target if it tried.
 */
export interface RouteResolution {
  readonly resolved: boolean;
  readonly routeId: Uuid | null;
  readonly view: PublicRouteView | null;
  readonly refusal: RouteRefusal | null;
}

/**
 * What is wrong with an external path template, in the terms the person who typed it can act on.
 *
 * Separate members for a malformed literal segment and a malformed parameter because the two mistakes look
 * nothing alike to the author: one is a stray capital or a space in a path, the other is a brace they forgot to
 * close. A single `malformed` would make the operator re-read the whole template to find out which they made.
 */
export type PathIssue =
  | "not_absolute"
  | "too_long"
  | "trailing_slash"
  | "empty_segment"
  | "malformed_segment"
  | "malformed_parameter"
  | "duplicate_parameter";

/**
 * Whether an external path may be published, and what it binds.
 *
 * `parameters` travels on the verdict because extracting them is the same walk as validating them, and a caller
 * that had to parse the template a second time to learn its parameters would be a caller with a second, subtly
 * different idea of what the template says.
 */
export interface PathVerdict {
  readonly valid: boolean;
  readonly issue: PathIssue | null;
  /** The parameter names the template binds, in the order they appear. Empty for a fully literal path. */
  readonly parameters: readonly string[];
}

// --- Version negotiation ---------------------------------------------------------

/** One version a capability is offered in, as the negotiation engine sees it. */
export interface OfferedVersion {
  readonly contractVersion: string;
  readonly status: ContractStatus;
  /** When notice was given, or `null` when none has been. */
  readonly deprecatedAt: ISODateString | null;
  /** When it stops answering, or `null` when no date has been set. */
  readonly sunsetAt: ISODateString | null;
}

/** What a caller asked for: a specific version, or nothing at all. */
export interface VersionRequest {
  readonly capabilityKey: string;
  /** The version the caller named. `null` means they named none and will take the default. */
  readonly requested: string | null;
  readonly offered: readonly OfferedVersion[];
  readonly asOf: ISODateString;
}

/** Why negotiation failed to seat a caller on a version. */
export type NegotiationRefusal = "no_versions_offered" | "unknown_version" | "version_not_servable";

/**
 * The version a caller will be served on, and what they should be told about it.
 *
 * `deprecated` and `sunsetAt` together are the notice a served-but-deprecated caller gets: that they are on a
 * version that is going away, and the date it goes. Both are part of the verdict rather than something the
 * transport works out afterwards, because a deprecation announced by whichever adapter remembered to announce
 * it is a deprecation half the consumers never hear about.
 *
 * `sunsetAt` is populated only when `deprecated` is true. A version that is merely published has no end date to
 * report, and carrying one anyway — a date read off a row that has not been announced yet — would let a
 * transport render a countdown for a version nobody has been told anything about.
 */
export interface VersionVerdict {
  readonly seated: boolean;
  readonly servedVersion: string | null;
  /** True when the seated version is on notice: served now, with a date attached. */
  readonly deprecated: boolean;
  readonly sunsetAt: ISODateString | null;
  readonly refusal: NegotiationRefusal | null;
}

// --- Contract lifecycle ----------------------------------------------------------

/** A contract's serving state as of an instant the caller names. */
export interface ServingRequest {
  readonly status: ContractStatus;
  readonly deprecatedAt: ISODateString | null;
  readonly sunsetAt: ISODateString | null;
  readonly asOf: ISODateString;
}

/**
 * Whether a contract answers right now, and on what terms.
 *
 * `daysUntilSunset` is `null` rather than a large number when no sunset is set, because "no date" and "a long
 * time" are different facts and an integrator planning work needs to tell them apart.
 */
export interface ServingVerdict {
  readonly served: boolean;
  readonly deprecated: boolean;
  /** Whole days remaining until the announced sunset, floored, or `null` when none is announced. */
  readonly daysUntilSunset: number | null;
  readonly reason: EnforcementReason;
}

/** A proposed deprecation, checked before it is announced. */
export interface DeprecationRequest {
  readonly status: ContractStatus;
  readonly announcedAt: ISODateString;
  readonly sunsetAt: ISODateString;
}

/** Why a proposed deprecation was refused. */
export type DeprecationRefusal =
  "contract_not_published" | "sunset_before_announcement" | "notice_too_short";

/** Whether a deprecation may be announced on the terms proposed, and how much notice it actually gives. */
export interface DeprecationVerdict {
  readonly allowed: boolean;
  readonly noticeDays: number;
  readonly refusal: DeprecationRefusal | null;
}

// --- Traffic policy --------------------------------------------------------------

/** The limits a traffic policy sets. Every field is optional; an unset limit is not enforced. */
export interface PolicyLimits {
  /** Requests permitted per rolling second-scale window, enforced by the shared rate limiter. */
  readonly requestsPerWindow: number | null;
  readonly window: QuotaWindow | null;
  /** The hard ceiling over the same window, beyond which the consumer is denied rather than throttled. */
  readonly burstAllowance: number | null;
  /** Maximum accepted request body size, in bytes. */
  readonly maxPayloadBytes: number | null;
  /** How long the platform will spend on one call before giving up, in milliseconds. */
  readonly timeoutMs: number | null;
}

/** A policy competing to apply to a request, reduced to what resolution needs. */
export interface PolicyCandidate {
  readonly policyId: Uuid;
  readonly scope: PolicyScope;
  readonly consumerId: Uuid | null;
  readonly capabilityKey: string | null;
  readonly limits: PolicyLimits;
  readonly active: boolean;
}

/** The request whose applicable policy is being resolved. */
export interface PolicySelector {
  readonly consumerId: Uuid;
  readonly capabilityKey: string;
}

/**
 * The policy that actually applies, and the ones it beat.
 *
 * `supersededBy` records the losing candidates rather than discarding them, because "why am I limited to a
 * hundred a minute" is the single most common question a gateway is asked, and an answer that can name the four
 * policies considered and the one that won is the difference between a two-minute reply and an afternoon.
 */
export interface EffectivePolicy {
  readonly policyId: Uuid | null;
  readonly scope: PolicyScope | null;
  readonly limits: PolicyLimits;
  readonly consideredCount: number;
  readonly supersededPolicyIds: readonly Uuid[];
}

// --- Quota -----------------------------------------------------------------------

/** A consumption check against a window the caller describes in full. */
export interface QuotaRequest {
  /** Units already consumed in the current window. */
  readonly consumed: number;
  /** Units this request would consume. Usually one; larger for batch capabilities. */
  readonly cost: number;
  readonly limit: number | null;
  readonly burstAllowance: number | null;
  readonly window: QuotaWindow | null;
  readonly windowStartedAt: ISODateString;
  readonly asOf: ISODateString;
}

/**
 * What the quota ledger concluded.
 *
 * `retryAfterSeconds` is present on every non-allow verdict and is computed from the window rather than
 * guessed, so a throttled consumer is told exactly when the window turns over. A gateway that throttles without
 * saying when has converted a well-behaved client into a polling one.
 *
 * The three window-shaped fields are nullable together and mean one thing between them: no rate limit applies,
 * so nothing is being counted. `null` rather than a sentinel, because both available sentinels lie — a
 * `remaining` of zero reads as exhausted on the one header integrators actually watch, and a very large number
 * reads as a limit nobody set. A transport renders these headers when they are populated and omits them
 * otherwise, which is what an unmetered consumer should see.
 */
export interface QuotaVerdict {
  readonly decision: EnforcementDecision;
  readonly reason: EnforcementReason;
  /**
   * Units left against the *sustained* limit after this request, floored at zero. `null` when unmetered.
   *
   * Counted against the sustained figure rather than the burst ceiling on purpose: a consumer drawing on its
   * burst allowance sees zero remaining while still being served, which is exactly the signal a well-behaved
   * client needs to ease off before the ceiling actually refuses it.
   */
  readonly remaining: number | null;
  /** When the window this request falls in turns over. `null` when unmetered. */
  readonly windowResetsAt: ISODateString | null;
  /**
   * The aligned start of the window this request falls in. `null` when unmetered.
   *
   * Differs from the request's `windowStartedAt` exactly when the recorded window has elapsed. A ledger rolling
   * a stale row writes this rather than the current instant, so windows keep their phase instead of drifting
   * forward every time a consumer goes quiet.
   */
  readonly currentWindowStartedAt: ISODateString | null;
  readonly retryAfterSeconds: number | null;
  /** True when the window described has already elapsed, so `consumed` refers to a window that is over. */
  readonly windowExpired: boolean;
}

// --- Admission -------------------------------------------------------------------

/** Everything the admission engine needs to decide one inbound call, and nothing it does not. */
export interface AdmissionRequest {
  readonly consumerActive: boolean;
  /** Scopes the consumer holds, as granted at registration. */
  readonly grantedScopes: readonly string[];
  readonly routeStatus: RouteStatus;
  readonly requiredScope: string;
  readonly serving: ServingVerdict;
  readonly quota: QuotaVerdict;
  /** Declared body size in bytes, or `null` when the call carries no body. */
  readonly payloadBytes: number | null;
  readonly limits: PolicyLimits;
}

/**
 * The gateway's decision on one call, with the reason that produced it.
 *
 * The checks run in a fixed order — who you are, whether you may, whether the thing is served, how big it is,
 * how fast you are going — and the first failure wins. Ordering it that way means a suspended consumer is told
 * they are suspended rather than that they are over quota, which is the difference between a remedy they can
 * act on and one that will not help.
 */
export interface AdmissionVerdict {
  readonly decision: EnforcementDecision;
  readonly reason: EnforcementReason;
  readonly deprecated: boolean;
  readonly retryAfterSeconds: number | null;
}

// --- Circuit ---------------------------------------------------------------------

/** A window of observed outcomes for one outbound endpoint. */
export interface OutcomeWindow {
  readonly successes: number;
  readonly failures: number;
  /** Consecutive failures at the end of the window — the signal a rate alone cannot carry. */
  readonly consecutiveFailures: number;
  readonly posture: CircuitPosture;
  /** When the posture last changed, so a half-open probe can be scheduled without a clock. */
  readonly postureSince: ISODateString;
  readonly asOf: ISODateString;
}

/** What the circuit engine concluded about an endpoint, and what the operator should be told. */
export interface CircuitVerdict {
  readonly posture: CircuitPosture;
  readonly health: "unknown" | "healthy" | "degraded" | "unreachable";
  readonly changed: boolean;
  /** True when enough time has passed in `open` for one probe to be worth making. */
  readonly probeDue: boolean;
  readonly observed: number;
  /** Failures as a fraction of observations, or `null` when nothing was observed. */
  readonly failureRatio: number | null;
}

// --- Backoff ---------------------------------------------------------------------

/** A delivery awaiting its next attempt. */
export interface BackoffRequest {
  /** The delivery's own identifier — the sole source of the jitter applied. Never a random source. */
  readonly deliveryId: Uuid;
  /** Attempts already made. Zero for a delivery that has not been tried. */
  readonly attempt: number;
  readonly lastAttemptedAt: ISODateString;
}

/** When a delivery should next be tried, or that it should not be. */
export interface BackoffPlan {
  readonly attempt: number;
  readonly exhausted: boolean;
  readonly delaySeconds: number;
  /** The instant the next attempt becomes due, derived from `lastAttemptedAt` and the delay. */
  readonly nextAttemptAt: ISODateString | null;
  readonly attemptsRemaining: number;
}

// --- Idempotency -----------------------------------------------------------------

/** A caller's idempotency key, presented with a digest of the request it belongs to. */
export interface IdempotencyProbe {
  readonly idempotencyKey: string;
  /** A digest the caller computed. The payload itself never reaches this package. */
  readonly payloadFingerprint: string;
  readonly asOf: ISODateString;
}

/** What the idempotency ledger says about a key. */
export type IdempotencyDisposition = "proceed" | "replay" | "in_flight" | "conflict";

/** The ledger's answer, and why. */
export interface IdempotencyVerdict {
  readonly disposition: IdempotencyDisposition;
  /** The recorded outcome to replay, when there is one. */
  readonly recordedStatus: number | null;
  readonly recordedAt: ISODateString | null;
  /** True when a record existed but had aged past its retention and was treated as absent. */
  readonly expired: boolean;
}

// --- Consumer projection ---------------------------------------------------------

/**
 * A registered consumer as an operator sees it.
 *
 * `credentialRef` is present and the secret is not, which is the whole shape of this contract's position on
 * credentials: the handle is operational information an administrator needs in order to rotate the thing it
 * points at, and the material behind it is resolved at the composition root and never held here.
 */
export interface ConsumerView {
  readonly consumerId: Uuid;
  readonly consumerKey: string;
  readonly displayName: string;
  readonly authScheme: AuthScheme;
  readonly credentialRef: string;
  readonly grantedScopes: readonly string[];
  readonly status: string;
}

// --- Endpoint projection ---------------------------------------------------------

/**
 * A registered outbound endpoint as an operator sees it, with the adapter it is served through.
 *
 * `status` and `health` are both present and neither can be derived from the other, which is the reason a view
 * this small carries two fields that both sound like they answer *is it working*. Health is what was observed;
 * status is what was decided. A disabled endpoint keeps whatever health it last earned — nothing has been sent
 * to it since, and the last thing that was sent may well have succeeded — so an operator reading health alone
 * would see `healthy` beside an endpoint that has not been called in a fortnight. A quarantined one drifts the
 * other way, to `unknown`, once the outcome window empties. The question an operator actually opens this list to
 * ask is whether calls are going out, and only `status` answers it.
 */
export interface EndpointView {
  readonly endpointId: Uuid;
  readonly endpointKey: string;
  readonly displayName: string;
  readonly protocol: IntegrationProtocol;
  /** The adapter implementation this endpoint is bound to. The vendor sits behind it, never in front. */
  readonly adapterKey: string;
  readonly status: EndpointStatus;
  readonly health: EndpointHealthSummary;
}

/** An endpoint's observed standing, summarised for display. */
export interface EndpointHealthSummary {
  readonly health: "unknown" | "healthy" | "degraded" | "unreachable";
  readonly posture: CircuitPosture;
  readonly consecutiveFailures: number;
  readonly lastOutcomeAt: ISODateString | null;
}

// --- Subscription projection -----------------------------------------------------

/** A webhook subscription as its owning consumer sees it. */
export interface SubscriptionView {
  readonly subscriptionId: Uuid;
  readonly subscriptionKey: string;
  readonly eventTypes: readonly string[];
  readonly deliveryMode: DeliveryMode;
  readonly status: SubscriptionStatusName;
  readonly consecutiveFailures: number;
}

/** The subscription status as a plain name, for projections that do not import the union. */
export type SubscriptionStatusName = "active" | "paused" | "suspended" | "revoked";

// --- Delivery projection ---------------------------------------------------------

/**
 * One outbound delivery as an operator working a dead-letter queue sees it.
 *
 * `lastError` crosses and the payload does not, which is the division this projection is built around. A person
 * triaging a queue of failed webhooks needs to know what the receiver said — a 401 and a 502 are different jobs
 * for different people — and does not need the institution's student records rendered into a support screen on
 * the way to finding out. The digest is carried instead, which is enough to tell two deliveries of the same
 * event apart and useless for anything else.
 */
export interface DeliveryView {
  readonly deliveryId: Uuid;
  readonly subscriptionId: Uuid;
  readonly eventType: string;
  readonly outcome: DeliveryOutcomeName;
  readonly attempts: number;
  readonly attemptsRemaining: number;
  readonly nextAttemptAt: ISODateString | null;
  readonly lastAttemptedAt: ISODateString | null;
  /** What the receiver answered with, where it answered at all. Null for a transport failure. */
  readonly lastStatusCode: number | null;
  readonly lastError: string | null;
  /** True only for a dead-lettered delivery. An abandoned one is retained and must never be re-sent. */
  readonly replayable: boolean;
}

/** The delivery outcome as a plain name, for projections that do not import the union. */
export type DeliveryOutcomeName =
  "pending" | "delivered" | "failed" | "dead_lettered" | "abandoned";
