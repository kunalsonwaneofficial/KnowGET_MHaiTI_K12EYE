import type { Principal } from "@knowget/auth";
import {
  type OverdueStage,
  type ReversalPlan,
  type WorkflowInstance,
  WorkflowRunService,
} from "@knowget/decision-intelligence";
import { nowIso } from "@knowget/shared";
import type { ISODateString, Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  DECISION_OPERATE,
  DECISION_READ,
  deciderOf,
  parseBody,
  tenantOf,
} from "./decision-intelligence-http";
import {
  asOfSchema,
  beginStageSchema,
  cancelInstanceSchema,
  completeStageSchema,
  failStageSchema,
  skipStageSchema,
  startInstanceSchema,
} from "./decision-intelligence.dto";
import { DI_WORKFLOW_RUN_SERVICE } from "./decision-intelligence.tokens";

/**
 * REST surface for workflow instances (P2-D27) — the cases actually running, stage by stage.
 *
 * Runtime, not governance: `decision:operate` writes here, and what may be run at all was settled on the
 * workflow-definitions controller under `decision:manage`. A case carries its own copy of the stages it was
 * started with, so re-publishing the definition tomorrow cannot rewrite what a case running today is doing.
 *
 * The reversal endpoints are the contract's third rule made answerable before the fact: `:id/reversal-plan`
 * says what it would take to undo this case as it stands, in the order it would have to be undone, and what
 * could not be undone at all — which is what anyone stopping a case halfway needs to know *before* they stop it.
 */
@Controller("decision/workflow-runs")
export class WorkflowRunController {
  constructor(@Inject(DI_WORKFLOW_RUN_SERVICE) private readonly service: WorkflowRunService) {}

  /**
   * Start a case on the currently published version of a process, named by key.
   *
   * A key rather than a definition id, deliberately: a caller that could name a version could start a case on a
   * draft nobody approved or on a version the institution has since replaced. Which version this became is
   * recorded on the instance, so the case can always say what it is following.
   */
  @RequirePermissions(DECISION_OPERATE)
  @Post()
  @HttpCode(201)
  async start(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<WorkflowInstance> {
    const dto = parseBody(startInstanceSchema, body);
    return this.service.start(tenantOf(principal), dto.workflowKey, {
      subjectDomain: dto.subjectDomain,
      subjectId: dto.subjectId,
      triggeredByUserId: deciderOf(principal),
      triggeredByRuleId: dto.triggeredByRuleId ?? null,
      recommendationId: dto.recommendationId ? (dto.recommendationId as Uuid) : null,
    });
  }

  /** Pick a pending stage up. Refused until everything it depends on has settled. */
  @RequirePermissions(DECISION_OPERATE)
  @Post(":id/stages/:stageKey/begin")
  @HttpCode(200)
  async beginStage(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("stageKey") stageKey: string,
    @Body() body: unknown,
  ): Promise<WorkflowInstance> {
    const dto = parseBody(beginStageSchema, body);
    return this.service.beginStage(tenantOf(principal), id as Uuid, stageKey, {
      assignedToUserId: dto.assignedToUserId ?? deciderOf(principal),
    });
  }

  @RequirePermissions(DECISION_OPERATE)
  @Post(":id/stages/:stageKey/complete")
  @HttpCode(200)
  async completeStage(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("stageKey") stageKey: string,
    @Body() body: unknown,
  ): Promise<WorkflowInstance> {
    const dto = parseBody(completeStageSchema, body);
    return this.service.completeStage(tenantOf(principal), id as Uuid, stageKey, {
      note: dto.note ?? null,
      executionRef: dto.executionRef ?? null,
    });
  }

  /** Skip a stage the definition declared optional. A required stage is not skippable at any price. */
  @RequirePermissions(DECISION_OPERATE)
  @Post(":id/stages/:stageKey/skip")
  @HttpCode(200)
  async skipStage(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("stageKey") stageKey: string,
    @Body() body: unknown,
  ): Promise<WorkflowInstance> {
    const dto = parseBody(skipStageSchema, body);
    return this.service.skipStage(tenantOf(principal), id as Uuid, stageKey, {
      note: dto.note ?? null,
    });
  }

  /** Fail a stage, and with it the case. The case stops at the stage that did not work and records why. */
  @RequirePermissions(DECISION_OPERATE)
  @Post(":id/stages/:stageKey/fail")
  @HttpCode(200)
  async failStage(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("stageKey") stageKey: string,
    @Body() body: unknown,
  ): Promise<WorkflowInstance> {
    const dto = parseBody(failStageSchema, body);
    return this.service.failStage(tenantOf(principal), id as Uuid, stageKey, {
      error: dto.error,
      executionRef: dto.executionRef ?? null,
    });
  }

  /** Undo one completed stage. What order to do this in is what `:id/reversal-plan` answers. */
  @RequirePermissions(DECISION_OPERATE)
  @Post(":id/stages/:stageKey/compensate")
  @HttpCode(200)
  async compensateStage(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("stageKey") stageKey: string,
  ): Promise<WorkflowInstance> {
    return this.service.compensateStage(tenantOf(principal), id as Uuid, stageKey);
  }

  /** Stop a running case. What has already happened is not undone by this — see the reversal plan. */
  @RequirePermissions(DECISION_OPERATE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<WorkflowInstance> {
    const dto = parseBody(cancelInstanceSchema, body);
    return this.service.cancel(tenantOf(principal), id as Uuid, {
      cancelledByUserId: deciderOf(principal),
      reason: dto.reason ?? null,
    });
  }

  @RequirePermissions(DECISION_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly WorkflowInstance[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(DECISION_READ)
  @Get("running")
  async listRunning(
    @CurrentPrincipal() principal: Principal,
  ): Promise<readonly WorkflowInstance[]> {
    return this.service.listRunning(tenantOf(principal));
  }

  @RequirePermissions(DECISION_READ)
  @Get("by-workflow/:workflowId")
  async listByWorkflow(
    @CurrentPrincipal() principal: Principal,
    @Param("workflowId") workflowId: string,
  ): Promise<readonly WorkflowInstance[]> {
    return this.service.listByWorkflow(tenantOf(principal), workflowId as Uuid);
  }

  /** Every case ever run about one subject — how a case worker sees what has already been tried. */
  @RequirePermissions(DECISION_READ)
  @Get("by-subject/:subjectDomain/:subjectId")
  async listBySubject(
    @CurrentPrincipal() principal: Principal,
    @Param("subjectDomain") subjectDomain: string,
    @Param("subjectId") subjectId: string,
  ): Promise<readonly WorkflowInstance[]> {
    return this.service.listBySubject(tenantOf(principal), subjectDomain, subjectId);
  }

  /** The stages that could be picked up right now — the work queue for one case. */
  @RequirePermissions(DECISION_READ)
  @Get(":id/ready")
  async ready(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<readonly string[]> {
    return this.service.ready(tenantOf(principal), id as Uuid);
  }

  /**
   * The stages that have run past the time the definition allowed them. The instant is supplied rather than read
   * from a clock, so what an operations screen shows and what a test asserts are the same function.
   */
  @RequirePermissions(DECISION_READ)
  @Get(":id/overdue")
  async overdue(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Query() query: unknown,
  ): Promise<readonly OverdueStage[]> {
    const dto = parseBody(asOfSchema, query);
    return this.service.overdue(
      tenantOf(principal),
      id as Uuid,
      (dto.at as ISODateString) ?? nowIso(),
    );
  }

  /**
   * What it would take to undo this case as it stands, in the order it would have to be undone, and what could
   * not be undone at all. `decision:read`, because knowing whether a process can be walked back is exactly the
   * thing an institution should be able to ask without holding the credential that walks it back.
   */
  @RequirePermissions(DECISION_READ)
  @Get(":id/reversal-plan")
  async reversalPlan(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ReversalPlan> {
    return this.service.reversalPlan(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(DECISION_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<WorkflowInstance> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
