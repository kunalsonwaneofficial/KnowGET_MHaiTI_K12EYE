import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  BehaviourGoal,
  BehaviourImprovementPlan,
  BehaviourIncident,
  BehaviourObservation,
  BehaviourRecord,
  BehaviourRecordRepository,
} from "@knowget/learner-wellbeing";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface BehaviourRecordRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  observations: unknown;
  incidents: unknown;
  goals: unknown;
  improvementPlan: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: BehaviourRecordRow): BehaviourRecord {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    observations: (row.observations as BehaviourObservation[]) ?? [],
    incidents: (row.incidents as BehaviourIncident[]) ?? [],
    goals: (row.goals as BehaviourGoal[]) ?? [],
    improvementPlan: (row.improvementPlan as BehaviourImprovementPlan | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(record: BehaviourRecord) {
  return {
    tenantId: record.tenantId,
    organizationId: record.organizationId,
    studentId: record.studentId,
    observations: JSON.parse(JSON.stringify(record.observations)),
    incidents: JSON.parse(JSON.stringify(record.incidents)),
    goals: JSON.parse(JSON.stringify(record.goals)),
    improvementPlan: record.improvementPlan
      ? JSON.parse(JSON.stringify(record.improvementPlan))
      : null,
  };
}

/** Prisma-backed {@link BehaviourRecordRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaBehaviourRecordRepository implements BehaviourRecordRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<BehaviourRecord | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.behaviourRecord.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByStudent(tenantId: TenantId, studentId: Uuid): Promise<BehaviourRecord | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.behaviourRecord.findFirst({ where: { studentId, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<BehaviourRecord[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.behaviourRecord.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<BehaviourRecord[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.behaviourRecord.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(record: BehaviourRecord): Promise<void> {
    return withTenant(this.db, record.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(record);
      await tx.behaviourRecord.upsert({
        where: { id: record.id },
        create: { id: record.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.behaviourRecord.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
