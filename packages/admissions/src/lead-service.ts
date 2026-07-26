import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  contactLead,
  convertLead,
  type CreateLeadParams,
  createLead,
  type Lead,
  loseLead,
  qualifyLead,
  updateLeadContact,
} from "./lead";
import {
  leadContactUpdated,
  leadContacted,
  leadConverted,
  leadCreated,
  leadLost,
  leadQualified,
} from "./admissions-events";
import {
  CampaignNotFoundError,
  DuplicateLeadCodeError,
  LeadNotFoundError,
  OrganizationNotFoundForAdmissionsError,
} from "./errors";
import type { LeadRepository, MarketingCampaignRepository, OrganizationDirectory } from "./ports";

export interface LeadServiceDeps {
  readonly repository: LeadRepository;
  readonly campaigns: MarketingCampaignRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for leads — the top of the admissions funnel. Creates a lead (validating the
 * organization, an optional attributed campaign, and a unique code per tenant), updates its contact details,
 * and drives `new → contacted → qualified → converted` (with `lost` from any open state), publishing the lead
 * events.
 */
export class LeadService {
  private readonly repository: LeadRepository;
  private readonly campaigns: MarketingCampaignRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: LeadServiceDeps) {
    this.repository = deps.repository;
    this.campaigns = deps.campaigns;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: CreateLeadParams): Promise<Lead> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAdmissionsError(input.organizationId);
    }
    if (input.campaignId && !(await this.campaigns.findById(input.tenantId, input.campaignId))) {
      throw new CampaignNotFoundError(input.campaignId);
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicateLeadCodeError(input.code.trim());
    }
    const lead = createLead(input);
    await this.repository.save(lead);
    await this.emit(leadCreated(lead));
    return lead;
  }

  async updateContact(
    tenantId: TenantId,
    id: Uuid,
    phone: string | null,
    email: string | null,
  ): Promise<Lead> {
    const updated = updateLeadContact(await this.require(tenantId, id), phone, email);
    await this.repository.save(updated);
    await this.emit(leadContactUpdated(updated));
    return updated;
  }

  async contact(tenantId: TenantId, id: Uuid): Promise<Lead> {
    const updated = contactLead(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(leadContacted(updated));
    return updated;
  }

  async qualify(tenantId: TenantId, id: Uuid): Promise<Lead> {
    const updated = qualifyLead(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(leadQualified(updated));
    return updated;
  }

  async convert(tenantId: TenantId, id: Uuid): Promise<Lead> {
    const updated = convertLead(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(leadConverted(updated));
    return updated;
  }

  async lose(tenantId: TenantId, id: Uuid): Promise<Lead> {
    const updated = loseLead(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(leadLost(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Lead> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<Lead> {
    const lead = await this.repository.findByCode(tenantId, code);
    if (!lead) {
      throw new LeadNotFoundError(code);
    }
    return lead;
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Lead[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async listForCampaign(tenantId: TenantId, campaignId: Uuid): Promise<Lead[]> {
    return this.repository.listByCampaign(tenantId, campaignId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Lead> {
    const lead = await this.repository.findById(tenantId, id);
    if (!lead) {
      throw new LeadNotFoundError(id);
    }
    return lead;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
