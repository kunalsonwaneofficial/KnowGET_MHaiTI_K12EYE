import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { Grade, GradeRepository, GradeStatus } from "@knowget/academic-structure";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface GradeRow {
  id: string;
  tenantId: string;
  organizationId: string;
  programId: string;
  name: string;
  code: string;
  level: number;
  nextGradeId: string | null;
  promotionRule: string | null;
  minAge: number | null;
  maxAge: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: GradeRow): Grade {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    programId: row.programId as Uuid,
    name: row.name,
    code: row.code,
    level: row.level,
    nextGradeId: (row.nextGradeId as Uuid | null) ?? null,
    promotionRule: row.promotionRule,
    minAge: row.minAge,
    maxAge: row.maxAge,
    status: row.status as GradeStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(grade: Grade) {
  return {
    tenantId: grade.tenantId,
    organizationId: grade.organizationId,
    programId: grade.programId,
    name: grade.name,
    code: grade.code,
    level: grade.level,
    nextGradeId: grade.nextGradeId,
    promotionRule: grade.promotionRule,
    minAge: grade.minAge,
    maxAge: grade.maxAge,
    status: grade.status,
  };
}

/** Prisma-backed {@link GradeRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaGradeRepository implements GradeRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Grade | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.grade.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, programId: Uuid, code: string): Promise<Grade | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.grade.findFirst({ where: { programId, code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByProgram(tenantId: TenantId, programId: Uuid): Promise<Grade[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.grade.findMany({ where: { programId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Grade[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.grade.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Grade[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.grade.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(grade: Grade): Promise<void> {
    return withTenant(this.db, grade.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(grade);
      await tx.grade.upsert({
        where: { id: grade.id },
        create: { id: grade.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.grade.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
