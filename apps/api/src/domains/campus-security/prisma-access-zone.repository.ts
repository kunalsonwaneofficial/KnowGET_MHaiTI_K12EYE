import type {
  AccessZone,
  AccessZoneRepository,
  SecurityLevel,
  ZoneStatus,
} from "@knowget/campus-security";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AccessZoneRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  name: string;
  securityLevel: string;
  capacity: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AccessZoneRow): AccessZone {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    name: row.name,
    securityLevel: row.securityLevel as SecurityLevel,
    capacity: row.capacity,
    status: row.status as ZoneStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(zone: AccessZone) {
  return {
    tenantId: zone.tenantId,
    organizationId: zone.organizationId,
    code: zone.code,
    name: zone.name,
    securityLevel: zone.securityLevel,
    capacity: zone.capacity,
    status: zone.status,
  };
}

/** Prisma-backed {@link AccessZoneRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAccessZoneRepository implements AccessZoneRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AccessZone | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.accessZone.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<AccessZone | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.accessZone.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AccessZone[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.accessZone.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AccessZone[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.accessZone.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(zone: AccessZone): Promise<void> {
    return withTenant(this.db, zone.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(zone);
      await tx.accessZone.upsert({
        where: { id: zone.id },
        create: { id: zone.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.accessZone.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
