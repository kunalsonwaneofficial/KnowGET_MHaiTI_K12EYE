import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  ActivityStatus,
  PdCategory,
  ProfessionalLearningActivity,
  ProfessionalLearningActivityRepository,
} from "@knowget/faculty-excellence";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface ProfessionalLearningActivityRow {
  id: string;
  tenantId: string;
  organizationId: string;
  employeeId: string;
  title: string;
  category: string;
  provider: string | null;
  hours: number;
  period: string;
  startDate: string;
  completedOn: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ProfessionalLearningActivityRow): ProfessionalLearningActivity {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    employeeId: row.employeeId as Uuid,
    title: row.title,
    category: row.category as PdCategory,
    provider: row.provider,
    hours: row.hours,
    period: row.period,
    startDate: row.startDate,
    completedOn: row.completedOn,
    status: row.status as ActivityStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(activity: ProfessionalLearningActivity) {
  return {
    tenantId: activity.tenantId,
    organizationId: activity.organizationId,
    employeeId: activity.employeeId,
    title: activity.title,
    category: activity.category,
    provider: activity.provider,
    hours: activity.hours,
    period: activity.period,
    startDate: activity.startDate,
    completedOn: activity.completedOn,
    status: activity.status,
  };
}

/** Prisma-backed {@link ProfessionalLearningActivityRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaProfessionalLearningActivityRepository
  implements ProfessionalLearningActivityRepository
{
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ProfessionalLearningActivity | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.professionalLearningActivity.findFirst({
        where: { id, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<ProfessionalLearningActivity[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.professionalLearningActivity.findMany({
        where: { employeeId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<ProfessionalLearningActivity[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.professionalLearningActivity.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(activity: ProfessionalLearningActivity): Promise<void> {
    return withTenant(this.db, activity.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(activity);
      await tx.professionalLearningActivity.upsert({
        where: { id: activity.id },
        create: { id: activity.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.professionalLearningActivity.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  }
}
