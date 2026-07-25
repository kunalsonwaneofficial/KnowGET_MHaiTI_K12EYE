import type {
  AvailabilityWindow,
  Resource,
  ResourceKind,
  ResourceRepository,
  ResourceStatus,
} from "@knowget/academic-scheduling";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface ResourceRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  name: string;
  kind: string;
  capacity: number | null;
  location: string | null;
  availabilityWindows: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ResourceRow): Resource {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    name: row.name,
    kind: row.kind as ResourceKind,
    capacity: row.capacity,
    location: row.location,
    availabilityWindows: (row.availabilityWindows as AvailabilityWindow[]) ?? [],
    status: row.status as ResourceStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(resource: Resource) {
  return {
    tenantId: resource.tenantId,
    organizationId: resource.organizationId,
    code: resource.code,
    name: resource.name,
    kind: resource.kind,
    capacity: resource.capacity,
    location: resource.location,
    availabilityWindows: JSON.parse(JSON.stringify(resource.availabilityWindows)),
    status: resource.status,
  };
}

/** Prisma-backed {@link ResourceRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaResourceRepository implements ResourceRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Resource | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.resource.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, organizationId: Uuid, code: string): Promise<Resource | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.resource.findFirst({
        where: { organizationId, code, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Resource[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.resource.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Resource[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.resource.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(resource: Resource): Promise<void> {
    return withTenant(this.db, resource.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(resource);
      await tx.resource.upsert({
        where: { id: resource.id },
        create: { id: resource.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.resource.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
