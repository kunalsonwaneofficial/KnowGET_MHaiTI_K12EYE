import type { Principal } from "@knowget/auth";
import { type MarketingCampaign, MarketingCampaignService } from "@knowget/admissions";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { MARKETING_READ, MARKETING_WRITE, parseBody, tenantOf } from "./admissions-http";
import {
  createCampaignSchema,
  renameCampaignSchema,
  setCampaignChannelSchema,
  setCampaignPeriodSchema,
} from "./admissions.dto";
import { AD_CAMPAIGN_SERVICE } from "./admissions.tokens";

/** REST surface for marketing campaigns (P2-D23). Gated by marketing:*; tenant-scoped. */
@Controller("marketing/campaigns")
export class MarketingCampaignController {
  constructor(@Inject(AD_CAMPAIGN_SERVICE) private readonly service: MarketingCampaignService) {}

  @RequirePermissions(MARKETING_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<MarketingCampaign> {
    const dto = parseBody(createCampaignSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      name: dto.name,
      channel: dto.channel,
      startOn: dto.startOn ?? null,
      endOn: dto.endOn ?? null,
    });
  }

  @RequirePermissions(MARKETING_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<MarketingCampaign> {
    const dto = parseBody(renameCampaignSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(MARKETING_WRITE)
  @Post(":id/channel")
  @HttpCode(200)
  async setChannel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<MarketingCampaign> {
    const dto = parseBody(setCampaignChannelSchema, body);
    return this.service.setChannel(tenantOf(principal), id as Uuid, dto.channel);
  }

  @RequirePermissions(MARKETING_WRITE)
  @Post(":id/period")
  @HttpCode(200)
  async setPeriod(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<MarketingCampaign> {
    const dto = parseBody(setCampaignPeriodSchema, body);
    return this.service.setPeriod(tenantOf(principal), id as Uuid, dto.startOn, dto.endOn);
  }

  @RequirePermissions(MARKETING_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MarketingCampaign> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(MARKETING_WRITE)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MarketingCampaign> {
    return this.service.complete(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(MARKETING_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MarketingCampaign> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(MARKETING_READ)
  @Get("by-code/:code")
  async getByCode(
    @CurrentPrincipal() principal: Principal,
    @Param("code") code: string,
  ): Promise<MarketingCampaign> {
    return this.service.getByCode(tenantOf(principal), code);
  }

  @RequirePermissions(MARKETING_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<MarketingCampaign[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(MARKETING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MarketingCampaign> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
