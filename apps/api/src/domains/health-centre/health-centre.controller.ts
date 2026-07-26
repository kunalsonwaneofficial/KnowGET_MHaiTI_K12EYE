import type { Principal } from "@knowget/auth";
import { type HealthCentre, HealthCentreService } from "@knowget/health-centre";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { CLINIC_READ, CLINIC_WRITE, parseBody, tenantOf } from "./health-centre-http";
import {
  assignLeadSchema,
  registerCentreSchema,
  renameCentreSchema,
  setCapacitySchema,
} from "./health-centre.dto";
import { HC_CENTRE_SERVICE } from "./health-centre.tokens";

/** REST surface for health centres (P2-D19). Gated by clinic:*; tenant-scoped. */
@Controller("clinic/centres")
export class HealthCentreController {
  constructor(@Inject(HC_CENTRE_SERVICE) private readonly service: HealthCentreService) {}

  @RequirePermissions(CLINIC_WRITE)
  @Post()
  @HttpCode(201)
  async register(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<HealthCentre> {
    const dto = parseBody(registerCentreSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      name: dto.name,
      type: dto.type,
      sickBayCapacity: dto.sickBayCapacity,
    });
  }

  @RequirePermissions(CLINIC_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<HealthCentre> {
    const dto = parseBody(renameCentreSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(CLINIC_WRITE)
  @Post(":id/capacity")
  @HttpCode(200)
  async setCapacity(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<HealthCentre> {
    const dto = parseBody(setCapacitySchema, body);
    return this.service.setCapacity(tenantOf(principal), id as Uuid, dto.capacity);
  }

  @RequirePermissions(CLINIC_WRITE)
  @Post(":id/assign-lead")
  @HttpCode(200)
  async assignLead(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<HealthCentre> {
    const dto = parseBody(assignLeadSchema, body);
    return this.service.assignLead(tenantOf(principal), id as Uuid, dto.clinicianId as Uuid);
  }

  @RequirePermissions(CLINIC_WRITE)
  @Post(":id/unassign-lead")
  @HttpCode(200)
  async unassignLead(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<HealthCentre> {
    return this.service.unassignLead(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CLINIC_WRITE)
  @Post(":id/send-to-maintenance")
  @HttpCode(200)
  async sendToMaintenance(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<HealthCentre> {
    return this.service.sendToMaintenance(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CLINIC_WRITE)
  @Post(":id/return-from-maintenance")
  @HttpCode(200)
  async returnFromMaintenance(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<HealthCentre> {
    return this.service.returnFromMaintenance(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CLINIC_WRITE)
  @Post(":id/decommission")
  @HttpCode(200)
  async decommission(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<HealthCentre> {
    return this.service.decommission(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CLINIC_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<HealthCentre[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(CLINIC_READ)
  @Get("by-code/:code")
  async getByCode(
    @CurrentPrincipal() principal: Principal,
    @Param("code") code: string,
  ): Promise<HealthCentre> {
    return this.service.getByCode(tenantOf(principal), code);
  }

  @RequirePermissions(CLINIC_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<HealthCentre[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(CLINIC_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<HealthCentre> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
