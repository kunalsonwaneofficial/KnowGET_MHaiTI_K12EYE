import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  AllocationStatus,
  BedAllocation,
  BedAllocationRepository,
} from "@knowget/residential";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AllocationRow {
  id: string;
  tenantId: string;
  organizationId: string;
  hostelId: string;
  roomId: string;
  bedKey: string;
  studentId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AllocationRow): BedAllocation {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    hostelId: row.hostelId as Uuid,
    roomId: row.roomId as Uuid,
    bedKey: row.bedKey,
    studentId: row.studentId as Uuid,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    status: row.status as AllocationStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(allocation: BedAllocation) {
  return {
    tenantId: allocation.tenantId,
    organizationId: allocation.organizationId,
    hostelId: allocation.hostelId,
    roomId: allocation.roomId,
    bedKey: allocation.bedKey,
    studentId: allocation.studentId,
    effectiveFrom: allocation.effectiveFrom,
    effectiveTo: allocation.effectiveTo,
    status: allocation.status,
  };
}

/** Prisma-backed {@link BedAllocationRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaBedAllocationRepository implements BedAllocationRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<BedAllocation | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.bedAllocation.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findActiveByBed(tenantId: TenantId, roomId: Uuid, bedKey: string): Promise<BedAllocation | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.bedAllocation.findFirst({
        where: { roomId, bedKey, status: "active", deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  findActiveByStudent(tenantId: TenantId, studentId: Uuid): Promise<BedAllocation | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.bedAllocation.findFirst({
        where: { studentId, status: "active", deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listActiveByRoom(tenantId: TenantId, roomId: Uuid): Promise<BedAllocation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.bedAllocation.findMany({
        where: { roomId, status: "active", deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listActiveByHostel(tenantId: TenantId, hostelId: Uuid): Promise<BedAllocation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.bedAllocation.findMany({
        where: { hostelId, status: "active", deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByRoom(tenantId: TenantId, roomId: Uuid): Promise<BedAllocation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.bedAllocation.findMany({ where: { roomId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<BedAllocation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.bedAllocation.findMany({ where: { studentId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<BedAllocation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.bedAllocation.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<BedAllocation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.bedAllocation.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(allocation: BedAllocation): Promise<void> {
    return withTenant(this.db, allocation.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(allocation);
      await tx.bedAllocation.upsert({
        where: { id: allocation.id },
        create: { id: allocation.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.bedAllocation.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
