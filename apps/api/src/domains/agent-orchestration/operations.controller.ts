import {
  type AgentOperationsSummary,
  type KeyCount,
  OperationsService,
} from "@knowget/agent-orchestration";
import type { Principal } from "@knowget/auth";
import { Controller, Get, Inject } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { AI_READ, tenantOf } from "./agent-orchestration-http";
import { AI_OPERATIONS_SERVICE } from "./agent-orchestration.tokens";

/**
 * REST surface for the AI operations view (P2-D26) — what the institution's agents are actually doing.
 *
 * Read-only by construction: every endpoint here is a count over records the runtime wrote, and none of them
 * takes an argument that could narrow the tenant. `ai:read` throughout — a leader who wants to see how much
 * work is running under approval, and how much is running without it, should not need the scope that runs it.
 */
@Controller("ai/operations")
export class OperationsController {
  constructor(@Inject(AI_OPERATIONS_SERVICE) private readonly service: OperationsService) {}

  @RequirePermissions(AI_READ)
  @Get("summary")
  async summarize(@CurrentPrincipal() principal: Principal): Promise<AgentOperationsSummary> {
    return this.service.summarize(tenantOf(principal));
  }

  @RequirePermissions(AI_READ)
  @Get("plan-pipeline")
  async planPipeline(@CurrentPrincipal() principal: Principal): Promise<readonly KeyCount[]> {
    return this.service.planPipeline(tenantOf(principal));
  }

  @RequirePermissions(AI_READ)
  @Get("plan-load-by-agent")
  async planLoadByAgent(@CurrentPrincipal() principal: Principal): Promise<readonly KeyCount[]> {
    return this.service.planLoadByAgent(tenantOf(principal));
  }

  @RequirePermissions(AI_READ)
  @Get("capability-usage")
  async capabilityUsage(@CurrentPrincipal() principal: Principal): Promise<readonly KeyCount[]> {
    return this.service.capabilityUsage(tenantOf(principal));
  }
}
