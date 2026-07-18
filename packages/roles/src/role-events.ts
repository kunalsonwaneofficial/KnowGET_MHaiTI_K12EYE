import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Role } from "./role";

export const ROLE_DEFINED = "role.defined";
export const ROLE_PERMISSIONS_CHANGED = "role.permissions_changed";
export const ROLE_RENAMED = "role.renamed";
export const ROLE_ARCHIVED = "role.archived";
export const ROLE_UNARCHIVED = "role.unarchived";

export interface RolePayload {
  readonly roleId: Uuid;
  readonly name: string;
}
export interface RolePermissionsChangedPayload extends RolePayload {
  readonly permissions: readonly string[];
}

const base = (role: Role): RolePayload => ({ roleId: role.id, name: role.name });

export type RoleDefinedEvent = DomainEvent<typeof ROLE_DEFINED, RolePayload>;

export const roleDefined = (role: Role): RoleDefinedEvent =>
  createEvent(ROLE_DEFINED, base(role), { tenantId: role.tenantId });

export const rolePermissionsChanged = (
  role: Role,
): DomainEvent<typeof ROLE_PERMISSIONS_CHANGED, RolePermissionsChangedPayload> =>
  createEvent(
    ROLE_PERMISSIONS_CHANGED,
    { ...base(role), permissions: role.permissions },
    { tenantId: role.tenantId },
  );

export const roleRenamed = (role: Role): DomainEvent<typeof ROLE_RENAMED, RolePayload> =>
  createEvent(ROLE_RENAMED, base(role), { tenantId: role.tenantId });

export const roleArchived = (role: Role): DomainEvent<typeof ROLE_ARCHIVED, RolePayload> =>
  createEvent(ROLE_ARCHIVED, base(role), { tenantId: role.tenantId });

export const roleUnarchived = (role: Role): DomainEvent<typeof ROLE_UNARCHIVED, RolePayload> =>
  createEvent(ROLE_UNARCHIVED, base(role), { tenantId: role.tenantId });
