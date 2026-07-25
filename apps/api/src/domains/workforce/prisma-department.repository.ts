import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";
import type { Department, DepartmentRepository, DepartmentStatus } from "@knowget/workforce";

interface DepartmentRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  name: string;
  parentDepartmentId: string | null;
  headEmployeeId: string | null;
  costCenter: string | null;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: DepartmentRow): Department {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    name: row.name,
    parentDepartmentId: (row.parentDepartmentId as Uuid | null) ?? null,
    headEmployeeId: (row.headEmployeeId as Uuid | null) ?? null,
    costCenter: row.costCenter,
    description: row.description,
    status: row.status as DepartmentStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(department: Department) {
  return {
    tenantId: department.tenantId,
    organizationId: department.organizationId,
    code: department.code,
    name: department.name,
    parentDepartmentId: department.parentDepartmentId,
    headEmployeeId: department.headEmployeeId,
    costCenter: department.costCenter,
    description: department.description,
    status: department.status,
  };
}

/** Prisma-backed {@link DepartmentRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaDepartmentRepository implements DepartmentRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Department | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.department.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<Department | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.department.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Department[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.department.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByParent(tenantId: TenantId, parentDepartmentId: Uuid): Promise<Department[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.department.findMany({
        where: { parentDepartmentId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Department[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.department.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(department: Department): Promise<void> {
    return withTenant(this.db, department.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(department);
      await tx.department.upsert({
        where: { id: department.id },
        create: { id: department.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.department.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
