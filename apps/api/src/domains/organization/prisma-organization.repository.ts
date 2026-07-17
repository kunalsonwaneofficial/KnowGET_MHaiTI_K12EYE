import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  Organization,
  OrganizationRepository,
  OrganizationStatus,
  OrganizationType,
} from "@knowget/organization";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

/** The database row shape (Prisma model fields) for an organization. */
interface OrganizationRow {
  id: string;
  tenantId: string;
  parentId: string | null;
  type: string;
  name: string;
  code: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: OrganizationRow): Organization {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    parentId: (row.parentId as Uuid | null) ?? null,
    type: row.type as OrganizationType,
    name: row.name,
    code: row.code,
    status: row.status as OrganizationStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

/**
 * Prisma-backed {@link OrganizationRepository}. Every operation runs inside
 * {@link withTenant}, which sets the PostgreSQL session tenant so Row-Level
 * Security isolates the query — defense-in-depth alongside the explicit tenant
 * argument. Deletes are soft (set `deletedAt`); reads exclude soft-deleted rows.
 */
export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Organization | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.organization.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<Organization | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.organization.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByTenant(tenantId: TenantId): Promise<Organization[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.organization.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  findChildren(tenantId: TenantId, parentId: Uuid): Promise<Organization[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.organization.findMany({ where: { parentId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(organization: Organization): Promise<void> {
    return withTenant(this.db, organization.tenantId, async (tx: TransactionClient) => {
      const fields = {
        tenantId: organization.tenantId,
        parentId: organization.parentId,
        type: organization.type,
        name: organization.name,
        code: organization.code,
        status: organization.status,
      };
      await tx.organization.upsert({
        where: { id: organization.id },
        create: { id: organization.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.organization.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
