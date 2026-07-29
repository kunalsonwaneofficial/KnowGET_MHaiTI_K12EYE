import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type CycleStage,
  type ImprovementCycle,
  type ImprovementCycleRepository,
} from "@knowget/platform-evolution";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

/** Cycle stages still running — the complement of the domain's terminal set. */
const OPEN_CYCLE_STAGES = ["planning", "executing", "reviewing"];

interface ImprovementCycleRow {
  id: string;
  tenantId: string;
  organizationId: string;
  cycleKey: string;
  intent: string;
  stage: string;
  startPeriod: number;
  endPeriod: number;
  periods: number;
  lessonsRecorded: number;
  openedBy: string;
  executionStartedAt: string | null;
  reviewStartedAt: string | null;
  settledAt: string | null;
  settledBy: string | null;
  abandonmentReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ImprovementCycleRow): ImprovementCycle {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    cycleKey: row.cycleKey,
    intent: row.intent,
    stage: row.stage as CycleStage,
    startPeriod: row.startPeriod,
    endPeriod: row.endPeriod,
    periods: row.periods,
    lessonsRecorded: row.lessonsRecorded,
    openedBy: row.openedBy as Uuid,
    executionStartedAt: (row.executionStartedAt as ISODateString | null) ?? null,
    reviewStartedAt: (row.reviewStartedAt as ISODateString | null) ?? null,
    settledAt: (row.settledAt as ISODateString | null) ?? null,
    settledBy: (row.settledBy as Uuid | null) ?? null,
    abandonmentReason: row.abandonmentReason,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(cycle: ImprovementCycle) {
  return {
    tenantId: cycle.tenantId,
    organizationId: cycle.organizationId,
    cycleKey: cycle.cycleKey,
    intent: cycle.intent,
    stage: cycle.stage,
    startPeriod: cycle.startPeriod,
    endPeriod: cycle.endPeriod,
    periods: cycle.periods,
    lessonsRecorded: cycle.lessonsRecorded,
    openedBy: cycle.openedBy,
    executionStartedAt: cycle.executionStartedAt,
    reviewStartedAt: cycle.reviewStartedAt,
    settledAt: cycle.settledAt,
    settledBy: cycle.settledBy,
    abandonmentReason: cycle.abandonmentReason,
  };
}

/**
 * Prisma-backed {@link ImprovementCycleRepository} (RLS via {@link withTenant}).
 *
 * `periods` is stored beside the span it was derived from, which looks redundant and is not. The span is on the
 * caller's period grid, and a grid can be redefined — a school that moves from terms to months has changed what
 * the numbers on either end of an old cycle mean. Storing the length the cadence engine computed at the time
 * keeps a closed cycle's duration reproducible years later, when the only other way to recover it would be to
 * remember which calendar the institution was keeping when it opened.
 *
 * `lessonsRecorded` is counted once at closure rather than maintained as a running total, and that is the
 * difference between a fact and a cache. A running count would drift the moment a lesson was recorded against a
 * cycle by any route that did not go through here, and a cycle whose stated output disagreed with the lessons
 * actually citing it would undermine the one closure rule this domain has: a round that produced nothing does
 * not get to close.
 *
 * There is no `remove`. An abandoned cycle carries its reason and stays, because a year the institution set out
 * to improve something and stopped is exactly the kind of thing an improvement record exists to still know.
 */
export class PrismaImprovementCycleRepository implements ImprovementCycleRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ImprovementCycle | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.improvementCycle.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * The key lookup behind the one-cycle-per-key rule. The same key is what a cycle's lessons carry as their
   * origin reference, so this read is also how a retrospective's provenance resolves back to the round it came
   * out of.
   */
  findByKey(tenantId: TenantId, cycleKey: string): Promise<ImprovementCycle | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.improvementCycle.findFirst({ where: { cycleKey } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * Every round still running — planning, executing or reviewing — in the order they were meant to start.
   *
   * Committed order rather than arrival order, because a cycle carries the span it promised and this read plus
   * the caller's own period is the whole of *what did we say we would improve, and where has it got to*. A round
   * still sitting in planning three periods after it was due to start is the failure this list has to surface,
   * and it only surfaces if the sort is the promise rather than the paperwork.
   */
  listOpen(tenantId: TenantId, organizationId: Uuid): Promise<ImprovementCycle[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.improvementCycle.findMany({
        where: { organizationId, stage: { in: OPEN_CYCLE_STAGES } },
        orderBy: [{ startPeriod: "asc" }, { cycleKey: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<ImprovementCycle[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.improvementCycle.findMany({ orderBy: { cycleKey: "asc" } });
      return rows.map(toDomain);
    });
  }

  save(cycle: ImprovementCycle): Promise<void> {
    return withTenant(this.db, cycle.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(cycle);
      await tx.improvementCycle.upsert({
        where: { id: cycle.id },
        create: { id: cycle.id, ...fields },
        update: fields,
      });
    });
  }
}
