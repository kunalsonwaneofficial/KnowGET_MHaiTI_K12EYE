import type { Principal } from "@knowget/auth";
import {
  type Intervention,
  type InterventionPlan,
  InterventionPlanService,
  type InterventionProgressNote,
} from "@knowget/learner-wellbeing";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  assignInterventionSchema,
  completeInterventionSchema,
  createInterventionPlanSchema,
  recordInterventionProgressSchema,
  setEarlyWarningTriggersSchema,
} from "./learner-wellbeing.dto";
import {
  INTERVENTION_READ,
  INTERVENTION_WRITE,
  parseBody,
  tenantOf,
} from "./learner-wellbeing-http";
import { LW_INTERVENTION_PLAN_SERVICE } from "./learner-wellbeing.tokens";

/** REST surface for intervention plans (P2-D05). Gated by intervention:*; tenant-scoped. */
@Controller("learner-wellbeing/intervention-plans")
export class InterventionPlanController {
  constructor(
    @Inject(LW_INTERVENTION_PLAN_SERVICE) private readonly service: InterventionPlanService,
  ) {}

  @RequirePermissions(INTERVENTION_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<InterventionPlan> {
    const dto = parseBody(createInterventionPlanSchema, body);
    return this.service.create({ tenantId: tenantOf(principal), studentId: dto.studentId as Uuid });
  }

  @RequirePermissions(INTERVENTION_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<InterventionPlan[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(INTERVENTION_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<InterventionPlan[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(INTERVENTION_READ)
  @Get("by-student/:studentId")
  async getByStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<InterventionPlan | null> {
    return this.service.getByStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(INTERVENTION_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<InterventionPlan> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(INTERVENTION_WRITE)
  @Post(":id/early-warning-triggers")
  @HttpCode(200)
  async setEarlyWarningTriggers(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<InterventionPlan> {
    const dto = parseBody(setEarlyWarningTriggersSchema, body);
    return this.service.setEarlyWarningTriggers(tenantOf(principal), id as Uuid, dto.triggers);
  }

  @RequirePermissions(INTERVENTION_WRITE)
  @Post(":id/interventions")
  @HttpCode(201)
  async assignIntervention(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ plan: InterventionPlan; intervention: Intervention }> {
    const dto = parseBody(assignInterventionSchema, body);
    return this.service.assignIntervention(tenantOf(principal), id as Uuid, {
      description: dto.description,
      responsibleStaff: dto.responsibleStaff as Uuid,
    });
  }

  @RequirePermissions(INTERVENTION_WRITE)
  @Post(":id/interventions/:interventionId/start")
  @HttpCode(200)
  async startIntervention(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("interventionId") interventionId: string,
  ): Promise<InterventionPlan> {
    return this.service.startIntervention(tenantOf(principal), id as Uuid, interventionId as Uuid);
  }

  @RequirePermissions(INTERVENTION_WRITE)
  @Post(":id/interventions/:interventionId/progress")
  @HttpCode(201)
  async recordProgress(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("interventionId") interventionId: string,
    @Body() body: unknown,
  ): Promise<{ plan: InterventionPlan; note: InterventionProgressNote }> {
    const dto = parseBody(recordInterventionProgressSchema, body);
    return this.service.recordProgress(tenantOf(principal), id as Uuid, interventionId as Uuid, {
      note: dto.note,
      recordedBy: dto.recordedBy as Uuid,
    });
  }

  @RequirePermissions(INTERVENTION_WRITE)
  @Post(":id/interventions/:interventionId/complete")
  @HttpCode(200)
  async completeIntervention(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("interventionId") interventionId: string,
    @Body() body: unknown,
  ): Promise<{ plan: InterventionPlan; intervention: Intervention }> {
    const dto = parseBody(completeInterventionSchema, body);
    return this.service.completeIntervention(
      tenantOf(principal),
      id as Uuid,
      interventionId as Uuid,
      dto.outcome,
    );
  }

  @RequirePermissions(INTERVENTION_WRITE)
  @Post(":id/interventions/:interventionId/cancel")
  @HttpCode(200)
  async cancelIntervention(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("interventionId") interventionId: string,
  ): Promise<InterventionPlan> {
    return this.service.cancelIntervention(tenantOf(principal), id as Uuid, interventionId as Uuid);
  }
}
