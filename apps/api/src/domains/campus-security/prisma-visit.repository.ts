import type { Visit, VisitRepository, VisitStatus } from "@knowget/campus-security";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

const OPEN: VisitStatus[] = ["requested", "approved", "checked_in"];

interface VisitRow {
  id: string;
  tenantId: string;
  organizationId: string;
  visitorId: string;
  hostPersonId: string;
  zoneId: string | null;
  purpose: string | null;
  scheduledFor: string;
  status: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: VisitRow): Visit {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    visitorId: row.visitorId as Uuid,
    hostPersonId: row.hostPersonId as Uuid,
    zoneId: (row.zoneId as Uuid | null) ?? null,
    purpose: row.purpose,
    scheduledFor: row.scheduledFor,
    status: row.status as VisitStatus,
    checkedInAt: row.checkedInAt,
    checkedOutAt: row.checkedOutAt,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(visit: Visit) {
  return {
    tenantId: visit.tenantId,
    organizationId: visit.organizationId,
    visitorId: visit.visitorId,
    hostPersonId: visit.hostPersonId,
    zoneId: visit.zoneId,
    purpose: visit.purpose,
    scheduledFor: visit.scheduledFor,
    status: visit.status,
    checkedInAt: visit.checkedInAt,
    checkedOutAt: visit.checkedOutAt,
  };
}

/** Prisma-backed {@link VisitRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaVisitRepository implements VisitRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Visit | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.visit.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByVisitor(tenantId: TenantId, visitorId: Uuid): Promise<Visit[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.visit.findMany({ where: { visitorId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByHost(tenantId: TenantId, hostPersonId: Uuid): Promise<Visit[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.visit.findMany({ where: { hostPersonId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByZone(tenantId: TenantId, zoneId: Uuid): Promise<Visit[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.visit.findMany({ where: { zoneId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listOnSiteByZone(tenantId: TenantId, zoneId: Uuid): Promise<Visit[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.visit.findMany({
        where: { zoneId, status: "checked_in", deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listOpen(tenantId: TenantId): Promise<Visit[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.visit.findMany({ where: { status: { in: OPEN }, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Visit[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.visit.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Visit[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.visit.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(visit: Visit): Promise<void> {
    return withTenant(this.db, visit.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(visit);
      await tx.visit.upsert({
        where: { id: visit.id },
        create: { id: visit.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.visit.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
