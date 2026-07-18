import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  Relationship,
  RelationshipKind,
  RelationshipRepository,
  RelationshipStatus,
} from "@knowget/relationship";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

/** The database row shape (Prisma model fields) for a relationship. */
interface RelationshipRow {
  id: string;
  tenantId: string;
  fromPersonId: string;
  toPersonId: string;
  kind: string;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const toDate = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

function toDomain(row: RelationshipRow): Relationship {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    fromPersonId: row.fromPersonId as Uuid,
    toPersonId: row.toPersonId as Uuid,
    kind: row.kind as RelationshipKind,
    status: row.status as RelationshipStatus,
    startDate: toDate(row.startDate),
    endDate: toDate(row.endDate),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

/** Persisted (Prisma) fields for a relationship. The return type is inferred (not
 * `Record<string, unknown>`) so the concrete field types satisfy Prisma's typed
 * create/update input. */
function toFields(relationship: Relationship) {
  return {
    tenantId: relationship.tenantId,
    fromPersonId: relationship.fromPersonId,
    toPersonId: relationship.toPersonId,
    kind: relationship.kind,
    status: relationship.status,
    startDate: relationship.startDate ? new Date(relationship.startDate) : null,
    endDate: relationship.endDate ? new Date(relationship.endDate) : null,
  };
}

/**
 * Prisma-backed {@link RelationshipRepository}. Every operation runs inside
 * {@link withTenant} so PostgreSQL RLS scopes the query to the caller's tenant
 * (defense-in-depth with the explicit tenant argument). Deletes are soft; reads
 * exclude soft-deleted rows.
 */
export class PrismaRelationshipRepository implements RelationshipRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Relationship | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.relationship.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByPerson(tenantId: TenantId, personId: Uuid): Promise<Relationship[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.relationship.findMany({
        where: {
          deletedAt: null,
          OR: [{ fromPersonId: personId }, { toPersonId: personId }],
        },
      });
      return rows.map(toDomain);
    });
  }

  findBetween(tenantId: TenantId, personA: Uuid, personB: Uuid): Promise<Relationship[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.relationship.findMany({
        where: {
          deletedAt: null,
          OR: [
            { fromPersonId: personA, toPersonId: personB },
            { fromPersonId: personB, toPersonId: personA },
          ],
        },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Relationship[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.relationship.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(relationship: Relationship): Promise<void> {
    return withTenant(this.db, relationship.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(relationship);
      await tx.relationship.upsert({
        where: { id: relationship.id },
        create: { id: relationship.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.relationship.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
