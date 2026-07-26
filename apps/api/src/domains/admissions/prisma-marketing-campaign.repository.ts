import type {
  CampaignChannel,
  CampaignStatus,
  MarketingCampaign,
  MarketingCampaignRepository,
} from "@knowget/admissions";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface MarketingCampaignRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  name: string;
  channel: string;
  startOn: string | null;
  endOn: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: MarketingCampaignRow): MarketingCampaign {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    name: row.name,
    channel: row.channel as CampaignChannel,
    startOn: row.startOn,
    endOn: row.endOn,
    status: row.status as CampaignStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(campaign: MarketingCampaign) {
  return {
    tenantId: campaign.tenantId,
    organizationId: campaign.organizationId,
    code: campaign.code,
    name: campaign.name,
    channel: campaign.channel,
    startOn: campaign.startOn,
    endOn: campaign.endOn,
    status: campaign.status,
  };
}

/** Prisma-backed {@link MarketingCampaignRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaMarketingCampaignRepository implements MarketingCampaignRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<MarketingCampaign | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.marketingCampaign.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<MarketingCampaign | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.marketingCampaign.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<MarketingCampaign[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.marketingCampaign.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<MarketingCampaign[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.marketingCampaign.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(campaign: MarketingCampaign): Promise<void> {
    return withTenant(this.db, campaign.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(campaign);
      await tx.marketingCampaign.upsert({
        where: { id: campaign.id },
        create: { id: campaign.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.marketingCampaign.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
