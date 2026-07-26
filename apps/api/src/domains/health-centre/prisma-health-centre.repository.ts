import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  CentreStatus,
  CentreType,
  HealthCentre,
  HealthCentreRepository,
} from "@knowget/health-centre";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface HealthCentreRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  name: string;
  type: string;
  sickBayCapacity: number;
  leadClinicianId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: HealthCentreRow): HealthCentre {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    name: row.name,
    type: row.type as CentreType,
    sickBayCapacity: row.sickBayCapacity,
    leadClinicianId: (row.leadClinicianId as Uuid | null) ?? null,
    status: row.status as CentreStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(centre: HealthCentre) {
  return {
    tenantId: centre.tenantId,
    organizationId: centre.organizationId,
    code: centre.code,
    name: centre.name,
    type: centre.type,
    sickBayCapacity: centre.sickBayCapacity,
    leadClinicianId: centre.leadClinicianId,
    status: centre.status,
  };
}

/** Prisma-backed {@link HealthCentreRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaHealthCentreRepository implements HealthCentreRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<HealthCentre | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.healthCentre.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<HealthCentre | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.healthCentre.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<HealthCentre[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.healthCentre.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<HealthCentre[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.healthCentre.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(centre: HealthCentre): Promise<void> {
    return withTenant(this.db, centre.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(centre);
      await tx.healthCentre.upsert({
        where: { id: centre.id },
        create: { id: centre.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.healthCentre.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
