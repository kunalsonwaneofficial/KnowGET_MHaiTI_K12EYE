import {
  type ApprovalRequest,
  type AuthorizationDecision,
  type CompensationPlan,
  InvocationService,
  type ToolInvocation,
} from "@knowget/agent-orchestration";
import type { Principal } from "@knowget/auth";
import type { ISODateString, Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { AI_OPERATE, AI_READ, parseBody, tenantOf } from "./agent-orchestration-http";
import {
  authorizeInvocationSchema,
  compensateInvocationSchema,
  invocationFailureSchema,
  requestInvocationApprovalSchema,
} from "./agent-orchestration.dto";
import { AI_INVOCATION_SERVICE } from "./agent-orchestration.tokens";

/**
 * REST surface for tool invocation (P2-D26) — the only door between an agent and a capability.
 *
 * `GET decision` answers "would this be allowed?" without recording anything, which is what a plan author and a
 * pre-flight check both want. `POST` (authorize) is the act: it re-runs the same authorization server-side and
 * writes the record, so a caller who read an `allowed` decision and then had its grant revoked still gets
 * refused. The decision endpoint is advice; nothing downstream trusts its answer.
 */
@Controller("ai/invocations")
export class InvocationController {
  constructor(@Inject(AI_INVOCATION_SERVICE) private readonly service: InvocationService) {}

  @RequirePermissions(AI_OPERATE)
  @Post()
  @HttpCode(201)
  async authorize(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ToolInvocation> {
    const dto = parseBody(authorizeInvocationSchema, body);
    return this.service.authorize({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      agentId: dto.agentId,
      capabilityKey: dto.capabilityKey,
      planId: dto.planId ?? null,
      stepId: dto.stepId ?? null,
      ordinal: dto.ordinal,
      approvalRequestId: dto.approvalRequestId ?? null,
    });
  }

  @RequirePermissions(AI_OPERATE)
  @Post("approval-requests")
  @HttpCode(201)
  async requestApproval(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ApprovalRequest> {
    const dto = parseBody(requestInvocationApprovalSchema, body);
    return this.service.requestApproval({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      agentId: dto.agentId,
      capabilityKey: dto.capabilityKey,
      stepId: dto.stepId ?? null,
      expiresAt: (dto.expiresAt ?? null) as ISODateString | null,
    });
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/begin")
  @HttpCode(200)
  async begin(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ToolInvocation> {
    return this.service.begin(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/succeed")
  @HttpCode(200)
  async succeed(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ToolInvocation> {
    return this.service.succeed(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/fail")
  @HttpCode(200)
  async fail(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ToolInvocation> {
    const dto = parseBody(invocationFailureSchema, body);
    return this.service.fail(tenantOf(principal), id as Uuid, dto.failureCode ?? null);
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/compensate")
  @HttpCode(200)
  async compensate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ToolInvocation> {
    const dto = parseBody(compensateInvocationSchema, body);
    return this.service.compensate(tenantOf(principal), id as Uuid, dto.compensatingInvocationId);
  }

  @RequirePermissions(AI_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<ToolInvocation[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(AI_READ)
  @Get("decision/:agentId/:capabilityKey")
  async decide(
    @CurrentPrincipal() principal: Principal,
    @Param("agentId") agentId: string,
    @Param("capabilityKey") capabilityKey: string,
  ): Promise<AuthorizationDecision> {
    return this.service.decide(tenantOf(principal), agentId, capabilityKey);
  }

  /** The reversal order for a plan's effects — read before rolling one back, not written by reading it. */
  @RequirePermissions(AI_READ)
  @Get("rollback-plan/:planId")
  async rollbackPlanFor(
    @CurrentPrincipal() principal: Principal,
    @Param("planId") planId: string,
  ): Promise<CompensationPlan> {
    return this.service.rollbackPlanFor(tenantOf(principal), planId);
  }

  @RequirePermissions(AI_READ)
  @Get("by-plan/:planId")
  async listByPlan(
    @CurrentPrincipal() principal: Principal,
    @Param("planId") planId: string,
  ): Promise<ToolInvocation[]> {
    return this.service.listByPlan(tenantOf(principal), planId);
  }

  @RequirePermissions(AI_READ)
  @Get("by-agent/:agentId")
  async listByAgent(
    @CurrentPrincipal() principal: Principal,
    @Param("agentId") agentId: string,
  ): Promise<ToolInvocation[]> {
    return this.service.listByAgent(tenantOf(principal), agentId);
  }

  @RequirePermissions(AI_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ToolInvocation> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
