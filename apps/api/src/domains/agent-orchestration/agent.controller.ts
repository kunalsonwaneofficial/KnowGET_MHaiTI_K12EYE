import { type AgentDefinition, AgentService } from "@knowget/agent-orchestration";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { AGENT_READ, AGENT_WRITE, parseBody, tenantOf } from "./agent-orchestration-http";
import {
  capabilityKeySchema,
  describeAgentSchema,
  registerAgentSchema,
  setAutonomySchema,
} from "./agent-orchestration.dto";
import { AI_AGENT_SERVICE } from "./agent-orchestration.tokens";

/**
 * REST surface for the agent registry (P2-D26) — who may act, how far, and over what. `agent:*`; tenant-scoped.
 *
 * Grants are their own endpoints rather than a field on the agent, because widening an agent's reach is the act
 * an institution most needs to be able to point at afterwards, and a PATCH that happens to include a longer
 * array is not something anyone can point at.
 */
@Controller("ai/agents")
export class AgentController {
  constructor(@Inject(AI_AGENT_SERVICE) private readonly service: AgentService) {}

  @RequirePermissions(AGENT_WRITE)
  @Post()
  @HttpCode(201)
  async register(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AgentDefinition> {
    const dto = parseBody(registerAgentSchema, body);
    return this.service.register({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      key: dto.key,
      name: dto.name,
      autonomyLevel: dto.autonomyLevel,
      purpose: dto.purpose ?? null,
    });
  }

  @RequirePermissions(AGENT_WRITE)
  @Post(":id/describe")
  @HttpCode(200)
  async describe(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AgentDefinition> {
    const dto = parseBody(describeAgentSchema, body);
    return this.service.describe(tenantOf(principal), id as Uuid, dto);
  }

  @RequirePermissions(AGENT_WRITE)
  @Post(":id/autonomy")
  @HttpCode(200)
  async setAutonomy(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AgentDefinition> {
    const dto = parseBody(setAutonomySchema, body);
    return this.service.setAutonomy(tenantOf(principal), id as Uuid, dto.autonomyLevel);
  }

  @RequirePermissions(AGENT_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AgentDefinition> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AGENT_WRITE)
  @Post(":id/suspend")
  @HttpCode(200)
  async suspend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AgentDefinition> {
    return this.service.suspend(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AGENT_WRITE)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AgentDefinition> {
    return this.service.retire(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AGENT_WRITE)
  @Post(":id/grants")
  @HttpCode(200)
  async grant(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AgentDefinition> {
    const dto = parseBody(capabilityKeySchema, body);
    return this.service.grant(tenantOf(principal), id as Uuid, dto.capabilityKey);
  }

  @RequirePermissions(AGENT_WRITE)
  @Post(":id/revocations")
  @HttpCode(200)
  async revoke(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AgentDefinition> {
    const dto = parseBody(capabilityKeySchema, body);
    return this.service.revoke(tenantOf(principal), id as Uuid, dto.capabilityKey);
  }

  @RequirePermissions(AGENT_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<AgentDefinition[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(AGENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AgentDefinition> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AGENT_WRITE)
  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<void> {
    return this.service.remove(tenantOf(principal), id as Uuid);
  }
}
