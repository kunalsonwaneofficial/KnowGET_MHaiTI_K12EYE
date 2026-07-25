import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  AssignmentStatus,
  VehicleAssignment,
  VehicleAssignmentRepository,
} from "@knowget/transport";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface VehicleAssignmentRow {
  id: string;
  tenantId: string;
  organizationId: string;
  routeId: string;
  vehicleId: string;
  driverId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: VehicleAssignmentRow): VehicleAssignment {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    routeId: row.routeId as Uuid,
    vehicleId: row.vehicleId as Uuid,
    driverId: row.driverId as Uuid,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    status: row.status as AssignmentStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(assignment: VehicleAssignment) {
  return {
    tenantId: assignment.tenantId,
    organizationId: assignment.organizationId,
    routeId: assignment.routeId,
    vehicleId: assignment.vehicleId,
    driverId: assignment.driverId,
    effectiveFrom: assignment.effectiveFrom,
    effectiveTo: assignment.effectiveTo,
    status: assignment.status,
  };
}

/** Prisma-backed {@link VehicleAssignmentRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaVehicleAssignmentRepository implements VehicleAssignmentRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<VehicleAssignment | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.vehicleAssignment.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findActiveByRoute(tenantId: TenantId, routeId: Uuid): Promise<VehicleAssignment | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.vehicleAssignment.findFirst({
        where: { routeId, status: "active", deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByRoute(tenantId: TenantId, routeId: Uuid): Promise<VehicleAssignment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.vehicleAssignment.findMany({ where: { routeId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByVehicle(tenantId: TenantId, vehicleId: Uuid): Promise<VehicleAssignment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.vehicleAssignment.findMany({ where: { vehicleId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<VehicleAssignment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.vehicleAssignment.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<VehicleAssignment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.vehicleAssignment.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(assignment: VehicleAssignment): Promise<void> {
    return withTenant(this.db, assignment.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(assignment);
      await tx.vehicleAssignment.upsert({
        where: { id: assignment.id },
        create: { id: assignment.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.vehicleAssignment.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
