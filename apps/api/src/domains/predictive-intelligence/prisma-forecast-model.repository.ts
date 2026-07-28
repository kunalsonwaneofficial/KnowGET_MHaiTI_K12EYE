import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type ConfidenceLevel,
  type ForecastMethod,
  type ForecastModel,
  type ForecastModelRepository,
  type ModelStatus,
  type ProjectionParameters,
} from "@knowget/predictive-intelligence";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface ForecastModelRow {
  id: string;
  tenantId: string;
  organizationId: string;
  modelKey: string;
  name: string;
  description: string | null;
  method: string;
  parameters: unknown;
  confidenceLevels: number[];
  version: number;
  status: string;
  publishedAt: string | null;
  retiredAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ForecastModelRow): ForecastModel {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    modelKey: row.modelKey,
    name: row.name,
    description: row.description,
    method: row.method as ForecastMethod,
    parameters: (row.parameters as ProjectionParameters) ?? {},
    confidenceLevels: row.confidenceLevels as ConfidenceLevel[],
    version: row.version,
    status: row.status as ModelStatus,
    publishedAt: (row.publishedAt as ISODateString | null) ?? null,
    retiredAt: (row.retiredAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(model: ForecastModel) {
  return {
    tenantId: model.tenantId,
    organizationId: model.organizationId,
    modelKey: model.modelKey,
    name: model.name,
    description: model.description,
    method: model.method,
    parameters: JSON.parse(JSON.stringify(model.parameters)),
    confidenceLevels: [...model.confidenceLevels],
    version: model.version,
    status: model.status,
    publishedAt: model.publishedAt,
    retiredAt: model.retiredAt,
  };
}

/**
 * Prisma-backed {@link ForecastModelRepository} (RLS via {@link withTenant}).
 *
 * A key does not identify a model here — a key and a version do — because a published model is frozen while
 * runs are pinning it, and revising one opens a new draft beside it rather than editing what the record already
 * cites. That is why `findByKeyAndVersion` is the unique lookup, `findPublishedByKey` is the runtime's question
 * (which version may be projected with right now), and `listVersionsOfKey` returns the family in version order
 * rather than by timestamp — versions are the sequence, and a clock agrees with them only by coincidence.
 *
 * Soft-deleted, and the `deletedAt: null` filter is on every read. Discarding is reachable only for a draft
 * nothing was ever run against; a published model is retired, which is a state and not an absence.
 */
export class PrismaForecastModelRepository implements ForecastModelRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ForecastModel | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.forecastModel.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByKeyAndVersion(
    tenantId: TenantId,
    modelKey: string,
    version: number,
  ): Promise<ForecastModel | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.forecastModel.findFirst({
        where: { modelKey, version, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  /** The one version of a key that may be projected with. At most one exists — the aggregate retires the last. */
  findPublishedByKey(tenantId: TenantId, modelKey: string): Promise<ForecastModel | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.forecastModel.findFirst({
        where: { modelKey, status: "published", deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listVersionsOfKey(tenantId: TenantId, modelKey: string): Promise<ForecastModel[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.forecastModel.findMany({
        where: { modelKey, deletedAt: null },
        orderBy: { version: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  listPublished(tenantId: TenantId): Promise<ForecastModel[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.forecastModel.findMany({
        where: { status: "published", deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<ForecastModel[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.forecastModel.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(model: ForecastModel): Promise<void> {
    return withTenant(this.db, model.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(model);
      await tx.forecastModel.upsert({
        where: { id: model.id },
        create: { id: model.id, ...fields },
        update: fields,
      });
    });
  }

  /** Soft-delete. Reachable only for a draft — a published version is retired instead. */
  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.forecastModel.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
