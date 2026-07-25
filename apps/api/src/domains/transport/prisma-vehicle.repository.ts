import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  Vehicle,
  VehicleOwnership,
  VehicleRepository,
  VehicleStatus,
  VehicleType,
} from "@knowget/transport";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface VehicleRow {
  id: string;
  tenantId: string;
  organizationId: string;
  registrationNumber: string;
  type: string;
  make: string | null;
  model: string | null;
  seatingCapacity: number;
  ownership: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: VehicleRow): Vehicle {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    registrationNumber: row.registrationNumber,
    type: row.type as VehicleType,
    make: row.make,
    model: row.model,
    seatingCapacity: row.seatingCapacity,
    ownership: row.ownership as VehicleOwnership,
    status: row.status as VehicleStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(vehicle: Vehicle) {
  return {
    tenantId: vehicle.tenantId,
    organizationId: vehicle.organizationId,
    registrationNumber: vehicle.registrationNumber,
    type: vehicle.type,
    make: vehicle.make,
    model: vehicle.model,
    seatingCapacity: vehicle.seatingCapacity,
    ownership: vehicle.ownership,
    status: vehicle.status,
  };
}

/** Prisma-backed {@link VehicleRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaVehicleRepository implements VehicleRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Vehicle | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.vehicle.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByRegistration(tenantId: TenantId, registrationNumber: string): Promise<Vehicle | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.vehicle.findFirst({ where: { registrationNumber, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Vehicle[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.vehicle.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Vehicle[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.vehicle.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(vehicle: Vehicle): Promise<void> {
    return withTenant(this.db, vehicle.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(vehicle);
      await tx.vehicle.upsert({
        where: { id: vehicle.id },
        create: { id: vehicle.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.vehicle.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
