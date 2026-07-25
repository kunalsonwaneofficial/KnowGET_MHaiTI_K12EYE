import type {
  Allocation,
  AllocationKind,
  AllocationRepository,
  AllocationStatus,
  TimeOfDay,
  Weekday,
} from "@knowget/academic-scheduling";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AllocationRow {
  id: string;
  tenantId: string;
  organizationId: string;
  resourceKind: string;
  resourceId: string;
  scheduleSlotId: string | null;
  sectionId: string | null;
  dayOfWeek: string;
  startsAt: string;
  endsAt: string;
  occupancy: number | null;
  status: string;
  releasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AllocationRow): Allocation {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    resourceKind: row.resourceKind as AllocationKind,
    resourceId: row.resourceId as Uuid,
    scheduleSlotId: (row.scheduleSlotId as Uuid | null) ?? null,
    sectionId: (row.sectionId as Uuid | null) ?? null,
    dayOfWeek: row.dayOfWeek as Weekday,
    startsAt: row.startsAt as TimeOfDay,
    endsAt: row.endsAt as TimeOfDay,
    occupancy: row.occupancy,
    status: row.status as AllocationStatus,
    releasedAt: row.releasedAt ? toIso(row.releasedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(allocation: Allocation) {
  return {
    tenantId: allocation.tenantId,
    organizationId: allocation.organizationId,
    resourceKind: allocation.resourceKind,
    resourceId: allocation.resourceId,
    scheduleSlotId: allocation.scheduleSlotId,
    sectionId: allocation.sectionId,
    dayOfWeek: allocation.dayOfWeek,
    startsAt: allocation.startsAt,
    endsAt: allocation.endsAt,
    occupancy: allocation.occupancy,
    status: allocation.status,
    releasedAt: allocation.releasedAt ? new Date(allocation.releasedAt) : null,
  };
}

/** Prisma-backed {@link AllocationRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAllocationRepository implements AllocationRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Allocation | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.allocation.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Allocation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.allocation.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByResource(tenantId: TenantId, resourceId: Uuid): Promise<Allocation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.allocation.findMany({ where: { resourceId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listBySlot(tenantId: TenantId, scheduleSlotId: Uuid): Promise<Allocation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.allocation.findMany({ where: { scheduleSlotId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listForConflict(tenantId: TenantId, organizationId: Uuid): Promise<Allocation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.allocation.findMany({
        where: { organizationId, status: "allocated", deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Allocation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.allocation.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(allocation: Allocation): Promise<void> {
    return withTenant(this.db, allocation.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(allocation);
      await tx.allocation.upsert({
        where: { id: allocation.id },
        create: { id: allocation.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.allocation.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
