import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { Membership, MembershipRepository, MembershipStatus } from "@knowget/membership";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

/** The database row shape (Prisma model fields) for a membership. */
interface MembershipRow {
  id: string;
  tenantId: string;
  personId: string;
  organizationId: string;
  roles: string[];
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const toDate = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

function toDomain(row: MembershipRow): Membership {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    personId: row.personId as Uuid,
    organizationId: row.organizationId as Uuid,
    roles: row.roles,
    status: row.status as MembershipStatus,
    startDate: toDate(row.startDate),
    endDate: toDate(row.endDate),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

/** Persisted (Prisma) fields for a membership. The return type is inferred (not
 * `Record<string, unknown>`) so the concrete field types satisfy Prisma's typed
 * create/update input. */
function toFields(membership: Membership) {
  return {
    tenantId: membership.tenantId,
    personId: membership.personId,
    organizationId: membership.organizationId,
    roles: [...membership.roles],
    status: membership.status,
    startDate: membership.startDate ? new Date(membership.startDate) : null,
    endDate: membership.endDate ? new Date(membership.endDate) : null,
  };
}

/**
 * Prisma-backed {@link MembershipRepository}. Every operation runs inside
 * {@link withTenant} so PostgreSQL RLS scopes the query to the caller's tenant
 * (defense-in-depth with the explicit tenant argument). Deletes are soft; reads
 * exclude soft-deleted rows.
 */
export class PrismaMembershipRepository implements MembershipRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Membership | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.membership.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByPerson(tenantId: TenantId, personId: Uuid): Promise<Membership[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.membership.findMany({ where: { personId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  findByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Membership[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.membership.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  findActiveByPersonAndOrg(
    tenantId: TenantId,
    personId: Uuid,
    organizationId: Uuid,
  ): Promise<Membership | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.membership.findFirst({
        where: { personId, organizationId, status: "active", deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByTenant(tenantId: TenantId): Promise<Membership[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.membership.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(membership: Membership): Promise<void> {
    return withTenant(this.db, membership.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(membership);
      await tx.membership.upsert({
        where: { id: membership.id },
        create: { id: membership.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.membership.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
