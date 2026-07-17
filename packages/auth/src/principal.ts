import type { TenantId, Uuid } from "@knowget/types";

/**
 * An authenticated actor. This is the persona-agnostic contract; concrete
 * business roles (Student, Teacher, Parent, Staff) and the full RBAC/ABAC model
 * are engineered in P1-M04 and Phase-2 identity domains.
 */
export interface Principal {
  readonly id: Uuid;
  readonly tenantId?: TenantId;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
}

/** Ambient authorization context propagated through a request. */
export interface AuthContext {
  readonly principal: Principal;
  readonly authenticatedAt: string;
}
