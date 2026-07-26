import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  HostelOccupancyProfile,
  HostelOccupancyProfileRepository,
} from "@knowget/residential";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface ProfileRow {
  id: string;
  tenantId: string;
  organizationId: string;
  hostelId: string;
  hostelCode: string;
  roomCount: number;
  bedCount: number;
  occupantCount: number;
  bedsAvailable: number;
  occupancyPercent: number;
  overCapacityRoomCount: number;
  overCapacity: boolean;
  version: number;
  refreshedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ProfileRow): HostelOccupancyProfile {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    hostelId: row.hostelId as Uuid,
    hostelCode: row.hostelCode,
    roomCount: row.roomCount,
    bedCount: row.bedCount,
    occupantCount: row.occupantCount,
    bedsAvailable: row.bedsAvailable,
    occupancyPercent: row.occupancyPercent,
    overCapacityRoomCount: row.overCapacityRoomCount,
    overCapacity: row.overCapacity,
    version: row.version,
    refreshedAt: (row.refreshedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(profile: HostelOccupancyProfile) {
  return {
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    hostelId: profile.hostelId,
    hostelCode: profile.hostelCode,
    roomCount: profile.roomCount,
    bedCount: profile.bedCount,
    occupantCount: profile.occupantCount,
    bedsAvailable: profile.bedsAvailable,
    occupancyPercent: profile.occupancyPercent,
    overCapacityRoomCount: profile.overCapacityRoomCount,
    overCapacity: profile.overCapacity,
    version: profile.version,
    refreshedAt: profile.refreshedAt,
  };
}

/** Prisma-backed {@link HostelOccupancyProfileRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaHostelOccupancyProfileRepository implements HostelOccupancyProfileRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<HostelOccupancyProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.hostelOccupancyProfile.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByHostel(tenantId: TenantId, hostelId: Uuid): Promise<HostelOccupancyProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.hostelOccupancyProfile.findFirst({
        where: { hostelId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<HostelOccupancyProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.hostelOccupancyProfile.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<HostelOccupancyProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.hostelOccupancyProfile.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(profile: HostelOccupancyProfile): Promise<void> {
    return withTenant(this.db, profile.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(profile);
      await tx.hostelOccupancyProfile.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.hostelOccupancyProfile.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
