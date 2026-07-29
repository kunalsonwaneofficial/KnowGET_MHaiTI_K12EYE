/**
 * Value objects for the API Gateway & Integration Fabric (P3-D01). These are the vocabulary of the platform's
 * entire external surface — who is allowed to call it, what shape they were promised, how long that promise
 * lasts, how much of it they may consume, and which outside systems the platform itself reaches. They are TEXT
 * in the store and closed unions here, for the reason every other contract freezes its grammar and leaves its
 * catalog open: the *kinds* of external relationship a platform can have are few and stable, while the set of
 * capabilities, consumers and outside systems is unbounded and will grow for as long as the platform is used.
 *
 * The contract's rule is *expose capabilities, never implementation*, and three things in this module are the
 * rule rather than a description of it:
 *
 * **There is no member anywhere that names an internal thing.** No status says `proxying`, no protocol says
 * `nest`, no scope kind says `module` or `service`. An integrator reading every union in this file learns what
 * the platform offers and nothing whatsoever about how it is built — which is the property the rule asks for,
 * and the only place it can be established is the vocabulary, because a term that leaked an implementation
 * would leak it through every event, error and document downstream of here.
 *
 * **A credential is a reference and the type system says so.** {@link isCredentialReference} accepts
 * `vault:`, `kms:`, `env:` and `secretstore:` prefixed handles and refuses everything else, including anything
 * carrying whitespace or a `://` authority. A gateway is the one component in a platform that is handed other
 * people's secrets as a matter of routine, and the failure is never a considered decision to store one — it is
 * a field typed `string` that a caller filled in with the actual key because nothing stopped them. This
 * predicate is what stops them, at the aggregate boundary, before the value reaches a row.
 *
 * **Nothing here reads a clock or a random source.** {@link QuotaWindow} names window *sizes*, not moments;
 * {@link BACKOFF_BASE_SECONDS} names a schedule, not a wake-up time. Every function in this package that needs
 * to know when it is takes that as a parameter — which is what makes a serving decision, a quota verdict and a
 * retry schedule all reproducible months later from the record alone, rather than from the record plus a
 * reconstruction of what the clock said.
 */

// --- Keys ------------------------------------------------------------------------

/**
 * The maximum length of a key in this package — a capability key, a consumer key, a contract version, an
 * endpoint key, a subscription key, an idempotency key.
 *
 * Generous rather than tight, because a capability key is a namespaced identifier an integrator writes into
 * their own source (`admissions.application.submit`) and truncating one silently would be far worse than
 * refusing a long one loudly.
 */
export const MAX_KEY_LENGTH = 128;

/** The maximum length of an idempotency key as presented by a caller. Longer keys are refused, not hashed. */
export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

/**
 * The shape every key in this package must take: lowercase alphanumerics in dot-, dash- or underscore-separated
 * segments.
 *
 * Uppercase is excluded rather than folded. A gateway that accepted `Admissions.Submit` and `admissions.submit`
 * as the same capability would be a gateway where two integrators can hold different beliefs about the name of
 * the thing they are both calling, and the first time that matters is when one of them files a support ticket
 * quoting a key that does not appear in any log.
 */
const KEY_PATTERN = /^[a-z0-9]+([._-][a-z0-9]+)*$/;

/** Trim and lowercase a key so that comparison, storage and display all agree on one form. */
export const normalizeKey = (value: string): string => value.trim().toLowerCase();

/** Whether a normalized key is well-formed and within length. */
export const isValidKey = (value: string): boolean =>
  value.length > 0 && value.length <= MAX_KEY_LENGTH && KEY_PATTERN.test(value);

// --- Credentials -----------------------------------------------------------------

/**
 * The secret providers this platform will hold a handle for.
 *
 * Closed, and short on purpose. Each member is a place a secret can live that is *not here*, and the list is
 * the complete set of answers to "where is it, then" — so a reviewer can establish that no fifth answer exists
 * by reading four words rather than by auditing a schema.
 */
export const CREDENTIAL_PROVIDERS = Object.freeze(["vault", "kms", "env", "secretstore"] as const);

export type CredentialProvider = (typeof CREDENTIAL_PROVIDERS)[number];

/**
 * Whether a value is a credential *reference* rather than a credential.
 *
 * The three refusals matter more than the acceptance. A value with no recognised provider prefix is refused
 * because it is indistinguishable from the secret itself. A value containing whitespace is refused because
 * pasted keys and PEM blocks contain whitespace and nothing legitimate here does. A value containing `://` is
 * refused because that is a URL, and a URL in a credential field is either a secret in a query string or an
 * endpoint in the wrong column — and both are worth failing a registration over.
 *
 * What this cannot do is prove that the handle points at something. That is the resolver's job at the
 * composition root, where a secret actually gets fetched. What it can do is make it impossible to arrive at
 * that resolver holding a value that never needed resolving, which is the failure that ends up in a database
 * backup.
 */
export const isCredentialReference = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_KEY_LENGTH) return false;
  if (/\s/.test(trimmed) || trimmed.includes("://")) return false;
  const separator = trimmed.indexOf(":");
  if (separator <= 0 || separator === trimmed.length - 1) return false;
  const provider = trimmed.slice(0, separator);
  return (CREDENTIAL_PROVIDERS as readonly string[]).includes(provider);
};

// --- Consumers -------------------------------------------------------------------

/**
 * How a registered caller proves who it is.
 *
 * Machine-to-machine only, and the omission is the point: there is no `password`, no `session`, no
 * `authorization_code`. A human signing in is P3-D03's subject and reaches the platform through identity
 * federation; a *system* calling on behalf of an institution is this contract's subject and reaches it through
 * one of these four. Blurring the two would put an interactive login flow behind a machine credential, which is
 * how service accounts end up with people's passwords in them.
 *
 * This package records which scheme a consumer uses and a handle for its material. It never validates a token,
 * mints one, or holds a key — token issuance and verification belong to the identity contracts, and a gateway
 * that grew its own would be the platform's second opinion about who somebody is.
 */
export const AUTH_SCHEMES = Object.freeze([
  "api_key",
  "oauth2_client_credentials",
  "mutual_tls",
  "signed_jwt",
] as const);

export type AuthScheme = (typeof AUTH_SCHEMES)[number];

/**
 * Where a registered external caller stands.
 *
 * `registered` is not a formality. A consumer exists as a record — reviewable, attributable, with an owner and
 * a stated purpose — before it can call anything, because the alternative is that the first evidence of an
 * integration's existence is traffic. `suspended` is reversible and `retired` is not, and the asymmetry is
 * deliberate: suspension is an operational response to something happening now, retirement is a statement that
 * this integration is over, and an integration that can come back from retirement is one nobody ever finishes
 * decommissioning.
 */
export const CONSUMER_STATUSES = Object.freeze([
  "registered",
  "active",
  "suspended",
  "retired",
] as const);

export type ConsumerStatus = (typeof CONSUMER_STATUSES)[number];

/** The status every consumer starts in. Registered is not admitted; admission is a separate, recorded act. */
export const INITIAL_CONSUMER_STATUS: ConsumerStatus = "registered";

/** Whether a consumer's status can never change again. */
export const isTerminalConsumerStatus = (status: ConsumerStatus): boolean => status === "retired";

/** Whether a consumer may currently be served at all, before any contract, route or policy is consulted. */
export const isConsumerServable = (status: ConsumerStatus): boolean => status === "active";

// --- Contracts -------------------------------------------------------------------

/**
 * The external contract styles the platform will publish a capability in.
 *
 * REST is the default and the other two are exceptions that have to be argued for, which is a position rather
 * than a preference: a platform whose external surface is three styles by default is a platform that has
 * committed to keeping three descriptions of the same capability true forever. `graphql` and `grpc` exist here
 * because some capabilities — a deeply nested read, a high-volume bidirectional stream — are genuinely worse
 * over REST, and a vocabulary that could not say so would push those integrations outside the gateway entirely,
 * which is the one outcome worse than a second style.
 */
export const CONTRACT_STYLES = Object.freeze(["rest", "graphql", "grpc"] as const);

export type ContractStyle = (typeof CONTRACT_STYLES)[number];

/** The style a capability is published in unless a case is made for another. */
export const DEFAULT_CONTRACT_STYLE: ContractStyle = "rest";

/**
 * Where a published capability contract stands in its life.
 *
 * The four states are the whole of what an integrator needs to plan against, and the two in the middle are why
 * the union exists. `deprecated` means *still served, and you have been told*; `sunset` means *no longer
 * served*. Platforms that collapse these into a single "old" flag give integrators no interval in which to act,
 * and so acquire a permanent inability to remove anything — every version stays up forever because no version
 * was ever visibly on the way out.
 *
 * There is no `retired` beyond `sunset` and no way back from it. A sunset contract's record stays readable
 * because integrations reference versions in code that outlives the integration, and the answer to "what
 * happened to v1" has to be findable years after v1 stopped answering.
 */
export const CONTRACT_STATUSES = Object.freeze([
  "draft",
  "published",
  "deprecated",
  "sunset",
] as const);

export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/** The status every contract starts in. Nothing is published by being written. */
export const INITIAL_CONTRACT_STATUS: ContractStatus = "draft";

/** Whether a contract's status can never change again. */
export const isTerminalContractStatus = (status: ContractStatus): boolean => status === "sunset";

/** Whether a contract is one an integrator may build against — published or on notice, but still answering. */
export const isContractServable = (status: ContractStatus): boolean =>
  status === "published" || status === "deprecated";

/**
 * The minimum number of whole days between announcing a deprecation and the sunset it announces.
 *
 * Ninety days is not a technical constant; it is the smallest interval in which an integrator with a release
 * process, a change-approval board and other work can plausibly migrate. A gateway that let an operator sunset
 * a version in a fortnight would be a gateway whose deprecation policy is decided by whoever is most annoyed by
 * the old version, and the cost lands entirely on people who cannot see the discussion.
 */
export const MIN_DEPRECATION_NOTICE_DAYS = 90;

// --- Routes ----------------------------------------------------------------------

/**
 * The request methods a capability route may be published under.
 *
 * `HEAD` and `OPTIONS` are absent because they are transport concerns the edge answers without consulting a
 * route, and `TRACE` is absent because it is a request to be told about the infrastructure, which is the one
 * question this contract exists to refuse.
 */
export const HTTP_METHODS = Object.freeze(["GET", "POST", "PUT", "PATCH", "DELETE"] as const);

export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Whether a method is expected to change state, and therefore whether idempotency protection applies. */
export const isMutatingMethod = (method: HttpMethod): boolean => method !== "GET";

/**
 * The maximum length of an external path template.
 *
 * Five hundred and twelve characters is far more than any sane path needs, and that is the point: the limit
 * exists to stop a path that is actually a mistake — a URL pasted whole, a query string, an entire document —
 * from reaching the store and the router, not to express an opinion about how deep a resource tree may go.
 */
export const MAX_EXTERNAL_PATH_LENGTH = 512;

/**
 * Where a capability route stands.
 *
 * Three states and no `deleted`. A route is how an external path became a capability, and removing the record
 * would leave every historical log line referring to a path that the platform can no longer explain. `retired`
 * is the way out and it keeps the explanation.
 */
export const ROUTE_STATUSES = Object.freeze(["draft", "active", "retired"] as const);

export type RouteStatus = (typeof ROUTE_STATUSES)[number];

/** Whether a route's status can never change again. */
export const isTerminalRouteStatus = (status: RouteStatus): boolean => status === "retired";

// --- Traffic policy --------------------------------------------------------------

/**
 * The window a quota is counted over.
 *
 * Four sizes, each a plain integer count of seconds, and no `custom`. An operator who can express a window in
 * arbitrary seconds will eventually express two overlapping ones, and the question of which applies to a given
 * request stops having an answer that can be explained to the consumer who was throttled by it.
 */
export const QUOTA_WINDOWS = Object.freeze(["minute", "hour", "day", "month"] as const);

export type QuotaWindow = (typeof QUOTA_WINDOWS)[number];

/**
 * How long each window is, in seconds.
 *
 * A month is thirty days rather than a calendar month, and the approximation is deliberate and documented
 * rather than hidden: a calendar month makes a quota's value depend on which month it is, so the same
 * integration gets ten percent more capacity in January than in February and nobody can explain why. A fixed
 * thirty-day window is worse as a description of a month and far better as a promise.
 */
export const QUOTA_WINDOW_SECONDS: Readonly<Record<QuotaWindow, number>> = Object.freeze({
  minute: 60,
  hour: 3_600,
  day: 86_400,
  month: 2_592_000,
});

/**
 * What a traffic policy is attached to, ordered from least to most specific.
 *
 * The order is load-bearing and is why this is an array rather than a union alone: policy resolution picks the
 * most specific match, and "most specific" has to be a fact about the vocabulary rather than a comparator
 * somebody wrote. A platform where two policies can both claim to be the applicable one is a platform where a
 * consumer's effective rate limit depends on row order.
 */
export const POLICY_SCOPES = Object.freeze([
  "global",
  "capability",
  "consumer",
  "consumer_capability",
] as const);

export type PolicyScope = (typeof POLICY_SCOPES)[number];

/** How specific a scope is. Higher wins; every scope has a distinct rank, so ties are impossible. */
export const policySpecificity = (scope: PolicyScope): number => POLICY_SCOPES.indexOf(scope);

/**
 * What the gateway decided to do with a request.
 *
 * `throttle` and `deny` are separate because they mean different things to the caller and imply different
 * remedies: a throttled request was well-formed and arrived too fast, and retrying later works; a denied
 * request will never be served in that form, and retrying is the wrong response. A single "rejected" outcome
 * would leave every client library retrying both.
 */
export const ENFORCEMENT_DECISIONS = Object.freeze(["allow", "throttle", "deny"] as const);

export type EnforcementDecision = (typeof ENFORCEMENT_DECISIONS)[number];

/**
 * Why the gateway decided what it decided.
 *
 * Stable codes rather than sentences, because these travel into events, error details and consumer-facing
 * headers, and each of them is something an integrator will match on in their own code. A reason phrased as
 * prose is a reason that changes when somebody improves the wording, and every integration matching it breaks
 * on a release that changed nothing.
 */
export const ENFORCEMENT_REASONS = Object.freeze([
  "within_limits",
  "consumer_not_active",
  "scope_not_granted",
  "route_not_active",
  "contract_not_servable",
  "contract_sunset",
  "version_unknown",
  "rate_limit_exceeded",
  "quota_exhausted",
  "payload_too_large",
] as const);

export type EnforcementReason = (typeof ENFORCEMENT_REASONS)[number];

// --- Outbound integration --------------------------------------------------------

/**
 * The transports the platform will reach an external system over.
 *
 * This is the fabric's half of the contract — every external vendor sits behind a replaceable adapter, and this
 * union is the set of ways an adapter can be plugged in. It names transports and never vendors: there is no
 * `stripe`, no `sendgrid`, no `sap`. A vocabulary that named a vendor would make swapping that vendor a
 * migration of the vocabulary, which is precisely the lock-in the adapter pattern is here to prevent.
 *
 * Device- and sensor-level transports are deliberately absent; they arrive with the smart-campus contract and
 * belong to it. What this list covers is the set of ways an *institutional system* is spoken to.
 */
export const INTEGRATION_PROTOCOLS = Object.freeze([
  "https",
  "graphql",
  "grpc",
  "soap",
  "sftp",
  "smtp",
  "amqp",
] as const);

export type IntegrationProtocol = (typeof INTEGRATION_PROTOCOLS)[number];

/**
 * Where a registered outbound endpoint stands.
 *
 * `quarantined` is the state that earns this union its existence. An endpoint whose circuit has been open long
 * enough stops being a transient failure and becomes a thing somebody has to look at, and a platform that only
 * had `active` and `disabled` would either keep hammering it forever or have an operator silently switch it
 * off — the first wastes the vendor's capacity and the second loses the fact that anything was ever wrong.
 */
export const ENDPOINT_STATUSES = Object.freeze([
  "registered",
  "active",
  "quarantined",
  "disabled",
  "retired",
] as const);

export type EndpointStatus = (typeof ENDPOINT_STATUSES)[number];

/** The status every endpoint starts in. */
export const INITIAL_ENDPOINT_STATUS: EndpointStatus = "registered";

/** Whether an endpoint's status can never change again. */
export const isTerminalEndpointStatus = (status: EndpointStatus): boolean => status === "retired";

/**
 * What the platform currently believes about an external system's health.
 *
 * Belief rather than fact, and named to say so. Every member is a summary of outcomes the platform has
 * observed, which is a different thing from whether the vendor is up — a `unreachable` verdict is just as often
 * a firewall change on this side. Keeping the word "health" attached to observations rather than to the vendor
 * is what stops an operator reading this field as a vendor status page.
 */
export const ENDPOINT_HEALTHS = Object.freeze([
  "unknown",
  "healthy",
  "degraded",
  "unreachable",
] as const);

export type EndpointHealth = (typeof ENDPOINT_HEALTHS)[number];

/**
 * The posture the fabric records for an endpoint's circuit.
 *
 * Named `posture` rather than `state`, and this is not decoration. `@knowget/reliability` owns the runtime
 * circuit breaker that actually short-circuits a call in flight; this field is the *registered* conclusion
 * derived from an outcome window, which is what an operator sees, what an event carries and what survives a
 * process restart. Two things that are computed differently, live in different places and answer to different
 * questions should not share a name, or the first person to see them disagree will file a bug against the wrong
 * one.
 */
export const CIRCUIT_POSTURES = Object.freeze(["closed", "open", "half_open"] as const);

export type CircuitPosture = (typeof CIRCUIT_POSTURES)[number];

/**
 * How many failures in a row settle the question of whether an endpoint is merely having a bad moment.
 *
 * A consecutive count rather than a rate, because the two catch different outages and a rate alone misses the
 * one that costs most. An endpoint that has just started refusing everything has a failure rate computed over a
 * handful of calls, which no ratio threshold with an honest minimum sample will trip until the sample has
 * accumulated — and every call made while it accumulates is a call the platform knew would fail.
 */
export const CIRCUIT_CONSECUTIVE_FAILURE_THRESHOLD = 5;

/**
 * The fewest observations a failure *rate* may be computed from.
 *
 * Three calls of which two failed is not a two-thirds failure rate; it is three calls. Without a floor, the
 * first unlucky pair of timeouts after a quiet hour opens the circuit on an endpoint that is perfectly well, and
 * the platform stops calling a vendor for the reason that almost nobody was calling the vendor.
 */
export const CIRCUIT_MIN_OBSERVATIONS = 20;

/** The share of a large enough sample that must have failed for the circuit to open. */
export const CIRCUIT_FAILURE_RATIO = 0.5;

/**
 * The share of failures at which an endpoint is reported as degraded while still being called.
 *
 * Well below the ratio that opens the circuit, and the gap between the two is the point of having both. One call
 * in ten failing is invisible to everybody except the integration it breaks, and it is exactly the condition an
 * operator can still act on — a certificate weeks from expiry, a vendor shedding load — while acting is cheap.
 */
export const CIRCUIT_DEGRADED_RATIO = 0.1;

/**
 * How long an open circuit waits before one probe is worth making.
 *
 * A minute: long enough that a restart, a failover or a deploy on the other side has plausibly finished, short
 * enough that an endpoint which recovered immediately is not left cold while deliveries pile up behind it.
 */
export const CIRCUIT_PROBE_AFTER_SECONDS = 60;

/**
 * How many probes must succeed before an open circuit is closed again.
 *
 * More than one, because a single success is precisely what a partially recovered endpoint produces — one node
 * back in the rotation and four still failing — and closing on it returns the full traffic to something that
 * will fail it again, which is how a recovering system is kept from recovering.
 */
export const CIRCUIT_HALF_OPEN_SUCCESSES = 3;

/**
 * How long an endpoint may keep failing its probes before it stops being an incident and becomes a task.
 *
 * An hour of open, probe, fail, open is not a transient anything. Past this point the retries cost the vendor
 * capacity and the platform queue depth with no prospect of success, and what the situation needs is a person: a
 * credential has expired, an address has moved, an agreement has ended. {@link ENDPOINT_STATUSES} carries
 * `quarantined` for exactly this, so that the endpoint stops being called *and* stays visible as something
 * unresolved rather than being quietly switched off by whoever got tired of the alert.
 */
export const CIRCUIT_QUARANTINE_AFTER_SECONDS = 3_600;

// --- Webhook delivery ------------------------------------------------------------

/**
 * The delivery guarantee a subscription is served under.
 *
 * Two members, and `exactly_once` is absent because it is not a property a webhook sender can offer — it
 * requires the receiver to participate, and a gateway claiming it would be making a promise on somebody else's
 * behalf. What the platform can offer is retry until acknowledged, or one attempt and no more, and the honest
 * union has exactly those two members. Selectable stronger semantics arrive with the event mesh, where both
 * ends of the channel are inside the platform's own guarantee.
 */
export const DELIVERY_MODES = Object.freeze(["at_least_once", "at_most_once"] as const);

export type DeliveryMode = (typeof DELIVERY_MODES)[number];

/** The default a subscription gets: retry until acknowledged, because a missed event is usually worse. */
export const DEFAULT_DELIVERY_MODE: DeliveryMode = "at_least_once";

/**
 * Where a subscription stands.
 *
 * `paused` is the consumer's own choice and `suspended` is the platform's, taken when an endpoint has failed
 * long enough that continuing is pointless. Keeping them apart means a consumer who returns from a maintenance
 * window can tell whether their own pause is still in effect or whether the platform stopped sending because
 * their endpoint was refusing everything — two situations with entirely different first actions.
 */
export const SUBSCRIPTION_STATUSES = Object.freeze([
  "active",
  "paused",
  "suspended",
  "revoked",
] as const);

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Whether a subscription's status can never change again. */
export const isTerminalSubscriptionStatus = (status: SubscriptionStatus): boolean =>
  status === "revoked";

/** Whether the platform should currently be sending to a subscription. */
export const isSubscriptionSending = (status: SubscriptionStatus): boolean => status === "active";

/**
 * Where one outbound delivery stands.
 *
 * `dead_lettered` and `abandoned` are both ends and they are not the same end. A dead-lettered delivery
 * exhausted its attempts and is *retained for replay* — somebody can look at it, fix the receiver and send it
 * again. An abandoned delivery was given up on deliberately, because the subscription was revoked or the event
 * is no longer worth delivering, and replaying it would be wrong. A single terminal failure state would make
 * the replay queue contain things nobody should ever replay.
 */
export const DELIVERY_OUTCOMES = Object.freeze([
  "pending",
  "delivered",
  "failed",
  "dead_lettered",
  "abandoned",
] as const);

export type DeliveryOutcome = (typeof DELIVERY_OUTCOMES)[number];

/** The outcome every delivery starts in. */
export const INITIAL_DELIVERY_OUTCOME: DeliveryOutcome = "pending";

/** Whether a delivery will never be attempted again under its current record. */
export const isTerminalDeliveryOutcome = (outcome: DeliveryOutcome): boolean =>
  outcome === "delivered" || outcome === "dead_lettered" || outcome === "abandoned";

/** Whether a delivery is eligible to be replayed — dead-lettered only, never abandoned. */
export const isReplayableOutcome = (outcome: DeliveryOutcome): boolean =>
  outcome === "dead_lettered";

/**
 * The base of the retry schedule, in seconds, indexed by attempt number.
 *
 * Written out rather than computed from a formula, because the schedule an integrator is promised should be
 * readable in one line, and because the last two steps are deliberately not a continuation of the doubling — a
 * pure exponential reaches useless intervals faster than a receiver's maintenance window ends. Six attempts
 * spanning a little over two hours is the shape that survives a deploy on the other side without holding a
 * delivery for a day.
 */
export const BACKOFF_BASE_SECONDS: readonly number[] = Object.freeze([
  30, 120, 480, 1_800, 3_600, 3_600,
]);

/** How many attempts a delivery gets before it is dead-lettered. */
export const MAX_DELIVERY_ATTEMPTS = BACKOFF_BASE_SECONDS.length;

/**
 * The fraction of a backoff interval that jitter may move it by.
 *
 * Jitter exists so that a thousand deliveries failed by one outage do not all return at the same second and
 * fail the receiver again on the way back up. It is derived from the delivery's own identity rather than from a
 * random source — see the backoff engine — so the schedule is spread across deliveries and still perfectly
 * reproducible for any one of them, which is what makes a support conversation about a late webhook possible.
 */
export const BACKOFF_JITTER_RATIO = 0.2;

// --- Idempotency -----------------------------------------------------------------

/**
 * Where an idempotency record stands.
 *
 * `conflicted` is the member that does the work. A caller who reuses a key with a *different* payload has a bug
 * — most often a retry loop that regenerates the key per attempt but not per operation, or the reverse — and
 * the only safe answer is to refuse and say so. Treating it as a replay would return the first call's result
 * for the second call's request, which is silent data loss dressed as a successful response.
 */
export const IDEMPOTENCY_STATES = Object.freeze(["in_flight", "completed", "conflicted"] as const);

export type IdempotencyState = (typeof IDEMPOTENCY_STATES)[number];

/**
 * How long an idempotency record is honoured for, in seconds.
 *
 * Twenty-four hours: long enough to cover any retry a sane client library performs, short enough that a key
 * reused a week later by a different operation is treated as new rather than answered from a stale ledger. The
 * expiry is evaluated against a caller-supplied instant, never a clock read here.
 */
export const IDEMPOTENCY_RETENTION_SECONDS = 86_400;

// --- Shared numeric guards -------------------------------------------------------

/** Whether a value is a non-negative integer — the shape every count, limit and ceiling in this package takes. */
export const isCount = (value: number): boolean => Number.isInteger(value) && value >= 0;

/** Whether a value is a positive integer — the shape every limit that would be meaningless at zero takes. */
export const isPositiveCount = (value: number): boolean => Number.isInteger(value) && value > 0;
