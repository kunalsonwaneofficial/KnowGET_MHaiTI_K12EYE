import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  Competency,
  CompetencyFramework,
  CompetencyFrameworkRepository,
  FrameworkStatus,
} from "@knowget/faculty-excellence";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface CompetencyFrameworkRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  name: string;
  description: string | null;
  competencies: unknown;
  status: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: CompetencyFrameworkRow): CompetencyFramework {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    name: row.name,
    description: row.description,
    competencies: (row.competencies as Competency[]) ?? [],
    status: row.status as FrameworkStatus,
    version: row.version,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(framework: CompetencyFramework) {
  return {
    tenantId: framework.tenantId,
    organizationId: framework.organizationId,
    code: framework.code,
    name: framework.name,
    description: framework.description,
    competencies: JSON.parse(JSON.stringify(framework.competencies)),
    status: framework.status,
    version: framework.version,
  };
}

/** Prisma-backed {@link CompetencyFrameworkRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaCompetencyFrameworkRepository implements CompetencyFrameworkRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<CompetencyFramework | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.competencyFramework.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<CompetencyFramework | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.competencyFramework.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CompetencyFramework[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.competencyFramework.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<CompetencyFramework[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.competencyFramework.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(framework: CompetencyFramework): Promise<void> {
    return withTenant(this.db, framework.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(framework);
      await tx.competencyFramework.upsert({
        where: { id: framework.id },
        create: { id: framework.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.competencyFramework.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
