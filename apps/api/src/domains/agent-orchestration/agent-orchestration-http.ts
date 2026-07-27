import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import type { TenantId } from "@knowget/types";

/**
 * Permissions gating the AI operating system's REST surface (P2-D26). Three scopes, split along the lines the
 * institution actually holds people accountable on.
 *
 * `agent:*` is the governance surface: which agents exist, how autonomous each is, what capabilities the catalog
 * offers, how risky each one is classified as, and which keys an agent has been granted. Everything an agent is
 * *allowed* to become is decided here, by administrators, ahead of time.
 *
 * `ai:*` is the runtime surface: reasoning sessions, execution plans, invocations and the operations view. It is
 * read (`ai:read`) and operate (`ai:operate`) — running an agent is not the same act as changing what it may do,
 * so a runtime operator cannot widen its own reach.
 *
 * `ai:approve` stands alone deliberately, and is the one scope that is not implied by any other. The gate exists
 * so that a person is accountable for the risky calls an agent makes; if the operator running the plan could also
 * clear its own approvals, the gate would record a signature without recording a decision. Separation of duty is
 * the whole value of the record, so it is a separate permission.
 */
export const AGENT_READ = "agent:read";
export const AGENT_WRITE = "agent:write";
export const AI_READ = "ai:read";
export const AI_OPERATE = "ai:operate";
export const AI_APPROVE = "ai:approve";

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
 * The user the platform will hold accountable for an approval decision. An approval whose decider cannot be
 * named is not an approval, so an unidentifiable principal is refused here rather than recorded as anonymous.
 */
export function deciderOf(principal: Principal): string {
  const decider = principal.id.trim();
  if (!decider) {
    throw new ValidationError("No user is associated with the current principal");
  }
  return decider;
}
