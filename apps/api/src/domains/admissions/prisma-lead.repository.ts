import type { CampaignChannel, Lead, LeadRepository, LeadStatus } from "@knowget/admissions";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface LeadRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  contactName: string;
  phone: string | null;
  email: string | null;
  source: string;
  campaignId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: LeadRow): Lead {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    contactName: row.contactName,
    phone: row.phone,
    email: row.email,
    source: row.source as CampaignChannel,
    campaignId: (row.campaignId as Uuid | null) ?? null,
    status: row.status as LeadStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(lead: Lead) {
  return {
    tenantId: lead.tenantId,
    organizationId: lead.organizationId,
    code: lead.code,
    contactName: lead.contactName,
    phone: lead.phone,
    email: lead.email,
    source: lead.source,
    campaignId: lead.campaignId,
    status: lead.status,
  };
}

/** Prisma-backed {@link LeadRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaLeadRepository implements LeadRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Lead | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.lead.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<Lead | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.lead.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Lead[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.lead.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  countByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<number> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      return tx.lead.count({ where: { organizationId, deletedAt: null } });
    });
  }

  listByCampaign(tenantId: TenantId, campaignId: Uuid): Promise<Lead[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.lead.findMany({ where: { campaignId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Lead[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.lead.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(lead: Lead): Promise<void> {
    return withTenant(this.db, lead.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(lead);
      await tx.lead.upsert({
        where: { id: lead.id },
        create: { id: lead.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.lead.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
