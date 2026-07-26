import type { Principal } from "@knowget/auth";
import { type AdmissionCycle, AdmissionCycleService } from "@knowget/admissions";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ADMISSIONS_READ, ADMISSIONS_WRITE, parseBody, tenantOf } from "./admissions-http";
import {
  createCycleSchema,
  renameCycleSchema,
  setCycleSeatPlanSchema,
  setCycleWindowSchema,
} from "./admissions.dto";
import { AD_CYCLE_SERVICE } from "./admissions.tokens";

/** REST surface for admission cycles (P2-D23). Gated by admissions:*; tenant-scoped. */
@Controller("admissions/cycles")
export class AdmissionCycleController {
  constructor(@Inject(AD_CYCLE_SERVICE) private readonly service: AdmissionCycleService) {}

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AdmissionCycle> {
    const dto = parseBody(createCycleSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      name: dto.name,
      academicYear: dto.academicYear,
      gradeCapacities: dto.gradeCapacities ?? [],
      opensOn: dto.opensOn ?? null,
      closesOn: dto.closesOn ?? null,
    });
  }

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AdmissionCycle> {
    const dto = parseBody(renameCycleSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post(":id/seat-plan")
  @HttpCode(200)
  async setSeatPlan(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AdmissionCycle> {
    const dto = parseBody(setCycleSeatPlanSchema, body);
    return this.service.setGradeCapacities(tenantOf(principal), id as Uuid, dto.gradeCapacities);
  }

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post(":id/window")
  @HttpCode(200)
  async setWindow(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AdmissionCycle> {
    const dto = parseBody(setCycleWindowSchema, body);
    return this.service.setWindow(tenantOf(principal), id as Uuid, dto.opensOn, dto.closesOn);
  }

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post(":id/open")
  @HttpCode(200)
  async open(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AdmissionCycle> {
    return this.service.open(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post(":id/close")
  @HttpCode(200)
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AdmissionCycle> {
    return this.service.close(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AdmissionCycle> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ADMISSIONS_READ)
  @Get("by-code/:code")
  async getByCode(
    @CurrentPrincipal() principal: Principal,
    @Param("code") code: string,
  ): Promise<AdmissionCycle> {
    return this.service.getByCode(tenantOf(principal), code);
  }

  @RequirePermissions(ADMISSIONS_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<AdmissionCycle[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ADMISSIONS_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AdmissionCycle> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
