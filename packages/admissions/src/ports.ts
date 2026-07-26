import type { TenantId, Uuid } from "@knowget/types";
import type { Lead } from "./lead";
import type { MarketingCampaign } from "./marketing-campaign";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the tenant?
 * Every admissions record attaches to it; the domain links to it and never depends on `@knowget/organization`
 * directly.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the person domain (P2-D01-M02): does this person exist? An application's applicant is a
 * Person; the domain links to them and never re-models them. The prospect/applicant/student lifecycle records
 * are Student Lifecycle's (P2-D03), referenced by id.
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/** Storage contract for marketing campaigns. Tenant-scoped (explicit argument + RLS). */
export interface MarketingCampaignRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<MarketingCampaign | null>;
  findByCode(tenantId: TenantId, code: string): Promise<MarketingCampaign | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<MarketingCampaign[]>;
  listByTenant(tenantId: TenantId): Promise<MarketingCampaign[]>;
  save(campaign: MarketingCampaign): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link MarketingCampaignRepository} — the default for tests and bootstrap. */
export class InMemoryMarketingCampaignRepository implements MarketingCampaignRepository {
  private readonly byId = new Map<string, MarketingCampaign>();

  async findById(tenantId: TenantId, id: Uuid): Promise<MarketingCampaign | null> {
    const campaign = this.byId.get(id);
    return campaign && campaign.tenantId === tenantId ? campaign : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<MarketingCampaign | null> {
    return [...this.byId.values()].find((c) => c.tenantId === tenantId && c.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<MarketingCampaign[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<MarketingCampaign[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(campaign: MarketingCampaign): Promise<void> {
    this.byId.set(campaign.id, campaign);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const campaign = this.byId.get(id);
    if (campaign && campaign.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for leads. Tenant-scoped (explicit argument + RLS). `countByOrganization` is the
 * top-of-funnel lead volume the funnel engine reads for a cycle in that organization.
 */
export interface LeadRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Lead | null>;
  findByCode(tenantId: TenantId, code: string): Promise<Lead | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Lead[]>;
  countByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<number>;
  listByCampaign(tenantId: TenantId, campaignId: Uuid): Promise<Lead[]>;
  listByTenant(tenantId: TenantId): Promise<Lead[]>;
  save(lead: Lead): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link LeadRepository} — the default for tests and bootstrap. */
export class InMemoryLeadRepository implements LeadRepository {
  private readonly byId = new Map<string, Lead>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Lead | null> {
    const lead = this.byId.get(id);
    return lead && lead.tenantId === tenantId ? lead : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<Lead | null> {
    return [...this.byId.values()].find((l) => l.tenantId === tenantId && l.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Lead[]> {
    return [...this.byId.values()].filter(
      (l) => l.tenantId === tenantId && l.organizationId === organizationId,
    );
  }

  async countByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<number> {
    return (await this.listByOrganization(tenantId, organizationId)).length;
  }

  async listByCampaign(tenantId: TenantId, campaignId: Uuid): Promise<Lead[]> {
    return [...this.byId.values()].filter(
      (l) => l.tenantId === tenantId && l.campaignId === campaignId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Lead[]> {
    return [...this.byId.values()].filter((l) => l.tenantId === tenantId);
  }

  async save(lead: Lead): Promise<void> {
    this.byId.set(lead.id, lead);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const lead = this.byId.get(id);
    if (lead && lead.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
