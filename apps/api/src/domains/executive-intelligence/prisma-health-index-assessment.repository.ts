import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type AssessmentStatus,
  type HealthIndexAssessment,
  type HealthIndexAssessmentRepository,
  type IndexRun,
  type PerformanceBand,
  type PeriodGrain,
  type PillarContribution,
  type PillarOmission,
  type TraceVerdict,
} from "@knowget/executive-intelligence";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface HealthIndexAssessmentRow {
  id: string;
  tenantId: string;
  organizationId: string;
  indexDefinitionId: string;
  indexKey: string;
  period: number;
  grain: string;
  run: unknown;
  fingerprint: string;
  value: number | null;
  band: string | null;
  pillarCoverage: number;
  sufficient: boolean;
  weightRedistributed: number;
  contributions: unknown;
  omissions: unknown;
  evidence: unknown;
  status: string;
  finalizedAt: string | null;
  invalidatedAt: string | null;
  invalidationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: HealthIndexAssessmentRow): HealthIndexAssessment {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    indexDefinitionId: row.indexDefinitionId as Uuid,
    indexKey: row.indexKey,
    period: row.period,
    grain: row.grain as PeriodGrain,
    run: row.run as IndexRun,
    fingerprint: row.fingerprint,
    value: row.value,
    band: (row.band as PerformanceBand | null) ?? null,
    pillarCoverage: row.pillarCoverage,
    sufficient: row.sufficient,
    weightRedistributed: row.weightRedistributed,
    contributions: (row.contributions as PillarContribution[]) ?? [],
    omissions: (row.omissions as PillarOmission[]) ?? [],
    evidence: row.evidence as TraceVerdict,
    status: row.status as AssessmentStatus,
    finalizedAt: (row.finalizedAt as ISODateString | null) ?? null,
    invalidatedAt: (row.invalidatedAt as ISODateString | null) ?? null,
    invalidationReason: row.invalidationReason,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(assessment: HealthIndexAssessment) {
  return {
    tenantId: assessment.tenantId,
    organizationId: assessment.organizationId,
    indexDefinitionId: assessment.indexDefinitionId,
    indexKey: assessment.indexKey,
    period: assessment.period,
    grain: assessment.grain,
    run: JSON.parse(JSON.stringify(assessment.run)),
    fingerprint: assessment.fingerprint,
    value: assessment.value,
    band: assessment.band,
    pillarCoverage: assessment.pillarCoverage,
    sufficient: assessment.sufficient,
    weightRedistributed: assessment.weightRedistributed,
    contributions: JSON.parse(JSON.stringify(assessment.contributions)),
    omissions: JSON.parse(JSON.stringify(assessment.omissions)),
    evidence: JSON.parse(JSON.stringify(assessment.evidence)),
    status: assessment.status,
    finalizedAt: assessment.finalizedAt,
    invalidatedAt: assessment.invalidatedAt,
    invalidationReason: assessment.invalidationReason,
  };
}

/**
 * Prisma-backed {@link HealthIndexAssessmentRepository} (RLS via {@link withTenant}).
 *
 * The pinned run, the contributions, the omissions and the evidence verdict are all JSONB on the assessment
 * rather than rows pointing back at it, and that is the reproducibility rule stated in storage. An assessment is
 * a claim about what the inputs *were* at the moment it was computed — if its inputs lived anywhere they could
 * be edited independently, recomputing it later would silently produce a different number and the fingerprint
 * would agree with both, which is the exact failure the fingerprint exists to catch.
 *
 * There is no `remove`, and the port declares none. A figure that turned out to rest on bad inputs is
 * invalidated with a reason, so the series keeps the shape it actually had rather than the shape the institution
 * would prefer it to have had.
 */
export class PrismaHealthIndexAssessmentRepository implements HealthIndexAssessmentRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<HealthIndexAssessment | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.healthIndexAssessment.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * Invalidated assessments are deliberately included, unlike the withdrawn-reading read next door. The unique
   * index behind this table covers every status, so an invalidated figure still holds its period — and the
   * service needs to see it in order to refuse a second assessment there and say why.
   */
  findByIndexAndPeriod(
    tenantId: TenantId,
    indexKey: string,
    period: number,
  ): Promise<HealthIndexAssessment | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.healthIndexAssessment.findFirst({ where: { indexKey, period } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * The series behind a period, oldest first. Attention reads the last element as the previous period and the
   * whole list as the run, so the ascending order is part of the contract rather than a presentation choice.
   *
   * Invalidated assessments are left out here precisely because they are kept elsewhere: a figure withdrawn as
   * wrong must not be what "the index fell this period" is measured against, and must not extend a run of
   * decline it was never entitled to join.
   */
  listBeforePeriod(
    tenantId: TenantId,
    indexKey: string,
    period: number,
  ): Promise<HealthIndexAssessment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.healthIndexAssessment.findMany({
        where: { indexKey, period: { lt: period }, status: { not: "invalidated" } },
        orderBy: { period: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<HealthIndexAssessment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.healthIndexAssessment.findMany({
        orderBy: [{ indexKey: "asc" }, { period: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  save(assessment: HealthIndexAssessment): Promise<void> {
    return withTenant(this.db, assessment.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(assessment);
      await tx.healthIndexAssessment.upsert({
        where: { id: assessment.id },
        create: { id: assessment.id, ...fields },
        update: fields,
      });
    });
  }
}
