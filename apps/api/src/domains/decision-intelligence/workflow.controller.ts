import type { Principal } from "@knowget/auth";
import {
  type DefineStageParams,
  type WorkflowDefinition,
  WorkflowService,
  type WorkflowStage,
  defineStage,
} from "@knowget/decision-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  DECISION_MANAGE,
  DECISION_READ,
  deciderOf,
  parseBody,
  tenantOf,
} from "./decision-intelligence-http";
import {
  type StageInput,
  addStageSchema,
  amendWorkflowSchema,
  draftWorkflowSchema,
  replaceStagesSchema,
} from "./decision-intelligence.dto";
import { DI_WORKFLOW_SERVICE } from "./decision-intelligence.tokens";

/**
 * REST surface for workflow definitions (P2-D27) — the processes an institution has decided it runs.
 *
 * Governance, not runtime: everything that writes here is `decision:manage`, because this is where an
 * institution decides what its automation is *allowed* to become. Starting and moving actual cases is
 * `decision:operate` and lives on the workflow-runs controller. The two are separate credentials on purpose —
 * the operator running today's admissions cases should not be able to quietly re-wire what admissions means.
 *
 * Stages are minted by the domain's own {@link defineStage}, so a stage key, its dependency set and its
 * normalized capability references are the platform's rather than the request's. Capability keys are re-checked
 * against the P2-D26 catalog at every one of the three moments that matter — attaching a stage, replacing the
 * set, and publishing — because a draft can sit for weeks between being written and being armed.
 */
@Controller("decision/workflows")
export class WorkflowController {
  constructor(@Inject(DI_WORKFLOW_SERVICE) private readonly service: WorkflowService) {}

  @RequirePermissions(DECISION_MANAGE)
  @Post()
  @HttpCode(201)
  async draft(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<WorkflowDefinition> {
    const dto = parseBody(draftWorkflowSchema, body);
    return this.service.draft({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      key: dto.key,
      name: dto.name,
      description: dto.description ?? null,
      trigger: dto.trigger,
      triggerSignalKey: dto.triggerSignalKey ?? null,
      version: dto.version ?? 1,
      stages: (dto.stages ?? []).map(toStage),
      createdByUserId: deciderOf(principal),
    });
  }

  @RequirePermissions(DECISION_MANAGE)
  @Post(":id/amend")
  @HttpCode(200)
  async amend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<WorkflowDefinition> {
    const dto = parseBody(amendWorkflowSchema, body);
    return this.service.amend(tenantOf(principal), id as Uuid, dto);
  }

  @RequirePermissions(DECISION_MANAGE)
  @Post(":id/stages")
  @HttpCode(200)
  async addStage(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<WorkflowDefinition> {
    const dto = parseBody(addStageSchema, body);
    return this.service.addStage(tenantOf(principal), id as Uuid, toStageParams(dto));
  }

  /**
   * Replace the whole stage set at once. Separate from attaching stages one at a time because dependencies
   * cross-reference: a process whose second stage depends on its third cannot be built incrementally without
   * passing through a state the aggregate would rightly refuse.
   */
  @RequirePermissions(DECISION_MANAGE)
  @Post(":id/stages/replace")
  @HttpCode(200)
  async replaceStages(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<WorkflowDefinition> {
    const dto = parseBody(replaceStagesSchema, body);
    return this.service.replaceStages(tenantOf(principal), id as Uuid, dto.stages.map(toStage));
  }

  @RequirePermissions(DECISION_MANAGE)
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<WorkflowDefinition> {
    return this.service.publish(tenantOf(principal), id as Uuid, {
      publishedByUserId: deciderOf(principal),
    });
  }

  @RequirePermissions(DECISION_MANAGE)
  @Post(":id/suspend")
  @HttpCode(200)
  async suspend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<WorkflowDefinition> {
    return this.service.suspend(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(DECISION_MANAGE)
  @Post(":id/resume")
  @HttpCode(200)
  async resume(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<WorkflowDefinition> {
    return this.service.resume(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(DECISION_MANAGE)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<WorkflowDefinition> {
    return this.service.retire(tenantOf(principal), id as Uuid);
  }

  /**
   * Open the next version as a fresh draft, copied from this one. `201`, because the response is a new
   * definition and not the one that was posted to: a published process is never edited in place, so that a case
   * started last week and a case started today can each say which version of the process they are running.
   */
  @RequirePermissions(DECISION_MANAGE)
  @Post(":id/revise")
  @HttpCode(201)
  async revise(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<WorkflowDefinition> {
    return this.service.revise(tenantOf(principal), id as Uuid, {
      createdByUserId: deciderOf(principal),
    });
  }

  @RequirePermissions(DECISION_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly WorkflowDefinition[]> {
    return this.service.list(tenantOf(principal));
  }

  /** The published processes listening for one signal — what a dispatcher would actually start. */
  @RequirePermissions(DECISION_READ)
  @Get("by-signal/:signalKey")
  async listBySignal(
    @CurrentPrincipal() principal: Principal,
    @Param("signalKey") signalKey: string,
  ): Promise<readonly WorkflowDefinition[]> {
    return this.service.listBySignal(tenantOf(principal), signalKey);
  }

  /** The version cases start on today, or `null` when nothing under this key is published. */
  @RequirePermissions(DECISION_READ)
  @Get("by-key/:key/published")
  async findPublished(
    @CurrentPrincipal() principal: Principal,
    @Param("key") key: string,
  ): Promise<WorkflowDefinition | null> {
    return this.service.findPublished(tenantOf(principal), key);
  }

  /** The newest version under this key whatever its status — how an author finds the draft they left open. */
  @RequirePermissions(DECISION_READ)
  @Get("by-key/:key/latest")
  async findLatest(
    @CurrentPrincipal() principal: Principal,
    @Param("key") key: string,
  ): Promise<WorkflowDefinition | null> {
    return this.service.findLatest(tenantOf(principal), key);
  }

  @RequirePermissions(DECISION_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<WorkflowDefinition> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }

  /** Detach a stage. Refused by the aggregate while anything still depends on it. */
  @RequirePermissions(DECISION_MANAGE)
  @Delete(":id/stages/:stageKey")
  @HttpCode(200)
  async removeStage(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("stageKey") stageKey: string,
  ): Promise<WorkflowDefinition> {
    return this.service.removeStage(tenantOf(principal), id as Uuid, stageKey);
  }

  /**
   * Delete a definition that was never published. Bounded to drafts deliberately: a published version is what
   * running cases name when they say which process they are following, and a retired one is what finished cases
   * name. Deleting either would leave the institution holding cases that describe a process nobody can read.
   */
  @RequirePermissions(DECISION_MANAGE)
  @Delete(":id")
  @HttpCode(204)
  async discard(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<void> {
    return this.service.discard(tenantOf(principal), id as Uuid);
  }
}

/** The shape {@link defineStage} takes, from the shape the wire carries. */
function toStageParams(dto: StageInput): DefineStageParams {
  return {
    key: dto.key,
    name: dto.name,
    ordinal: dto.ordinal,
    kind: dto.kind,
    capabilityKey: dto.capabilityKey ?? null,
    riskLevel: dto.riskLevel,
    reversibility: dto.reversibility,
    compensationKey: dto.compensationKey ?? null,
    dependsOn: dto.dependsOn ?? [],
    slaHours: dto.slaHours ?? null,
    assigneeRole: dto.assigneeRole ?? null,
    optional: dto.optional ?? false,
  };
}

/** Mint a stage through the domain, so keys and dependencies are normalized the aggregate's way. */
const toStage = (dto: StageInput): WorkflowStage => defineStage(toStageParams(dto));
