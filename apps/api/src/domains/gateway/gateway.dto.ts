import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const isoDate = z.string().datetime();

/**
 * A limit's magnitude, checked only for being a number.
 *
 * Positivity, integrality, the rate-pair completeness rule and the burst-above-count rule are all enforced by
 * the aggregate, which raises a named error naming the offending field. Restating any of them here would put two
 * definitions of a valid limit in the repository, and the one an operator hits would depend on which layer they
 * reached first — so this layer establishes that a number arrived and the domain decides whether it is a limit.
 */
const count = z.number().finite();

/**
 * A gateway key, checked only for presence.
 *
 * Every key in this domain — capability, contract version, scope, event type, adapter, endpoint, subscription,
 * internal target — goes through the package's own `normalizeKey` and `isValidKey` on the way into an aggregate,
 * which lowercases it, bounds its length and refuses anything outside the platform's key grammar, with a named
 * error saying which key and what was wrong with it. A second pattern here would be a second grammar to keep in
 * step, and the first time the two disagreed an integrator would be refused by a regular expression that gives
 * no reason. This checks that something was sent.
 */
const key = nonEmpty;

// --- Shared vocabularies ---------------------------------------------------------

const authScheme = z.enum(["api_key", "oauth2_client_credentials", "mutual_tls", "signed_jwt"]);
const contractStyle = z.enum(["rest", "graphql", "grpc"]);
const httpMethod = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const quotaWindow = z.enum(["minute", "hour", "day", "month"]);
const policyScope = z.enum(["global", "capability", "consumer", "consumer_capability"]);
const integrationProtocol = z.enum(["https", "graphql", "grpc", "soap", "sftp", "smtp", "amqp"]);
const deliveryMode = z.enum(["at_least_once", "at_most_once"]);

/**
 * The limits a policy sets, with every field defaulting to `null`.
 *
 * The default is what makes the domain's rule expressible over HTTP. The most specific policy wins wholesale and
 * limits are never merged, so an unset limit means *not enforced* rather than *inherit* — and a caller writing a
 * consumer-scoped rate limit has to be able to say nothing about payload size without that silence being read as
 * an omission. Requiring five explicit nulls to express one limit would make the common request the awkward one
 * and produce a field somebody eventually copies from another policy by mistake.
 *
 * A policy that sets nothing at all parses cleanly here and is then refused by the aggregate, which is the right
 * division: the shape is valid and the record is useless, and only one of those is a schema's business.
 */
const policyLimits = z.object({
  requestsPerWindow: count.nullable().default(null),
  window: quotaWindow.nullable().default(null),
  burstAllowance: count.nullable().default(null),
  maxPayloadBytes: count.nullable().default(null),
  timeoutMs: count.nullable().default(null),
});

// --- API consumers ---------------------------------------------------------------

/**
 * Admit an outside system (`gateway:admit`).
 *
 * `tenantId` and `registeredBy` are absent because both come from the authenticated principal; see `actorOf` for
 * why attribution is never read from a body in this domain. `credentialRef` is a handle to material held
 * somewhere else and the aggregate refuses anything that looks like the secret itself, so a caller who pastes a
 * key into this field is refused rather than obeyed.
 *
 * `grantedScopes` is bounded below at one, matching the aggregate: a consumer with no scopes is a credential
 * that authenticates and can reach nothing, which is a record somebody made by accident every time.
 */
export const registerApiConsumerSchema = z.object({
  organizationId: uuid,
  consumerKey: key,
  displayName: nonEmpty,
  authScheme,
  credentialRef: nonEmpty,
  grantedScopes: z.array(key).min(1),
  ownerId: uuid,
});

export const renameApiConsumerSchema = z.object({ displayName: nonEmpty });

/** Move the consumer to a different accountable person. The owner is a person, not the caller. */
export const reassignApiConsumerSchema = z.object({ ownerId: uuid });

export const rotateConsumerCredentialSchema = z.object({ credentialRef: nonEmpty });

/**
 * The scopes to add, or the scopes to take away.
 *
 * One schema serves both directions because the request bodies are the same shape and the asymmetry lives where
 * it belongs — the service resolves a grant against the platform's scope catalogue and does not resolve a
 * revocation against anything, so a scope that has since stopped existing can always be taken back.
 */
export const changeConsumerScopesSchema = z.object({ scopes: z.array(key).min(1) });

/** Suspension carries a reason because a consumer being cut off will ask, and somebody has to answer. */
export const suspendApiConsumerSchema = z.object({ reason: nonEmpty });

// --- API contracts ---------------------------------------------------------------

/**
 * Declare a version of a capability the platform offers (`gateway:publish`).
 *
 * `style` is optional and the aggregate defaults it to REST, because that is what an unqualified *the API* means
 * to an integrator. `specificationRef` is a pointer to the specification document rather than the document, so
 * the contract record stays a record and the schema stays a schema.
 */
export const defineApiContractSchema = z.object({
  organizationId: uuid,
  capabilityKey: key,
  contractVersion: key,
  title: nonEmpty,
  summary: nonEmpty,
  style: contractStyle.optional(),
  specificationRef: nonEmpty,
});

/**
 * Restate a draft's description.
 *
 * The three fields here are exactly the three a published contract may not change, which is why revision has no
 * route to the capability, the version or the style: those identify the promise rather than describe it, and a
 * new one of any of them is a new contract.
 */
export const reviseApiContractSchema = z.object({
  title: nonEmpty,
  summary: nonEmpty,
  specificationRef: nonEmpty,
});

/**
 * Announce that a version is going away, and say what to move to.
 *
 * Both instants are required and neither is a clock reading, because a deprecation is a dated promise: the
 * aggregate measures the notice period between them and refuses one shorter than an integrator could plausibly
 * act on, and a sunset stamped from the server's clock at request time would make the notice unreviewable. The
 * successor version is compulsory for the same reason — *this is going away* without *use this instead* is an
 * outage with a lead time.
 */
export const deprecateApiContractSchema = z.object({
  announcedAt: isoDate,
  sunsetAt: isoDate,
  supersededByVersion: key,
});

// --- Capability routes -----------------------------------------------------------

/**
 * Give a capability a public address under a contract (`gateway:publish`).
 *
 * The capability, version, style and organization are read from the contract rather than restated here, so a
 * route cannot claim to serve a version it is not attached to. `internalTarget` is the one field in this domain
 * that is written over HTTP and never read back over it: the route projections return the public address, method,
 * version, status and required scope, which is what *expose capabilities, never implementation* costs at the
 * boundary rather than what it means in a document.
 */
export const registerCapabilityRouteSchema = z.object({
  contractId: uuid,
  method: httpMethod,
  externalPath: nonEmpty,
  requiredScope: key,
  internalTarget: key,
  idempotencyGuarded: z.boolean(),
});

/**
 * Change the address, the scope it demands, or whether it is guarded.
 *
 * The method is not revisable, because a route's method and path together are the address an integrator wrote
 * down. Changing one of the two in place would move the address while looking like an edit.
 */
export const reviseCapabilityRouteSchema = z.object({
  externalPath: nonEmpty,
  requiredScope: key,
  idempotencyGuarded: z.boolean(),
});

/**
 * Point a live address at a different capability inside the platform.
 *
 * Separate from revision, and the separation is the indirection paying for itself: nothing an integrator can see
 * changes, so this is the operation that lets the platform be refactored without the outside world migrating —
 * and it is also the operation that silently changes what somebody's existing integration invokes, which is why
 * it sits behind `gateway:publish` rather than an operational scope.
 */
export const retargetCapabilityRouteSchema = z.object({ internalTarget: key });

// --- Traffic policies ------------------------------------------------------------

/**
 * Set how much of the platform somebody may use (`gateway:operate`).
 *
 * `consumerId` and `capabilityKey` are nullable but not optional, and that is deliberate. A policy's scope and
 * its subject are one fact the aggregate checks as one — a `consumer` policy naming no consumer and a `global`
 * policy naming one are both refused — so an explicit `null` records *this scope has no such subject* where an
 * omitted field would record that somebody stopped filling in the form. The two failures are a sentence apart in
 * a request body and an incident apart in production.
 */
export const defineTrafficPolicySchema = z.object({
  organizationId: uuid,
  scope: policyScope,
  consumerId: uuid.nullable(),
  capabilityKey: key.nullable(),
  displayName: nonEmpty,
  limits: policyLimits,
});

/**
 * Replace a policy's limits outright.
 *
 * Wholesale rather than field by field, because that is what the resolver does with a policy and a partial
 * update would give *omitted* a second meaning here that it does not have anywhere else in this domain.
 */
export const reviseTrafficPolicySchema = z.object({ limits: policyLimits });

export const renameTrafficPolicySchema = z.object({ displayName: nonEmpty });

// --- Integration endpoints -------------------------------------------------------

/**
 * Register something outside the platform that the platform may call (`gateway:integrate`).
 *
 * `credentialRef` is nullable and not optional, mirroring the aggregate's own insistence: an endpoint reachable
 * only from inside a network, or authenticated by a certificate the platform did not mint, genuinely needs no
 * handle of ours — and *this needs no credential* must not be spellable the same way as *nobody filled that
 * field in*, because the platform will authenticate to a third party without one either way.
 */
export const registerIntegrationEndpointSchema = z.object({
  organizationId: uuid,
  endpointKey: key,
  displayName: nonEmpty,
  protocol: integrationProtocol,
  adapterKey: key,
  credentialRef: nonEmpty.nullable(),
});

export const renameIntegrationEndpointSchema = z.object({ displayName: nonEmpty });

/** Send this endpoint's calls through a different adapter. The adapter must support its protocol. */
export const rebindEndpointAdapterSchema = z.object({ adapterKey: key });

export const rotateEndpointCredentialSchema = z.object({ credentialRef: nonEmpty.nullable() });

/** Taking an endpoint out of service carries a reason, because every subscription behind it stops. */
export const disableIntegrationEndpointSchema = z.object({ reason: nonEmpty });

/**
 * The instant a quarantine sweep judges every open circuit against.
 *
 * An argument rather than the server's clock, so one sweep decides its whole batch against one moment: an
 * endpoint whose circuit crossed the quarantine threshold on the boundary is in this run or the next one, never
 * in both, and a sweep can be re-run against a past instant to establish what it would have done.
 */
export const sweepEndpointQuarantineSchema = z.object({ asOf: isoDate });

// --- Webhook subscriptions -------------------------------------------------------

/**
 * Arrange for institutional facts to be sent somewhere (`gateway:integrate`).
 *
 * `eventTypes` is bounded below at one because a subscription that matches nothing is a delivery arrangement
 * nobody will notice is broken. Each type is resolved against the platform's published catalogue, which is a
 * curated set rather than every event the platform emits — so a plausible-looking type that names an internal
 * step is refused here rather than becoming a public contract by being subscribed to.
 *
 * `secretRef` is nullable and not optional, for the reason an endpoint's credential is: a consumer who verifies
 * deliveries by mutual TLS and a consumer whose signing secret was never filled in otherwise produce the same
 * record, and only one of them should be sent unsigned payloads.
 */
export const createWebhookSubscriptionSchema = z.object({
  organizationId: uuid,
  consumerId: uuid,
  subscriptionKey: key,
  displayName: nonEmpty,
  endpointId: uuid,
  eventTypes: z.array(key).min(1),
  deliveryMode: deliveryMode.optional(),
  secretRef: nonEmpty.nullable(),
});

export const renameWebhookSubscriptionSchema = z.object({ displayName: nonEmpty });

/** Replace what the subscription is interested in. Wholesale, because the filter is one decision. */
export const resubscribeWebhookSubscriptionSchema = z.object({
  eventTypes: z.array(key).min(1),
});

export const rebindSubscriptionEndpointSchema = z.object({ endpointId: uuid });

export const rotateSubscriptionSecretSchema = z.object({ secretRef: nonEmpty.nullable() });

/**
 * Stop sending, on the institution's initiative rather than the consumer's.
 *
 * A reason is required here and not on a pause, and the difference is whose subscription it is. A consumer
 * pausing their own feed owes nobody an explanation; an institution stopping somebody else's owes them one, and
 * this is the field it gets written in.
 */
export const suspendWebhookSubscriptionSchema = z.object({ reason: nonEmpty });

// --- Outbound deliveries ---------------------------------------------------------

/**
 * The instant a due-delivery read is judged against (`gateway:read`).
 *
 * Required rather than defaulted, unlike the equivalent elsewhere in the platform, because the caller here is a
 * delivery worker rather than a screen. A worker that let the server pick the instant could not say afterwards
 * which window it had drained, and re-running a drain against a past instant is how a missed run gets audited.
 */
export const dueDeliveriesQuerySchema = z.object({ asOf: isoDate });

/**
 * Give up on a delivery for good (`gateway:operate`).
 *
 * The reason is the whole point of the operation. A dead-lettered delivery is the platform saying it could not
 * get through; an abandoned one is a person saying it should stop being tried, and the only thing that
 * distinguishes a considered decision from a queue somebody cleared is what they wrote here.
 */
export const abandonOutboundDeliverySchema = z.object({ reason: nonEmpty });

// --- Idempotency ledger ----------------------------------------------------------

/**
 * The instant an idempotency purge judges retention against (`gateway:operate`).
 *
 * An argument rather than a clock reading, for the reason the quarantine sweep's is — and safe to run late,
 * twice, or not at all for a week, because the ledger already treats a record past its retention as absent. The
 * purge removes rows that had stopped answering rather than rows that were still being honoured.
 */
export const purgeIdempotencyRecordsSchema = z.object({ asOf: isoDate });
