import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  AccessModel,
  DigitalAsset,
  DigitalAssetRepository,
  DigitalFormat,
  DigitalStatus,
} from "@knowget/library";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface DigitalAssetRow {
  id: string;
  tenantId: string;
  organizationId: string;
  title: string;
  format: string;
  accessModel: string;
  accessUrl: string | null;
  provider: string | null;
  licenseExpiry: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: DigitalAssetRow): DigitalAsset {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    title: row.title,
    format: row.format as DigitalFormat,
    accessModel: row.accessModel as AccessModel,
    accessUrl: row.accessUrl,
    provider: row.provider,
    licenseExpiry: row.licenseExpiry,
    status: row.status as DigitalStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(asset: DigitalAsset) {
  return {
    tenantId: asset.tenantId,
    organizationId: asset.organizationId,
    title: asset.title,
    format: asset.format,
    accessModel: asset.accessModel,
    accessUrl: asset.accessUrl,
    provider: asset.provider,
    licenseExpiry: asset.licenseExpiry,
    status: asset.status,
  };
}

/** Prisma-backed {@link DigitalAssetRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaDigitalAssetRepository implements DigitalAssetRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<DigitalAsset | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.digitalAsset.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<DigitalAsset[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.digitalAsset.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<DigitalAsset[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.digitalAsset.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(asset: DigitalAsset): Promise<void> {
    return withTenant(this.db, asset.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(asset);
      await tx.digitalAsset.upsert({
        where: { id: asset.id },
        create: { id: asset.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.digitalAsset.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
