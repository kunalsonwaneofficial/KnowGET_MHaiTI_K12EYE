import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type LeverView,
  type Scenario,
  type ScenarioRepository,
  type ScenarioStatus,
} from "@knowget/predictive-intelligence";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface ScenarioRow {
  id: string;
  tenantId: string;
  organizationId: string;
  scenarioKey: string;
  name: string;
  description: string | null;
  levers: unknown;
  version: number;
  status: string;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ScenarioRow): Scenario {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    scenarioKey: row.scenarioKey,
    name: row.name,
    description: row.description,
    levers: (row.levers as LeverView[]) ?? [],
    version: row.version,
    status: row.status as ScenarioStatus,
    publishedAt: (row.publishedAt as ISODateString | null) ?? null,
    archivedAt: (row.archivedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(scenario: Scenario) {
  return {
    tenantId: scenario.tenantId,
    organizationId: scenario.organizationId,
    scenarioKey: scenario.scenarioKey,
    name: scenario.name,
    description: scenario.description,
    levers: JSON.parse(JSON.stringify(scenario.levers)),
    version: scenario.version,
    status: scenario.status,
    publishedAt: scenario.publishedAt,
    archivedAt: scenario.archivedAt,
  };
}

/**
 * Prisma-backed {@link ScenarioRepository} (RLS via {@link withTenant}).
 *
 * The levers are a JSONB column on the scenario, for the same reason the observations are one on the series:
 * `version` identifies the lever set as a whole and a simulation pins that number, so a lever written on its
 * own would change what a recorded outcome claimed to be a departure from. Application order matters too — an
 * override after a multiplier is a different scenario from a multiplier after an override — and order is a
 * property of the set rather than of any row in it.
 *
 * Soft-deleted, with `deletedAt: null` on every read. Discarding reaches only a draft nothing was simulated
 * against; a published case is archived, because outcomes cite it and an archived case still answers what they
 * were exploring.
 */
export class PrismaScenarioRepository implements ScenarioRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Scenario | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.scenario.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByKey(
    tenantId: TenantId,
    organizationId: Uuid,
    scenarioKey: string,
  ): Promise<Scenario | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.scenario.findFirst({
        where: { organizationId, scenarioKey, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Scenario[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.scenario.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  /** The cases that may be simulated against. A draft is still being written; an archived one is history. */
  listPublished(tenantId: TenantId): Promise<Scenario[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.scenario.findMany({ where: { status: "published", deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Scenario[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.scenario.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(scenario: Scenario): Promise<void> {
    return withTenant(this.db, scenario.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(scenario);
      await tx.scenario.upsert({
        where: { id: scenario.id },
        create: { id: scenario.id, ...fields },
        update: fields,
      });
    });
  }

  /** Soft-delete. Reachable only for a draft nothing was simulated against — a published case is archived. */
  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.scenario.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
