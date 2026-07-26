import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  MaintenanceCategory,
  MaintenanceOrder,
  MaintenanceOrderRepository,
  MaintenancePriority,
  MaintenanceStatus,
} from "@knowget/facilities";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface MaintenanceOrderRow {
  id: string;
  tenantId: string;
  organizationId: string;
  buildingId: string;
  spaceId: string | null;
  systemId: string | null;
  code: string;
  summary: string;
  category: string;
  priority: string;
  status: string;
  assigneeId: string | null;
  reportedOn: string;
  assignedOn: string | null;
  completedOn: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const OPEN: MaintenanceStatus[] = ["reported", "assigned", "in_progress"];

function toDomain(row: MaintenanceOrderRow): MaintenanceOrder {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    buildingId: row.buildingId as Uuid,
    spaceId: (row.spaceId as Uuid | null) ?? null,
    systemId: (row.systemId as Uuid | null) ?? null,
    code: row.code,
    summary: row.summary,
    category: row.category as MaintenanceCategory,
    priority: row.priority as MaintenancePriority,
    status: row.status as MaintenanceStatus,
    assigneeId: (row.assigneeId as Uuid | null) ?? null,
    reportedOn: row.reportedOn,
    assignedOn: row.assignedOn,
    completedOn: row.completedOn,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(order: MaintenanceOrder) {
  return {
    tenantId: order.tenantId,
    organizationId: order.organizationId,
    buildingId: order.buildingId,
    spaceId: order.spaceId,
    systemId: order.systemId,
    code: order.code,
    summary: order.summary,
    category: order.category,
    priority: order.priority,
    status: order.status,
    assigneeId: order.assigneeId,
    reportedOn: order.reportedOn,
    assignedOn: order.assignedOn,
    completedOn: order.completedOn,
  };
}

/** Prisma-backed {@link MaintenanceOrderRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaMaintenanceOrderRepository implements MaintenanceOrderRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<MaintenanceOrder | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.maintenanceOrder.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<MaintenanceOrder | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.maintenanceOrder.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByBuilding(tenantId: TenantId, buildingId: Uuid): Promise<MaintenanceOrder[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.maintenanceOrder.findMany({ where: { buildingId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<MaintenanceOrder[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.maintenanceOrder.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByAssignee(tenantId: TenantId, assigneeId: Uuid): Promise<MaintenanceOrder[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.maintenanceOrder.findMany({ where: { assigneeId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listOpen(tenantId: TenantId): Promise<MaintenanceOrder[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.maintenanceOrder.findMany({
        where: { status: { in: OPEN }, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<MaintenanceOrder[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.maintenanceOrder.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(order: MaintenanceOrder): Promise<void> {
    return withTenant(this.db, order.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(order);
      await tx.maintenanceOrder.upsert({
        where: { id: order.id },
        create: { id: order.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.maintenanceOrder.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
