import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  ExternalAgencyInvolvement,
  SafeguardingCase,
  SafeguardingCaseRepository,
  SafeguardingCaseStatus,
  SafeguardingEscalation,
  SafeguardingIncidentReport,
  SafeguardingRiskLevel,
} from "@knowget/learner-wellbeing";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface SafeguardingCaseRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  concern: string;
  category: string;
  riskLevel: string;
  status: string;
  reportedBy: string;
  incidentReports: unknown;
  escalations: unknown;
  externalAgencies: unknown;
  resolution: string | null;
  openedAt: Date;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: SafeguardingCaseRow): SafeguardingCase {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    concern: row.concern,
    category: row.category,
    riskLevel: row.riskLevel as SafeguardingRiskLevel,
    status: row.status as SafeguardingCaseStatus,
    reportedBy: row.reportedBy as Uuid,
    incidentReports: (row.incidentReports as SafeguardingIncidentReport[]) ?? [],
    escalations: (row.escalations as SafeguardingEscalation[]) ?? [],
    externalAgencies: (row.externalAgencies as ExternalAgencyInvolvement[]) ?? [],
    resolution: row.resolution,
    openedAt: toIso(row.openedAt),
    resolvedAt: row.resolvedAt ? toIso(row.resolvedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(kase: SafeguardingCase) {
  return {
    tenantId: kase.tenantId,
    organizationId: kase.organizationId,
    studentId: kase.studentId,
    concern: kase.concern,
    category: kase.category,
    riskLevel: kase.riskLevel,
    status: kase.status,
    reportedBy: kase.reportedBy,
    incidentReports: JSON.parse(JSON.stringify(kase.incidentReports)),
    escalations: JSON.parse(JSON.stringify(kase.escalations)),
    externalAgencies: JSON.parse(JSON.stringify(kase.externalAgencies)),
    resolution: kase.resolution,
    openedAt: new Date(kase.openedAt),
    resolvedAt: kase.resolvedAt ? new Date(kase.resolvedAt) : null,
  };
}

/** Prisma-backed {@link SafeguardingCaseRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaSafeguardingCaseRepository implements SafeguardingCaseRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<SafeguardingCase | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.safeguardingCase.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<SafeguardingCase[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.safeguardingCase.findMany({ where: { studentId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<SafeguardingCase[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.safeguardingCase.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<SafeguardingCase[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.safeguardingCase.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(kase: SafeguardingCase): Promise<void> {
    return withTenant(this.db, kase.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(kase);
      await tx.safeguardingCase.upsert({
        where: { id: kase.id },
        create: { id: kase.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.safeguardingCase.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
