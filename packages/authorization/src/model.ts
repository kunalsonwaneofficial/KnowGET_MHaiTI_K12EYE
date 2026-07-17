import type { Principal } from "@knowget/auth";

export type Effect = "allow" | "deny";

/** A named role granting a set of permissions. */
export interface Role {
  readonly name: string;
  readonly permissions: readonly string[];
}

/** Context passed to policy conditions (enables ABAC). */
export interface PolicyContext {
  readonly principal: Principal;
  readonly action: string;
  readonly resource?: string;
  readonly attributes: Record<string, unknown>;
}

/** A policy contributes an allow/deny decision when its condition matches. */
export interface Policy {
  readonly name: string;
  readonly effect: Effect;
  matches(context: PolicyContext): boolean;
}

export interface AuthorizationRequest {
  readonly principal: Principal;
  readonly action: string;
  readonly resource?: string;
  readonly attributes?: Record<string, unknown>;
}

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly effect: Effect;
  readonly reason: string;
}

/** Build a policy from a condition predicate. */
export function policy(
  name: string,
  effect: Effect,
  matches: (context: PolicyContext) => boolean,
): Policy {
  return { name, effect, matches };
}
