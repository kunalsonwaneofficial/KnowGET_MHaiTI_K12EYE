import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { Driver, DriverRepository, DriverStatus } from "@knowget/transport";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface DriverRow {
  id: string;
  tenantId: string;
  organizationId: string;
  employeeId: string;
  licenseNumber: string;
  licenseClass: string | null;
  licenseExpiry: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: DriverRow): Driver {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    employeeId: row.employeeId as Uuid,
    licenseNumber: row.licenseNumber,
    licenseClass: row.licenseClass,
    licenseExpiry: row.licenseExpiry,
    status: row.status as DriverStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(driver: Driver) {
  return {
    tenantId: driver.tenantId,
    organizationId: driver.organizationId,
    employeeId: driver.employeeId,
    licenseNumber: driver.licenseNumber,
    licenseClass: driver.licenseClass,
    licenseExpiry: driver.licenseExpiry,
    status: driver.status,
  };
}

/** Prisma-backed {@link DriverRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaDriverRepository implements DriverRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Driver | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.driver.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByLicense(tenantId: TenantId, licenseNumber: string): Promise<Driver | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.driver.findFirst({ where: { licenseNumber, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Driver | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.driver.findFirst({ where: { employeeId, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Driver[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.driver.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Driver[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.driver.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(driver: Driver): Promise<void> {
    return withTenant(this.db, driver.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(driver);
      await tx.driver.upsert({
        where: { id: driver.id },
        create: { id: driver.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.driver.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
