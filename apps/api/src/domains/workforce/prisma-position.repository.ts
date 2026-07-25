import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";
import type {
  EmploymentType,
  Position,
  PositionRepository,
  PositionStatus,
} from "@knowget/workforce";

interface PositionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  departmentId: string;
  code: string;
  title: string;
  employmentType: string;
  headcount: number;
  grade: string | null;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: PositionRow): Position {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    departmentId: row.departmentId as Uuid,
    code: row.code,
    title: row.title,
    employmentType: row.employmentType as EmploymentType,
    headcount: row.headcount,
    grade: row.grade,
    description: row.description,
    status: row.status as PositionStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(position: Position) {
  return {
    tenantId: position.tenantId,
    organizationId: position.organizationId,
    departmentId: position.departmentId,
    code: position.code,
    title: position.title,
    employmentType: position.employmentType,
    headcount: position.headcount,
    grade: position.grade,
    description: position.description,
    status: position.status,
  };
}

/** Prisma-backed {@link PositionRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaPositionRepository implements PositionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Position | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.position.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<Position | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.position.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByDepartment(tenantId: TenantId, departmentId: Uuid): Promise<Position[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.position.findMany({ where: { departmentId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Position[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.position.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Position[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.position.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(position: Position): Promise<void> {
    return withTenant(this.db, position.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(position);
      await tx.position.upsert({
        where: { id: position.id },
        create: { id: position.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.position.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
