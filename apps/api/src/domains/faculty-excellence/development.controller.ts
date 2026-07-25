import type { Principal } from "@knowget/auth";
import {
  type DevelopmentLedger,
  type DevelopmentRequirement,
  DevelopmentService,
  type ProfessionalLearningActivity,
} from "@knowget/faculty-excellence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  completeActivitySchema,
  planActivitySchema,
  reviseRequirementSchema,
  setActivityHoursSchema,
  setRequirementSchema,
} from "./faculty-excellence.dto";
import { FACULTY_READ, FACULTY_WRITE, parseBody, tenantOf } from "./faculty-excellence-http";
import { FE_DEVELOPMENT_SERVICE } from "./faculty-excellence.tokens";

/**
 * REST surface for professional development (P2-D13) — CPD requirements, activities and the
 * reconciled compliance ledger. Gated by faculty:*; tenant-scoped.
 */
@Controller("faculty/development")
export class DevelopmentController {
  constructor(@Inject(FE_DEVELOPMENT_SERVICE) private readonly service: DevelopmentService) {}

  @RequirePermissions(FACULTY_WRITE)
  @Post("requirements")
  @HttpCode(201)
  async setRequirement(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<DevelopmentRequirement> {
    const dto = parseBody(setRequirementSchema, body);
    return this.service.setRequirement({
      tenantId: tenantOf(principal),
      employeeId: dto.employeeId as Uuid,
      category: dto.category,
      period: dto.period,
      requiredHours: dto.requiredHours,
    });
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post("requirements/:id/revise")
  @HttpCode(200)
  async reviseRequirement(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<DevelopmentRequirement> {
    const dto = parseBody(reviseRequirementSchema, body);
    return this.service.reviseRequirement(tenantOf(principal), id as Uuid, dto.requiredHours);
  }

  @RequirePermissions(FACULTY_READ)
  @Get("requirements/by-employee/:employeeId")
  async listRequirements(
    @CurrentPrincipal() principal: Principal,
    @Param("employeeId") employeeId: string,
  ): Promise<DevelopmentRequirement[]> {
    return this.service.listRequirements(tenantOf(principal), employeeId as Uuid);
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post("activities")
  @HttpCode(201)
  async plan(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ProfessionalLearningActivity> {
    const dto = parseBody(planActivitySchema, body);
    return this.service.plan({
      tenantId: tenantOf(principal),
      employeeId: dto.employeeId as Uuid,
      title: dto.title,
      category: dto.category,
      hours: dto.hours,
      ...(dto.provider !== undefined ? { provider: dto.provider } : {}),
      ...(dto.period !== undefined ? { period: dto.period } : {}),
      ...(dto.startDate !== undefined ? { startDate: dto.startDate } : {}),
    });
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post("activities/:id/enroll")
  @HttpCode(200)
  async enroll(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ProfessionalLearningActivity> {
    return this.service.enroll(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post("activities/:id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ProfessionalLearningActivity> {
    const dto = parseBody(completeActivitySchema, body);
    return this.service.complete(tenantOf(principal), id as Uuid, dto.completedOn ?? null);
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post("activities/:id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ProfessionalLearningActivity> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post("activities/:id/hours")
  @HttpCode(200)
  async setActivityHours(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ProfessionalLearningActivity> {
    const dto = parseBody(setActivityHoursSchema, body);
    return this.service.setActivityHours(tenantOf(principal), id as Uuid, dto.hours);
  }

  @RequirePermissions(FACULTY_READ)
  @Get("activities/by-employee/:employeeId")
  async listActivities(
    @CurrentPrincipal() principal: Principal,
    @Param("employeeId") employeeId: string,
  ): Promise<ProfessionalLearningActivity[]> {
    return this.service.listActivities(tenantOf(principal), employeeId as Uuid);
  }

  @RequirePermissions(FACULTY_READ)
  @Get("activities/:id")
  async getActivity(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ProfessionalLearningActivity> {
    return this.service.getActivity(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACULTY_READ)
  @Get("ledger/:employeeId/:period")
  async computeLedger(
    @CurrentPrincipal() principal: Principal,
    @Param("employeeId") employeeId: string,
    @Param("period") period: string,
  ): Promise<DevelopmentLedger> {
    return this.service.computeLedger(tenantOf(principal), employeeId as Uuid, period);
  }
}
