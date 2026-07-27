import type { Principal } from "@knowget/auth";
import {
  type EntityMemory,
  type EntityMemoryView,
  type GraphSummary,
  KnowledgeMemoryService,
  type Neighborhood,
} from "@knowget/knowledge-graph";
import type { Uuid } from "@knowget/types";
import { Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { KNOWLEDGE_READ, KNOWLEDGE_WRITE, tenantOf } from "./knowledge-graph-http";
import { KG_MEMORY_SERVICE } from "./knowledge-graph.tokens";

/**
 * REST surface for the digital-memory spine (P2-D25): refresh an entity's memory, read the persisted or live
 * view, its neighbourhood, and a tenant graph summary. knowledge:*; tenant-scoped. Everything read here is
 * re-derived from the graph — descriptive, never predictive.
 */
@Controller("knowledge/memory")
export class EntityMemoryController {
  constructor(@Inject(KG_MEMORY_SERVICE) private readonly service: KnowledgeMemoryService) {}

  @RequirePermissions(KNOWLEDGE_WRITE)
  @Post(":entityId/refresh")
  @HttpCode(200)
  async refresh(
    @CurrentPrincipal() principal: Principal,
    @Param("entityId") entityId: string,
  ): Promise<EntityMemory> {
    return this.service.refreshForEntity(tenantOf(principal), entityId as Uuid);
  }

  @RequirePermissions(KNOWLEDGE_READ)
  @Get("graph-summary")
  async summary(@CurrentPrincipal() principal: Principal): Promise<GraphSummary> {
    return this.service.graphSummary(tenantOf(principal));
  }

  @RequirePermissions(KNOWLEDGE_READ)
  @Get(":entityId/live")
  async live(
    @CurrentPrincipal() principal: Principal,
    @Param("entityId") entityId: string,
  ): Promise<EntityMemoryView> {
    return this.service.memoryForEntity(tenantOf(principal), entityId as Uuid);
  }

  @RequirePermissions(KNOWLEDGE_READ)
  @Get(":entityId/neighborhood")
  async neighborhood(
    @CurrentPrincipal() principal: Principal,
    @Param("entityId") entityId: string,
  ): Promise<Neighborhood> {
    return this.service.neighborhoodForEntity(tenantOf(principal), entityId as Uuid);
  }

  @RequirePermissions(KNOWLEDGE_READ)
  @Get(":entityId")
  async getForEntity(
    @CurrentPrincipal() principal: Principal,
    @Param("entityId") entityId: string,
  ): Promise<EntityMemory> {
    return this.service.getForEntity(tenantOf(principal), entityId as Uuid);
  }
}
