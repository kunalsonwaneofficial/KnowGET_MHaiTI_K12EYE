import type { Principal } from "@knowget/auth";
import {
  type EmergencyDrill,
  EmergencyDrillService,
  type MusterStatus,
} from "@knowget/campus-security";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { parseBody, SECURITY_READ, SECURITY_WRITE, tenantOf } from "./campus-security-http";
import {
  completeDrillSchema,
  recordMusterSchema,
  scheduleDrillSchema,
  setDrillExpectedSchema,
  startDrillSchema,
} from "./campus-security.dto";
import { CS_DRILL_SERVICE } from "./campus-security.tokens";

/** REST surface for emergency drills (P2-D21). Gated by security:*; tenant-scoped. */
@Controller("security/drills")
export class EmergencyDrillController {
  constructor(@Inject(CS_DRILL_SERVICE) private readonly service: EmergencyDrillService) {}

  @RequirePermissions(SECURITY_WRITE)
  @Post()
  @HttpCode(201)
  async schedule(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<EmergencyDrill> {
    const dto = parseBody(scheduleDrillSchema, body);
    return this.service.schedule({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      type: dto.type,
      zoneId: (dto.zoneId as Uuid | null | undefined) ?? null,
      conductedById: (dto.conductedById as Uuid | null | undefined) ?? null,
      scheduledFor: dto.scheduledFor,
      expectedCount: dto.expectedCount,
    });
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/expected")
  @HttpCode(200)
  async setExpected(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EmergencyDrill> {
    const dto = parseBody(setDrillExpectedSchema, body);
    return this.service.setExpected(tenantOf(principal), id as Uuid, dto.expectedCount);
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/start")
  @HttpCode(200)
  async start(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EmergencyDrill> {
    const dto = parseBody(startDrillSchema, body);
    return this.service.start(tenantOf(principal), id as Uuid, dto.startedAt);
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/muster")
  @HttpCode(200)
  async recordMuster(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EmergencyDrill> {
    const dto = parseBody(recordMusterSchema, body);
    return this.service.recordMuster(tenantOf(principal), id as Uuid, dto.accountedCount);
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EmergencyDrill> {
    const dto = parseBody(completeDrillSchema, body);
    return this.service.complete(tenantOf(principal), id as Uuid, dto.completedAt);
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EmergencyDrill> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SECURITY_READ)
  @Get(":id/muster-status")
  async musterStatus(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MusterStatus> {
    return this.service.musterStatus(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SECURITY_READ)
  @Get("by-code/:code")
  async getByCode(
    @CurrentPrincipal() principal: Principal,
    @Param("code") code: string,
  ): Promise<EmergencyDrill> {
    return this.service.getByCode(tenantOf(principal), code);
  }

  @RequirePermissions(SECURITY_READ)
  @Get("by-zone/:zoneId")
  async listForZone(
    @CurrentPrincipal() principal: Principal,
    @Param("zoneId") zoneId: string,
  ): Promise<EmergencyDrill[]> {
    return this.service.listForZone(tenantOf(principal), zoneId as Uuid);
  }

  @RequirePermissions(SECURITY_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<EmergencyDrill[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(SECURITY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EmergencyDrill> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
