import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  AcademicProgram,
  AcademicProgramRepository,
  ProgramStage,
  ProgramStatus,
} from "@knowget/academic-structure";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AcademicProgramRow {
  id: string;
  tenantId: string;
  organizationId: string;
  name: string;
  code: string;
  stage: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AcademicProgramRow): AcademicProgram {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    name: row.name,
    code: row.code,
    stage: row.stage as ProgramStage,
    description: row.description,
    status: row.status as ProgramStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(program: AcademicProgram) {
  return {
    tenantId: program.tenantId,
    organizationId: program.organizationId,
    name: program.name,
    code: program.code,
    stage: program.stage,
    description: program.description,
    status: program.status,
  };
}

/** Prisma-backed {@link AcademicProgramRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAcademicProgramRepository implements AcademicProgramRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AcademicProgram | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.academicProgram.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<AcademicProgram | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.academicProgram.findFirst({
        where: { organizationId, code, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicProgram[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.academicProgram.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AcademicProgram[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.academicProgram.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(program: AcademicProgram): Promise<void> {
    return withTenant(this.db, program.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(program);
      await tx.academicProgram.upsert({
        where: { id: program.id },
        create: { id: program.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.academicProgram.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
