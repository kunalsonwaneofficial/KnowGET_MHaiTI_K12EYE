import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidRoleStatusTransitionError, RoleNameRequiredError } from "./errors";
import { normalizePermissions } from "./permissions";

export type RoleStatus = "active" | "archived";

/**
 * A tenant-scoped RBAC role — a named grant of permissions. Role names are the
 * stable reference that memberships (P2-D01-M04) point at; the permission set is
 * what the authorization engine expands a principal's roles into. `isSystem`
 * marks a built-in role that is protected from deletion.
 */
export interface Role {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly description: string | null;
  readonly permissions: readonly string[];
  readonly status: RoleStatus;
  readonly isSystem: boolean;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateRoleParams {
  readonly tenantId: TenantId;
  readonly name: string;
  readonly description?: string | null;
  readonly permissions?: readonly string[];
  readonly isSystem?: boolean;
}

/** Trim a role name, rejecting a blank one. */
export function normalizeRoleName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new RoleNameRequiredError();
  }
  return trimmed;
}

/** Create a new, `active` role. */
export function createRole(params: CreateRoleParams): Role {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    name: normalizeRoleName(params.name),
    description: params.description ?? null,
    permissions: normalizePermissions(params.permissions ?? []),
    status: "active",
    isSystem: params.isSystem ?? false,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (role: Role, patch: Partial<Role>): Role => ({
  ...role,
  ...patch,
  updatedAt: nowIso(),
});

export const renameRole = (role: Role, name: string): Role =>
  touch(role, { name: normalizeRoleName(name) });

export const describeRole = (role: Role, description: string | null): Role =>
  touch(role, { description });

export const setRolePermissions = (role: Role, permissions: readonly string[]): Role =>
  touch(role, { permissions: normalizePermissions(permissions) });

export const grantRolePermissions = (role: Role, permissions: readonly string[]): Role =>
  touch(role, { permissions: normalizePermissions([...role.permissions, ...permissions]) });

export const revokeRolePermissions = (role: Role, permissions: readonly string[]): Role => {
  const removed = new Set(permissions.map((p) => p.trim()));
  return touch(role, {
    permissions: role.permissions.filter((permission) => !removed.has(permission)),
  });
};

export function archiveRole(role: Role): Role {
  if (role.status !== "active") {
    throw new InvalidRoleStatusTransitionError(role.status, "archived");
  }
  return touch(role, { status: "archived" });
}

export function unarchiveRole(role: Role): Role {
  if (role.status !== "archived") {
    throw new InvalidRoleStatusTransitionError(role.status, "active");
  }
  return touch(role, { status: "active" });
}

/** True when the role currently grants its permissions (status `active`). */
export const isActiveRole = (role: Role): boolean => role.status === "active";
