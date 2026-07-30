import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  ConsumerAlreadyInStatusError,
  ConsumerRetiredError,
  EmptyGatewayKeyError,
  EmptyScopeGrantError,
  InvalidConsumerProgressionError,
  InvalidGatewayKeyError,
  PlaintextCredentialError,
} from "./errors";
import {
  type AuthScheme,
  CREDENTIAL_PROVIDERS,
  type ConsumerStatus,
  INITIAL_CONSUMER_STATUS,
  isCredentialReference,
  isValidKey,
  normalizeKey,
} from "./gateway-value";
import type { ConsumerView } from "./gateway-view";
import { inspectConsumerTransition } from "./lifecycle";

/**
 * An API consumer: an external system the institution has agreed to answer, and the record of what it may ask
 * for.
 *
 * Every call that reaches this platform from outside arrives as one of these, which makes the aggregate the
 * place where three otherwise separate questions become one record: who is calling, what they are allowed to
 * reach, and who inside the institution is accountable for the fact that they can. Most integrations fail
 * governance on the third. A key is issued during a project, the project ends, the person who arranged it
 * leaves, and what remains is a credential with live access and nobody to ask about it — discovered during an
 * incident rather than during a review. {@link ApiConsumer.ownerId} is not nullable for that reason.
 *
 * **The credential is a reference and never the credential.** {@link registerApiConsumer} and
 * {@link rotateConsumerCredential} both refuse anything that does not look like a handle — `vault:<name>`,
 * `kms:<name>` and the other providers in {@link CREDENTIAL_PROVIDERS} — and the refusal deliberately does not
 * echo the rejected value back, because by the time it is refused it may well be a live key and the error would
 * write it to the log the check exists to keep it out of. The secret itself is resolved at the composition root
 * and this package never holds one.
 *
 * **Scopes are checked for grammar here and for existence elsewhere.** A grant that names a scope the platform
 * does not issue is worse than granting nothing, because it looks granted and every check downstream compares
 * against a string no route will ever require. But whether a scope exists is a question about the platform's
 * catalogue rather than about this consumer, and an aggregate that answered it would be holding a second
 * opinion about what the platform issues. What is enforced here is that a grant names at least one scope and
 * that each one is well formed; the service resolves them against the catalogue before calling in.
 *
 * **Suspension is reversible and retirement is not.** The two exist separately because they mean different
 * things to the person on the other end: suspension is a conversation that is expected to resume, retirement is
 * the end of an integration. See {@link inspectConsumerTransition} for the map.
 */

// --- The aggregate ---------------------------------------------------------------

export interface ApiConsumer {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** How policies, grants, logs and quota ledgers all refer to this integration. Immutable. */
  readonly consumerKey: string;
  /** What an operator sees in a list. Revisable: it is a label rather than an identifier. */
  readonly displayName: string;
  /** How the caller proves who they are. Fixed at registration; changing it is a new consumer. */
  readonly authScheme: AuthScheme;
  /** A handle to the secret, never the secret. Rotatable; see {@link rotateConsumerCredential}. */
  readonly credentialRef: string;
  /** The scopes this consumer holds, normalised and deduplicated, in the order they were granted. */
  readonly grantedScopes: readonly string[];
  readonly status: ConsumerStatus;
  /** The person accountable for this integration existing. Never `null`: that is the point of the field. */
  readonly ownerId: Uuid;
  /** Who performed the registration. `null` for one provisioned by an automated onboarding step. */
  readonly registeredBy: Uuid | null;
  /** Why the consumer was last suspended, for the conversation that follows. `null` when it never was. */
  readonly suspensionReason: string | null;
  readonly activatedAt: ISODateString | null;
  readonly suspendedAt: ISODateString | null;
  readonly retiredAt: ISODateString | null;
  /** When the credential reference last changed. `null` until it does; a rotation audit reads this. */
  readonly rotatedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RegisterApiConsumerParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly consumerKey: string;
  readonly displayName: string;
  readonly authScheme: AuthScheme;
  readonly credentialRef: string;
  /** At least one, each well formed. Resolved against the platform's catalogue before this is called. */
  readonly grantedScopes: readonly string[];
  readonly ownerId: Uuid;
  readonly registeredBy: Uuid | null;
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
 * Refuse a credential that is not a handle to one.
 *
 * The check is deliberately structural rather than heuristic: a value is accepted when it names one of the
 * providers the platform resolves and carries a name after it, and refused otherwise. A cleverer test that tried
 * to recognise *secret-looking* strings would pass the first API key shaped like a word.
 */
function requireCredentialReference(field: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new EmptyGatewayKeyError(field);
  if (!isCredentialReference(trimmed)) {
    throw new PlaintextCredentialError(field, CREDENTIAL_PROVIDERS);
  }
  return trimmed;
}

/**
 * Normalise a set of scopes, refusing an empty grant and any member that is malformed.
 *
 * Duplicates are dropped rather than refused. A caller that sends the same scope twice has asked for exactly
 * what a caller that sent it once asked for, and failing the request would be a rule about tidiness enforced as
 * though it were a rule about access.
 */
function requireScopes(consumerKey: string, scopes: readonly string[]): readonly string[] {
  if (scopes.length === 0) throw new EmptyScopeGrantError(consumerKey);
  const normalised: string[] = [];
  for (const scope of scopes) {
    const value = requireKey("scope", scope);
    if (!normalised.includes(value)) normalised.push(value);
  }
  if (normalised.length === 0) throw new EmptyScopeGrantError(consumerKey);
  return Object.freeze(normalised);
}

/** Refuse any edit to a retired consumer. Retirement is the end, including for the harmless-looking edits. */
function requireNotRetired(consumer: ApiConsumer): void {
  if (consumer.status === "retired") throw new ConsumerRetiredError(consumer.id);
}

/**
 * Ask the lifecycle engine whether a status move is permitted, and raise the refusal it names.
 *
 * Three refusals get three error types because they have three different remedies and only one of them is a
 * genuine mistake. Being told a consumer is already active is a form submitted twice. Being told it is retired
 * says no remedy exists and a new registration is the way forward. Only the third is a caller asking the
 * lifecycle for a move it does not contain.
 */
function requireConsumerTransition(consumer: ApiConsumer, to: ConsumerStatus): void {
  const verdict = inspectConsumerTransition(consumer.status, to);
  if (verdict.allowed) return;
  if (verdict.refusal === "same_status") {
    throw new ConsumerAlreadyInStatusError(consumer.id, consumer.status);
  }
  if (verdict.refusal === "terminal_status") throw new ConsumerRetiredError(consumer.id);
  throw new InvalidConsumerProgressionError(consumer.id, consumer.status, to);
}

// --- Registration ----------------------------------------------------------------

/**
 * Register an external system, as `registered` rather than as active.
 *
 * There is no parameter that skips the first status, and the gap between registering an integration and letting
 * it call is where the institution's own review happens: the scopes are read by somebody other than the person
 * who asked for them, the owner is confirmed to still work here, and the credential is placed in the store the
 * reference points at. A registration that arrived already able to call would collapse all three into whoever
 * filled in the form.
 *
 * Nothing here refuses a duplicate key. This package holds no directory of its own consumers, and a uniqueness
 * check invented inside an aggregate would be a second opinion about what exists.
 */
export function registerApiConsumer(params: RegisterApiConsumerParams): ApiConsumer {
  const consumerKey = requireKey("consumer", params.consumerKey);
  const credentialRef = requireCredentialReference("credentialRef", params.credentialRef);
  const grantedScopes = requireScopes(consumerKey, params.grantedScopes);

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    consumerKey,
    displayName: params.displayName.trim(),
    authScheme: params.authScheme,
    credentialRef,
    grantedScopes,
    status: INITIAL_CONSUMER_STATUS,
    ownerId: params.ownerId,
    registeredBy: params.registeredBy,
    suspensionReason: null,
    activatedAt: null,
    suspendedAt: null,
    retiredAt: null,
    rotatedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Change the label an operator sees. The key is what everything else refers to and does not move. */
export function renameApiConsumer(consumer: ApiConsumer, displayName: string): ApiConsumer {
  requireNotRetired(consumer);
  return { ...consumer, displayName: displayName.trim(), updatedAt: nowIso() };
}

/**
 * Hand ownership to somebody else.
 *
 * Its own operation rather than a field on a general edit, because this is the transfer that keeps an
 * integration governable when the person who arranged it moves on, and it is the one that gets skipped when it
 * is buried in a form with seven other fields.
 */
export function reassignApiConsumer(consumer: ApiConsumer, ownerId: Uuid): ApiConsumer {
  requireNotRetired(consumer);
  return { ...consumer, ownerId, updatedAt: nowIso() };
}

// --- Credentials -----------------------------------------------------------------

/**
 * Point the consumer at a different secret.
 *
 * The aggregate learns that a rotation happened and when; it does not learn what rotated, and could not, because
 * what it holds is a reference. `rotatedAt` exists so that a credential-age review has something to read — the
 * question *which of our integrations is still on the key it was issued in 2023* has no answer at all without
 * it, and it is the question that finds the ones nobody has looked at.
 */
export function rotateConsumerCredential(
  consumer: ApiConsumer,
  credentialRef: string,
): ApiConsumer {
  requireNotRetired(consumer);
  const next = requireCredentialReference("credentialRef", credentialRef);
  const now = nowIso();
  return { ...consumer, credentialRef: next, rotatedAt: now, updatedAt: now };
}

// --- Scopes ----------------------------------------------------------------------

/**
 * Add scopes to what the consumer already holds.
 *
 * Additive rather than replacing, and separate from {@link revokeConsumerScopes}, because a single set-the-whole-
 * list operation makes every widening and every narrowing look identical in the audit trail. What an institution
 * needs to be able to ask afterwards is when a consumer gained the ability to read student records, and a log of
 * full-list replacements answers that only by diffing consecutive rows.
 */
export function grantConsumerScopes(consumer: ApiConsumer, scopes: readonly string[]): ApiConsumer {
  requireNotRetired(consumer);
  const additions = requireScopes(consumer.consumerKey, scopes);
  const merged = [...consumer.grantedScopes];
  for (const scope of additions) {
    if (!merged.includes(scope)) merged.push(scope);
  }
  return { ...consumer, grantedScopes: Object.freeze(merged), updatedAt: nowIso() };
}

/**
 * Take scopes away.
 *
 * Revoking something the consumer never held is not an error. The caller's intent is that the consumer should
 * not hold it, and that intent is satisfied; refusing would turn a safe corrective action into one an operator
 * has to check the current state before performing, during an incident, which is when this is used.
 *
 * A revocation may empty the grant, and that is permitted. A consumer with no scopes is refused everywhere,
 * which is a coherent and occasionally exactly correct position to put an integration in while a question about
 * it is answered — and it is honest in a way that leaving one harmless scope behind would not be.
 */
export function revokeConsumerScopes(
  consumer: ApiConsumer,
  scopes: readonly string[],
): ApiConsumer {
  requireNotRetired(consumer);
  const removals = requireScopes(consumer.consumerKey, scopes);
  const remaining = consumer.grantedScopes.filter((scope) => !removals.includes(scope));
  return { ...consumer, grantedScopes: Object.freeze(remaining), updatedAt: nowIso() };
}

// --- Lifecycle -------------------------------------------------------------------

/** Let the consumer call. Clears any suspension reason: it no longer describes the current state. */
export function activateApiConsumer(consumer: ApiConsumer): ApiConsumer {
  requireConsumerTransition(consumer, "active");
  const now = nowIso();
  return {
    ...consumer,
    status: "active",
    suspensionReason: null,
    activatedAt: now,
    updatedAt: now,
  };
}

/**
 * Stop serving the consumer, with a reason attached.
 *
 * The reason is required rather than optional. A suspension is a thing done to somebody who will ask why, often
 * days later and often to a person who was not the one who did it, and an unexplained suspension is reliably
 * resolved by reactivating the consumer to see what happens.
 */
export function suspendApiConsumer(consumer: ApiConsumer, reason: string): ApiConsumer {
  requireConsumerTransition(consumer, "suspended");
  const trimmed = reason.trim();
  if (trimmed.length === 0) throw new EmptyGatewayKeyError("suspension reason");
  const now = nowIso();
  return {
    ...consumer,
    status: "suspended",
    suspensionReason: trimmed,
    suspendedAt: now,
    updatedAt: now,
  };
}

/** End the integration. Terminal, from any status, and there is no way back to any of them. */
export function retireApiConsumer(consumer: ApiConsumer): ApiConsumer {
  requireConsumerTransition(consumer, "retired");
  const now = nowIso();
  return { ...consumer, status: "retired", retiredAt: now, updatedAt: now };
}

// --- Reading ---------------------------------------------------------------------

/** Registered and reviewed and allowed to call. The only status that is served. */
export const isApiConsumerActive = (consumer: ApiConsumer): boolean => consumer.status === "active";

/** Stopped for now, with a reason, and expected to resume. */
export const isApiConsumerSuspended = (consumer: ApiConsumer): boolean =>
  consumer.status === "suspended";

/** Finished. Kept readable because the traffic it made and the access it held are part of the record. */
export const isApiConsumerRetired = (consumer: ApiConsumer): boolean =>
  consumer.status === "retired";

/** Whether the consumer holds a scope. Compared against the normalised form, as grants are stored. */
export const consumerHoldsScope = (consumer: ApiConsumer, scope: string): boolean =>
  consumer.grantedScopes.includes(normalizeKey(scope));

/**
 * The consumer as an operator is permitted to see it.
 *
 * `credentialRef` crosses and the secret does not, because the handle is operational information an
 * administrator needs in order to rotate the thing it points at. Everything else omitted here — the owner, the
 * suspension reason, the timestamps — is available through the record itself to callers inside the platform;
 * this is the shape that is safe to hand outward.
 */
export const toConsumerView = (consumer: ApiConsumer): ConsumerView => ({
  consumerId: consumer.id,
  consumerKey: consumer.consumerKey,
  displayName: consumer.displayName,
  authScheme: consumer.authScheme,
  credentialRef: consumer.credentialRef,
  grantedScopes: consumer.grantedScopes,
  status: consumer.status,
});
