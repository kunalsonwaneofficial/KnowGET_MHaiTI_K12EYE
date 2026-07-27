import { type ToolDefinition, ToolService } from "@knowget/agent-orchestration";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { AGENT_READ, AGENT_WRITE, parseBody, tenantOf } from "./agent-orchestration-http";
import {
  describeCapabilitySchema,
  reclassifyCapabilitySchema,
  registerCapabilitySchema,
} from "./agent-orchestration.dto";
import { AI_TOOL_SERVICE } from "./agent-orchestration.tokens";

/**
 * REST surface for the capability catalog (P2-D26) — what an agent can be pointed at, and how dangerous each
 * one is. `agent:*`; tenant-scoped.
 *
 * Reclassification is separate from description because the two carry different weight: renaming a capability
 * changes what a screen says, while restating its risk or reversibility changes who has to approve it and
 * whether it can be rolled back. They are the same HTTP verb and very much not the same decision.
 */
@Controller("ai/capabilities")
export class CapabilityController {
  constructor(@Inject(AI_TOOL_SERVICE) private readonly service: ToolService) {}

  @RequirePermissions(AGENT_WRITE)
  @Post()
  @HttpCode(201)
  async register(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ToolDefinition> {
    const dto = parseBody(registerCapabilitySchema, body);
    return this.service.register({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      key: dto.key,
      name: dto.name,
      capabilityDomain: dto.capabilityDomain,
      effect: dto.effect,
      riskLevel: dto.riskLevel,
      reversibility: dto.reversibility,
      compensationKey: dto.compensationKey ?? null,
      requiresApproval: dto.requiresApproval,
      description: dto.description ?? null,
    });
  }

  @RequirePermissions(AGENT_WRITE)
  @Post(":id/describe")
  @HttpCode(200)
  async describe(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ToolDefinition> {
    const dto = parseBody(describeCapabilitySchema, body);
    return this.service.describe(tenantOf(principal), id as Uuid, dto);
  }

  @RequirePermissions(AGENT_WRITE)
  @Post(":id/reclassify")
  @HttpCode(200)
  async reclassify(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ToolDefinition> {
    const dto = parseBody(reclassifyCapabilitySchema, body);
    return this.service.reclassify(tenantOf(principal), id as Uuid, dto);
  }

  @RequirePermissions(AGENT_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ToolDefinition> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AGENT_WRITE)
  @Post(":id/deprecate")
  @HttpCode(200)
  async deprecate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ToolDefinition> {
    return this.service.deprecate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AGENT_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<ToolDefinition[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(AGENT_READ)
  @Get("by-key/:key")
  async getByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("key") key: string,
  ): Promise<ToolDefinition> {
    return this.service.getByKey(tenantOf(principal), key);
  }

  @RequirePermissions(AGENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ToolDefinition> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(AGENT_WRITE)
  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<void> {
    return this.service.remove(tenantOf(principal), id as Uuid);
  }
}
