import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type HealthIndexDefinition,
  type HealthIndexDefinitionRepository,
  type IndexStatus,
  type PeriodGrain,
  type PillarWeight,
} from "@knowget/executive-intelligence";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface HealthIndexDefinitionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  indexKey: string;
  name: string;
  description: string | null;
  grain: string;
  weights: unknown;
  status: string;
  supersededById: string | null;
  publishedAt: string | null;
  supersededAt: string | null;
  retiredAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: HealthIndexDefinitionRow): HealthIndexDefinition {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    indexKey: row.indexKey,
    name: row.name,
    description: row.description,
    grain: row.grain as PeriodGrain,
    weights: (row.weights as PillarWeight[]) ?? [],
    status: row.status as IndexStatus,
    supersededById: (row.supersededById as Uuid | null) ?? null,
    publishedAt: (row.publishedAt as ISODateString | null) ?? null,
    supersededAt: (row.supersededAt as ISODateString | null) ?? null,
    retiredAt: (row.retiredAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(definition: HealthIndexDefinition) {
  return {
    tenantId: definition.tenantId,
    organizationId: definition.organizationId,
    indexKey: definition.indexKey,
    name: definition.name,
    description: definition.description,
    grain: definition.grain,
    weights: JSON.parse(JSON.stringify(definition.weights)),
    status: definition.status,
    supersededById: definition.supersededById,
    publishedAt: definition.publishedAt,
    supersededAt: definition.supersededAt,
    retiredAt: definition.retiredAt,
  };
}

/**
 * Prisma-backed {@link HealthIndexDefinitionRepository} (RLS via {@link withTenant}).
 *
 * The weights are a JSONB column for the reason the aggregate freezes them: they are one statement about the
 * institution, not ten independent ones. A row per pillar would let a composition change a weight at a time, and
 * between two of those writes the declared weight would not sum to anything — so an assessment computed in that
 * window would be scored against a composition the institution never held, and there would be nothing in the
 * record afterwards to say so.
 *
 * There is no `remove`, and the port declares none. A reweighting supersedes rather than replaces, so the
 * definition every filed assessment was computed under stays exactly where that assessment points.
 */
export class PrismaHealthIndexDefinitionRepository implements HealthIndexDefinitionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<HealthIndexDefinition | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.healthIndexDefinition.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * The composition an institution is currently measuring itself under. There is at most one, and the partial
   * unique index on this table — `(tenant_id, index_key) WHERE status = 'published'` — is what makes that a fact
   * rather than a hope, since two published definitions for one key would give the same period two defensible
   * and different answers with no way to say which was asked.
   */
  findPublishedByKey(tenantId: TenantId, indexKey: string): Promise<HealthIndexDefinition | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.healthIndexDefinition.findFirst({
        where: { indexKey, status: "published" },
      });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * Every composition this institution has measured itself under, oldest first, drafts and retirements included.
   * Ordering by creation walks the supersession chain forward, which is what lets a reader look at a step in the
   * series and tell a change of fortune from a change of question.
   */
  listByKey(tenantId: TenantId, indexKey: string): Promise<HealthIndexDefinition[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.healthIndexDefinition.findMany({
        where: { indexKey },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<HealthIndexDefinition[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.healthIndexDefinition.findMany({
        orderBy: [{ indexKey: "asc" }, { createdAt: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  save(definition: HealthIndexDefinition): Promise<void> {
    return withTenant(this.db, definition.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(definition);
      await tx.healthIndexDefinition.upsert({
        where: { id: definition.id },
        create: { id: definition.id, ...fields },
        update: fields,
      });
    });
  }
}
