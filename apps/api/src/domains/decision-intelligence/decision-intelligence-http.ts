import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import type { TenantId } from "@knowget/types";

/**
 * Permissions gating the decision layer's REST surface (P2-D27). Four scopes, and the split is the contract's
 * first rule expressed as authorization rather than as advice.
 *
 * `decision:manage` is the governance surface: authoring workflow versions, publishing and retiring them, and
 * drafting, arming and pausing standing automation rules. Everything an institution's processes are *allowed* to
 * become is decided here, ahead of time, by people who answer for the design.
 *
 * `decision:operate` is the runtime surface: raising recommendations and citing their evidence, starting cases,
 * moving stages, dispatching signals, handing authorized actions to the runtime and recording reversals. It runs
 * the machinery; it does not decide what the machinery may do.
 *
 * `decision:decide` is the human answer, and it is the one scope no other implies. Accepting or rejecting a
 * recommendation, recording a decision against one, and approving or refusing an automation firing all sit here.
 * A platform where only low-risk actions auto-execute has bought nothing if the operator who fired the rule can
 * also clear the approval it stopped for — the gate would record a signature and not a decision, which is the
 * failure the rule exists to prevent. Separation of duty is the value, so it is a separate permission.
 *
 * `decision:read` is every read: the backlog, the queues, what is running, what is owed a reversal. Deliberately
 * wide, because the thing an institution most needs about its own automation is to be able to look at it — an
 * observer who cannot approve, operate or author still sees exactly what was done and on what grounds.
 */
export const DECISION_READ = "decision:read";
export const DECISION_MANAGE = "decision:manage";
export const DECISION_OPERATE = "decision:operate";
export const DECISION_DECIDE = "decision:decide";

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
 * The user the platform will hold accountable for an answer — accepting a recommendation, deciding on one,
 * approving or refusing a firing, cancelling a case.
 *
 * Taken from the authenticated principal and never from the body, anywhere in this domain. Every one of those
 * acts is one the platform later has to attribute, and a decider a caller could type in is a field rather than
 * an accountability record. An unidentifiable principal is refused here instead of being recorded as anonymous.
 */
export function deciderOf(principal: Principal): string {
  const decider = principal.id.trim();
  if (!decider) {
    throw new ValidationError("No user is associated with the current principal");
  }
  return decider;
}
