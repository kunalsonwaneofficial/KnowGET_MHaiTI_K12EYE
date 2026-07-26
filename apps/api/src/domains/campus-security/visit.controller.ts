import type { Principal } from "@knowget/auth";
import { type Visit, VisitService } from "@knowget/campus-security";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { parseBody, tenantOf, VISITOR_READ, VISITOR_WRITE } from "./campus-security-http";
import {
  checkInVisitSchema,
  checkOutVisitSchema,
  requestVisitSchema,
  setVisitZoneSchema,
} from "./campus-security.dto";
import { CS_VISIT_SERVICE } from "./campus-security.tokens";

/** REST surface for visits (P2-D21). Gated by visitor:*; tenant-scoped. */
@Controller("visits")
export class VisitController {
  constructor(@Inject(CS_VISIT_SERVICE) private readonly service: VisitService) {}

  @RequirePermissions(VISITOR_WRITE)
  @Post()
  @HttpCode(201)
  async request(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Visit> {
    const dto = parseBody(requestVisitSchema, body);
    return this.service.request({
      tenantId: tenantOf(principal),
      visitorId: dto.visitorId as Uuid,
      hostPersonId: dto.hostPersonId as Uuid,
      zoneId: (dto.zoneId as Uuid | null | undefined) ?? null,
      purpose: dto.purpose,
      scheduledFor: dto.scheduledFor,
    });
  }

  @RequirePermissions(VISITOR_WRITE)
  @Post(":id/zone")
  @HttpCode(200)
  async setZone(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Visit> {
    const dto = parseBody(setVisitZoneSchema, body);
    return this.service.setZone(
      tenantOf(principal),
      id as Uuid,
      (dto.zoneId as Uuid | null) ?? null,
    );
  }

  @RequirePermissions(VISITOR_WRITE)
  @Post(":id/approve")
  @HttpCode(200)
  async approve(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Visit> {
    return this.service.approve(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(VISITOR_WRITE)
  @Post(":id/deny")
  @HttpCode(200)
  async deny(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Visit> {
    return this.service.deny(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(VISITOR_WRITE)
  @Post(":id/check-in")
  @HttpCode(200)
  async checkIn(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Visit> {
    const dto = parseBody(checkInVisitSchema, body);
    return this.service.checkIn(tenantOf(principal), id as Uuid, dto.checkedInAt);
  }

  @RequirePermissions(VISITOR_WRITE)
  @Post(":id/check-out")
  @HttpCode(200)
  async checkOut(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Visit> {
    const dto = parseBody(checkOutVisitSchema, body);
    return this.service.checkOut(tenantOf(principal), id as Uuid, dto.checkedOutAt);
  }

  @RequirePermissions(VISITOR_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Visit> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(VISITOR_WRITE)
  @Post(":id/expire")
  @HttpCode(200)
  async expire(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Visit> {
    return this.service.expire(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(VISITOR_READ)
  @Get("open")
  async listOpen(@CurrentPrincipal() principal: Principal): Promise<Visit[]> {
    return this.service.listOpen(tenantOf(principal));
  }

  @RequirePermissions(VISITOR_READ)
  @Get("by-visitor/:visitorId")
  async listForVisitor(
    @CurrentPrincipal() principal: Principal,
    @Param("visitorId") visitorId: string,
  ): Promise<Visit[]> {
    return this.service.listForVisitor(tenantOf(principal), visitorId as Uuid);
  }

  @RequirePermissions(VISITOR_READ)
  @Get("by-host/:hostPersonId")
  async listForHost(
    @CurrentPrincipal() principal: Principal,
    @Param("hostPersonId") hostPersonId: string,
  ): Promise<Visit[]> {
    return this.service.listForHost(tenantOf(principal), hostPersonId as Uuid);
  }

  @RequirePermissions(VISITOR_READ)
  @Get("by-zone/:zoneId/on-site")
  async listOnSiteForZone(
    @CurrentPrincipal() principal: Principal,
    @Param("zoneId") zoneId: string,
  ): Promise<Visit[]> {
    return this.service.listOnSiteForZone(tenantOf(principal), zoneId as Uuid);
  }

  @RequirePermissions(VISITOR_READ)
  @Get("by-zone/:zoneId")
  async listForZone(
    @CurrentPrincipal() principal: Principal,
    @Param("zoneId") zoneId: string,
  ): Promise<Visit[]> {
    return this.service.listForZone(tenantOf(principal), zoneId as Uuid);
  }

  @RequirePermissions(VISITOR_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Visit[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(VISITOR_READ)
  @Get(":id")
  async getById(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Visit> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
