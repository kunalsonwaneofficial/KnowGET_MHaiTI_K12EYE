import type { Principal } from "@knowget/auth";
import {
  type CounsellingCase,
  CounsellingCaseService,
  type CounsellingGoal,
  type CounsellingReferral,
  type CounsellingSession,
} from "@knowget/learner-wellbeing";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  addReferralSchema,
  assignCounsellorSchema,
  closeCounsellingCaseSchema,
  openCounsellingCaseSchema,
  recordSessionSchema,
  setCasePrioritySchema,
  setCounsellingGoalSchema,
  updateCounsellingGoalStatusSchema,
} from "./learner-wellbeing.dto";
import { COUNSELLING_READ, COUNSELLING_WRITE, parseBody, tenantOf } from "./learner-wellbeing-http";
import { LW_COUNSELLING_CASE_SERVICE } from "./learner-wellbeing.tokens";

/**
 * REST surface for counselling cases (P2-D05). Gated by the isolated, enhanced-privacy
 * counselling:* scope; tenant-scoped.
 */
@Controller("learner-wellbeing/counselling-cases")
export class CounsellingCaseController {
  constructor(
    @Inject(LW_COUNSELLING_CASE_SERVICE) private readonly service: CounsellingCaseService,
  ) {}

  @RequirePermissions(COUNSELLING_WRITE)
  @Post()
  @HttpCode(201)
  async open(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<CounsellingCase> {
    const dto = parseBody(openCounsellingCaseSchema, body);
    return this.service.open({
      tenantId: tenantOf(principal),
      studentId: dto.studentId as Uuid,
      counsellorId: dto.counsellorId as Uuid,
      presentingConcern: dto.presentingConcern,
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
    });
  }

  @RequirePermissions(COUNSELLING_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<CounsellingCase[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(COUNSELLING_READ)
  @Get("by-student/:studentId")
  async listForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<CounsellingCase[]> {
    return this.service.listForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(COUNSELLING_READ)
  @Get("by-counsellor/:counsellorId")
  async listForCounsellor(
    @CurrentPrincipal() principal: Principal,
    @Param("counsellorId") counsellorId: string,
  ): Promise<CounsellingCase[]> {
    return this.service.listForCounsellor(tenantOf(principal), counsellorId as Uuid);
  }

  @RequirePermissions(COUNSELLING_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<CounsellingCase[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(COUNSELLING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<CounsellingCase> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COUNSELLING_WRITE)
  @Post(":id/counsellor")
  @HttpCode(200)
  async assignCounsellor(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CounsellingCase> {
    const dto = parseBody(assignCounsellorSchema, body);
    return this.service.assignCounsellor(tenantOf(principal), id as Uuid, dto.counsellorId as Uuid);
  }

  @RequirePermissions(COUNSELLING_WRITE)
  @Post(":id/priority")
  @HttpCode(200)
  async setPriority(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CounsellingCase> {
    const dto = parseBody(setCasePrioritySchema, body);
    return this.service.setPriority(tenantOf(principal), id as Uuid, dto.priority);
  }

  @RequirePermissions(COUNSELLING_WRITE)
  @Post(":id/sessions")
  @HttpCode(201)
  async recordSession(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ kase: CounsellingCase; session: CounsellingSession }> {
    const dto = parseBody(recordSessionSchema, body);
    return this.service.recordSession(tenantOf(principal), id as Uuid, {
      note: dto.note,
      recordedBy: dto.recordedBy as Uuid,
      ...(dto.occurredOn !== undefined ? { occurredOn: dto.occurredOn } : {}),
    });
  }

  @RequirePermissions(COUNSELLING_WRITE)
  @Post(":id/referrals")
  @HttpCode(201)
  async addReferral(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ kase: CounsellingCase; referral: CounsellingReferral }> {
    const dto = parseBody(addReferralSchema, body);
    return this.service.addReferral(tenantOf(principal), id as Uuid, {
      referredTo: dto.referredTo,
      reason: dto.reason,
    });
  }

  @RequirePermissions(COUNSELLING_WRITE)
  @Post(":id/goals")
  @HttpCode(201)
  async setGoal(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ kase: CounsellingCase; goal: CounsellingGoal }> {
    const dto = parseBody(setCounsellingGoalSchema, body);
    return this.service.setGoal(tenantOf(principal), id as Uuid, dto.description);
  }

  @RequirePermissions(COUNSELLING_WRITE)
  @Post(":id/goals/:goalId/status")
  @HttpCode(200)
  async updateGoalStatus(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("goalId") goalId: string,
    @Body() body: unknown,
  ): Promise<CounsellingCase> {
    const dto = parseBody(updateCounsellingGoalStatusSchema, body);
    return this.service.updateGoalStatus(
      tenantOf(principal),
      id as Uuid,
      goalId as Uuid,
      dto.status,
    );
  }

  @RequirePermissions(COUNSELLING_WRITE)
  @Post(":id/close")
  @HttpCode(200)
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CounsellingCase> {
    const dto = parseBody(closeCounsellingCaseSchema, body);
    return this.service.close(tenantOf(principal), id as Uuid, dto.outcome);
  }
}
