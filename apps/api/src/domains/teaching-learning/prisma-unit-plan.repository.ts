import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { UnitPlan, UnitPlanRepository, UnitPlanStatus } from "@knowget/teaching-learning";
import type { TenantId, Uuid } from "@knowget/types";

interface UnitPlanRow {
  id: string;
  tenantId: string;
  organizationId: string;
  subjectId: string;
  academicPlanId: string | null;
  title: string;
  sequence: number;
  curriculumFrameworkId: string | null;
  learningOutcomeIds: unknown;
  competencies: unknown;
  estimatedInstructionalHours: number;
  assessmentStrategy: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: UnitPlanRow): UnitPlan {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    subjectId: row.subjectId as Uuid,
    academicPlanId: row.academicPlanId as Uuid | null,
    title: row.title,
    sequence: row.sequence,
    curriculumFrameworkId: row.curriculumFrameworkId as Uuid | null,
    learningOutcomeIds: (row.learningOutcomeIds as Uuid[]) ?? [],
    competencies: (row.competencies as string[]) ?? [],
    estimatedInstructionalHours: row.estimatedInstructionalHours,
    assessmentStrategy: row.assessmentStrategy,
    status: row.status as UnitPlanStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(unit: UnitPlan) {
  return {
    tenantId: unit.tenantId,
    organizationId: unit.organizationId,
    subjectId: unit.subjectId,
    academicPlanId: unit.academicPlanId,
    title: unit.title,
    sequence: unit.sequence,
    curriculumFrameworkId: unit.curriculumFrameworkId,
    learningOutcomeIds: JSON.parse(JSON.stringify(unit.learningOutcomeIds)),
    competencies: JSON.parse(JSON.stringify(unit.competencies)),
    estimatedInstructionalHours: unit.estimatedInstructionalHours,
    assessmentStrategy: unit.assessmentStrategy,
    status: unit.status,
  };
}

/** Prisma-backed {@link UnitPlanRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaUnitPlanRepository implements UnitPlanRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<UnitPlan | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.unitPlan.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listBySubject(tenantId: TenantId, subjectId: Uuid): Promise<UnitPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.unitPlan.findMany({ where: { subjectId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<UnitPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.unitPlan.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<UnitPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.unitPlan.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(unit: UnitPlan): Promise<void> {
    return withTenant(this.db, unit.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(unit);
      await tx.unitPlan.upsert({
        where: { id: unit.id },
        create: { id: unit.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.unitPlan.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
