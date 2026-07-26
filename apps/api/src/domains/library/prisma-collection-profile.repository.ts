import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { CollectionProfile, CollectionProfileRepository } from "@knowget/library";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface CollectionProfileRow {
  id: string;
  tenantId: string;
  organizationId: string;
  titleCount: number;
  copyCount: number;
  availableCount: number;
  onLoanCount: number;
  lostCount: number;
  digitalAssetCount: number;
  activeLoanCount: number;
  overdueLoanCount: number;
  openReservationCount: number;
  utilizationPercent: number;
  version: number;
  refreshedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: CollectionProfileRow): CollectionProfile {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    titleCount: row.titleCount,
    copyCount: row.copyCount,
    availableCount: row.availableCount,
    onLoanCount: row.onLoanCount,
    lostCount: row.lostCount,
    digitalAssetCount: row.digitalAssetCount,
    activeLoanCount: row.activeLoanCount,
    overdueLoanCount: row.overdueLoanCount,
    openReservationCount: row.openReservationCount,
    utilizationPercent: row.utilizationPercent,
    version: row.version,
    refreshedAt: (row.refreshedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(profile: CollectionProfile) {
  return {
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    titleCount: profile.titleCount,
    copyCount: profile.copyCount,
    availableCount: profile.availableCount,
    onLoanCount: profile.onLoanCount,
    lostCount: profile.lostCount,
    digitalAssetCount: profile.digitalAssetCount,
    activeLoanCount: profile.activeLoanCount,
    overdueLoanCount: profile.overdueLoanCount,
    openReservationCount: profile.openReservationCount,
    utilizationPercent: profile.utilizationPercent,
    version: profile.version,
    refreshedAt: profile.refreshedAt,
  };
}

/** Prisma-backed {@link CollectionProfileRepository} (RLS via {@link withTenant}; one per org; soft delete). */
export class PrismaCollectionProfileRepository implements CollectionProfileRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<CollectionProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.collectionProfile.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CollectionProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.collectionProfile.findFirst({
        where: { organizationId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByTenant(tenantId: TenantId): Promise<CollectionProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.collectionProfile.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(profile: CollectionProfile): Promise<void> {
    return withTenant(this.db, profile.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(profile);
      await tx.collectionProfile.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.collectionProfile.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
