import type { Audience, AudienceRepository, AudienceStatus } from "@knowget/engagement";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AudienceRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  name: string;
  description: string | null;
  criteriaLabel: string | null;
  memberPersonIds: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AudienceRow): Audience {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    name: row.name,
    description: row.description,
    criteriaLabel: row.criteriaLabel,
    memberPersonIds: (row.memberPersonIds as Uuid[] | null) ?? [],
    status: row.status as AudienceStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(audience: Audience) {
  return {
    tenantId: audience.tenantId,
    organizationId: audience.organizationId,
    code: audience.code,
    name: audience.name,
    description: audience.description,
    criteriaLabel: audience.criteriaLabel,
    // Serialize to a plain JSON value for the JSONB column.
    memberPersonIds: JSON.parse(JSON.stringify(audience.memberPersonIds)),
    status: audience.status,
  };
}

/** Prisma-backed {@link AudienceRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAudienceRepository implements AudienceRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Audience | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.audience.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<Audience | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.audience.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Audience[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.audience.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Audience[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.audience.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(audience: Audience): Promise<void> {
    return withTenant(this.db, audience.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(audience);
      await tx.audience.upsert({
        where: { id: audience.id },
        create: { id: audience.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.audience.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
