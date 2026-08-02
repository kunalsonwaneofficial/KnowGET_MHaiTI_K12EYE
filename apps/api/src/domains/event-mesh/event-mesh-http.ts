import type { Principal } from "@knowget/auth";
import { TRANSPORT_KINDS, type TransportKind } from "@knowget/event-mesh";
import { ValidationError } from "@knowget/exceptions";
import { isUuid } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * Permissions gating the event mesh surface (P3-D02). Six scopes, and the split follows the questions the domain
 * itself keeps separate: what the platform carries, where it is carried to, who may put a fact on it, who keeps
 * it running, and who may make history happen a second time.
 *
 * `mesh:read` is the mesh's own account of itself: event types and their schemas, streams and their partitioning,
 * bindings, subscriptions and their filters, message headers, checkpoints and lag, dead letters and replays. Wide
 * on purpose, because an institution that cannot see which facts leave it, on what channel and to whom has no
 * event governance at all — and narrow in exactly one place, which is that it does not include a message body.
 * Knowing that an enrolment was confirmed and being handed what was written about the learner are different
 * permissions, and this domain is the one place where the second is available in bulk.
 *
 * `mesh:govern` is the vocabulary and the channels: defining, revising, publishing, deprecating and retiring an
 * event type, and defining, repartitioning, re-retaining, accepting into, withdrawing from, activating, pausing
 * and retiring a stream. This is the scope that decides what the platform is willing to say and for how long it
 * will remember saying it. Retention lives here rather than with the operators because how long institutional
 * facts are kept is a decision an institution makes once and answers for afterwards, not a dial an on-call rota
 * turns; and publishing an event type is the moment a schema stops being a draft and becomes something consumers
 * elsewhere in the platform are entitled to rely on.
 *
 * `mesh:deliver` is the arrangement scope: declaring, retargeting, activating, draining and retiring a stream
 * binding, and registering, refiltering, re-terming, activating, pausing and retiring a subscription. Both halves
 * answer *where does this end up*, which is why they share a key — a binding names the backbone that carries a
 * stream and a subscription names who reads from it, and together they are the whole path a fact travels after
 * the mesh accepts it. Kept apart from `mesh:govern` because a binding to an outside broker is an egress path:
 * the person who decides that attendance is a fact the platform records is not automatically the person who
 * decides that attendance leaves the building.
 *
 * `mesh:publish` is one operation — recording a message — and it is alone because of who holds it. Every
 * producing capability in the platform needs it, which makes it the most widely issued key in this domain, and a
 * key that widely issued must not carry the power to define a stream, rewire a transport or add a consumer. A
 * publisher's blast radius should be the facts it publishes.
 *
 * `mesh:operate` is the running mesh: opening, committing and resetting a checkpoint; recording, replaying and
 * discarding a dead letter; forgetting a message body and sweeping a stream's retention. None of it changes what
 * the platform carries or where it goes — a checkpoint moves a consumer through work it was already entitled to,
 * a dead-lettered delivery completing late is a delivery that was already authorised, and the sweep and the
 * single forget are the platform honouring a promise `mesh:govern` made on its behalf. Deciding how long a body
 * is kept is governance; actually forgetting it is operations, and the two should not be one key.
 *
 * `mesh:replay` is requesting, approving, rejecting, cancelling, starting, completing and failing a replay, and
 * it is also the only way to read a retained message body. It is separate from `mesh:operate` because a replay is
 * the one act here that delivers facts a consumer has already acted on, and every consumer downstream was written
 * to read a stream forwards; the damage is not an error anybody sees but a projection in a state no sequence of
 * real events could have produced. The body read belongs with it rather than with `mesh:read` for the same
 * reason — the two honest reasons to open a stored payload are deciding whether a window is worth replaying and
 * working out why a consumer choked on it, and both of those are this scope's business. Requesting and approving
 * share the key because the two-person rule is enforced by the aggregate, which refuses an approver who is the
 * requester; the control is a second person rather than a second permission.
 */
export const MESH_READ = "mesh:read";
export const MESH_GOVERN = "mesh:govern";
export const MESH_DELIVER = "mesh:deliver";
export const MESH_PUBLISH = "mesh:publish";
export const MESH_OPERATE = "mesh:operate";
export const MESH_REPLAY = "mesh:replay";

interface ZodLike<T> {
  safeParse: (
    value: unknown,
  ) => { success: true; data: T } | { success: false; error: { issues: unknown } };
}

/** Parse a request body with a zod schema, mapping failure to a 400 ValidationError. */
export function parseBody<T>(schema: ZodLike<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError("Invalid request body", { details: { issues: result.error.issues } });
  }
  return result.data;
}

/** The tenant of the current principal, or a 400 when none is associated. */
export function tenantOf(principal: Principal): TenantId {
  if (!principal.tenantId) {
    throw new ValidationError("No tenant is associated with the current principal");
  }
  return principal.tenantId;
}

/**
 * The person the institution will be held to — who published a schema, who activated a stream, who pointed a
 * binding at a different broker, who switched a consumer on, who rewound a checkpoint, who asked for a month of
 * history to be delivered again and who agreed to it.
 *
 * Taken from the authenticated principal and never from the body, anywhere in this domain. The replay approval is
 * where that matters most and where it would be easiest to get wrong. A replay may not be approved by the person
 * who asked for it, and the aggregate enforces that by comparing the approver against the requester — so an
 * `approvedBy` a caller could type in would not merely record the wrong name, it would defeat the rule outright.
 * Whoever wanted a term of history re-delivered could name a colleague, and the platform would have a signed
 * record of a decision that colleague never made.
 *
 * An unidentifiable principal is refused here rather than recorded as nobody. The aggregates do admit `null`
 * attribution, because a completion, a failure and a retention sweep genuinely have no person behind them — but
 * that is a decision for a background worker to make, not something an authenticated HTTP request should produce.
 */
export function actorOf(principal: Principal): Uuid {
  const actor = principal.id.trim();
  if (!actor || !isUuid(actor)) {
    throw new ValidationError("No user is associated with the current principal");
  }
  return actor as Uuid;
}

/**
 * An event type version taken from a path segment. Versions start at one and count up, so a zero or a leading
 * zero is not a version this domain has ever issued, and refusing it here is what keeps a mistyped route from
 * reaching the store as a lookup that finds nothing and reads back as a definition that was never defined.
 */
export function versionOf(value: string): number {
  if (!/^[1-9][0-9]*$/u.test(value)) {
    throw new ValidationError("An event type version must be a positive integer", {
      details: { version: value },
    });
  }
  return Number(value);
}

/** A partition ordinal taken from a path segment. Zero-based, so unlike a version it admits zero. */
export function partitionOf(value: string): number {
  if (!/^(0|[1-9][0-9]*)$/u.test(value)) {
    throw new ValidationError("A partition must be a whole number of zero or more", {
      details: { partition: value },
    });
  }
  return Number(value);
}

/**
 * A transport named in a path segment, resolved against the package's own vocabulary rather than asserted into
 * it. Casting a segment to the union would let an unknown backbone reach a repository query that finds nothing,
 * and an empty result reads as "this stream has no binding there" rather than "there is no such transport" —
 * which is the difference between a channel somebody forgot to declare and a channel that does not exist.
 */
export function transportOf(value: string): TransportKind {
  const transport = TRANSPORT_KINDS.find((kind) => kind === value);
  if (!transport) {
    throw new ValidationError("Unknown transport", { details: { transport: value } });
  }
  return transport;
}
