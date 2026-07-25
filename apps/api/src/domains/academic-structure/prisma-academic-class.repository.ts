import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  AcademicClass,
  AcademicClassRepository,
  ClassStatus,
} from "@knowget/academic-structure";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AcademicClassRow {
  id: string;
  tenantId: string;
  organizationId: string;
  gradeId: string;
  academicYear: string;
  name: string;
  curriculumFrameworkId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AcademicClassRow): AcademicClass {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    gradeId: row.gradeId as Uuid,
    academicYear: row.academicYear,
    name: row.name,
    curriculumFrameworkId: (row.curriculumFrameworkId as Uuid | null) ?? null,
    status: row.status as ClassStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(klass: AcademicClass) {
  return {
    tenantId: klass.tenantId,
    organizationId: klass.organizationId,
    gradeId: klass.gradeId,
    academicYear: klass.academicYear,
    name: klass.name,
    curriculumFrameworkId: klass.curriculumFrameworkId,
    status: klass.status,
  };
}

/** Prisma-backed {@link AcademicClassRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAcademicClassRepository implements AcademicClassRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AcademicClass | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.academicClass.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByName(
    tenantId: TenantId,
    gradeId: Uuid,
    academicYear: string,
    name: string,
  ): Promise<AcademicClass | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.academicClass.findFirst({
        where: { gradeId, academicYear, name, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByGrade(tenantId: TenantId, gradeId: Uuid): Promise<AcademicClass[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.academicClass.findMany({ where: { gradeId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicClass[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.academicClass.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AcademicClass[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.academicClass.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(klass: AcademicClass): Promise<void> {
    return withTenant(this.db, klass.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(klass);
      await tx.academicClass.upsert({
        where: { id: klass.id },
        create: { id: klass.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.academicClass.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
