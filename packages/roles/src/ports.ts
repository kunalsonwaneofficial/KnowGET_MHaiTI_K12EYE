import type { TenantId, Uuid } from "@knowget/types";
import type { Role } from "./role";

/**
 * Storage contract for roles. Tenant-scoped (explicit argument + RLS in the
 * adapter). `findByName` powers per-tenant name uniqueness and name-based lookup
 * (memberships reference roles by name).
 */
export interface RoleRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Role | null>;
  findByName(tenantId: TenantId, name: string): Promise<Role | null>;
  listByTenant(tenantId: TenantId): Promise<Role[]>;
  save(role: Role): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link RoleRepository} — the default for tests and bootstrap. */
export class InMemoryRoleRepository implements RoleRepository {
  private readonly byId = new Map<string, Role>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Role | null> {
    const role = this.byId.get(id);
    return role && role.tenantId === tenantId ? role : null;
  }

  async findByName(tenantId: TenantId, name: string): Promise<Role | null> {
    const wanted = name.trim();
    for (const role of this.byId.values()) {
      if (role.tenantId === tenantId && role.name === wanted) {
        return role;
      }
    }
    return null;
  }

  async listByTenant(tenantId: TenantId): Promise<Role[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(role: Role): Promise<void> {
    this.byId.set(role.id, role);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const role = this.byId.get(id);
    if (role && role.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
