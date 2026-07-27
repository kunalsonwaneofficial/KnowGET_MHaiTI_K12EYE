import {
  type ReasoningSession,
  ReasoningService,
  type ReasoningTrace,
  type SessionGrounding,
  type SessionSummary,
} from "@knowget/agent-orchestration";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { AI_OPERATE, AI_READ, parseBody, tenantOf } from "./agent-orchestration-http";
import {
  attachPlanSchema,
  concludeSessionSchema,
  groundedTraceSchema,
  observeSchema,
  openSessionSchema,
  recordTraceSchema,
  retrieveSchema,
} from "./agent-orchestration.dto";
import { AI_REASONING_SERVICE } from "./agent-orchestration.tokens";

/**
 * REST surface for reasoning sessions (P2-D26) — the record of *why*, kept as the agent works rather than
 * reconstructed afterwards.
 *
 * The four trace kinds get four endpoints rather than one with a `kind` field, because they carry different
 * obligations and the URL is where a caller finds that out: a retrieval must name knowledge-graph references,
 * an inference and a decision must name the earlier steps they rest on, and an observation may stand alone. A
 * single endpoint would accept all four shapes and reject three of them at runtime.
 *
 * `GET :id/grounding` is what an auditor reads before trusting a conclusion: how much of the chain traces back
 * to institutional knowledge rather than to the agent's own assertion.
 */
@Controller("ai/reasoning-sessions")
export class ReasoningController {
  constructor(@Inject(AI_REASONING_SERVICE) private readonly service: ReasoningService) {}

  @RequirePermissions(AI_OPERATE)
  @Post()
  @HttpCode(201)
  async open(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ReasoningSession> {
    const dto = parseBody(openSessionSchema, body);
    return this.service.open({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      agentId: dto.agentId,
      purpose: dto.purpose,
    });
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/traces")
  @HttpCode(201)
  async record(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ReasoningSession> {
    const dto = parseBody(recordTraceSchema, body);
    return this.service.record(tenantOf(principal), id as Uuid, {
      kind: dto.kind,
      statement: dto.statement,
      knowledgeRefs: dto.knowledgeRefs ?? [],
      dependsOn: dto.dependsOn ?? [],
      confidence: dto.confidence,
    });
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/retrievals")
  @HttpCode(201)
  async retrieve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ReasoningSession> {
    const dto = parseBody(retrieveSchema, body);
    return this.service.retrieve(
      tenantOf(principal),
      id as Uuid,
      dto.statement,
      dto.knowledgeRefs,
      dto.confidence,
    );
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/observations")
  @HttpCode(201)
  async observe(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ReasoningSession> {
    const dto = parseBody(observeSchema, body);
    return this.service.observe(tenantOf(principal), id as Uuid, dto.statement, dto.confidence);
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/inferences")
  @HttpCode(201)
  async infer(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ReasoningSession> {
    const dto = parseBody(groundedTraceSchema, body);
    return this.service.infer(
      tenantOf(principal),
      id as Uuid,
      dto.statement,
      dto.dependsOn,
      dto.confidence,
    );
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/decisions")
  @HttpCode(201)
  async decide(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ReasoningSession> {
    const dto = parseBody(groundedTraceSchema, body);
    return this.service.decide(
      tenantOf(principal),
      id as Uuid,
      dto.statement,
      dto.dependsOn,
      dto.confidence,
    );
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/plan")
  @HttpCode(200)
  async attachPlan(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ReasoningSession> {
    const dto = parseBody(attachPlanSchema, body);
    return this.service.attachPlan(tenantOf(principal), id as Uuid, dto.executionPlanId);
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/conclude")
  @HttpCode(200)
  async conclude(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ReasoningSession> {
    const dto = parseBody(concludeSessionSchema, body);
    return this.service.conclude(tenantOf(principal), id as Uuid, dto.conclusion);
  }

  @RequirePermissions(AI_OPERATE)
  @Post(":id/abandon")
  @HttpCode(200)
  async abandon(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ReasoningSession> {
    return this.service.abandon(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AI_READ)
  @Get(":id/grounding")
  async grounding(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<SessionGrounding> {
    return this.service.grounding(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AI_READ)
  @Get(":id/summary")
  async summarize(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<SessionSummary> {
    return this.service.summarize(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AI_READ)
  @Get(":id/knowledge-refs")
  async knowledgeRefs(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<readonly string[]> {
    return this.service.knowledgeRefs(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AI_READ)
  @Get(":id/traces/:traceId")
  async trace(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("traceId") traceId: string,
  ): Promise<ReasoningTrace> {
    return this.service.trace(tenantOf(principal), id as Uuid, traceId);
  }

  @RequirePermissions(AI_READ)
  @Get("by-agent/:agentId")
  async listByAgent(
    @CurrentPrincipal() principal: Principal,
    @Param("agentId") agentId: string,
  ): Promise<ReasoningSession[]> {
    return this.service.listByAgent(tenantOf(principal), agentId);
  }

  @RequirePermissions(AI_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<ReasoningSession[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(AI_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ReasoningSession> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
