import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  EarlyWarning,
  EarlyWarningRepository,
  EarlyWarningStatus,
  EvidenceRef,
  InsightDimension,
  InsightEvent,
  RiskBand,
} from "@knowget/learning-intelligence";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface EarlyWarningRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  dimension: string;
  ruleId: string;
  severity: string;
  observedScore: number;
  rationale: string;
  evidence: unknown;
  status: string;
  history: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: EarlyWarningRow): EarlyWarning {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    dimension: row.dimension as InsightDimension,
    ruleId: row.ruleId,
    severity: row.severity as RiskBand,
    observedScore: row.observedScore,
    rationale: row.rationale,
    evidence: (row.evidence as EvidenceRef[]) ?? [],
    status: row.status as EarlyWarningStatus,
    history: (row.history as InsightEvent[]) ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(warning: EarlyWarning) {
  return {
    tenantId: warning.tenantId,
    organizationId: warning.organizationId,
    studentId: warning.studentId,
    dimension: warning.dimension,
    ruleId: warning.ruleId,
    severity: warning.severity,
    observedScore: warning.observedScore,
    rationale: warning.rationale,
    evidence: JSON.parse(JSON.stringify(warning.evidence)),
    status: warning.status,
    history: JSON.parse(JSON.stringify(warning.history)),
  };
}

/** Prisma-backed {@link EarlyWarningRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaEarlyWarningRepository implements EarlyWarningRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<EarlyWarning | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.earlyWarning.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findOpenByStudentAndRule(
    tenantId: TenantId,
    studentId: Uuid,
    ruleId: string,
  ): Promise<EarlyWarning | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.earlyWarning.findFirst({
        where: {
          studentId,
          ruleId,
          status: { in: ["raised", "acknowledged"] },
          deletedAt: null,
        },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<EarlyWarning[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.earlyWarning.findMany({ where: { studentId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<EarlyWarning[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.earlyWarning.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<EarlyWarning[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.earlyWarning.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(warning: EarlyWarning): Promise<void> {
    return withTenant(this.db, warning.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(warning);
      await tx.earlyWarning.upsert({
        where: { id: warning.id },
        create: { id: warning.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.earlyWarning.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
