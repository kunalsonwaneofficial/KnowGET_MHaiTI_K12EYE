import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type Dashboard,
  type DashboardPanel,
  type DashboardRepository,
  type DashboardStatus,
} from "@knowget/executive-intelligence";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface DashboardRow {
  id: string;
  tenantId: string;
  organizationId: string;
  dashboardKey: string;
  name: string;
  description: string | null;
  panels: unknown;
  status: string;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: DashboardRow): Dashboard {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    dashboardKey: row.dashboardKey,
    name: row.name,
    description: row.description,
    panels: (row.panels as DashboardPanel[]) ?? [],
    status: row.status as DashboardStatus,
    publishedAt: (row.publishedAt as ISODateString | null) ?? null,
    archivedAt: (row.archivedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(dashboard: Dashboard) {
  return {
    tenantId: dashboard.tenantId,
    organizationId: dashboard.organizationId,
    dashboardKey: dashboard.dashboardKey,
    name: dashboard.name,
    description: dashboard.description,
    panels: JSON.parse(JSON.stringify(dashboard.panels)),
    status: dashboard.status,
    publishedAt: dashboard.publishedAt,
    archivedAt: dashboard.archivedAt,
  };
}

/**
 * Prisma-backed {@link DashboardRepository} (RLS via {@link withTenant}).
 *
 * The panels are a JSONB array on the dashboard, and the array order is the layout — this domain has no
 * coordinates, so position is nothing but index. A panel table would need an explicit ordinal column kept
 * consistent across inserts and deletes, and the first time two writers disagreed about it the dashboard would
 * reorder itself under a viewer with no edit to point at. Held as one document, a reordering is one write.
 *
 * Nothing here filters panels by scope. Composition does that, on the way out, per viewer — a repository that
 * pre-filtered would have to be told who is asking, and a store that answers differently depending on the reader
 * is a store nobody can reason about.
 *
 * There is no `remove`, and the port declares none. A dashboard nobody should open any more is archived, which
 * keeps saved links resolving to something that explains itself instead of a dead key.
 */
export class PrismaDashboardRepository implements DashboardRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Dashboard | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.dashboard.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  findByKey(tenantId: TenantId, dashboardKey: string): Promise<Dashboard | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.dashboard.findFirst({ where: { dashboardKey } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * What a viewer at this organization node could actually open. Drafts and archives are left out here rather
   * than in the caller because a draft dashboard is not a dashboard a viewer is missing permission for — it is
   * one the institution has not finished writing, and the two deserve different answers.
   */
  listPublished(tenantId: TenantId, organizationId: Uuid): Promise<Dashboard[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.dashboard.findMany({
        where: { organizationId, status: "published" },
        orderBy: { dashboardKey: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Dashboard[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.dashboard.findMany({ orderBy: { dashboardKey: "asc" } });
      return rows.map(toDomain);
    });
  }

  save(dashboard: Dashboard): Promise<void> {
    return withTenant(this.db, dashboard.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(dashboard);
      await tx.dashboard.upsert({
        where: { id: dashboard.id },
        create: { id: dashboard.id, ...fields },
        update: fields,
      });
    });
  }
}
