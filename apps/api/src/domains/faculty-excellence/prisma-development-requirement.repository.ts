import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  DevelopmentRequirement,
  DevelopmentRequirementRepository,
  PdCategory,
} from "@knowget/faculty-excellence";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface DevelopmentRequirementRow {
  id: string;
  tenantId: string;
  organizationId: string;
  employeeId: string;
  category: string;
  period: string;
  requiredHours: number;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: DevelopmentRequirementRow): DevelopmentRequirement {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    employeeId: row.employeeId as Uuid,
    category: row.category as PdCategory,
    period: row.period,
    requiredHours: row.requiredHours,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(requirement: DevelopmentRequirement) {
  return {
    tenantId: requirement.tenantId,
    organizationId: requirement.organizationId,
    employeeId: requirement.employeeId,
    category: requirement.category,
    period: requirement.period,
    requiredHours: requirement.requiredHours,
  };
}

/** Prisma-backed {@link DevelopmentRequirementRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaDevelopmentRequirementRepository implements DevelopmentRequirementRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<DevelopmentRequirement | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.developmentRequirement.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByScope(
    tenantId: TenantId,
    employeeId: Uuid,
    category: string,
    period: string,
  ): Promise<DevelopmentRequirement | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.developmentRequirement.findFirst({
        where: { employeeId, category, period, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<DevelopmentRequirement[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.developmentRequirement.findMany({
        where: { employeeId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<DevelopmentRequirement[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.developmentRequirement.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(requirement: DevelopmentRequirement): Promise<void> {
    return withTenant(this.db, requirement.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(requirement);
      await tx.developmentRequirement.upsert({
        where: { id: requirement.id },
        create: { id: requirement.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.developmentRequirement.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
