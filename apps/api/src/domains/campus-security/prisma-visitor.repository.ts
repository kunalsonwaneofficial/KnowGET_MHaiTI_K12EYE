import type {
  Visitor,
  VisitorRepository,
  VisitorStatus,
  VisitorType,
} from "@knowget/campus-security";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface VisitorRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  fullName: string;
  type: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: VisitorRow): Visitor {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    fullName: row.fullName,
    type: row.type as VisitorType,
    phone: row.phone,
    email: row.email,
    company: row.company,
    status: row.status as VisitorStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(visitor: Visitor) {
  return {
    tenantId: visitor.tenantId,
    organizationId: visitor.organizationId,
    code: visitor.code,
    fullName: visitor.fullName,
    type: visitor.type,
    phone: visitor.phone,
    email: visitor.email,
    company: visitor.company,
    status: visitor.status,
  };
}

/** Prisma-backed {@link VisitorRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaVisitorRepository implements VisitorRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Visitor | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.visitor.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<Visitor | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.visitor.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Visitor[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.visitor.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Visitor[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.visitor.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(visitor: Visitor): Promise<void> {
    return withTenant(this.db, visitor.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(visitor);
      await tx.visitor.upsert({
        where: { id: visitor.id },
        create: { id: visitor.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.visitor.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
