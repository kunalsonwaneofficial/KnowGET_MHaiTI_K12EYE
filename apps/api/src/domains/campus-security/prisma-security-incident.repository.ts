import type {
  IncidentCategory,
  IncidentSeverity,
  IncidentStatus,
  SecurityIncident,
  SecurityIncidentRepository,
} from "@knowget/campus-security";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

const OPEN: IncidentStatus[] = ["reported", "triaged", "investigating"];

interface SecurityIncidentRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  category: string;
  severity: string;
  zoneId: string | null;
  reportedByPersonId: string | null;
  assigneeId: string | null;
  summary: string;
  reportedOn: string;
  resolvedOn: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: SecurityIncidentRow): SecurityIncident {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    category: row.category as IncidentCategory,
    severity: row.severity as IncidentSeverity,
    zoneId: (row.zoneId as Uuid | null) ?? null,
    reportedByPersonId: (row.reportedByPersonId as Uuid | null) ?? null,
    assigneeId: (row.assigneeId as Uuid | null) ?? null,
    summary: row.summary,
    reportedOn: row.reportedOn,
    resolvedOn: row.resolvedOn,
    status: row.status as IncidentStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(incident: SecurityIncident) {
  return {
    tenantId: incident.tenantId,
    organizationId: incident.organizationId,
    code: incident.code,
    category: incident.category,
    severity: incident.severity,
    zoneId: incident.zoneId,
    reportedByPersonId: incident.reportedByPersonId,
    assigneeId: incident.assigneeId,
    summary: incident.summary,
    reportedOn: incident.reportedOn,
    resolvedOn: incident.resolvedOn,
    status: incident.status,
  };
}

/** Prisma-backed {@link SecurityIncidentRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaSecurityIncidentRepository implements SecurityIncidentRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<SecurityIncident | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.securityIncident.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<SecurityIncident | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.securityIncident.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByZone(tenantId: TenantId, zoneId: Uuid): Promise<SecurityIncident[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.securityIncident.findMany({ where: { zoneId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByAssignee(tenantId: TenantId, assigneeId: Uuid): Promise<SecurityIncident[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.securityIncident.findMany({ where: { assigneeId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listOpen(tenantId: TenantId): Promise<SecurityIncident[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.securityIncident.findMany({
        where: { status: { in: OPEN }, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<SecurityIncident[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.securityIncident.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<SecurityIncident[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.securityIncident.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(incident: SecurityIncident): Promise<void> {
    return withTenant(this.db, incident.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(incident);
      await tx.securityIncident.upsert({
        where: { id: incident.id },
        create: { id: incident.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.securityIncident.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
