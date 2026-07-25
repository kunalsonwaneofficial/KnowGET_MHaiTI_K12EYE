import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";
import type {
  PerformanceReview,
  PerformanceReviewRepository,
  ReviewStatus,
} from "@knowget/workforce";

interface PerformanceReviewRow {
  id: string;
  tenantId: string;
  organizationId: string;
  employeeId: string;
  reviewerId: string | null;
  period: string;
  overallRating: number | null;
  summary: string | null;
  strengths: string | null;
  improvements: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: PerformanceReviewRow): PerformanceReview {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    employeeId: row.employeeId as Uuid,
    reviewerId: (row.reviewerId as Uuid | null) ?? null,
    period: row.period,
    overallRating: row.overallRating,
    summary: row.summary,
    strengths: row.strengths,
    improvements: row.improvements,
    status: row.status as ReviewStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(review: PerformanceReview) {
  return {
    tenantId: review.tenantId,
    organizationId: review.organizationId,
    employeeId: review.employeeId,
    reviewerId: review.reviewerId,
    period: review.period,
    overallRating: review.overallRating,
    summary: review.summary,
    strengths: review.strengths,
    improvements: review.improvements,
    status: review.status,
  };
}

/** Prisma-backed {@link PerformanceReviewRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaPerformanceReviewRepository implements PerformanceReviewRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<PerformanceReview | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.performanceReview.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<PerformanceReview[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.performanceReview.findMany({ where: { employeeId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<PerformanceReview[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.performanceReview.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(review: PerformanceReview): Promise<void> {
    return withTenant(this.db, review.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(review);
      await tx.performanceReview.upsert({
        where: { id: review.id },
        create: { id: review.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.performanceReview.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
