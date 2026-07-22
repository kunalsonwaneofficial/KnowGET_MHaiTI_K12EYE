import type { Principal } from "@knowget/auth";
import {
  type BehaviourGoal,
  type BehaviourIncident,
  type BehaviourObservation,
  type BehaviourRecord,
  BehaviourRecordService,
  type RestorativeAction,
} from "@knowget/learner-wellbeing";
import type { ISODateString, Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  addRestorativeActionSchema,
  createBehaviourRecordSchema,
  recordObservationSchema,
  reportIncidentSchema,
  setBehaviourGoalSchema,
  setImprovementPlanSchema,
  updateBehaviourGoalStatusSchema,
  updateIncidentStatusSchema,
} from "./learner-wellbeing.dto";
import { BEHAVIOUR_READ, BEHAVIOUR_WRITE, parseBody, tenantOf } from "./learner-wellbeing-http";
import { LW_BEHAVIOUR_RECORD_SERVICE } from "./learner-wellbeing.tokens";

/** REST surface for behaviour records (P2-D05). Gated by behaviour:*; tenant-scoped. */
@Controller("learner-wellbeing/behaviour-records")
export class BehaviourRecordController {
  constructor(
    @Inject(LW_BEHAVIOUR_RECORD_SERVICE) private readonly service: BehaviourRecordService,
  ) {}

  @RequirePermissions(BEHAVIOUR_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<BehaviourRecord> {
    const dto = parseBody(createBehaviourRecordSchema, body);
    return this.service.create({ tenantId: tenantOf(principal), studentId: dto.studentId as Uuid });
  }

  @RequirePermissions(BEHAVIOUR_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<BehaviourRecord[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(BEHAVIOUR_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<BehaviourRecord[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(BEHAVIOUR_READ)
  @Get("by-student/:studentId")
  async getByStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<BehaviourRecord | null> {
    return this.service.getByStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(BEHAVIOUR_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<BehaviourRecord> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(BEHAVIOUR_WRITE)
  @Post(":id/observations")
  @HttpCode(201)
  async recordObservation(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ record: BehaviourRecord; observation: BehaviourObservation }> {
    const dto = parseBody(recordObservationSchema, body);
    return this.service.recordObservation(tenantOf(principal), id as Uuid, {
      type: dto.type,
      note: dto.note,
      observedBy: dto.observedBy as Uuid,
      ...(dto.observedAt !== undefined ? { observedAt: dto.observedAt as ISODateString } : {}),
    });
  }

  @RequirePermissions(BEHAVIOUR_WRITE)
  @Post(":id/observations/:observationId/remove")
  @HttpCode(200)
  async removeObservation(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("observationId") observationId: string,
  ): Promise<BehaviourRecord> {
    return this.service.removeObservation(tenantOf(principal), id as Uuid, observationId as Uuid);
  }

  @RequirePermissions(BEHAVIOUR_WRITE)
  @Post(":id/incidents")
  @HttpCode(201)
  async reportIncident(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ record: BehaviourRecord; incident: BehaviourIncident }> {
    const dto = parseBody(reportIncidentSchema, body);
    return this.service.reportIncident(tenantOf(principal), id as Uuid, {
      category: dto.category,
      severity: dto.severity,
      description: dto.description,
      reportedBy: dto.reportedBy as Uuid,
      ...(dto.reportedAt !== undefined ? { reportedAt: dto.reportedAt as ISODateString } : {}),
    });
  }

  @RequirePermissions(BEHAVIOUR_WRITE)
  @Post(":id/incidents/:incidentId/status")
  @HttpCode(200)
  async updateIncidentStatus(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
  ): Promise<BehaviourRecord> {
    const dto = parseBody(updateIncidentStatusSchema, body);
    return this.service.updateIncidentStatus(
      tenantOf(principal),
      id as Uuid,
      incidentId as Uuid,
      dto.status,
    );
  }

  @RequirePermissions(BEHAVIOUR_WRITE)
  @Post(":id/incidents/:incidentId/restorative-actions")
  @HttpCode(201)
  async addRestorativeAction(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
  ): Promise<{ record: BehaviourRecord; action: RestorativeAction }> {
    const dto = parseBody(addRestorativeActionSchema, body);
    return this.service.addRestorativeAction(
      tenantOf(principal),
      id as Uuid,
      incidentId as Uuid,
      dto.description,
    );
  }

  @RequirePermissions(BEHAVIOUR_WRITE)
  @Post(":id/incidents/:incidentId/restorative-actions/:actionId/complete")
  @HttpCode(200)
  async completeRestorativeAction(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("incidentId") incidentId: string,
    @Param("actionId") actionId: string,
  ): Promise<BehaviourRecord> {
    return this.service.completeRestorativeAction(
      tenantOf(principal),
      id as Uuid,
      incidentId as Uuid,
      actionId as Uuid,
    );
  }

  @RequirePermissions(BEHAVIOUR_WRITE)
  @Post(":id/goals")
  @HttpCode(201)
  async setGoal(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ record: BehaviourRecord; goal: BehaviourGoal }> {
    const dto = parseBody(setBehaviourGoalSchema, body);
    return this.service.setGoal(tenantOf(principal), id as Uuid, dto.description);
  }

  @RequirePermissions(BEHAVIOUR_WRITE)
  @Post(":id/goals/:goalId/status")
  @HttpCode(200)
  async updateGoalStatus(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("goalId") goalId: string,
    @Body() body: unknown,
  ): Promise<BehaviourRecord> {
    const dto = parseBody(updateBehaviourGoalStatusSchema, body);
    return this.service.updateGoalStatus(
      tenantOf(principal),
      id as Uuid,
      goalId as Uuid,
      dto.status,
    );
  }

  @RequirePermissions(BEHAVIOUR_WRITE)
  @Post(":id/goals/:goalId/remove")
  @HttpCode(200)
  async removeGoal(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("goalId") goalId: string,
  ): Promise<BehaviourRecord> {
    return this.service.removeGoal(tenantOf(principal), id as Uuid, goalId as Uuid);
  }

  @RequirePermissions(BEHAVIOUR_WRITE)
  @Post(":id/improvement-plan")
  @HttpCode(200)
  async setImprovementPlan(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<BehaviourRecord> {
    const dto = parseBody(setImprovementPlanSchema, body);
    return this.service.setImprovementPlan(tenantOf(principal), id as Uuid, {
      strategies: dto.strategies,
      ...(dto.reviewOn !== undefined ? { reviewOn: dto.reviewOn } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
    });
  }

  @RequirePermissions(BEHAVIOUR_WRITE)
  @Post(":id/improvement-plan/clear")
  @HttpCode(200)
  async clearImprovementPlan(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<BehaviourRecord> {
    return this.service.clearImprovementPlan(tenantOf(principal), id as Uuid);
  }
}
