import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  RouteDirection,
  Trip,
  TripEvent,
  TripRepository,
  TripStatus,
} from "@knowget/transport";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface TripRow {
  id: string;
  tenantId: string;
  organizationId: string;
  routeId: string;
  vehicleId: string;
  driverId: string;
  serviceDate: string;
  direction: string;
  capacity: number;
  events: unknown;
  status: string;
  departedAt: string | null;
  completedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: TripRow): Trip {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    routeId: row.routeId as Uuid,
    vehicleId: row.vehicleId as Uuid,
    driverId: row.driverId as Uuid,
    serviceDate: row.serviceDate,
    direction: row.direction as RouteDirection,
    capacity: row.capacity,
    events: (row.events as TripEvent[]) ?? [],
    status: row.status as TripStatus,
    departedAt: (row.departedAt as ISODateString | null) ?? null,
    completedAt: (row.completedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(trip: Trip) {
  return {
    tenantId: trip.tenantId,
    organizationId: trip.organizationId,
    routeId: trip.routeId,
    vehicleId: trip.vehicleId,
    driverId: trip.driverId,
    serviceDate: trip.serviceDate,
    direction: trip.direction,
    capacity: trip.capacity,
    events: JSON.parse(JSON.stringify(trip.events)),
    status: trip.status,
    departedAt: trip.departedAt,
    completedAt: trip.completedAt,
  };
}

/** Prisma-backed {@link TripRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaTripRepository implements TripRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Trip | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.trip.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByRoute(tenantId: TenantId, routeId: Uuid): Promise<Trip[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.trip.findMany({ where: { routeId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByVehicle(tenantId: TenantId, vehicleId: Uuid): Promise<Trip[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.trip.findMany({ where: { vehicleId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Trip[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.trip.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Trip[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.trip.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(trip: Trip): Promise<void> {
    return withTenant(this.db, trip.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(trip);
      await tx.trip.upsert({
        where: { id: trip.id },
        create: { id: trip.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.trip.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
