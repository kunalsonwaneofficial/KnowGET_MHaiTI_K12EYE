import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { CannotModifySystemRoleError, DuplicateRoleError, RoleNotFoundError } from "./errors";
import {
  archiveRole,
  type CreateRoleParams,
  createRole,
  describeRole,
  grantRolePermissions,
  isActiveRole,
  normalizeRoleName,
  renameRole,
  type Role,
  revokeRolePermissions,
  setRolePermissions,
  unarchiveRole,
} from "./role";
import {
  roleArchived,
  roleDefined,
  rolePermissionsChanged,
  roleRenamed,
  roleUnarchived,
} from "./role-events";
import type { RoleRepository } from "./ports";

export interface RoleServiceDeps {
  readonly repository: RoleRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for the role catalogue. Defines tenant-scoped roles
 * (unique by name), maintains their permission sets and lifecycle, and resolves
 * role names into the permissions the authorization engine grants — publishing a
 * domain event per change. System roles are protected from rename/archive/delete.
 */
export class RoleService {
  private readonly repository: RoleRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: RoleServiceDeps) {
    this.repository = deps.repository;
    this.events = deps.events;
  }

  async define(input: CreateRoleParams): Promise<Role> {
    const name = normalizeRoleName(input.name);
    if (await this.repository.findByName(input.tenantId, name)) {
      throw new DuplicateRoleError(name);
    }
    const role = createRole({ ...input, name });
    await this.repository.save(role);
    await this.emit(roleDefined(role));
    return role;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Role> {
    return this.require(tenantId, id);
  }

  async getByName(tenantId: TenantId, name: string): Promise<Role> {
    const role = await this.repository.findByName(tenantId, name.trim());
    if (!role) {
      throw new RoleNotFoundError(name);
    }
    return role;
  }

  async list(tenantId: TenantId): Promise<Role[]> {
    return this.repository.listByTenant(tenantId);
  }

  async setPermissions(
    tenantId: TenantId,
    id: Uuid,
    permissions: readonly string[],
  ): Promise<Role> {
    return this.mutatePermissions(tenantId, id, (role) => setRolePermissions(role, permissions));
  }

  async grantPermissions(
    tenantId: TenantId,
    id: Uuid,
    permissions: readonly string[],
  ): Promise<Role> {
    return this.mutatePermissions(tenantId, id, (role) => grantRolePermissions(role, permissions));
  }

  async revokePermissions(
    tenantId: TenantId,
    id: Uuid,
    permissions: readonly string[],
  ): Promise<Role> {
    return this.mutatePermissions(tenantId, id, (role) => revokeRolePermissions(role, permissions));
  }

  async describe(tenantId: TenantId, id: Uuid, description: string | null): Promise<Role> {
    const updated = describeRole(await this.require(tenantId, id), description);
    await this.repository.save(updated);
    return updated;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<Role> {
    const role = await this.require(tenantId, id);
    this.assertNotSystem(role, "renamed");
    const nextName = normalizeRoleName(name);
    const clash = await this.repository.findByName(tenantId, nextName);
    if (clash && clash.id !== role.id) {
      throw new DuplicateRoleError(nextName);
    }
    const updated = renameRole(role, nextName);
    await this.repository.save(updated);
    await this.emit(roleRenamed(updated));
    return updated;
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<Role> {
    const role = await this.require(tenantId, id);
    this.assertNotSystem(role, "archived");
    const updated = archiveRole(role);
    await this.repository.save(updated);
    await this.emit(roleArchived(updated));
    return updated;
  }

  async unarchive(tenantId: TenantId, id: Uuid): Promise<Role> {
    const updated = unarchiveRole(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(roleUnarchived(updated));
    return updated;
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const role = await this.require(tenantId, id);
    this.assertNotSystem(role, "deleted");
    await this.repository.remove(tenantId, id);
  }

  /** True when an **active** role with this name exists (for membership validation). */
  async roleExists(tenantId: TenantId, name: string): Promise<boolean> {
    const role = await this.repository.findByName(tenantId, name.trim());
    return role !== null && isActiveRole(role);
  }

  /**
   * The union of permissions granted by the named **active** roles — what a
   * persisted principal resolver expands a principal's role names into. Unknown
   * or archived roles contribute nothing (fail-safe).
   */
  async permissionsForRoleNames(tenantId: TenantId, names: readonly string[]): Promise<string[]> {
    if (names.length === 0) {
      return [];
    }
    const wanted = new Set(names.map((n) => n.trim()));
    const permissions = new Set<string>();
    for (const role of await this.repository.listByTenant(tenantId)) {
      if (isActiveRole(role) && wanted.has(role.name)) {
        for (const permission of role.permissions) {
          permissions.add(permission);
        }
      }
    }
    return [...permissions];
  }

  private async mutatePermissions(
    tenantId: TenantId,
    id: Uuid,
    change: (role: Role) => Role,
  ): Promise<Role> {
    const updated = change(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(rolePermissionsChanged(updated));
    return updated;
  }

  private assertNotSystem(role: Role, action: string): void {
    if (role.isSystem) {
      throw new CannotModifySystemRoleError(role.name, action);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Role> {
    const role = await this.repository.findById(tenantId, id);
    if (!role) {
      throw new RoleNotFoundError(id);
    }
    return role;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
