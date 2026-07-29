import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type AreaOutcome,
  type MaturityAssessment,
  type MaturityAssessmentRepository,
  type MaturityLevel,
  type ResolvedWeight,
} from "@knowget/platform-evolution";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface MaturityAssessmentRow {
  id: string;
  tenantId: string;
  organizationId: string;
  assessmentKey: string;
  period: number;
  weights: unknown;
  areas: unknown;
  publishable: boolean;
  index: number;
  level: string;
  coverage: number;
  areasReported: number;
  openedBy: string;
  publishedAt: string | null;
  publishedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: MaturityAssessmentRow): MaturityAssessment {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    assessmentKey: row.assessmentKey,
    period: row.period,
    weights: (row.weights as ResolvedWeight[]) ?? [],
    areas: (row.areas as AreaOutcome[]) ?? [],
    publishable: row.publishable,
    index: row.index,
    level: row.level as MaturityLevel,
    coverage: row.coverage,
    areasReported: row.areasReported,
    openedBy: row.openedBy as Uuid,
    publishedAt: (row.publishedAt as ISODateString | null) ?? null,
    publishedBy: (row.publishedBy as Uuid | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(assessment: MaturityAssessment) {
  return {
    tenantId: assessment.tenantId,
    organizationId: assessment.organizationId,
    assessmentKey: assessment.assessmentKey,
    period: assessment.period,
    weights: JSON.parse(JSON.stringify(assessment.weights)),
    areas: JSON.parse(JSON.stringify(assessment.areas)),
    publishable: assessment.publishable,
    index: assessment.index,
    level: assessment.level,
    coverage: assessment.coverage,
    areasReported: assessment.areasReported,
    openedBy: assessment.openedBy,
    publishedAt: assessment.publishedAt,
    publishedBy: assessment.publishedBy,
  };
}

/**
 * Prisma-backed {@link MaturityAssessmentRepository} (RLS via {@link withTenant}).
 *
 * The weights and the readings are JSONB on the assessment, and keeping them there is what makes the index
 * defensible. An institution's declared weighting is a statement about what it thinks matters, made before
 * anything was scored precisely so the scoring cannot be arranged to flatter it; weights editable after the
 * readings landed would let a disappointing index be improved by discovering that the weak areas were never
 * important. The readings are the other half of the same argument — the index, the coverage and the level are a
 * function of exactly this list, and a reading amended independently would leave a published number nobody could
 * reproduce from what the record holds.
 *
 * The five derived columns are stored rather than computed on read for the reason a governance decision stores
 * its counts: leadership acted on the number that was published, and a derivation repeated at every read is a
 * second opinion waiting to disagree with the first — the sort of disagreement that surfaces years later, when
 * an engine changed and nobody thought a stored score would move.
 *
 * There is no `remove` and no `findByPeriod`. Nothing in this domain says an organization gets one assessment
 * per period, and a read shaped as though it did would be the first place that rule appeared, enforced by
 * nothing.
 */
export class PrismaMaturityAssessmentRepository implements MaturityAssessmentRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<MaturityAssessment | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.maturityAssessment.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /** The key lookup behind the one-assessment-per-key rule, and how a series names its own members. */
  findByKey(tenantId: TenantId, assessmentKey: string): Promise<MaturityAssessment | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.maturityAssessment.findFirst({ where: { assessmentKey } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * The trend line — published assessments in period order.
   *
   * Both halves are load-bearing. Published, because a draft index is a number somebody is still assembling and
   * a series that mixed the two would move for reasons that are not about the institution. In period order,
   * because a single maturity index is nearly meaningless: three is neither good nor bad without knowing what
   * last year was, and the trajectory is the only part of this that ever supports a decision.
   */
  listPublished(tenantId: TenantId, organizationId: Uuid): Promise<MaturityAssessment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.maturityAssessment.findMany({
        where: { organizationId, publishedAt: { not: null } },
        orderBy: [{ period: "asc" }, { assessmentKey: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<MaturityAssessment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.maturityAssessment.findMany({ orderBy: { assessmentKey: "asc" } });
      return rows.map(toDomain);
    });
  }

  save(assessment: MaturityAssessment): Promise<void> {
    return withTenant(this.db, assessment.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(assessment);
      await tx.maturityAssessment.upsert({
        where: { id: assessment.id },
        create: { id: assessment.id, ...fields },
        update: fields,
      });
    });
  }
}
