import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { Asset, AssetRepository, AssetStatus } from "@knowget/resource";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface AssetRow {
  id: string;
  tenantId: string;
  organizationId: string;
  assetTag: string;
  name: string;
  category: string | null;
  custodianId: string | null;
  location: string | null;
  acquisitionCostMinor: bigint;
  salvageValueMinor: bigint;
  currency: string;
  acquisitionDate: string;
  usefulLifeMonths: number;
  status: string;
  retiredAt: string | null;
  disposedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AssetRow): Asset {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    assetTag: row.assetTag,
    name: row.name,
    category: row.category,
    custodianId: (row.custodianId as Uuid | null) ?? null,
    location: row.location,
    acquisitionCostMinor: Number(row.acquisitionCostMinor),
    salvageValueMinor: Number(row.salvageValueMinor),
    currency: row.currency,
    acquisitionDate: row.acquisitionDate,
    usefulLifeMonths: row.usefulLifeMonths,
    status: row.status as AssetStatus,
    retiredAt: (row.retiredAt as ISODateString | null) ?? null,
    disposedAt: (row.disposedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(asset: Asset) {
  return {
    tenantId: asset.tenantId,
    organizationId: asset.organizationId,
    assetTag: asset.assetTag,
    name: asset.name,
    category: asset.category,
    custodianId: asset.custodianId,
    location: asset.location,
    acquisitionCostMinor: BigInt(asset.acquisitionCostMinor),
    salvageValueMinor: BigInt(asset.salvageValueMinor),
    currency: asset.currency,
    acquisitionDate: asset.acquisitionDate,
    usefulLifeMonths: asset.usefulLifeMonths,
    status: asset.status,
    retiredAt: asset.retiredAt,
    disposedAt: asset.disposedAt,
  };
}

/** Prisma-backed {@link AssetRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAssetRepository implements AssetRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Asset | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.asset.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByTag(tenantId: TenantId, assetTag: string): Promise<Asset | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.asset.findFirst({ where: { assetTag, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Asset[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.asset.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByCustodian(tenantId: TenantId, custodianId: Uuid): Promise<Asset[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.asset.findMany({ where: { custodianId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Asset[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.asset.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(asset: Asset): Promise<void> {
    return withTenant(this.db, asset.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(asset);
      await tx.asset.upsert({
        where: { id: asset.id },
        create: { id: asset.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.asset.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
