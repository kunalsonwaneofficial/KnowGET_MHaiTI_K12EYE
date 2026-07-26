import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { Bed, Room, RoomRepository, RoomStatus, RoomType } from "@knowget/residential";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface RoomRow {
  id: string;
  tenantId: string;
  organizationId: string;
  hostelId: string;
  roomNumber: string;
  floor: number | null;
  type: string;
  beds: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: RoomRow): Room {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    hostelId: row.hostelId as Uuid,
    roomNumber: row.roomNumber,
    floor: row.floor,
    type: row.type as RoomType,
    beds: (row.beds as Bed[]) ?? [],
    status: row.status as RoomStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(room: Room) {
  return {
    tenantId: room.tenantId,
    organizationId: room.organizationId,
    hostelId: room.hostelId,
    roomNumber: room.roomNumber,
    floor: room.floor,
    type: room.type,
    beds: JSON.parse(JSON.stringify(room.beds)),
    status: room.status,
  };
}

/** Prisma-backed {@link RoomRepository} (RLS via {@link withTenant}; soft delete; beds JSONB). */
export class PrismaRoomRepository implements RoomRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Room | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.room.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByHostelAndNumber(
    tenantId: TenantId,
    hostelId: Uuid,
    roomNumber: string,
  ): Promise<Room | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.room.findFirst({ where: { hostelId, roomNumber, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByHostel(tenantId: TenantId, hostelId: Uuid): Promise<Room[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.room.findMany({ where: { hostelId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Room[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.room.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Room[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.room.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(room: Room): Promise<void> {
    return withTenant(this.db, room.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(room);
      await tx.room.upsert({
        where: { id: room.id },
        create: { id: room.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.room.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
