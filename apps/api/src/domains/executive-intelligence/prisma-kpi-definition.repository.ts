import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type HealthPillar,
  type KpiDefinition,
  type KpiDefinitionRepository,
  type KpiStatus,
  type MeasurementScale,
} from "@knowget/executive-intelligence";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface KpiDefinitionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  kpiKey: string;
  name: string;
  description: string | null;
  pillar: string;
  sourceDomain: string;
  scale: unknown;
  targetScore: number | null;
  status: string;
  activatedAt: string | null;
  retiredAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: KpiDefinitionRow): KpiDefinition {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    kpiKey: row.kpiKey,
    name: row.name,
    description: row.description,
    pillar: row.pillar as HealthPillar,
    sourceDomain: row.sourceDomain,
    scale: row.scale as MeasurementScale,
    targetScore: row.targetScore,
    status: row.status as KpiStatus,
    activatedAt: (row.activatedAt as ISODateString | null) ?? null,
    retiredAt: (row.retiredAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(definition: KpiDefinition) {
  return {
    tenantId: definition.tenantId,
    organizationId: definition.organizationId,
    kpiKey: definition.kpiKey,
    name: definition.name,
    description: definition.description,
    pillar: definition.pillar,
    sourceDomain: definition.sourceDomain,
    scale: JSON.parse(JSON.stringify(definition.scale)),
    targetScore: definition.targetScore,
    status: definition.status,
    activatedAt: definition.activatedAt,
    retiredAt: definition.retiredAt,
  };
}

/**
 * Prisma-backed {@link KpiDefinitionRepository} (RLS via {@link withTenant}).
 *
 * The scale is a JSONB column rather than a table of anchors, and that is the one decision here worth stating.
 * A scale is what *good* means for an indicator, it is frozen from activation onward, and every reading ever
 * scored by it was scored by the whole of it. An anchor row that could be written on its own would let a scale
 * change one point at a time, and every figure already filed under the old shape would silently come to mean
 * something else — with no version to notice it by, because the indicator would not have changed.
 *
 * There is no `remove`, and the port declares none. An indicator the institution has stopped using is retired,
 * which keeps the readings behind it explicable; deleting it would leave a pillar's history with a denominator
 * nobody can reconstruct.
 */
export class PrismaKpiDefinitionRepository implements KpiDefinitionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<KpiDefinition | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.kpiDefinition.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  findByKey(tenantId: TenantId, kpiKey: string): Promise<KpiDefinition | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.kpiDefinition.findFirst({ where: { kpiKey } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * What the institution currently says it measures for one organization node, which is the denominator every
   * coverage figure in this domain is computed against. Retired and draft indicators are left out deliberately:
   * a pillar is not short of evidence because it once measured something it has since stopped measuring.
   */
  listActive(tenantId: TenantId, organizationId: Uuid): Promise<KpiDefinition[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.kpiDefinition.findMany({
        where: { organizationId, status: "active" },
        orderBy: { kpiKey: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<KpiDefinition[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.kpiDefinition.findMany({ orderBy: { kpiKey: "asc" } });
      return rows.map(toDomain);
    });
  }

  save(definition: KpiDefinition): Promise<void> {
    return withTenant(this.db, definition.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(definition);
      await tx.kpiDefinition.upsert({
        where: { id: definition.id },
        create: { id: definition.id, ...fields },
        update: fields,
      });
    });
  }
}
