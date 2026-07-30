import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyGatewayKeyError,
  InvalidExternalPathError,
  InvalidGatewayKeyError,
  InvalidRouteProgressionError,
  MissingInternalTargetError,
  RouteContractNotPublishedError,
  RouteRetiredError,
} from "./errors";
import {
  type ContractStatus,
  type ContractStyle,
  type HttpMethod,
  type RouteStatus,
  isMutatingMethod,
  isValidKey,
  normalizeKey,
} from "./gateway-value";
import type { PathIssue, PublicRouteView } from "./gateway-view";
import { inspectRouteTransition } from "./lifecycle";
import { inspectExternalPath } from "./routing";

/**
 * A capability route: the binding between a path the world calls and something inside the platform that answers.
 *
 * This aggregate is where the contract's central rule stops being a principle and becomes a data structure. The
 * record holds an internal target — it has to, or nothing would answer — and {@link toPublicRouteView} is the
 * only way anything leaves, and it does not carry that field. Everything downstream of the view (the resolver,
 * the catalogue, the error responses, the developer portal) is therefore *structurally* unable to disclose what
 * implements a capability, rather than merely disciplined about it.
 *
 * **Retargeting is the point of the indirection, and it is permitted while the route is live.** A capability
 * moved to a new module, split across two, or put behind a different handler is a platform-internal event that
 * integrators must never experience. {@link retargetCapabilityRoute} changes what answers without touching the
 * path, the method, the version or the scope, so the refactor is invisible from outside. A gateway that made
 * this hard would be a gateway that quietly taught its own engineers to publish implementation names, because
 * that is the path of least resistance when the alternative is a migration.
 *
 * **The external surface is frozen once the route is active.** The path, the required scope and whether repeat
 * calls are protected are all editable while the route is a draft and none of them afterwards. They are what an
 * integrator wrote into their code and their access request; changing one after publication does not update
 * their code, it invalidates it.
 *
 * **The capability, the version and the style are copied from the contract on purpose.** Every inbound call is
 * resolved against these three fields, and a resolution that needed a second read to learn them would put a
 * join on the hot path of every request the platform serves. The copy cannot drift because none of the three is
 * revisable on the contract either — a contract may change its title and its specification handle, never
 * what it is or which version it is.
 */

// --- The aggregate ---------------------------------------------------------------

export interface CapabilityRoute {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The contract this route serves. The authority for everything copied below. */
  readonly contractId: Uuid;
  readonly capabilityKey: string;
  readonly contractVersion: string;
  readonly method: HttpMethod;
  /** The published template, e.g. `/v2/admissions/applications/{applicationId}`. Frozen on activation. */
  readonly externalPath: string;
  /** The parameter names the template binds, derived from it rather than declared alongside it. */
  readonly pathParameters: readonly string[];
  readonly style: ContractStyle;
  readonly status: RouteStatus;
  /** The scope a caller must hold. Published, because an integrator has to know what to request. */
  readonly requiredScope: string;
  /** What answers, inside the platform. Held here and disclosed nowhere. */
  readonly internalTarget: string;
  /** Whether repeat calls are safe: always for a read, and for a write when the ledger guards it. */
  readonly idempotent: boolean;
  readonly activatedAt: ISODateString | null;
  readonly retiredAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RegisterCapabilityRouteParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly contractId: Uuid;
  readonly capabilityKey: string;
  readonly contractVersion: string;
  readonly method: HttpMethod;
  readonly externalPath: string;
  readonly style: ContractStyle;
  readonly requiredScope: string;
  readonly internalTarget: string;
  /**
   * Whether the idempotency ledger guards repeat calls.
   *
   * Required rather than defaulted, and required even for a read, because a default would decide the question
   * for whoever forgot to think about it and the answer that costs money is the one nobody chose. A read is
   * idempotent whatever is passed here; the flag only decides anything for a method that changes state.
   */
  readonly idempotencyGuarded: boolean;
}

export interface ReviseCapabilityRouteParams {
  readonly externalPath: string;
  readonly requiredScope: string;
  readonly idempotencyGuarded: boolean;
}

// --- Guards ----------------------------------------------------------------------

/** What each path issue means, phrased for the person who typed the path rather than for a log. */
const PATH_ISSUE_REASONS: Readonly<Record<PathIssue, string>> = Object.freeze({
  not_absolute: "it must begin with a slash",
  too_long: "it is longer than the platform publishes",
  trailing_slash: "it must not end with a slash",
  empty_segment: "it contains an empty segment",
  malformed_segment:
    "a segment is not lowercase alphanumerics separated by dots, dashes or underscores",
  malformed_parameter: "a parameter must be written as {name} with a camelCase name",
  duplicate_parameter: "the same parameter name appears twice",
});

/** Normalise a key and refuse it if it is blank or does not fit the platform's grammar. */
function requireKey(kind: string, value: string): string {
  const key = normalizeKey(value);
  if (key.length === 0) throw new EmptyGatewayKeyError(kind);
  if (!isValidKey(key)) throw new InvalidGatewayKeyError(kind, key);
  return key;
}

/**
 * Validate the external path and hand back both it and what it binds.
 *
 * The parameters are taken from the same walk that validated the template rather than parsed again later. A
 * route whose stored parameter list disagreed with its own path would be a route that validates requests
 * against a template nobody published.
 */
function requireExternalPath(value: string): { path: string; parameters: readonly string[] } {
  const path = value.trim();
  const verdict = inspectExternalPath(path);
  if (!verdict.valid) {
    const issue =
      verdict.issue === null ? "it is not a usable template" : PATH_ISSUE_REASONS[verdict.issue];
    throw new InvalidExternalPathError(path, issue);
  }
  return { path, parameters: verdict.parameters };
}

/**
 * Refuse a route with nothing behind it.
 *
 * A blank target gets its own error rather than the generic empty-key refusal because the two are found by
 * different people: an operator mistypes a scope, whereas a missing target is almost always a registration
 * assembled programmatically from a source that did not have one.
 */
function requireInternalTarget(capabilityKey: string, value: string): string {
  const target = normalizeKey(value);
  if (target.length === 0) throw new MissingInternalTargetError(capabilityKey);
  if (!isValidKey(target)) throw new InvalidGatewayKeyError("internal target", target);
  return target;
}

/** Refuse any edit to a retired route. The path is gone; nothing about it is worth correcting. */
function requireNotRetired(route: CapabilityRoute): void {
  if (route.status === "retired") throw new RouteRetiredError(route.id);
}

/** Refuse any change to the published surface of a route that is already serving calls. */
function requireDraft(route: CapabilityRoute): void {
  requireNotRetired(route);
  if (route.status !== "draft") {
    throw new InvalidRouteProgressionError(route.id, route.status, "draft");
  }
}

/**
 * Ask the lifecycle engine whether a status move is permitted, and raise the refusal it names.
 *
 * As with a contract, a retired route answers every question with the same fact, including the request to
 * retire it again. The engine's distinction between a resubmission and a finished record earns its keep for a
 * consumer, where the two have different remedies; for a path that has stopped answering they do not.
 */
function requireRouteTransition(route: CapabilityRoute, to: RouteStatus): void {
  const verdict = inspectRouteTransition(route.status, to);
  if (verdict.allowed) return;
  if (verdict.refusal === "terminal_status" || route.status === "retired") {
    throw new RouteRetiredError(route.id);
  }
  throw new InvalidRouteProgressionError(route.id, route.status, to);
}

// --- Registration ----------------------------------------------------------------

/**
 * Register a route as a draft. Nothing resolves to it until it is activated.
 *
 * The draft state is not ceremony. A route is registered by whoever is building the capability and activated
 * once the contract behind it is published, and those are usually two moments and sometimes two people. A
 * registration that went live immediately would make the window between *the path exists* and *the shape is
 * agreed* into a window in which the platform answers calls against a specification still being argued about.
 *
 * Nothing here refuses a second route for the same capability, version and method. This package holds no
 * directory of its own routes, and a uniqueness rule invented inside an aggregate would be a second opinion
 * about what exists; the service that owns the directory refuses the duplicate.
 */
export function registerCapabilityRoute(params: RegisterCapabilityRouteParams): CapabilityRoute {
  const capabilityKey = requireKey("capability", params.capabilityKey);
  const contractVersion = requireKey("contract version", params.contractVersion);
  const requiredScope = requireKey("scope", params.requiredScope);
  const internalTarget = requireInternalTarget(capabilityKey, params.internalTarget);
  const { path, parameters } = requireExternalPath(params.externalPath);

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    contractId: params.contractId,
    capabilityKey,
    contractVersion,
    method: params.method,
    externalPath: path,
    pathParameters: parameters,
    style: params.style,
    status: "draft",
    requiredScope,
    internalTarget,
    idempotent: !isMutatingMethod(params.method) || params.idempotencyGuarded,
    activatedAt: null,
    retiredAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Change the published surface of a draft: the path, the scope and the idempotency guarantee.
 *
 * The method is not revisable even here. It is half of what a route is addressed by, and a draft that changed
 * its own method would silently become a different route from the one a duplicate check already cleared.
 */
export function reviseCapabilityRoute(
  route: CapabilityRoute,
  params: ReviseCapabilityRouteParams,
): CapabilityRoute {
  requireDraft(route);
  const { path, parameters } = requireExternalPath(params.externalPath);

  return {
    ...route,
    externalPath: path,
    pathParameters: parameters,
    requiredScope: requireKey("scope", params.requiredScope),
    idempotent: !isMutatingMethod(route.method) || params.idempotencyGuarded,
    updatedAt: nowIso(),
  };
}

/**
 * Point the route at something else inside the platform, without changing anything the outside world sees.
 *
 * Permitted while the route is live, and that is the whole reason the indirection exists. The alternative —
 * requiring a route to be retired and re-registered to move a handler — would mean every internal refactor
 * costs an external migration, and the reliable consequence is that capabilities stop being refactored and
 * start being named after the modules that implement them.
 */
export function retargetCapabilityRoute(
  route: CapabilityRoute,
  internalTarget: string,
): CapabilityRoute {
  requireNotRetired(route);
  return {
    ...route,
    internalTarget: requireInternalTarget(route.capabilityKey, internalTarget),
    updatedAt: nowIso(),
  };
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Activate the route, so that calls resolve to it.
 *
 * The contract's status is a parameter rather than something this aggregate fetches, and it must be
 * `published`. Not `deprecated`: publishing a new path onto a version that is already on notice hands an
 * integrator something to build against and a sunset date for it in the same breath. Not `draft`: the shape is
 * not agreed. The two records are edited by different people at different times, which is exactly why the check
 * is here rather than left to the order in which somebody happens to click.
 */
export function activateCapabilityRoute(
  route: CapabilityRoute,
  contractStatus: ContractStatus,
): CapabilityRoute {
  requireRouteTransition(route, "active");
  if (contractStatus !== "published") {
    throw new RouteContractNotPublishedError(route.id, route.capabilityKey, route.contractVersion);
  }

  const now = nowIso();
  return { ...route, status: "active", activatedAt: now, updatedAt: now };
}

/**
 * Retire the route. The path stops resolving and the record stays.
 *
 * There is no deletion, and the reason is legibility rather than sentiment: every access log, every error
 * report and every integrator's support ticket refers to paths, and a platform that removed the row would be a
 * platform that cannot explain its own history to the people asking about it.
 */
export function retireCapabilityRoute(route: CapabilityRoute): CapabilityRoute {
  requireRouteTransition(route, "retired");
  const now = nowIso();
  return { ...route, status: "retired", retiredAt: now, updatedAt: now };
}

// --- Reading ---------------------------------------------------------------------

/** Whether the route resolves calls. */
export const isCapabilityRouteActive = (route: CapabilityRoute): boolean =>
  route.status === "active";

/**
 * Whether a caller must present an idempotency key.
 *
 * A read never needs one — repeating it changes nothing — so the question is only ever asked of a method that
 * mutates, and answered by whether the route was registered under the ledger's protection.
 */
export const routeRequiresIdempotencyKey = (route: CapabilityRoute): boolean =>
  isMutatingMethod(route.method) && route.idempotent;

/**
 * The route as the outside world is permitted to see it.
 *
 * The one boundary that matters in this file. Everything an integrator needs to call the capability crosses it;
 * the internal target does not, and neither does the contract id, which is a platform identifier that would
 * invite somebody to look it up.
 */
export const toPublicRouteView = (route: CapabilityRoute): PublicRouteView =>
  Object.freeze({
    capabilityKey: route.capabilityKey,
    contractVersion: route.contractVersion,
    method: route.method,
    externalPath: route.externalPath,
    status: route.status,
    requiredScope: route.requiredScope,
    style: route.style,
    idempotent: route.idempotent,
  });
