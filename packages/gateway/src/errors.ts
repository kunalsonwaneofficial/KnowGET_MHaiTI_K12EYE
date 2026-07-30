import { PlatformError } from "@knowget/exceptions";

/**
 * The domain error model for the API Gateway & Integration Fabric. Every failure this contract can produce is a
 * typed, operational error carrying a stable code, an HTTP status and structured details — never a bare string,
 * and never free text an API consumer has to parse.
 *
 * This file matters more here than in any domain contract, and the reason is arithmetic: a domain error is read
 * by the handful of people who operate that domain, and a gateway error is read by every external integrator
 * the institution has, in code, at three in the morning, in a language nobody here chose. The details object on
 * each of these is a public API in every sense that counts, and changing one is a breaking change whatever the
 * version number says.
 *
 * Four groups do most of the work, and each is a rule from the contract made unignorable:
 *
 * - {@link PlaintextCredentialError} is the one refusal in this package that protects somebody other than the
 *   caller. A gateway is handed other people's secrets constantly, and nobody has ever *decided* to store one —
 *   what happens is that a field typed `string` accepts whatever was pasted into it, and the value reaches a
 *   row, a backup and a log before anybody notices the registration form said "reference". Refusing at the
 *   aggregate boundary is the only place the refusal is cheap.
 * - {@link ContractFrozenError}, {@link DeprecationNoticeTooShortError} and
 *   {@link SunsetBeforeAnnouncementError} are *a published contract is a promise*. The first says the shape an
 *   integrator built against cannot change under them; the other two say it cannot be withdrawn faster than
 *   they could plausibly move. A gateway missing these is a gateway whose external surface is decided by
 *   whoever is currently refactoring.
 * - {@link ConsumerNotActiveError}, {@link ScopeNotGrantedError} and {@link ContractSunsetError} are the three
 *   ways a well-formed call is legitimately refused, kept apart because they have three different remedies —
 *   talk to the institution, request a scope, migrate off the version — and a single 403 would leave every
 *   integrator guessing which.
 * - {@link IdempotencyKeyConflictError} refuses to answer a second, different request from a first one's
 *   result. Treating a reused key with a changed payload as a replay is silent data loss wearing a `200`, and
 *   it is the failure mode an idempotency ledger is most likely to introduce if it is written to be helpful.
 *
 * One structural choice is worth defending. The key errors are parameterised by `kind` rather than written out
 * once per aggregate, which is not how the domain contracts do it. There the key spaces have different rules —
 * a lesson key and a signal key validate differently and fail differently. Here all eight key spaces share one
 * grammar, one length and one normalisation, and eight identical classes would be eight places to update when
 * that grammar changes and eight opportunities for one of them not to be.
 */

// --- Keys and credentials --------------------------------------------------------

/** A key arrived empty, or as nothing but whitespace. */
export class EmptyGatewayKeyError extends PlatformError {
  constructor(kind: string) {
    super(`A ${kind} key is required and cannot be blank`, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      isOperational: true,
      details: { kind },
    });
  }
}

/**
 * A key does not fit the platform's grammar.
 *
 * The offending value travels in the details, which is safe because a key is an identifier the caller chose and
 * never a secret — and it is necessary, because "invalid key" without the key is the least actionable message
 * an integration can receive.
 */
export class InvalidGatewayKeyError extends PlatformError {
  constructor(kind: string, value: string) {
    super(
      `"${value}" is not a valid ${kind} key; use lowercase alphanumeric segments separated by ".", "-" or "_"`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 400,
        isOperational: true,
        details: { kind, value },
      },
    );
  }
}

/**
 * Something that should have been a handle to a secret looks like the secret.
 *
 * The rejected value is deliberately **not** in the details, and this is the only error in the package that
 * withholds its input. Everywhere else the offending value is the most useful thing a caller can be told; here
 * it is quite possibly a live API key, and putting it in a structured error field would write it to the exact
 * log the refusal exists to keep it out of. What travels is the field name and the list of providers that would
 * have been accepted, which is enough to fix the call.
 */
export class PlaintextCredentialError extends PlatformError {
  constructor(field: string, providers: readonly string[]) {
    super(
      `"${field}" must be a credential reference such as "vault:<name>", not the credential itself`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 400,
        isOperational: true,
        details: { field, acceptedProviders: providers },
      },
    );
  }
}

// --- Directories -----------------------------------------------------------------

/** The organization (institution node, P2-D01-M01) this registration was to be attached to does not exist. */
export class OrganizationNotFoundForGatewayError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot attach the registration to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/**
 * A person named on a gateway record — who registered a consumer, who approved a contract, who quarantined an
 * endpoint — is not in this tenant.
 *
 * Attribution is most of what makes an external integration governable. A registration whose owner resolves to
 * nobody passes every check here and leaves the institution with an integration that has access, traffic and no
 * one to ask about it, which is discovered during an incident rather than during a review.
 */
export class PersonNotFoundForGatewayError extends PlatformError {
  constructor(personId: string, role: string) {
    super(`No person "${personId}" exists in this tenant; they cannot be the ${role}`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { personId, role },
    });
  }
}

/**
 * A scope named in a grant is not one the platform issues.
 *
 * Granting an unknown scope is worse than granting nothing, because it looks granted. Every permission check
 * downstream compares against a string that will never be required by any route, so the consumer is refused
 * everywhere with a message saying they lack a scope their record plainly shows.
 */
export class UnknownScopeError extends PlatformError {
  constructor(scope: string) {
    super(`"${scope}" is not a scope this platform issues`, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      isOperational: true,
      details: { scope },
    });
  }
}

// --- Consumers -------------------------------------------------------------------

/** The requested API consumer does not exist in the current tenant. */
export class ApiConsumerNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`API consumer "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** Two consumers cannot share a key: it is how logs, policies and grants all refer to the same integration. */
export class DuplicateConsumerKeyError extends PlatformError {
  constructor(consumerKey: string) {
    super(`An API consumer with key "${consumerKey}" already exists in this tenant`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { consumerKey },
    });
  }
}

/** The consumer is already in the status somebody asked to move it to. */
export class ConsumerAlreadyInStatusError extends PlatformError {
  constructor(id: string, status: string) {
    super(`API consumer "${id}" is already ${status}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/**
 * The consumer is retired, and retirement is the end.
 *
 * There is no reinstatement, and the asymmetry with suspension is the whole point: suspension answers something
 * happening now and is meant to be undone, retirement is the statement that an integration is over. A retired
 * consumer that could be revived is one that never actually finishes being decommissioned, and its credential
 * reference stays live in somebody's configuration on that basis.
 */
export class ConsumerRetiredError extends PlatformError {
  constructor(id: string) {
    super(`API consumer "${id}" is retired; register a new consumer instead of reviving it`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** The requested consumer status change is not a move the lifecycle permits. */
export class InvalidConsumerProgressionError extends PlatformError {
  constructor(id: string, from: string, to: string) {
    super(`API consumer "${id}" cannot move from ${from} to ${to}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, from, to },
    });
  }
}

/**
 * A call arrived from a consumer that is not active.
 *
 * `403` rather than `401`: the caller authenticated perfectly well, and telling them their credential is bad
 * would send them to rotate a key that is fine. What has happened is that the institution has not activated
 * them, or has suspended them, and the remedy is a conversation rather than a configuration change.
 */
export class ConsumerNotActiveError extends PlatformError {
  constructor(consumerKey: string, status: string) {
    super(`API consumer "${consumerKey}" is ${status} and cannot be served`, {
      code: "CONFLICT",
      httpStatus: 403,
      isOperational: true,
      details: { consumerKey, status },
    });
  }
}

/** A grant arrived with no scopes in it, which grants access to nothing and reads as though it granted some. */
export class EmptyScopeGrantError extends PlatformError {
  constructor(consumerKey: string) {
    super(`A scope grant for "${consumerKey}" must name at least one scope`, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      isOperational: true,
      details: { consumerKey },
    });
  }
}

/** The consumer does not hold the scope this capability requires. */
export class ScopeNotGrantedError extends PlatformError {
  constructor(consumerKey: string, requiredScope: string) {
    super(`API consumer "${consumerKey}" has not been granted "${requiredScope}"`, {
      code: "CONFLICT",
      httpStatus: 403,
      isOperational: true,
      details: { consumerKey, requiredScope },
    });
  }
}

// --- Contracts -------------------------------------------------------------------

/** The requested capability contract does not exist in the current tenant. */
export class ApiContractNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`API contract "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** One capability cannot publish the same version twice; the version is what an integrator pins to. */
export class DuplicateContractVersionError extends PlatformError {
  constructor(capabilityKey: string, contractVersion: string) {
    super(`Capability "${capabilityKey}" already has a contract at version "${contractVersion}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { capabilityKey, contractVersion },
    });
  }
}

/**
 * Somebody tried to change a contract that has been published.
 *
 * This is the contract's central promise enforced at the one place it can be. A published contract is the
 * document an integrator wrote code against, and editing it does not update their code — it makes their code
 * wrong, silently, at a moment nobody chose. Every change to a published capability is a new version, and the
 * old one keeps answering until it is deprecated and sunset on notice. There is no flag for a small change:
 * *small* is a judgement made by the person changing it and experienced by somebody else.
 */
export class ContractFrozenError extends PlatformError {
  constructor(id: string, status: string) {
    super(`API contract "${id}" is ${status} and can no longer be edited; publish a new version`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/** The requested contract status change is not a move the lifecycle permits. */
export class InvalidContractProgressionError extends PlatformError {
  constructor(id: string, from: string, to: string) {
    super(`API contract "${id}" cannot move from ${from} to ${to}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, from, to },
    });
  }
}

/** The contract has been sunset; nothing moves it again. */
export class ContractSunsetError extends PlatformError {
  constructor(capabilityKey: string, contractVersion: string) {
    super(`Version "${contractVersion}" of "${capabilityKey}" was sunset and no longer answers`, {
      code: "CONFLICT",
      httpStatus: 410,
      isOperational: true,
      details: { capabilityKey, contractVersion },
    });
  }
}

/** The contract exists but is not in a state that answers calls — most often still a draft. */
export class ContractNotServableError extends PlatformError {
  constructor(capabilityKey: string, contractVersion: string, status: string) {
    super(`Version "${contractVersion}" of "${capabilityKey}" is ${status} and is not served`, {
      code: "CONFLICT",
      httpStatus: 404,
      isOperational: true,
      details: { capabilityKey, contractVersion, status },
    });
  }
}

/** Deprecation applies to something that is published; a draft is withdrawn, not deprecated. */
export class ContractNotPublishedError extends PlatformError {
  constructor(id: string, status: string) {
    super(`API contract "${id}" is ${status}; only a published contract can be deprecated`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/**
 * A sunset was announced with less notice than the platform will give.
 *
 * The floor is not negotiable through a parameter, and that is the design. An operator under pressure to
 * retire a version always has a reason why this one is different, and the cost of agreeing lands entirely on
 * integrators who are not in the conversation and will discover the decision when their calls stop working.
 */
export class DeprecationNoticeTooShortError extends PlatformError {
  constructor(id: string, noticeDays: number, minimumDays: number) {
    super(
      `API contract "${id}" was given ${noticeDays} days' notice; at least ${minimumDays} are required`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { id, noticeDays, minimumDays },
      },
    );
  }
}

/** A sunset date precedes the announcement that was supposed to give notice of it. */
export class SunsetBeforeAnnouncementError extends PlatformError {
  constructor(id: string, announcedAt: string, sunsetAt: string) {
    super(
      `API contract "${id}" cannot sunset at ${sunsetAt}, before its announcement at ${announcedAt}`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { id, announcedAt, sunsetAt },
      },
    );
  }
}

/**
 * The version named as a deprecation's successor is not something an integrator could move onto.
 *
 * A deprecation notice is only half a message. The other half is *go here instead*, and it is the half that
 * decides whether the notice is actionable or merely a countdown. Naming a successor that does not exist, or
 * that is itself a draft, or that has already been sunset, produces a notice that reads as a migration plan
 * and functions as a dead end — and the integrator discovers the difference at the moment they act on it,
 * which is the moment the old version stops answering. The three refusals share one class because they are
 * one mistake from the caller's side: the successor was not checked before it was published as advice.
 */
export class UnusableSuccessorVersionError extends PlatformError {
  constructor(capabilityKey: string, contractVersion: string, issue: string) {
    super(`Version "${contractVersion}" of "${capabilityKey}" ${issue} and cannot be a successor`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { capabilityKey, contractVersion, issue },
    });
  }
}

// --- Routes ----------------------------------------------------------------------

/** The requested capability route does not exist in the current tenant. */
export class CapabilityRouteNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Capability route "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** Two active routes cannot claim the same capability, version and method; resolution would be ambiguous. */
export class DuplicateRouteError extends PlatformError {
  constructor(capabilityKey: string, contractVersion: string, method: string) {
    super(
      `A route for ${method} "${capabilityKey}" at version "${contractVersion}" already exists`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { capabilityKey, contractVersion, method },
      },
    );
  }
}

/** The requested route status change is not a move the lifecycle permits. */
export class InvalidRouteProgressionError extends PlatformError {
  constructor(id: string, from: string, to: string) {
    super(`Capability route "${id}" cannot move from ${from} to ${to}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, from, to },
    });
  }
}

/** The route is retired; nothing moves it again. */
export class RouteRetiredError extends PlatformError {
  constructor(id: string) {
    super(`Capability route "${id}" is retired`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/**
 * A route was activated against a contract that is not published.
 *
 * The check exists because the two records are edited by different people at different times, and a route that
 * went live against a draft would expose a shape nobody agreed to under a version number that implies somebody
 * did.
 */
export class RouteContractNotPublishedError extends PlatformError {
  constructor(id: string, capabilityKey: string, contractVersion: string) {
    super(
      `Route "${id}" cannot be activated: "${capabilityKey}" version "${contractVersion}" is not published`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { id, capabilityKey, contractVersion },
      },
    );
  }
}

/** The external path is not a well-formed template. */
export class InvalidExternalPathError extends PlatformError {
  constructor(path: string, issue: string) {
    super(`External path "${path}" is not usable: ${issue}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      isOperational: true,
      details: { path, issue },
    });
  }
}

/** A route was registered with no internal target, so nothing would answer a call that resolved to it. */
export class MissingInternalTargetError extends PlatformError {
  constructor(capabilityKey: string) {
    super(`A route for "${capabilityKey}" must name an internal target`, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      isOperational: true,
      details: { capabilityKey },
    });
  }
}

/**
 * Two routes that have not been retired cannot claim the same method and public address.
 *
 * The sibling rule to {@link DuplicateRouteError}, and a separate one, because the two collisions arrive from
 * opposite directions. That one is about resolution — two routes for one capability, version and method give
 * the fabric a choice it has no basis to make. This one is about the address, and the two routes involved are
 * usually for *different* capabilities, published by different people, neither of whom knew about the other.
 *
 * A retired route frees its address. That is deliberate: retiring the old route and activating a replacement on
 * the same path is the ordinary shape of a migration, and a platform that held addresses forever would force
 * every correction to be published at a URL that says what went wrong.
 */
export class RouteAddressTakenError extends PlatformError {
  constructor(method: string, externalPath: string) {
    super(`${method} "${externalPath}" is already claimed by a route that has not been retired`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { method, externalPath },
    });
  }
}

/**
 * The route names an internal target that does not resolve to anything that answers.
 *
 * Refused at registration, which is the only moment it is cheap. The internal target is the one field the
 * fabric holds and never discloses, so nobody outside will ever notice it is wrong — and the person who does
 * notice is an integrator who pinned to a published contract, wrote code against it and is now receiving a
 * failure whose cause is invisible from their side and unfixable from it.
 */
export class UnresolvableInternalTargetError extends PlatformError {
  constructor(capabilityKey: string, internalTarget: string) {
    super(`Internal target "${internalTarget}" for "${capabilityKey}" does not resolve`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { capabilityKey, internalTarget },
    });
  }
}

// --- Traffic policy --------------------------------------------------------------

/** The requested traffic policy does not exist in the current tenant. */
export class TrafficPolicyNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Traffic policy "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/**
 * Two active policies claim the same scope over the same subject.
 *
 * Refused rather than resolved, because every tie-break rule that could settle it — newest wins, tightest wins,
 * lowest id wins — makes a consumer's effective rate limit depend on something nobody would think to look at.
 * The specificity ordering is designed so that ties are impossible between *different* scopes; a tie within one
 * scope is a duplicate, and the honest answer is to say so at the point of creation.
 */
export class DuplicatePolicyScopeError extends PlatformError {
  constructor(scope: string, subject: string) {
    super(`An active ${scope} traffic policy already applies to ${subject}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { scope, subject },
    });
  }
}

/** The policy's scope and its subject fields disagree — a consumer scope with no consumer, or the reverse. */
export class PolicyScopeMismatchError extends PlatformError {
  constructor(scope: string, issue: string) {
    super(`A ${scope} traffic policy ${issue}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { scope, issue },
    });
  }
}

/** A limit was set to something that is not a usable figure. */
export class InvalidPolicyLimitError extends PlatformError {
  constructor(limit: string, value: number) {
    super(`Traffic policy limit "${limit}" must be a positive whole number, not ${value}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { limit, value },
    });
  }
}

/** A policy was created that sets nothing, which looks like protection and provides none. */
export class EmptyTrafficPolicyError extends PlatformError {
  constructor(scope: string) {
    super(`A ${scope} traffic policy must set at least one limit`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { scope },
    });
  }
}

/**
 * Half a rate limit was set: a request count with no window, a window with no count, or a burst with neither.
 *
 * Refused rather than completed with a default, because both defaults are wrong in a way nobody would notice. A
 * count with an assumed window is a limit the operator did not choose and cannot see; a window with no count
 * enforces nothing at all while appearing in every listing as though it does.
 */
export class IncompleteRateLimitError extends PlatformError {
  constructor(missing: string) {
    super(
      `A rate limit needs a request count and the window it is counted over; ${missing} was not set`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { missing },
      },
    );
  }
}

/** A burst allowance below the sustained limit would deny traffic the limit expressly permits. */
export class BurstBelowLimitError extends PlatformError {
  constructor(burstAllowance: number, requestsPerWindow: number) {
    super(
      `Burst allowance ${burstAllowance} is below the sustained limit ${requestsPerWindow}; it would deny permitted traffic`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { burstAllowance, requestsPerWindow },
      },
    );
  }
}

// --- Integration endpoints -------------------------------------------------------

/** The requested integration endpoint does not exist in the current tenant. */
export class IntegrationEndpointNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Integration endpoint "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** Two endpoints cannot share a key: it is how every adapter binding and delivery record refers to one. */
export class DuplicateEndpointKeyError extends PlatformError {
  constructor(endpointKey: string) {
    super(`An integration endpoint with key "${endpointKey}" already exists in this tenant`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { endpointKey },
    });
  }
}

/** The requested endpoint status change is not a move the lifecycle permits. */
export class InvalidEndpointProgressionError extends PlatformError {
  constructor(id: string, from: string, to: string) {
    super(`Integration endpoint "${id}" cannot move from ${from} to ${to}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, from, to },
    });
  }
}

/** The endpoint is retired; nothing moves it again. */
export class EndpointRetiredError extends PlatformError {
  constructor(id: string) {
    super(`Integration endpoint "${id}" is retired`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/**
 * Something asked to call an endpoint that is not currently reachable through the fabric.
 *
 * `503` and not `500`, because nothing is broken here: an endpoint is quarantined or disabled, and the caller's
 * request was fine. The distinction reaches every retry policy on the other side of this response, and a `500`
 * would tell well-behaved clients to stop retrying something that will come back.
 */
export class EndpointNotAvailableError extends PlatformError {
  constructor(endpointKey: string, status: string) {
    super(`Integration endpoint "${endpointKey}" is ${status} and cannot be called`, {
      code: "UNAVAILABLE",
      httpStatus: 503,
      isOperational: true,
      details: { endpointKey, status },
    });
  }
}

/** An endpoint was registered with no adapter, which is a vendor with nothing in front of it. */
export class MissingAdapterKeyError extends PlatformError {
  constructor(endpointKey: string) {
    super(`Integration endpoint "${endpointKey}" must name the adapter it is served through`, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      isOperational: true,
      details: { endpointKey },
    });
  }
}

/**
 * The circuit engine was handed an outcome window that is not a tally: a negative count, a fraction, a run of
 * consecutive failures longer than the failures observed.
 *
 * Non-operational and hidden from clients for the same reason {@link InvalidQuotaFigureError} is. Nobody outside
 * the platform contributes to an outcome window; every figure in one comes from the fabric's own record of calls
 * it made, so a figure that is not a count is a defect on this side of the boundary.
 *
 * Raised rather than clamped, and here the argument is sharper than it is for a quota. A clamped outcome window
 * still produces a posture, and that posture goes on to open or close a circuit — so the cost of absorbing the
 * defect is not a mis-counted call but an endpoint taken out of service, or left in it, on the strength of
 * arithmetic nobody checked. An operator investigating either would find a perfectly plausible record.
 */
export class InvalidOutcomeCountError extends PlatformError {
  constructor(name: string, value: number) {
    super(`An outcome window's ${name} must be a whole count of calls; ${value} was given`, {
      code: "INTERNAL_ERROR",
      httpStatus: 500,
      isOperational: false,
      details: { name, value },
    });
  }
}

/**
 * The endpoint names an adapter the registry does not have, or one that does not speak the stated protocol.
 *
 * One refusal for both because the caller's correction is the same — look at the registry — and because the
 * second failure is the more dangerous of the two precisely by resembling the first less. An endpoint bound to
 * a real adapter under the wrong protocol does not fail at registration and does not fail obviously in service;
 * it fails at the first call, in whatever way a mismatched wire format fails, and it is investigated as a
 * network problem by people who have no reason to suspect configuration.
 */
export class UnknownAdapterError extends PlatformError {
  constructor(adapterKey: string, protocol: string) {
    super(`No adapter "${adapterKey}" speaking ${protocol} is registered`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { adapterKey, protocol },
    });
  }
}

// --- Webhook subscriptions -------------------------------------------------------

/** The requested webhook subscription does not exist in the current tenant. */
export class WebhookSubscriptionNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Webhook subscription "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** Two subscriptions cannot share a key within one consumer. */
export class DuplicateSubscriptionKeyError extends PlatformError {
  constructor(subscriptionKey: string) {
    super(`A webhook subscription with key "${subscriptionKey}" already exists for this consumer`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { subscriptionKey },
    });
  }
}

/** The requested subscription status change is not a move the lifecycle permits. */
export class InvalidSubscriptionProgressionError extends PlatformError {
  constructor(id: string, from: string, to: string) {
    super(`Webhook subscription "${id}" cannot move from ${from} to ${to}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, from, to },
    });
  }
}

/** The subscription is revoked; nothing moves it again. */
export class SubscriptionRevokedError extends PlatformError {
  constructor(id: string) {
    super(`Webhook subscription "${id}" is revoked`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** A subscription was created that subscribes to nothing, which will never deliver and looks like it might. */
export class NoEventTypesSubscribedError extends PlatformError {
  constructor(subscriptionKey: string) {
    super(`Webhook subscription "${subscriptionKey}" must name at least one event type`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { subscriptionKey },
    });
  }
}

/**
 * Something asked the fabric to send to a subscription that is not currently being sent to.
 *
 * Names the status rather than only refusing, because the three ways to arrive here have three different next
 * actions and the caller cannot tell them apart otherwise: a paused subscription is resumed by the consumer who
 * paused it, a suspended one is resumed once whatever the receiver was doing has stopped, and a revoked one is
 * not resumed at all.
 */
export class SubscriptionNotSendingError extends PlatformError {
  constructor(subscriptionKey: string, status: string) {
    super(`Webhook subscription "${subscriptionKey}" is ${status} and is not being sent to`, {
      code: "UNAVAILABLE",
      httpStatus: 503,
      isOperational: true,
      details: { subscriptionKey, status },
    });
  }
}

/**
 * The subscription asks for an event type nothing in the platform emits.
 *
 * The one refusal in this package that exists purely to prevent silence. Subscriptions match event types
 * exactly and deliberately, with no wildcards, so a mistyped type is not a subscription that misbehaves — it is
 * one that is permanently, quietly empty. Nothing errors, nothing is dead-lettered, no counter moves; the
 * consumer simply never hears about the thing they asked for, and finds out when somebody downstream notices
 * their data is weeks stale. Subscription time is the only moment anybody is looking at the string.
 */
export class UnknownEventTypeError extends PlatformError {
  constructor(eventType: string) {
    super(`No published event type "${eventType}" exists to subscribe to`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { eventType },
    });
  }
}

// --- Outbound deliveries ---------------------------------------------------------

/** The requested outbound delivery does not exist in the current tenant. */
export class OutboundDeliveryNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Outbound delivery "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The delivery has reached an end state and will not be attempted again under this record. */
export class DeliverySettledError extends PlatformError {
  constructor(id: string, outcome: string) {
    super(`Outbound delivery "${id}" is ${outcome} and will not be attempted again`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, outcome },
    });
  }
}

/**
 * Somebody asked to replay a delivery that is not eligible.
 *
 * Only a dead-lettered delivery replays. An abandoned one was given up on deliberately — the subscription was
 * revoked, or the event stopped being worth sending — and replaying it would deliver, to a consumer who may
 * have been offboarded, an event the institution decided not to send.
 */
export class DeliveryNotReplayableError extends PlatformError {
  constructor(id: string, outcome: string) {
    super(
      `Outbound delivery "${id}" is ${outcome}; only dead-lettered deliveries can be replayed`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { id, outcome },
      },
    );
  }
}

/** Every permitted attempt has been made; the delivery dead-letters rather than retrying forever. */
export class DeliveryAttemptsExhaustedError extends PlatformError {
  constructor(id: string, attempts: number) {
    super(`Outbound delivery "${id}" has used all ${attempts} attempts`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, attempts },
    });
  }
}

/**
 * The backoff engine was handed an attempt count that is not a count of attempts.
 *
 * Non-operational, and the reason is worth stating plainly: the attempt counter is incremented by this package
 * and by nothing else. A consumer cannot influence it, a receiver cannot influence it, and a value that is not a
 * whole non-negative number means the delivery record was written by something that is not the aggregate.
 *
 * Raised rather than clamped, on the same argument the circuit engine makes. A clamped attempt count still
 * produces a schedule, and that schedule decides whether a delivery is retried in thirty seconds or given up on
 * entirely — so absorbing the defect costs an institution a webhook that was silently dead-lettered on the first
 * failure, or one that retried past its allowance against a receiver already telling us to stop.
 */
export class InvalidAttemptNumberError extends PlatformError {
  constructor(deliveryId: string, attempt: number) {
    super(`Outbound delivery "${deliveryId}" has a non-count attempt number of ${attempt}`, {
      code: "INTERNAL_ERROR",
      httpStatus: 500,
      isOperational: false,
      details: { deliveryId, attempt },
    });
  }
}

// --- Idempotency -----------------------------------------------------------------

/**
 * The requested idempotency record does not exist in the current tenant.
 *
 * Raised only by the reads an operator performs — a record fetched by id or by key while investigating a
 * duplicate. The guarded write path never reaches this: a missing record there is the ordinary case and means
 * *proceed*, which is what {@link IdempotencyKeyConflictError} and {@link OperationInFlightError} exist to
 * distinguish it from.
 */
export class IdempotencyRecordNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Idempotency record "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An idempotency key exceeded the length the platform will accept. */
export class IdempotencyKeyTooLongError extends PlatformError {
  constructor(length: number, maximum: number) {
    super(`Idempotency key is ${length} characters; the maximum is ${maximum}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      isOperational: true,
      details: { length, maximum },
    });
  }
}

/**
 * A key was reused with a different request.
 *
 * `409` and never a replay. The caller has a bug — most often a key generated per operation and reused across
 * two, or generated per attempt and therefore never matching — and returning the first request's result would
 * report success for work that was never done. It is the one error in this package whose absence would be
 * invisible in every test and catastrophic in production.
 */
export class IdempotencyKeyConflictError extends PlatformError {
  constructor(idempotencyKey: string) {
    super(`Idempotency key "${idempotencyKey}" was already used for a different request`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { idempotencyKey },
    });
  }
}

/** The first call under this key has not finished; a concurrent retry waits rather than doubling the work. */
export class OperationInFlightError extends PlatformError {
  constructor(idempotencyKey: string) {
    super(`A request under idempotency key "${idempotencyKey}" is still in progress`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { idempotencyKey },
    });
  }
}

/** The idempotency record has already been completed and cannot be completed again with a new result. */
export class IdempotencyRecordSettledError extends PlatformError {
  constructor(idempotencyKey: string, state: string) {
    super(
      `Idempotency record "${idempotencyKey}" is ${state} and cannot be recorded against again`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { idempotencyKey, state },
      },
    );
  }
}

/**
 * A completion was recorded against an idempotency key with something that is not an HTTP status.
 *
 * Refused rather than absorbed, which is the opposite of what a delivery attempt does with a nonsense status
 * code, and the difference is what the number is *for*. A delivery records what a receiver said and nothing
 * branches on it; this number is replayed to the next caller as their response status. A record completed with
 * a null status answers a retry with no status at all, and the client library on the other end will do
 * something arbitrary with that — most of them treat it as a transport failure and retry, which is exactly the
 * duplicate the ledger exists to prevent.
 */
export class InvalidRecordedStatusError extends PlatformError {
  constructor(idempotencyKey: string, statusCode: number) {
    super(`Cannot record status ${statusCode} against idempotency key "${idempotencyKey}"`, {
      code: "INTERNAL_ERROR",
      httpStatus: 500,
      isOperational: false,
      details: { idempotencyKey, statusCode },
    });
  }
}

// --- Enforcement -----------------------------------------------------------------

/**
 * A quota check was handed a count that is not a count: a negative consumption, a fractional cost, a cost of nothing.
 *
 * Hidden from clients and non-operational, because no consumer can cause this. Every figure the quota engine
 * reads comes from the platform's own ledger or from the code that priced the call, so a bad one is a defect on
 * our side and the consumer would only be confused by it.
 *
 * Raised rather than absorbed. The tempting alternative is to clamp — read a cost of zero as one, a negative
 * consumption as none — and it is the wrong instinct here, because every clamp produces a call that is served
 * and mis-counted, and a consumer whose usage is quietly under-counted is discovered by the bill or by the
 * outage, months later, with no record of which calls were wrong.
 */
export class InvalidQuotaFigureError extends PlatformError {
  constructor(name: string, value: number, requirement: string) {
    super(`A quota ${name} ${requirement}; ${value} was given`, {
      code: "INTERNAL_ERROR",
      httpStatus: 500,
      isOperational: false,
      details: { name, value, requirement },
    });
  }
}

/**
 * An admission check was handed a declared body size that is not a size.
 *
 * A negative or fractional byte count comes from the transport layer, not from the caller — a consumer cannot
 * declare minus four hundred bytes — so this is our defect and is hidden accordingly. Raised rather than read as
 * "no body", because a request whose size could not be established is a request the payload ceiling was never
 * actually applied to, and serving it would mean the limit an operator configured silently did not hold.
 */
export class InvalidPayloadSizeError extends PlatformError {
  constructor(payloadBytes: number) {
    super(`A declared body size must be a whole number of bytes; ${payloadBytes} was given`, {
      code: "INTERNAL_ERROR",
      httpStatus: 500,
      isOperational: false,
      details: { payloadBytes },
    });
  }
}

/**
 * The consumer exceeded the rate they are permitted.
 *
 * `retryAfterSeconds` is in the details rather than only in a header, because the details object is what
 * survives into the structured error a client library surfaces, and a client that has to parse a header to
 * find out when to come back will come back immediately.
 */
export class RateLimitExceededError extends PlatformError {
  constructor(consumerKey: string, retryAfterSeconds: number) {
    super(`API consumer "${consumerKey}" has exceeded its rate limit`, {
      code: "RATE_LIMITED",
      httpStatus: 429,
      isOperational: true,
      details: { consumerKey, retryAfterSeconds },
    });
  }
}

/** The consumer has consumed its allowance for the current window and is over the burst ceiling as well. */
export class QuotaExhaustedError extends PlatformError {
  constructor(consumerKey: string, window: string, retryAfterSeconds: number) {
    super(`API consumer "${consumerKey}" has exhausted its ${window} quota`, {
      code: "RATE_LIMITED",
      httpStatus: 429,
      isOperational: true,
      details: { consumerKey, window, retryAfterSeconds },
    });
  }
}

/** The request body exceeds the ceiling the applicable policy sets. */
export class PayloadTooLargeError extends PlatformError {
  constructor(payloadBytes: number, maxPayloadBytes: number) {
    super(`Request body is ${payloadBytes} bytes; the limit is ${maxPayloadBytes}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 413,
      isOperational: true,
      details: { payloadBytes, maxPayloadBytes },
    });
  }
}
