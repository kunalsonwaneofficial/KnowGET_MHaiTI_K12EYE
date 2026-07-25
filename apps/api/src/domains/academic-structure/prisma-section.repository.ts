import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { Section, SectionRepository, SectionStatus } from "@knowget/academic-structure";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface SectionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  classId: string;
  name: string;
  capacity: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: SectionRow): Section {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    classId: row.classId as Uuid,
    name: row.name,
    capacity: row.capacity,
    status: row.status as SectionStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(section: Section) {
  return {
    tenantId: section.tenantId,
    organizationId: section.organizationId,
    classId: section.classId,
    name: section.name,
    capacity: section.capacity,
    status: section.status,
  };
}

/** Prisma-backed {@link SectionRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaSectionRepository implements SectionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Section | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.section.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByName(tenantId: TenantId, classId: Uuid, name: string): Promise<Section | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.section.findFirst({ where: { classId, name, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByClass(tenantId: TenantId, classId: Uuid): Promise<Section[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.section.findMany({ where: { classId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Section[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.section.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Section[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.section.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(section: Section): Promise<void> {
    return withTenant(this.db, section.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(section);
      await tx.section.upsert({
        where: { id: section.id },
        create: { id: section.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.section.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
