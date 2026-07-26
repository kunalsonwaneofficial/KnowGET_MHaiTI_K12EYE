import type { Principal } from "@knowget/auth";
import { type Lead, LeadService } from "@knowget/admissions";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { MARKETING_READ, MARKETING_WRITE, parseBody, tenantOf } from "./admissions-http";
import { createLeadSchema, updateLeadContactSchema } from "./admissions.dto";
import { AD_LEAD_SERVICE } from "./admissions.tokens";

/** REST surface for leads (P2-D23) — the top of the funnel. Gated by marketing:*; tenant-scoped. */
@Controller("marketing/leads")
export class LeadController {
  constructor(@Inject(AD_LEAD_SERVICE) private readonly service: LeadService) {}

  @RequirePermissions(MARKETING_WRITE)
  @Post()
  @HttpCode(201)
  async create(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Lead> {
    const dto = parseBody(createLeadSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      contactName: dto.contactName,
      source: dto.source,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      campaignId: (dto.campaignId ?? null) as Uuid | null,
    });
  }

  @RequirePermissions(MARKETING_WRITE)
  @Post(":id/details")
  @HttpCode(200)
  async updateContact(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Lead> {
    const dto = parseBody(updateLeadContactSchema, body);
    return this.service.updateContact(tenantOf(principal), id as Uuid, dto.phone, dto.email);
  }

  @RequirePermissions(MARKETING_WRITE)
  @Post(":id/contact")
  @HttpCode(200)
  async contact(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Lead> {
    return this.service.contact(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(MARKETING_WRITE)
  @Post(":id/qualify")
  @HttpCode(200)
  async qualify(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Lead> {
    return this.service.qualify(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(MARKETING_WRITE)
  @Post(":id/convert")
  @HttpCode(200)
  async convert(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Lead> {
    return this.service.convert(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(MARKETING_WRITE)
  @Post(":id/lose")
  @HttpCode(200)
  async lose(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Lead> {
    return this.service.lose(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(MARKETING_READ)
  @Get("by-code/:code")
  async getByCode(
    @CurrentPrincipal() principal: Principal,
    @Param("code") code: string,
  ): Promise<Lead> {
    return this.service.getByCode(tenantOf(principal), code);
  }

  @RequirePermissions(MARKETING_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Lead[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(MARKETING_READ)
  @Get("by-campaign/:campaignId")
  async listForCampaign(
    @CurrentPrincipal() principal: Principal,
    @Param("campaignId") campaignId: string,
  ): Promise<Lead[]> {
    return this.service.listForCampaign(tenantOf(principal), campaignId as Uuid);
  }

  @RequirePermissions(MARKETING_READ)
  @Get(":id")
  async getById(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Lead> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
