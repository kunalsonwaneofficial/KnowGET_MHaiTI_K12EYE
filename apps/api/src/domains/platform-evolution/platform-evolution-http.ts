import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import { isUuid } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * Permissions gating the platform-evolution surface (P2-D30). Five scopes, and the split is this contract's
 * second rule — evolution always requires human governance — expressed as authorization rather than as advice.
 *
 * `evolution:read` is every read: the signal queue, the initiative backlog, open and settled gates, the lesson
 * register, cycles, maturity assessments and adoption reviews. Deliberately wide, because an institution that
 * cannot look at what it is changing about itself has no governance to speak of — a reader who can neither
 * raise, run, assess nor approve still sees exactly what was proposed, on what evidence, who agreed, and
 * whether the benefit that justified it actually arrived.
 *
 * `evolution:contribute` is the participation surface: raising a signal and corroborating one, proposing an
 * initiative, restating either, reclassifying a draft, submitting it for review, and recording and revising
 * lessons. It is the widest write scope on purpose. The contract's whole premise is that improvement signals
 * come from everywhere in the institution, and a platform where only administrators may say something is wrong
 * collects the observations of administrators. Nothing here settles anything: a submitted initiative is a
 * request, and reclassification stops being available the moment the draft leaves the author's hands.
 *
 * `evolution:manage` is the running surface: triaging, accepting, merging and declining signals; moving an
 * initiative into review, starting its pilot and withdrawing it; retaining and superseding lessons; opening,
 * restating, rescheduling, advancing and abandoning improvement cycles; and opening adoption reviews, claiming
 * benefits, observing outcomes and concluding. This is the work of running the improvement programme, and none
 * of it is consent — every act here either prepares a decision or records what happened after one.
 *
 * `evolution:assess` is the capability surface: opening a maturity assessment, filing area readings and
 * publishing the result. It is separated from `evolution:manage` because a maturity index is the number the
 * institution will be judged by, and the coverage and weighting rules that protect it are worth nothing if the
 * person running the improvement backlog can also decide what the institution scored on it.
 *
 * `evolution:govern` stands alone, and the separation is the point rather than a tidiness. It is the scope of
 * *consent*: convoking a gate and casting a ballot, approving, rejecting and adopting an initiative, and
 * closing a cycle. Those are exactly the transitions the engine stands a gate in front of, and no other scope
 * implies this one — a head who can open cycles and edit initiatives still cannot approve one on that
 * authority. Every other scope in the platform governs what a person may *do*; this one governs what the
 * institution may *become*, and a permission model that bundled the second into the first would hand it out
 * with the job rather than with the mandate.
 */
export const EVOLUTION_READ = "evolution:read";
export const EVOLUTION_CONTRIBUTE = "evolution:contribute";
export const EVOLUTION_MANAGE = "evolution:manage";
export const EVOLUTION_ASSESS = "evolution:assess";
export const EVOLUTION_GOVERN = "evolution:govern";

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
 * The person the institution will be held to — who raised a signal, who declined one, who proposed a change,
 * who cast the ballot that approved it, who signed the lesson, who closed the cycle.
 *
 * Taken from the authenticated principal and never from the body, anywhere in this domain. This is the contract
 * where attribution is the entire product: a gate's whole guarantee is that a named human agreed, and the
 * engine enforces that by counting *distinct decider identities*, so a `deciderId` a caller could type in would
 * let one person clear a three-decider gate by voting under three names. The same reasoning covers the softer
 * fields — a lesson recorded by nobody is folklore with a primary key, and a decline nobody signed is an
 * argument the institution can no longer reopen because it cannot find who ended it.
 *
 * An unidentifiable principal is refused here rather than recorded as nobody. The aggregates do admit `null`
 * attribution, because signals genuinely arrive through channels that carry no user — but that is a decision
 * for a background sweep to make, not something an authenticated HTTP request should ever produce.
 */
export function actorOf(principal: Principal): Uuid {
  const actor = principal.id.trim();
  if (!actor || !isUuid(actor)) {
    throw new ValidationError("No user is associated with the current principal");
  }
  return actor as Uuid;
}
