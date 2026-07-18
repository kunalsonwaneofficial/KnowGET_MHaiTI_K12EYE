import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { Role, RoleRepository, RoleStatus } from "@knowget/roles";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

/** The database row shape (Prisma model fields) for a role. */
interface RoleRow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  permissions: string[];
  status: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: RoleRow): Role {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    name: row.name,
    description: row.description,
    permissions: row.permissions,
    status: row.status as RoleStatus,
    isSystem: row.isSystem,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

/** Persisted (Prisma) fields for a role. The return type is inferred (not
 * `Record<string, unknown>`) so the concrete field types satisfy Prisma's typed
 * create/update input. */
function toFields(role: Role) {
  return {
    tenantId: role.tenantId,
    name: role.name,
    description: role.description,
    permissions: [...role.permissions],
    status: role.status,
    isSystem: role.isSystem,
  };
}

/**
 * Prisma-backed {@link RoleRepository}. Every operation runs inside
 * {@link withTenant} so PostgreSQL RLS scopes the query to the caller's tenant
 * (defense-in-depth with the explicit tenant argument). Deletes are soft; reads
 * exclude soft-deleted rows.
 */
export class PrismaRoleRepository implements RoleRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Role | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.role.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByName(tenantId: TenantId, name: string): Promise<Role | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.role.findFirst({ where: { name, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByTenant(tenantId: TenantId): Promise<Role[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.role.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(role: Role): Promise<void> {
    return withTenant(this.db, role.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(role);
      await tx.role.upsert({
        where: { id: role.id },
        create: { id: role.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.role.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
