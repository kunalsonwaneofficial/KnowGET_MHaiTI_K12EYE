import {
  type ExecutionPlan,
  ExecutionPlanService,
  type PlanInspection,
  type PlanProgress,
  type PlanStepView,
  type SubmittedPlan,
} from "@knowget/agent-orchestration";
import type { Principal } from "@knowget/auth";
import type { ISODateString, Uuid } from "@knowget/types";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  AI_APPROVE,
  AI_OPERATE,
  AI_READ,
  deciderOf,
  parseBody,
  tenantOf,
} from "./agent-orchestration-http";
import {
  addPlanStepSchema,
  decisionSchema,
  draftPlanSchema,
  restateGoalSchema,
  stepFailureSchema,
  stepOutcomeSchema,
  submitPlanSchema,
} from "./agent-orchestration.dto";
import { AI_PLAN_SERVICE } from "./agent-orchestration.tokens";

/**
 * REST surface for execution plans (P2-D26) — what an agent intends to do, before it does any of it.
 *
 * `ai:read` and `ai:operate` cover authoring and execution; `approve` and `reject` require `ai:approve` instead,
 * which no other scope implies. The plan's gate exists so a person is accountable for the risky calls in it, and
 * an operator who could clear the gate on their own plan would be recording a signature rather than a decision.
 *
 * `GET :id/inspect` is the endpoint that makes a plan inspectable rather than merely stored: it re-reads every
 * step against the live catalog, so a capability that was deprecated or reclassified after the plan was written
 * shows up as a finding at the moment someone looks, not as a surprise mid-execution.
 */
@Controller("ai/plans")
export class ExecutionPlanController {
  constructor(@Inject(AI_PLAN_SERVICE) private readonly service: ExecutionPlanService) {}

  @RequirePermissions(AI_OPERATE)
  @Post()
  @HttpCode(201)
  async draft(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ExecutionPlan> {
    const dto = parseBody(draftPlanSchema, body);
    return this.service.draft({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      agentId: dto.agentId,
      goal: dto.goal,
      reasoningSessionId: dto.reasoningSessionId ?? null,
    });
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/goal")
  @HttpCode(200)
  async restateGoal(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ExecutionPlan> {
    const dto = parseBody(restateGoalSchema, body);
    return this.service.restateGoal(tenantOf(principal), id as Uuid, dto.goal);
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/steps")
  @HttpCode(201)
  async addStep(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ExecutionPlan> {
    const dto = parseBody(addPlanStepSchema, body);
    return this.service.addStep(tenantOf(principal), id as Uuid, {
      capabilityKey: dto.capabilityKey,
      intent: dto.intent ?? null,
      dependsOn: dto.dependsOn ?? [],
    });
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/submit")
  @HttpCode(200)
  async submit(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<SubmittedPlan> {
    const dto = parseBody(submitPlanSchema, body);
    return this.service.submit(
      tenantOf(principal),
      id as Uuid,
      (dto.expiresAt ?? null) as ISODateString | null,
    );
  }

  @RequirePermissions(AI_APPROVE)
  @Post(":id/approve")
  @HttpCode(200)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<SubmittedPlan> {
    const dto = parseBody(decisionSchema, body);
    return this.service.approve(tenantOf(principal), id as Uuid, {
      decidedByUserId: deciderOf(principal),
      note: dto.note ?? null,
    });
  }

  @RequirePermissions(AI_APPROVE)
  @Post(":id/reject")
  @HttpCode(200)
  async reject(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<SubmittedPlan> {
    const dto = parseBody(decisionSchema, body);
    return this.service.reject(tenantOf(principal), id as Uuid, {
      decidedByUserId: deciderOf(principal),
      note: dto.note ?? null,
    });
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/start")
  @HttpCode(200)
  async start(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ExecutionPlan> {
    return this.service.start(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/steps/:stepId/begin")
  @HttpCode(200)
  async beginStep(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("stepId") stepId: string,
  ): Promise<ExecutionPlan> {
    return this.service.beginStep(tenantOf(principal), id as Uuid, stepId);
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/steps/:stepId/succeed")
  @HttpCode(200)
  async succeedStep(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("stepId") stepId: string,
    @Body() body: unknown,
  ): Promise<ExecutionPlan> {
    const dto = parseBody(stepOutcomeSchema, body);
    return this.service.succeedStep(tenantOf(principal), id as Uuid, stepId, dto.invocationId);
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/steps/:stepId/fail")
  @HttpCode(200)
  async failStep(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("stepId") stepId: string,
    @Body() body: unknown,
  ): Promise<ExecutionPlan> {
    const dto = parseBody(stepFailureSchema, body);
    return this.service.failStep(tenantOf(principal), id as Uuid, stepId, dto.invocationId ?? null);
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/steps/:stepId/skip")
  @HttpCode(200)
  async skipStep(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("stepId") stepId: string,
  ): Promise<ExecutionPlan> {
    return this.service.skipStep(tenantOf(principal), id as Uuid, stepId);
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/steps/:stepId/compensate")
  @HttpCode(200)
  async compensateStep(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("stepId") stepId: string,
  ): Promise<ExecutionPlan> {
    return this.service.compensateStep(tenantOf(principal), id as Uuid, stepId);
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ExecutionPlan> {
    return this.service.complete(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/fail")
  @HttpCode(200)
  async fail(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ExecutionPlan> {
    return this.service.fail(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/roll-back")
  @HttpCode(200)
  async rollBack(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ExecutionPlan> {
    return this.service.rollBack(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ExecutionPlan> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AI_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<ExecutionPlan[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(AI_READ)
  @Get("by-agent/:agentId")
  async listByAgent(
    @CurrentPrincipal() principal: Principal,
    @Param("agentId") agentId: string,
  ): Promise<ExecutionPlan[]> {
    return this.service.listByAgent(tenantOf(principal), agentId);
  }

  @RequirePermissions(AI_READ)
  @Get("by-session/:sessionId")
  async listBySession(
    @CurrentPrincipal() principal: Principal,
    @Param("sessionId") sessionId: string,
  ): Promise<ExecutionPlan[]> {
    return this.service.listBySession(tenantOf(principal), sessionId);
  }

  @RequirePermissions(AI_READ)
  @Get(":id/inspect")
  async inspect(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<PlanInspection> {
    return this.service.inspect(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AI_READ)
  @Get(":id/next-steps")
  async nextSteps(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<readonly PlanStepView[]> {
    return this.service.nextSteps(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AI_READ)
  @Get(":id/progress")
  async progress(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<PlanProgress> {
    return this.service.progress(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AI_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ExecutionPlan> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AI_OPERATE)
  @Delete(":id/steps/:stepId")
  @HttpCode(200)
  async removeStep(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("stepId") stepId: string,
  ): Promise<ExecutionPlan> {
    return this.service.removeStep(tenantOf(principal), id as Uuid, stepId);
  }

  @RequirePermissions(AI_OPERATE)
  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<void> {
    return this.service.remove(tenantOf(principal), id as Uuid);
  }
}
