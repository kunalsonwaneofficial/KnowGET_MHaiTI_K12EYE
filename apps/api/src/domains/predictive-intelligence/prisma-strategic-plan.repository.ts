import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type ObjectiveProgressView,
  type ObjectiveView,
  type PlanReview,
  type PlanStatus,
  type StrategicPlan,
  type StrategicPlanRepository,
} from "@knowget/predictive-intelligence";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface StrategicPlanRow {
  id: string;
  tenantId: string;
  organizationId: string;
  planKey: string;
  name: string;
  description: string | null;
  startPeriod: number;
  objectives: unknown;
  progress: unknown;
  reviews: unknown;
  version: number;
  status: string;
  activatedByUserId: string | null;
  activatedAt: string | null;
  closedByUserId: string | null;
  closedAt: string | null;
  abandonmentReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `metric_keys` is deliberately absent here. It is a projection this adapter derives on write and the domain
 * knows nothing about, so reading it back would put a persistence artefact on the aggregate and give the plan
 * two accounts of its own metrics — one of which could be stale.
 */
function toDomain(row: StrategicPlanRow): StrategicPlan {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    planKey: row.planKey,
    name: row.name,
    description: row.description,
    startPeriod: row.startPeriod,
    objectives: (row.objectives as ObjectiveView[]) ?? [],
    progress: (row.progress as ObjectiveProgressView[]) ?? [],
    reviews: (row.reviews as PlanReview[]) ?? [],
    version: row.version,
    status: row.status as PlanStatus,
    activatedByUserId: (row.activatedByUserId as Uuid | null) ?? null,
    activatedAt: (row.activatedAt as ISODateString | null) ?? null,
    closedByUserId: (row.closedByUserId as Uuid | null) ?? null,
    closedAt: (row.closedAt as ISODateString | null) ?? null,
    abandonmentReason: row.abandonmentReason,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

/**
 * The distinct metric keys a plan measures itself by, derived from its objectives on every write.
 *
 * Derived rather than accepted, and derived here rather than in the domain, because it is an index and not a
 * fact: the objectives already say which metrics a plan tracks, and a second copy a caller could set would be
 * a second answer to a question that has one. Sorted so that the same objective set always produces the same
 * array and a save that changed nothing writes nothing different.
 */
function metricKeysOf(plan: StrategicPlan): string[] {
  return [...new Set(plan.objectives.map((objective) => objective.metricKey))].sort();
}

function toFields(plan: StrategicPlan) {
  return {
    tenantId: plan.tenantId,
    organizationId: plan.organizationId,
    planKey: plan.planKey,
    name: plan.name,
    description: plan.description,
    startPeriod: plan.startPeriod,
    objectives: JSON.parse(JSON.stringify(plan.objectives)),
    metricKeys: metricKeysOf(plan),
    progress: JSON.parse(JSON.stringify(plan.progress)),
    reviews: JSON.parse(JSON.stringify(plan.reviews)),
    version: plan.version,
    status: plan.status,
    activatedByUserId: plan.activatedByUserId,
    activatedAt: plan.activatedAt,
    closedByUserId: plan.closedByUserId,
    closedAt: plan.closedAt,
    abandonmentReason: plan.abandonmentReason,
  };
}

/**
 * Prisma-backed {@link StrategicPlanRepository} (RLS via {@link withTenant}).
 *
 * Objectives, progress and reviews are all JSONB on the plan row, and each of the three has its own reason.
 * `version` identifies the objective set a review's frozen variance was computed against. Progress is held in
 * arrival order rather than sorted, because "the latest reading" means the one recorded last and not the one at
 * the highest period — a correction arriving after a later reading is exactly the case a sort would silently
 * reorder. And a review keeps the variance it saw rather than one recomputed on read, which is the difference
 * between a record of what leadership was told and a recalculation of what they should have been told. None of
 * the three survives children that can be written on their own.
 *
 * `metric_keys` is the one derived column. It is the GIN-indexed array behind {@link listByMetric}, which is
 * the read that finds every plan reviewing itself against a series that has since taken a correction — the
 * question a data steward asks after fixing history, and one that would otherwise be a scan over JSONB.
 *
 * There is no `remove`. An abandoned plan is the record that a course was tried and changed, and deleting it
 * turns a decision into an omission.
 */
export class PrismaStrategicPlanRepository implements StrategicPlanRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<StrategicPlan | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.strategicPlan.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  findByKey(
    tenantId: TenantId,
    organizationId: Uuid,
    planKey: string,
  ): Promise<StrategicPlan | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.strategicPlan.findFirst({ where: { organizationId, planKey } });
      return row ? toDomain(row) : null;
    });
  }

  /** What the institution is currently committed to. Drafts are not commitments; closed plans are history. */
  listActive(tenantId: TenantId): Promise<StrategicPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.strategicPlan.findMany({ where: { status: "active" } });
      return rows.map(toDomain);
    });
  }

  /** Every plan with an objective on this metric, served by the GIN index on the derived `metric_keys`. */
  listByMetric(tenantId: TenantId, metricKey: string): Promise<StrategicPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.strategicPlan.findMany({ where: { metricKeys: { has: metricKey } } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<StrategicPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.strategicPlan.findMany({ where: { organizationId } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<StrategicPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.strategicPlan.findMany();
      return rows.map(toDomain);
    });
  }

  save(plan: StrategicPlan): Promise<void> {
    return withTenant(this.db, plan.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(plan);
      await tx.strategicPlan.upsert({
        where: { id: plan.id },
        create: { id: plan.id, ...fields },
        update: fields,
      });
    });
  }
}
