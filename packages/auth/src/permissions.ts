import type { Principal } from "./principal";

/** Wildcard permission granting all actions. */
export const WILDCARD_PERMISSION = "*";

/** True when the principal holds the given permission (or the wildcard). */
export function hasPermission(principal: Principal, permission: string): boolean {
  return (
    principal.permissions.includes(WILDCARD_PERMISSION) ||
    principal.permissions.includes(permission)
  );
}

/** True when the principal holds every one of the given permissions. */
export function hasAllPermissions(principal: Principal, permissions: readonly string[]): boolean {
  return permissions.every((permission) => hasPermission(principal, permission));
}

/** True when the principal holds at least one of the given roles. */
export function hasAnyRole(principal: Principal, roles: readonly string[]): boolean {
  return roles.some((role) => principal.roles.includes(role));
}
