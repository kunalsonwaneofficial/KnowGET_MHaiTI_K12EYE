import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  activateCampaign,
  cancelCampaign,
  completeCampaign,
  type CreateMarketingCampaignParams,
  createMarketingCampaign,
  type MarketingCampaign,
  renameCampaign,
  setCampaignChannel,
  setCampaignPeriod,
} from "./marketing-campaign";
import type { CampaignChannel } from "./admissions-value";
import {
  campaignActivated,
  campaignCancelled,
  campaignChannelSet,
  campaignCompleted,
  campaignCreated,
  campaignPeriodSet,
  campaignRenamed,
} from "./admissions-events";
import {
  CampaignNotFoundError,
  DuplicateCampaignCodeError,
  OrganizationNotFoundForAdmissionsError,
} from "./errors";
import type { MarketingCampaignRepository, OrganizationDirectory } from "./ports";

export interface MarketingCampaignServiceDeps {
  readonly repository: MarketingCampaignRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for marketing campaigns. Creates a campaign (validating the organization and a unique
 * code per tenant), edits its name/channel/period, and drives `draft → active → completed | cancelled`,
 * publishing the campaign events.
 */
export class MarketingCampaignService {
  private readonly repository: MarketingCampaignRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: MarketingCampaignServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: CreateMarketingCampaignParams): Promise<MarketingCampaign> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAdmissionsError(input.organizationId);
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicateCampaignCodeError(input.code.trim());
    }
    const campaign = createMarketingCampaign(input);
    await this.repository.save(campaign);
    await this.emit(campaignCreated(campaign));
    return campaign;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<MarketingCampaign> {
    const updated = renameCampaign(await this.require(tenantId, id), name);
    await this.repository.save(updated);
    await this.emit(campaignRenamed(updated));
    return updated;
  }

  async setChannel(
    tenantId: TenantId,
    id: Uuid,
    channel: CampaignChannel,
  ): Promise<MarketingCampaign> {
    const updated = setCampaignChannel(await this.require(tenantId, id), channel);
    await this.repository.save(updated);
    await this.emit(campaignChannelSet(updated));
    return updated;
  }

  async setPeriod(
    tenantId: TenantId,
    id: Uuid,
    startOn: string | null,
    endOn: string | null,
  ): Promise<MarketingCampaign> {
    const updated = setCampaignPeriod(await this.require(tenantId, id), startOn, endOn);
    await this.repository.save(updated);
    await this.emit(campaignPeriodSet(updated));
    return updated;
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<MarketingCampaign> {
    const updated = activateCampaign(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(campaignActivated(updated));
    return updated;
  }

  async complete(tenantId: TenantId, id: Uuid): Promise<MarketingCampaign> {
    const updated = completeCampaign(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(campaignCompleted(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<MarketingCampaign> {
    const updated = cancelCampaign(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(campaignCancelled(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<MarketingCampaign> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<MarketingCampaign> {
    const campaign = await this.repository.findByCode(tenantId, code);
    if (!campaign) {
      throw new CampaignNotFoundError(code);
    }
    return campaign;
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<MarketingCampaign[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<MarketingCampaign> {
    const campaign = await this.repository.findById(tenantId, id);
    if (!campaign) {
      throw new CampaignNotFoundError(id);
    }
    return campaign;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
