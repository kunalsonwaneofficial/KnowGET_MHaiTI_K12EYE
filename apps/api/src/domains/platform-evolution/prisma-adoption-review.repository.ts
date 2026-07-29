import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type AdoptionReview,
  type AdoptionReviewRepository,
  type RealizationVerdict,
  type ReviewedBenefit,
  type VarianceBand,
} from "@knowget/platform-evolution";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface AdoptionReviewRow {
  id: string;
  tenantId: string;
  organizationId: string;
  initiativeId: string;
  reviewPeriod: number;
  benefits: unknown;
  verdict: string;
  worstBand: string | null;
  benefitsMeasured: number;
  benefitsClaimed: number;
  openedAt: string;
  openedBy: string;
  concludedAt: string | null;
  concludedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AdoptionReviewRow): AdoptionReview {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    initiativeId: row.initiativeId as Uuid,
    reviewPeriod: row.reviewPeriod,
    benefits: (row.benefits as ReviewedBenefit[]) ?? [],
    verdict: row.verdict as RealizationVerdict,
    worstBand: (row.worstBand as VarianceBand | null) ?? null,
    benefitsMeasured: row.benefitsMeasured,
    benefitsClaimed: row.benefitsClaimed,
    openedAt: row.openedAt as ISODateString,
    openedBy: row.openedBy as Uuid,
    concludedAt: (row.concludedAt as ISODateString | null) ?? null,
    concludedBy: (row.concludedBy as Uuid | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(review: AdoptionReview) {
  return {
    tenantId: review.tenantId,
    organizationId: review.organizationId,
    initiativeId: review.initiativeId,
    reviewPeriod: review.reviewPeriod,
    benefits: JSON.parse(JSON.stringify(review.benefits)),
    verdict: review.verdict,
    worstBand: review.worstBand,
    benefitsMeasured: review.benefitsMeasured,
    benefitsClaimed: review.benefitsClaimed,
    openedAt: review.openedAt,
    openedBy: review.openedBy,
    concludedAt: review.concludedAt,
    concludedBy: review.concludedBy,
  };
}

/**
 * Prisma-backed {@link AdoptionReviewRepository} (RLS via {@link withTenant}).
 *
 * The benefits are JSONB on the review, including the ones that could not be measured, and carrying the
 * unmeasured ones is the point rather than an oversight. `benefitsClaimed` beside `benefitsMeasured` is the
 * honest reading of a realization review: a change that promised six improvements and could evidence one has not
 * been shown to work, and a store that kept only the measured benefits would present that review as a clean
 * single-benefit success. Each benefit also carries its own derived ratio and band, so what the verdict was
 * drawn from stays legible beside it.
 *
 * The review is identified by `(tenant, initiative, period)`, enforced by a unique constraint rather than by
 * anything here, and that composite is deliberate. Reviewing an adopted change at one period and again at four
 * is the normal shape of benefits realization — early movement often decays, and the second answer is allowed to
 * differ from the first — while a second review at the *same* distance from adoption is the move being refused,
 * because it is how an unwelcome verdict gets asked again until it comes out differently.
 *
 * There is no `remove`. A `revert` verdict is the most valuable record this domain produces and the one an
 * institution has the most reason to want gone.
 */
export class PrismaAdoptionReviewRepository implements AdoptionReviewRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AdoptionReview | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.adoptionReview.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * The lookup behind the one-review-per-initiative-per-period rule. It finds concluded reviews as well as open
   * ones, because a concluded review is precisely what a second attempt at the same period would be trying to
   * get around.
   */
  findByInitiativeAndPeriod(
    tenantId: TenantId,
    initiativeId: Uuid,
    reviewPeriod: number,
  ): Promise<AdoptionReview | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.adoptionReview.findFirst({ where: { initiativeId, reviewPeriod } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * The realization trail for one adopted change, in period order.
   *
   * The ordering is what makes the trail readable rather than contradictory. Two reviews of the same change
   * reaching different verdicts is the expected result when they were taken at different distances from
   * adoption — sustained at one period and adjust at four is a finding about decay. Unordered, the same two
   * records are just an institution disagreeing with itself about whether something worked.
   */
  listByInitiative(tenantId: TenantId, initiativeId: Uuid): Promise<AdoptionReview[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.adoptionReview.findMany({
        where: { initiativeId },
        orderBy: { reviewPeriod: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AdoptionReview[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.adoptionReview.findMany({
        orderBy: [{ initiativeId: "asc" }, { reviewPeriod: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  save(review: AdoptionReview): Promise<void> {
    return withTenant(this.db, review.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(review);
      await tx.adoptionReview.upsert({
        where: { id: review.id },
        create: { id: review.id, ...fields },
        update: fields,
      });
    });
  }
}
