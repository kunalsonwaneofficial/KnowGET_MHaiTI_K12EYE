import type { Principal } from "@knowget/auth";
import { type Offer, OfferService } from "@knowget/admissions";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ADMISSIONS_READ, ADMISSIONS_WRITE, parseBody, tenantOf } from "./admissions-http";
import { extendOfferSchema, respondOfferSchema } from "./admissions.dto";
import { AD_OFFER_SERVICE } from "./admissions.tokens";

/** REST surface for admission offers (P2-D23). Gated by admissions:*; tenant-scoped. */
@Controller("admissions/offers")
export class OfferController {
  constructor(@Inject(AD_OFFER_SERVICE) private readonly service: OfferService) {}

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post()
  @HttpCode(201)
  async extend(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Offer> {
    const dto = parseBody(extendOfferSchema, body);
    return this.service.extend({
      tenantId: tenantOf(principal),
      applicationId: dto.applicationId as Uuid,
      extendedOn: dto.extendedOn,
      gradeOffered: dto.gradeOffered,
      respondBy: dto.respondBy ?? null,
    });
  }

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post(":id/accept")
  @HttpCode(200)
  async accept(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Offer> {
    const dto = parseBody(respondOfferSchema, body);
    return this.service.accept(tenantOf(principal), id as Uuid, dto.respondedOn);
  }

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post(":id/decline")
  @HttpCode(200)
  async decline(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Offer> {
    const dto = parseBody(respondOfferSchema, body);
    return this.service.decline(tenantOf(principal), id as Uuid, dto.respondedOn);
  }

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post(":id/expire")
  @HttpCode(200)
  async expire(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Offer> {
    return this.service.expire(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post(":id/withdraw")
  @HttpCode(200)
  async withdraw(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Offer> {
    return this.service.withdraw(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ADMISSIONS_READ)
  @Get("by-application/:applicationId")
  async getByApplication(
    @CurrentPrincipal() principal: Principal,
    @Param("applicationId") applicationId: string,
  ): Promise<Offer | null> {
    return this.service.getByApplication(tenantOf(principal), applicationId as Uuid);
  }

  @RequirePermissions(ADMISSIONS_READ)
  @Get("by-cycle/:cycleId")
  async listForCycle(
    @CurrentPrincipal() principal: Principal,
    @Param("cycleId") cycleId: string,
  ): Promise<Offer[]> {
    return this.service.listForCycle(tenantOf(principal), cycleId as Uuid);
  }

  @RequirePermissions(ADMISSIONS_READ)
  @Get(":id")
  async getById(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Offer> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
