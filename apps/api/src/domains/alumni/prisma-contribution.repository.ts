import type {
  Contribution,
  ContributionRepository,
  ContributionType,
  RecognitionTier,
} from "@knowget/alumni";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface ContributionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  alumniProfileId: string;
  type: string;
  recognitionTier: string;
  campaignRef: string | null;
  contributedOn: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ContributionRow): Contribution {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    alumniProfileId: row.alumniProfileId as Uuid,
    type: row.type as ContributionType,
    recognitionTier: row.recognitionTier as RecognitionTier,
    campaignRef: row.campaignRef,
    contributedOn: row.contributedOn,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(contribution: Contribution) {
  return {
    tenantId: contribution.tenantId,
    organizationId: contribution.organizationId,
    alumniProfileId: contribution.alumniProfileId,
    type: contribution.type,
    recognitionTier: contribution.recognitionTier,
    campaignRef: contribution.campaignRef,
    contributedOn: contribution.contributedOn,
  };
}

/**
 * Prisma-backed {@link ContributionRepository} (RLS via {@link withTenant}). The giving log is immutable and
 * append-only, so there is no `remove`.
 */
export class PrismaContributionRepository implements ContributionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Contribution | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.contribution.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<Contribution[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.contribution.findMany({ where: { alumniProfileId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  countByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<number> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      return tx.contribution.count({ where: { alumniProfileId, deletedAt: null } });
    });
  }

  listByTenant(tenantId: TenantId): Promise<Contribution[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.contribution.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(contribution: Contribution): Promise<void> {
    return withTenant(this.db, contribution.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(contribution);
      await tx.contribution.upsert({
        where: { id: contribution.id },
        create: { id: contribution.id, ...fields },
        update: fields,
      });
    });
  }
}
