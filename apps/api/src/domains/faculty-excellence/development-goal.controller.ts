import type { Principal } from "@knowget/auth";
import { type DevelopmentGoal, DevelopmentGoalService } from "@knowget/faculty-excellence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  draftGoalSchema,
  goalOutcomeSchema,
  setGoalDescriptionSchema,
  setGoalTargetDateSchema,
} from "./faculty-excellence.dto";
import { FACULTY_READ, FACULTY_WRITE, parseBody, tenantOf } from "./faculty-excellence-http";
import { FE_GOAL_SERVICE } from "./faculty-excellence.tokens";

/** REST surface for development goals (P2-D13). Gated by faculty:*; tenant-scoped. */
@Controller("faculty/goals")
export class DevelopmentGoalController {
  constructor(@Inject(FE_GOAL_SERVICE) private readonly service: DevelopmentGoalService) {}

  @RequirePermissions(FACULTY_WRITE)
  @Post()
  @HttpCode(201)
  async draft(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<DevelopmentGoal> {
    const dto = parseBody(draftGoalSchema, body);
    return this.service.draft({
      tenantId: tenantOf(principal),
      employeeId: dto.employeeId as Uuid,
      description: dto.description,
      ...(dto.targetCompetencyKey !== undefined
        ? { targetCompetencyKey: dto.targetCompetencyKey }
        : {}),
      ...(dto.frameworkId !== undefined ? { frameworkId: dto.frameworkId as Uuid | null } : {}),
      ...(dto.engagementId !== undefined ? { engagementId: dto.engagementId as Uuid | null } : {}),
      ...(dto.targetDate !== undefined ? { targetDate: dto.targetDate } : {}),
    });
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post(":id/description")
  @HttpCode(200)
  async setDescription(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<DevelopmentGoal> {
    const dto = parseBody(setGoalDescriptionSchema, body);
    return this.service.setDescription(tenantOf(principal), id as Uuid, dto.description);
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post(":id/target-date")
  @HttpCode(200)
  async setTargetDate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<DevelopmentGoal> {
    const dto = parseBody(setGoalTargetDateSchema, body);
    return this.service.setTargetDate(tenantOf(principal), id as Uuid, dto.targetDate);
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<DevelopmentGoal> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post(":id/achieve")
  @HttpCode(200)
  async achieve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<DevelopmentGoal> {
    const dto = parseBody(goalOutcomeSchema, body);
    return this.service.achieve(tenantOf(principal), id as Uuid, dto.outcome ?? null);
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post(":id/abandon")
  @HttpCode(200)
  async abandon(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<DevelopmentGoal> {
    const dto = parseBody(goalOutcomeSchema, body);
    return this.service.abandon(tenantOf(principal), id as Uuid, dto.outcome ?? null);
  }

  @RequirePermissions(FACULTY_READ)
  @Get("by-employee/:employeeId")
  async listForEmployee(
    @CurrentPrincipal() principal: Principal,
    @Param("employeeId") employeeId: string,
  ): Promise<DevelopmentGoal[]> {
    return this.service.listForEmployee(tenantOf(principal), employeeId as Uuid);
  }

  @RequirePermissions(FACULTY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<DevelopmentGoal> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
