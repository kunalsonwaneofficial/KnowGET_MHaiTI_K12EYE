import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type {
  AcademicPlan,
  AcademicPlanRepository,
  AcademicPlanStatus,
  AcademicPlanType,
} from "@knowget/teaching-learning";
import type { TenantId, Uuid } from "@knowget/types";

interface AcademicPlanRow {
  id: string;
  tenantId: string;
  organizationId: string;
  planType: string;
  code: string;
  title: string;
  academicYear: string | null;
  term: string | null;
  subjectId: string | null;
  objectives: unknown;
  fromDate: string | null;
  toDate: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AcademicPlanRow): AcademicPlan {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    planType: row.planType as AcademicPlanType,
    code: row.code,
    title: row.title,
    academicYear: row.academicYear,
    term: row.term,
    subjectId: row.subjectId as Uuid | null,
    objectives: (row.objectives as string[]) ?? [],
    fromDate: row.fromDate,
    toDate: row.toDate,
    status: row.status as AcademicPlanStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(plan: AcademicPlan) {
  return {
    tenantId: plan.tenantId,
    organizationId: plan.organizationId,
    planType: plan.planType,
    code: plan.code,
    title: plan.title,
    academicYear: plan.academicYear,
    term: plan.term,
    subjectId: plan.subjectId,
    objectives: JSON.parse(JSON.stringify(plan.objectives)),
    fromDate: plan.fromDate,
    toDate: plan.toDate,
    status: plan.status,
  };
}

/** Prisma-backed {@link AcademicPlanRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAcademicPlanRepository implements AcademicPlanRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AcademicPlan | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.academicPlan.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, organizationId: Uuid, code: string): Promise<AcademicPlan | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.academicPlan.findFirst({
        where: { organizationId, code, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.academicPlan.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AcademicPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.academicPlan.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(plan: AcademicPlan): Promise<void> {
    return withTenant(this.db, plan.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(plan);
      await tx.academicPlan.upsert({
        where: { id: plan.id },
        create: { id: plan.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.academicPlan.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
