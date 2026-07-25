import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  EvidenceRef,
  InsightDimension,
  LearningSignal,
  LearningSignalRepository,
  SignalSource,
  SignalTrend,
} from "@knowget/learning-intelligence";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface LearningSignalRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  dimension: string;
  source: string;
  metric: string;
  value: number;
  trend: string;
  observedAt: string;
  evidence: unknown;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: LearningSignalRow): LearningSignal {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    dimension: row.dimension as InsightDimension,
    source: row.source as SignalSource,
    metric: row.metric,
    value: row.value,
    trend: row.trend as SignalTrend,
    observedAt: row.observedAt,
    evidence: row.evidence as EvidenceRef,
    note: row.note,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(signal: LearningSignal) {
  return {
    tenantId: signal.tenantId,
    organizationId: signal.organizationId,
    studentId: signal.studentId,
    dimension: signal.dimension,
    source: signal.source,
    metric: signal.metric,
    value: signal.value,
    trend: signal.trend,
    observedAt: signal.observedAt,
    evidence: JSON.parse(JSON.stringify(signal.evidence)),
    note: signal.note,
  };
}

/** Prisma-backed {@link LearningSignalRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaLearningSignalRepository implements LearningSignalRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<LearningSignal | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.learningSignal.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<LearningSignal[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.learningSignal.findMany({ where: { studentId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LearningSignal[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.learningSignal.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<LearningSignal[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.learningSignal.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(signal: LearningSignal): Promise<void> {
    return withTenant(this.db, signal.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(signal);
      await tx.learningSignal.upsert({
        where: { id: signal.id },
        create: { id: signal.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.learningSignal.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
