import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  GovernanceBody,
  GovernanceBodyRepository,
  GovernanceBodyStatus,
  GovernanceBodyType,
} from "@knowget/governance";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface GovernanceBodyRow {
  id: string;
  tenantId: string;
  organizationId: string;
  parentBodyId: string | null;
  name: string;
  type: string;
  status: string;
  termsOfReference: string | null;
  establishedOn: Date | null;
  dissolvedOn: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const toDate = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

function toDomain(row: GovernanceBodyRow): GovernanceBody {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    parentBodyId: row.parentBodyId as Uuid | null,
    name: row.name,
    type: row.type as GovernanceBodyType,
    status: row.status as GovernanceBodyStatus,
    termsOfReference: row.termsOfReference,
    establishedOn: toDate(row.establishedOn),
    dissolvedOn: toDate(row.dissolvedOn),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(body: GovernanceBody) {
  return {
    tenantId: body.tenantId,
    organizationId: body.organizationId,
    parentBodyId: body.parentBodyId,
    name: body.name,
    type: body.type,
    status: body.status,
    termsOfReference: body.termsOfReference,
    establishedOn: body.establishedOn ? new Date(body.establishedOn) : null,
    dissolvedOn: body.dissolvedOn ? new Date(body.dissolvedOn) : null,
  };
}

/**
 * Prisma-backed {@link GovernanceBodyRepository}. Every operation runs inside
 * {@link withTenant} so PostgreSQL RLS scopes it to the caller's tenant. Deletes are
 * soft; reads exclude soft-deleted rows.
 */
export class PrismaGovernanceBodyRepository implements GovernanceBodyRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<GovernanceBody | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.governanceBody.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findChildren(tenantId: TenantId, parentBodyId: Uuid): Promise<GovernanceBody[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governanceBody.findMany({ where: { parentBodyId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<GovernanceBody[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governanceBody.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<GovernanceBody[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governanceBody.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(body: GovernanceBody): Promise<void> {
    return withTenant(this.db, body.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(body);
      await tx.governanceBody.upsert({
        where: { id: body.id },
        create: { id: body.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.governanceBody.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
