import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyGatewayKeyError,
  EndpointNotAvailableError,
  EndpointRetiredError,
  InvalidEndpointProgressionError,
  InvalidGatewayKeyError,
  MissingAdapterKeyError,
  PlaintextCredentialError,
} from "./errors";
import {
  CIRCUIT_QUARANTINE_AFTER_SECONDS,
  CREDENTIAL_PROVIDERS,
  type CircuitPosture,
  type EndpointHealth,
  type EndpointStatus,
  INITIAL_ENDPOINT_STATUS,
  type IntegrationProtocol,
  isCredentialReference,
  isValidKey,
  normalizeKey,
} from "./gateway-value";
import type { CircuitVerdict, EndpointView, OutcomeWindow } from "./gateway-view";
import { inspectEndpointTransition } from "./lifecycle";

/**
 * An integration endpoint: an external system the platform calls, and everything known about how that has gone.
 *
 * This is the outbound half of the fabric, and it is the record the adapter rule is enforced by. The endpoint
 * names a protocol and an adapter and never a vendor — `adapterKey` points at an implementation registered at
 * the composition root, and swapping a payment gateway or a messaging provider is a change of that one field
 * rather than a migration of everything that referred to the old one by name. Nothing in this file knows what a
 * vendor is, and that is what makes the swap cheap enough to actually perform when a contract ends.
 *
 * **Health is observed; status is decided.** The two live side by side on this record and only one of them ever
 * changes as a consequence of a call going badly. {@link applyCircuitVerdict} writes health, posture and the
 * failure counters, and it does not touch `status` — an endpoint stops being called only when a person or an
 * explicit quarantine says so. The alternative is a fabric in which a burst of timeouts during a vendor's
 * fifteen-minute incident silently takes an integration out of service, and the institution discovers it a week
 * later through the work that did not happen.
 *
 * **Quarantine and disablement are different facts, kept apart deliberately.** Quarantine is the platform's own
 * conclusion, reached when a circuit has stayed open long enough that the retries are costing both sides
 * capacity for nothing; disablement is an operator's decision, made for reasons the platform cannot see — an
 * agreement that ended, a migration in progress, a vendor asking to be left alone during their own incident.
 * Merging them into one *off* status would leave an operator with a list in which the endpoints they switched
 * off and the ones the fabric gave up on are indistinguishable, which is the difference between a record of
 * decisions and a list of unresolved failures. It is also why a disablement carries a required reason and a
 * quarantine does not: the reason for a quarantine is the posture, the health and the failure count already on
 * the record, and asking a machine to write prose about them would produce prose nobody reads.
 *
 * **The stamps record the current state, not a history.** Activation clears the quarantine and disablement
 * stamps and the disablement reason, because they describe an absence that has ended. What happened, in order,
 * belongs to the event stream, and an aggregate that accumulated every past absence in nullable columns would
 * offer an incomplete audit trail in the place people look for a complete one.
 */

// --- The aggregate ---------------------------------------------------------------

export interface IntegrationEndpoint {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** How every delivery, adapter binding and outcome record refers to this endpoint. Immutable. */
  readonly endpointKey: string;
  readonly displayName: string;
  /** The transport. Fixed at registration: a different transport is a different endpoint. */
  readonly protocol: IntegrationProtocol;
  /** The adapter implementation this endpoint is served through. The vendor sits behind it, never in front. */
  readonly adapterKey: string;
  /** A handle to the credential the adapter authenticates with, or null where none is needed. */
  readonly credentialRef: string | null;
  readonly status: EndpointStatus;
  readonly health: EndpointHealth;
  readonly posture: CircuitPosture;
  readonly consecutiveFailures: number;
  /** When the posture last changed. What a half-open probe is scheduled from. */
  readonly postureSince: ISODateString;
  /**
   * When the circuit last left `closed`, surviving the probe cycle that resets {@link postureSince}.
   *
   * Quarantine is a judgement about how long an endpoint has been failing, and an open circuit that probes
   * every minute moves `postureSince` every minute. Measured from that, no outage would ever be long enough.
   */
  readonly circuitOpenedAt: ISODateString | null;
  readonly lastOutcomeAt: ISODateString | null;
  /** When the endpoint was last put into service — not the first time, which `createdAt` answers. */
  readonly activatedAt: ISODateString | null;
  readonly quarantinedAt: ISODateString | null;
  readonly disabledAt: ISODateString | null;
  readonly disabledReason: string | null;
  readonly retiredAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RegisterIntegrationEndpointParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly endpointKey: string;
  readonly displayName: string;
  readonly protocol: IntegrationProtocol;
  readonly adapterKey: string;
  /**
   * A handle to the credential, or null.
   *
   * Required as an explicit null rather than omitted, because *this endpoint needs no credential* and *nobody
   * filled that field in* are different statements and only one of them should register an endpoint the
   * platform will authenticate to a third party without.
   */
  readonly credentialRef: string | null;
}

// --- Guards ----------------------------------------------------------------------

/** Normalise a key and refuse it if it is blank or does not fit the platform's grammar. */
function requireKey(kind: string, value: string): string {
  const key = normalizeKey(value);
  if (key.length === 0) throw new EmptyGatewayKeyError(kind);
  if (!isValidKey(key)) throw new InvalidGatewayKeyError(kind, key);
  return key;
}

/**
 * Refuse an endpoint with no adapter in front of it.
 *
 * A blank adapter gets its own error rather than the generic empty-key refusal because of what it means: an
 * endpoint bound to nothing is an external system the platform intends to call with no replaceable layer between
 * it and the domain, which is the one arrangement this contract exists to prevent.
 */
function requireAdapterKey(endpointKey: string, value: string): string {
  const key = normalizeKey(value);
  if (key.length === 0) throw new MissingAdapterKeyError(endpointKey);
  if (!isValidKey(key)) throw new InvalidGatewayKeyError("adapter key", key);
  return key;
}

/**
 * Refuse a credential that is not a handle to one, while permitting the absence of a credential.
 *
 * Blank collapses to null rather than to an error, and that is the one place the null is inferred rather than
 * stated: a whitespace-only handle resolves to nothing at the composition root, and storing it would leave an
 * endpoint that reads as credentialled in every listing and fails on every call.
 */
function requireCredentialRef(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (!isCredentialReference(trimmed)) {
    throw new PlaintextCredentialError("credentialRef", CREDENTIAL_PROVIDERS);
  }
  return trimmed;
}

/** Refuse any edit to a retired endpoint. The system is no longer called; nothing about it is worth correcting. */
function requireNotRetired(endpoint: IntegrationEndpoint): void {
  if (endpoint.status === "retired") throw new EndpointRetiredError(endpoint.id);
}

/**
 * Ask the lifecycle engine whether a status move is permitted, and raise the refusal it names.
 *
 * A resubmission collapses into the progression error rather than earning a type of its own, as it does for a
 * route. The distinction pays for itself where the two have different remedies — a consumer told *already
 * active* has submitted a form twice, and one told *not permitted* has misread the lifecycle. For an endpoint
 * being disabled twice there is nothing to tell apart: the endpoint is not being called either way.
 */
function requireEndpointTransition(endpoint: IntegrationEndpoint, to: EndpointStatus): void {
  const verdict = inspectEndpointTransition(endpoint.status, to);
  if (verdict.allowed) return;
  if (verdict.refusal === "terminal_status" || endpoint.status === "retired") {
    throw new EndpointRetiredError(endpoint.id);
  }
  throw new InvalidEndpointProgressionError(endpoint.id, endpoint.status, to);
}

// --- Registration ----------------------------------------------------------------

/**
 * Register an external system, as `registered` rather than as active.
 *
 * The gap between registering an endpoint and letting the platform call it is where the credential is placed in
 * the store the reference points at and somebody confirms the address belongs to who it is supposed to. An
 * endpoint that went live on registration would make the first call the platform ever makes to a third party
 * into the test of whether the configuration was right.
 *
 * Health starts at `unknown` and not at `healthy`. Nothing has been observed, and an endpoint that reported
 * itself well before anybody called it would put a green tick beside every integration that was configured and
 * then forgotten.
 */
export function registerIntegrationEndpoint(
  params: RegisterIntegrationEndpointParams,
): IntegrationEndpoint {
  const endpointKey = requireKey("endpoint", params.endpointKey);
  const adapterKey = requireAdapterKey(endpointKey, params.adapterKey);
  const credentialRef = requireCredentialRef(params.credentialRef);

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    endpointKey,
    displayName: params.displayName.trim(),
    protocol: params.protocol,
    adapterKey,
    credentialRef,
    status: INITIAL_ENDPOINT_STATUS,
    health: "unknown",
    posture: "closed",
    consecutiveFailures: 0,
    postureSince: now,
    circuitOpenedAt: null,
    lastOutcomeAt: null,
    activatedAt: null,
    quarantinedAt: null,
    disabledAt: null,
    disabledReason: null,
    retiredAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Change the label an operator sees. The key is what everything else refers to and does not move. */
export function renameIntegrationEndpoint(
  endpoint: IntegrationEndpoint,
  displayName: string,
): IntegrationEndpoint {
  requireNotRetired(endpoint);
  return { ...endpoint, displayName: displayName.trim(), updatedAt: nowIso() };
}

/**
 * Serve the endpoint through a different adapter, without changing anything that refers to it.
 *
 * Permitted while the endpoint is live, and this is the operation the whole indirection exists for. Replacing a
 * vendor, moving from a vendor's v1 client to their v2, or putting a recorded stub in front of an endpoint
 * during a rehearsal are all one field change here, and every subscription, delivery and outcome record keeps
 * pointing at the same endpoint key. A fabric that required re-registration to change an adapter would be a
 * fabric where vendors are never actually replaced.
 */
export function rebindEndpointAdapter(
  endpoint: IntegrationEndpoint,
  adapterKey: string,
): IntegrationEndpoint {
  requireNotRetired(endpoint);
  return {
    ...endpoint,
    adapterKey: requireAdapterKey(endpoint.endpointKey, adapterKey),
    updatedAt: nowIso(),
  };
}

/**
 * Point the endpoint at a different secret, or at none.
 *
 * The aggregate learns that the handle changed and not what it now resolves to, which is the same position the
 * consumer record takes and for the same reason: the material lives in the store the reference names, and an
 * aggregate that held it would be an aggregate that appears in every log line that ever serialises one.
 */
export function rotateEndpointCredential(
  endpoint: IntegrationEndpoint,
  credentialRef: string | null,
): IntegrationEndpoint {
  requireNotRetired(endpoint);
  return {
    ...endpoint,
    credentialRef: requireCredentialRef(credentialRef),
    updatedAt: nowIso(),
  };
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Put the endpoint into service, from registration, quarantine or disablement alike.
 *
 * The circuit is reset along with the status, and that is a decision rather than housekeeping. An operator
 * activating a quarantined endpoint is asserting that whatever was wrong has been dealt with — the credential
 * rotated, the address corrected, the vendor's incident closed — and leaving the old posture in place would
 * quarantine it again on the strength of failures that predate the fix, before enough new calls had been made to
 * outvote them.
 */
export function activateIntegrationEndpoint(endpoint: IntegrationEndpoint): IntegrationEndpoint {
  requireEndpointTransition(endpoint, "active");
  const now = nowIso();
  return {
    ...endpoint,
    status: "active",
    posture: "closed",
    consecutiveFailures: 0,
    postureSince: now,
    circuitOpenedAt: null,
    activatedAt: now,
    quarantinedAt: null,
    disabledAt: null,
    disabledReason: null,
    updatedAt: now,
  };
}

/**
 * Stop calling the endpoint because it has gone on failing.
 *
 * The platform's own conclusion, and the health it carries is left exactly as observed. Overwriting it with
 * something that meant *quarantined* would destroy the evidence for the quarantine at the moment it becomes the
 * thing an operator most needs to read.
 */
export function quarantineIntegrationEndpoint(endpoint: IntegrationEndpoint): IntegrationEndpoint {
  requireEndpointTransition(endpoint, "quarantined");
  const now = nowIso();
  return { ...endpoint, status: "quarantined", quarantinedAt: now, updatedAt: now };
}

/**
 * Stop calling the endpoint because somebody decided to, with a reason attached.
 *
 * The reason is required for the same cause a consumer's suspension reason is: this is a thing done to an
 * integration that somebody else will ask about, often weeks later, and an unexplained disablement is reliably
 * resolved by switching it back on to see what happens.
 */
export function disableIntegrationEndpoint(
  endpoint: IntegrationEndpoint,
  reason: string,
): IntegrationEndpoint {
  requireEndpointTransition(endpoint, "disabled");
  const trimmed = reason.trim();
  if (trimmed.length === 0) throw new EmptyGatewayKeyError("disablement reason");
  const now = nowIso();
  return {
    ...endpoint,
    status: "disabled",
    disabledAt: now,
    disabledReason: trimmed,
    updatedAt: now,
  };
}

/** End the integration. Terminal, from any status, and the record stays readable. */
export function retireIntegrationEndpoint(endpoint: IntegrationEndpoint): IntegrationEndpoint {
  requireEndpointTransition(endpoint, "retired");
  const now = nowIso();
  return { ...endpoint, status: "retired", retiredAt: now, updatedAt: now };
}

// --- Observation -----------------------------------------------------------------

/**
 * Record what a window of calls showed, without deciding anything about whether to keep making them.
 *
 * `circuitOpenedAt` is set on the first departure from `closed` and kept through every probe cycle afterwards,
 * which is what lets {@link isEndpointQuarantineDue} measure a real outage. It clears only on a return to
 * `closed`, so an endpoint that recovers starts its next outage's clock from that outage.
 *
 * `lastOutcomeAt` moves only when something was actually observed. A window with nothing in it is a window in
 * which nobody called the endpoint, and advancing the stamp for it would tell an operator the platform had heard
 * from a system it has not spoken to since Tuesday.
 */
export function applyCircuitVerdict(
  endpoint: IntegrationEndpoint,
  window: OutcomeWindow,
  verdict: CircuitVerdict,
): IntegrationEndpoint {
  requireNotRetired(endpoint);

  const circuitOpenedAt =
    verdict.posture === "closed" ? null : (endpoint.circuitOpenedAt ?? window.asOf);

  return {
    ...endpoint,
    health: verdict.health,
    posture: verdict.posture,
    consecutiveFailures: window.consecutiveFailures,
    postureSince: verdict.changed ? window.asOf : endpoint.postureSince,
    circuitOpenedAt,
    lastOutcomeAt: verdict.observed > 0 ? window.asOf : endpoint.lastOutcomeAt,
    updatedAt: nowIso(),
  };
}

// --- Reading ---------------------------------------------------------------------

/** Whether the fabric will send anything to this endpoint. Only one status is called. */
export const isIntegrationEndpointCallable = (endpoint: IntegrationEndpoint): boolean =>
  endpoint.status === "active";

/**
 * Refuse a call to an endpoint that is not in service, naming the status so the caller knows which it is.
 *
 * The key rather than the id, because this refusal reaches a delivery worker's logs and an operator's screen,
 * and an identifier that has to be looked up before the message means anything is an identifier that turns a
 * thirty-second diagnosis into a query.
 */
export function requireCallableEndpoint(endpoint: IntegrationEndpoint): void {
  if (!isIntegrationEndpointCallable(endpoint)) {
    throw new EndpointNotAvailableError(endpoint.endpointKey, endpoint.status);
  }
}

const MILLISECONDS_PER_SECOND = 1_000;

/**
 * Whether an endpoint has been failing long enough to stop being an incident and become somebody's task.
 *
 * Asked of the aggregate rather than answered by the circuit engine, because the engine sees one window and this
 * question spans every window since the circuit opened. Taking `asOf` as an argument keeps it as reproducible as
 * everything else here: the same record and the same instant give the same answer next year.
 *
 * Only an active endpoint qualifies. A quarantined one is already there, and a disabled one is not being called,
 * so the failures that would justify quarantining it are failures nobody caused.
 */
export function isEndpointQuarantineDue(
  endpoint: IntegrationEndpoint,
  asOf: ISODateString,
): boolean {
  if (endpoint.status !== "active" || endpoint.circuitOpenedAt === null) return false;
  const openFor = Date.parse(asOf) - Date.parse(endpoint.circuitOpenedAt);
  return openFor >= CIRCUIT_QUARANTINE_AFTER_SECONDS * MILLISECONDS_PER_SECOND;
}

/**
 * The endpoint as an operator sees it.
 *
 * The credential handle does not cross, and this is where the projection differs from a consumer's. A consumer's
 * handle is shown because rotating it is an operator's job; an endpoint's authenticates the *platform* to
 * somebody else's system, and the set of people who need to see an endpoint's health is far wider than the set
 * who should be told which vault entry the institution's own outbound credential lives in.
 */
export const toEndpointView = (endpoint: IntegrationEndpoint): EndpointView =>
  Object.freeze({
    endpointId: endpoint.id,
    endpointKey: endpoint.endpointKey,
    displayName: endpoint.displayName,
    protocol: endpoint.protocol,
    adapterKey: endpoint.adapterKey,
    status: endpoint.status,
    health: Object.freeze({
      health: endpoint.health,
      posture: endpoint.posture,
      consecutiveFailures: endpoint.consecutiveFailures,
      lastOutcomeAt: endpoint.lastOutcomeAt,
    }),
  });
