import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  BindingNotDrainedError,
  BindingRetiredError,
  EmptyMeshKeyError,
  InvalidBindingProgressionError,
  InvalidMeshCountError,
  InvalidMeshKeyError,
  PlaintextTransportCredentialError,
} from "./errors";
import { inspectBindingTransition } from "./lifecycle";
import {
  type BindingStatus,
  DEFAULT_TRANSPORT_KIND,
  INITIAL_BINDING_STATUS,
  TRANSPORT_REF_PROVIDERS,
  type TransportKind,
  type TransportRefProvider,
  isBindingCarrying,
  isBindingDraining,
  isTransportReference,
  isValidKey,
  normalizeKey,
} from "./mesh-value";

/**
 * A binding: which backbone one stream travels on, and the handle the settings for it are resolved from.
 *
 * This aggregate is a *declaration* and not a client. Nothing in this package speaks Kafka, AMQP or any other
 * protocol; a binding records the intent, the composition root supplies the transport that implements it, and
 * that indirection is what makes a backbone swap a governed operation rather than a redeployment of every
 * publisher. It is also why the record holds a reference rather than a configuration: the settings a broker
 * client is built from change on a different schedule from the decision about which broker to use, and a
 * platform that stored them together would make rotating a password an edit to an institutional record.
 *
 * **The stream and the transport are both immutable, and there is no operation that changes either.** A binding
 * is the pairing; a different pairing is a different binding. The reason is not tidiness, it is that a swap has
 * to be observable. Two rows — the old one draining, the new one active — say what happened and when, and can
 * be reversed by activating the first again. One row whose `transport` column was updated says only that the
 * stream is on Kafka now, and the question an operator asks after an incident is what it was on before.
 *
 * **Exactly one binding per stream carries at a time, and this aggregate cannot enforce it.** Sequences are per
 * stream and gapless, so two backbones carrying concurrently means two writers handing out the same numbers to
 * different messages, and every checkpoint in the tenant becomes a position in a sequence that identifies
 * nothing. Whether another binding on this stream is already active is a question about what else the tenant
 * holds; this package keeps no directory of its own bindings, and {@link activateStreamBinding} therefore
 * checks the transition and nothing else. `BindingAlreadyActiveError` belongs to the service that can look.
 *
 * **Draining is mandatory and `active` to `retired` is not an edge.** A binding being replaced stops accepting
 * new messages and keeps delivering what it already accepted, and only then retires. The alternative — a
 * binding that goes straight to retired — loses whatever was in flight at that instant, which is precisely the
 * outage a migration exists to avoid, and it loses it silently, because a message that was never delivered
 * leaves no record on the consumer that was supposed to receive it. {@link retireStreamBinding} therefore takes
 * the count of what is still undelivered and refuses while it is anything but nought.
 *
 * Whether a deployment can actually serve the backbone a binding names is likewise not decidable here.
 * `TransportNotAvailableError` is raised where the transports are registered, which is the composition root.
 */

// --- The aggregate ---------------------------------------------------------------

export interface StreamBinding {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The stream this binding carries, by key. Immutable: a different stream is a different binding. */
  readonly streamKey: string;
  /** The backbone it travels on. Immutable: a different backbone is a different binding, and a drained swap. */
  readonly transport: TransportKind;
  /** The handle the transport's settings are resolved from, e.g. `config:kafka-primary`. Never the settings. */
  readonly transportRef: string;
  readonly status: BindingStatus;
  /** When the binding first began carrying. Null until it is activated, and never cleared afterwards. */
  readonly activatedAt: ISODateString | null;
  readonly activatedBy: Uuid | null;
  /** When it stopped accepting new messages and began catching its consumers up. Null unless it has drained. */
  readonly drainingSince: ISODateString | null;
  readonly retiredAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DeclareStreamBindingParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly streamKey: string;
  /** Defaults to the transactional outbox: the only backbone that is crash-safe without a second system. */
  readonly transport?: TransportKind;
  readonly transportRef: string;
}

// --- Guards ----------------------------------------------------------------------

/** Normalise a key and refuse it if it is blank or does not fit the platform's grammar. */
function requireKey(kind: string, value: string): string {
  const key = normalizeKey(value);
  if (key.length === 0) throw new EmptyMeshKeyError(kind);
  if (!isValidKey(key)) throw new InvalidMeshKeyError(kind, key);
  return key;
}

/**
 * Refuse a transport reference that is the connection settings rather than a handle to them.
 *
 * One refusal for every way of getting this wrong, including a blank one, because the remedy is the same
 * sentence in every case: this field takes `provider:name`. The error is the package's only one that withholds
 * its input, and the guard is written to keep that promise — the rejected value is not interpolated into any
 * message here, is not normalised into a key, and does not reach a `details` object. A pasted broker password
 * that fails this check leaves no trace of itself in the refusal, which is the entire point of the check.
 *
 * Case is preserved rather than lowercased. A vault path is a path, and `secretstore:Kafka/Prod` and
 * `secretstore:kafka/prod` are two different secrets on most of the stores anybody would put behind this.
 */
function requireTransportRef(value: string): string {
  const reference = value.trim();
  if (!isTransportReference(reference)) {
    throw new PlaintextTransportCredentialError("transportRef", TRANSPORT_REF_PROVIDERS);
  }
  return reference;
}

/** Refuse a change to a binding that is finished. A retired binding is read, never re-pointed. */
function requireNotRetired(binding: StreamBinding): void {
  if (binding.status === "retired") {
    throw new BindingRetiredError(binding.id);
  }
}

/**
 * Ask the lifecycle engine whether a status move is permitted, and raise the refusal it names.
 *
 * A retired binding gets its own error, which also covers the engine's `same_status` refusal once the binding
 * is retired. Everything else is a progression error carrying both ends of the move, because the two requests
 * that land here most often — retiring an active binding without draining it, and activating a draining one —
 * are both cases where the caller needs to be told which edge they were missing rather than that they failed.
 */
function requireBindingTransition(binding: StreamBinding, to: BindingStatus): void {
  const verdict = inspectBindingTransition(binding.status, to);
  if (verdict.allowed) return;
  if (verdict.refusal === "terminal_status" || binding.status === "retired") {
    throw new BindingRetiredError(binding.id);
  }
  throw new InvalidBindingProgressionError(binding.id, binding.status, to);
}

/**
 * Refuse a retirement while the binding still holds messages nobody has received.
 *
 * The count arrives as an argument rather than being read here, because what is undelivered is a fact about
 * the message store and this package holds no store. That makes the guard honest about what it is: the caller
 * has to have counted, and a caller that passes nought without looking has made a decision rather than
 * inherited a default. A count that is not a count is an internal fault and not a refusal, which is why it
 * raises the package's fault error rather than the operational one.
 */
function requireDrained(binding: StreamBinding, undeliveredMessages: number): void {
  if (!Number.isInteger(undeliveredMessages) || undeliveredMessages < 0) {
    throw new InvalidMeshCountError(
      "undelivered message count",
      undeliveredMessages,
      "must be a whole, non-negative count of messages still to be delivered",
    );
  }
  if (undeliveredMessages > 0) {
    throw new BindingNotDrainedError(binding.id, undeliveredMessages);
  }
}

// --- Definition ------------------------------------------------------------------

/**
 * Declare a binding. It carries nothing until it is activated.
 *
 * The declared state is what makes a swap safe to prepare: the new binding is written, reviewed and resolved
 * against the composition root while the old one is still carrying, and the cutover is two status changes
 * rather than an insert nobody had a chance to check. It is also why there is no parameter that activates on
 * creation — the one operation that must never happen by default is a second backbone starting to carry.
 *
 * @throws {EmptyMeshKeyError} when the stream key is blank.
 * @throws {InvalidMeshKeyError} when it does not fit the platform's grammar.
 * @throws {PlaintextTransportCredentialError} when the reference looks like the settings rather than a handle.
 */
export function declareStreamBinding(params: DeclareStreamBindingParams): StreamBinding {
  const streamKey = requireKey("stream", params.streamKey);
  const transportRef = requireTransportRef(params.transportRef);

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    streamKey,
    transport: params.transport ?? DEFAULT_TRANSPORT_KIND,
    transportRef,
    status: INITIAL_BINDING_STATUS,
    activatedAt: null,
    activatedBy: null,
    drainingSince: null,
    retiredAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Re-point the binding at a different handle for the same backbone.
 *
 * Permitted while the binding is carrying, and the reason is that the alternative is worse. A reference is how
 * a credential is rotated and how a settings bundle is renamed, and a platform that made either of those
 * require a drain and a new binding would get deployments that never rotate anything. So this is the one field
 * on the record that moves, and it moves under a rule the aggregate cannot check: **the new reference must
 * resolve to the same backbone.** Pointing a carrying binding at a different cluster is a swap performed
 * without a drain, and it loses whatever is in flight exactly as retiring an undrained binding would — with
 * the difference that nothing here can tell the two apart, because both are a string that parses.
 *
 * @throws {BindingRetiredError} when the binding is finished, and resolves to nothing either way.
 * @throws {PlaintextTransportCredentialError} when the new reference looks like the settings themselves.
 */
export function retargetStreamBinding(binding: StreamBinding, transportRef: string): StreamBinding {
  requireNotRetired(binding);
  return {
    ...binding,
    transportRef: requireTransportRef(transportRef),
    updatedAt: nowIso(),
  };
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Begin carrying the stream on this backbone.
 *
 * Reachable only from `declared`, and deliberately not from `draining`. A draining binding is one somebody
 * decided to replace, and un-deciding it by reactivating the same row would leave the stream with two active
 * bindings for as long as it took to notice the replacement was already carrying. The way back is to drain the
 * replacement and activate a fresh binding, which is the same operation as any other swap and leaves the same
 * record of itself.
 *
 * @throws {BindingRetiredError} when the binding is finished.
 * @throws {InvalidBindingProgressionError} when it is already carrying or is draining.
 */
export function activateStreamBinding(binding: StreamBinding, activatedBy: Uuid): StreamBinding {
  requireBindingTransition(binding, "active");
  const now = nowIso();
  return {
    ...binding,
    status: "active",
    activatedAt: now,
    activatedBy,
    updatedAt: now,
  };
}

/**
 * Stop accepting new messages, and keep delivering the ones already accepted.
 *
 * The step that makes a swap survivable, and a status rather than a flag because it is a state the mesh has to
 * be able to report on: *how long has this been draining* is the question an operator asks while waiting, and
 * it is answerable from `drainingSince` without a log having been kept. Reachable only from `active`, since a
 * binding that never carried has nothing to drain and retires directly.
 *
 * @throws {BindingRetiredError} when the binding is finished.
 * @throws {InvalidBindingProgressionError} when it is not carrying, so there is nothing in flight to drain.
 */
export function drainStreamBinding(binding: StreamBinding): StreamBinding {
  requireBindingTransition(binding, "draining");
  const now = nowIso();
  return { ...binding, status: "draining", drainingSince: now, updatedAt: now };
}

/**
 * Close the binding permanently, once nothing is left in flight on it.
 *
 * Terminal, and reachable from `declared` — which is how a binding that will never carry is withdrawn — and
 * from `draining`. Not from `active`, which is the lifecycle's whole opinion: a binding that is carrying has
 * to stop accepting before it can stop delivering, and the two are separate operations because the interval
 * between them is where the in-flight messages get to arrive.
 *
 * The status is checked before the count, so a binding that is already retired is told so rather than being
 * asked to drain something it no longer holds.
 *
 * @throws {BindingRetiredError} when the binding is already finished.
 * @throws {InvalidBindingProgressionError} when it is still carrying and has not been drained first.
 * @throws {BindingNotDrainedError} when messages it accepted have not yet been delivered.
 * @throws {InvalidMeshCountError} when the undelivered count is not a whole, non-negative number.
 */
export function retireStreamBinding(
  binding: StreamBinding,
  undeliveredMessages: number,
): StreamBinding {
  requireBindingTransition(binding, "retired");
  requireDrained(binding, undeliveredMessages);
  const now = nowIso();
  return { ...binding, status: "retired", retiredAt: now, updatedAt: now };
}

// --- Reading ---------------------------------------------------------------------

/** Carrying new publications: active, and nothing else. At most one binding per stream is ever here. */
export const isStreamBindingCarrying = (binding: StreamBinding): boolean =>
  isBindingCarrying(binding.status);

/** Still delivering what it accepted, and accepting nothing further. The state a swap waits on. */
export const isStreamBindingDraining = (binding: StreamBinding): boolean =>
  isBindingDraining(binding.status);

/**
 * The provider the binding's reference resolves through, so a caller picks a resolver without re-parsing.
 *
 * The assertion is sound because {@link requireTransportRef} is the only way a reference reaches the record
 * and it accepts nothing whose prefix is outside {@link TRANSPORT_REF_PROVIDERS}. It exists so that the
 * composition root, which is where the resolvers live, reads the provider off one function rather than
 * splitting the string at four call sites that would each handle a missing colon differently.
 */
export const bindingTransportProvider = (binding: StreamBinding): TransportRefProvider =>
  binding.transportRef.slice(0, binding.transportRef.indexOf(":")) as TransportRefProvider;
