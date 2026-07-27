import type { Principal } from "@knowget/auth";
import { type KnowledgeEntity, KnowledgeEntityService } from "@knowget/knowledge-graph";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { KNOWLEDGE_READ, KNOWLEDGE_WRITE, parseBody, tenantOf } from "./knowledge-graph-http";
import { createEntitySchema, mergeEntitySchema, relabelEntitySchema } from "./knowledge-graph.dto";
import { KG_ENTITY_SERVICE } from "./knowledge-graph.tokens";

/** REST surface for knowledge entities (P2-D25) — the graph nodes. knowledge:*; tenant-scoped. */
@Controller("knowledge/entities")
export class KnowledgeEntityController {
  constructor(@Inject(KG_ENTITY_SERVICE) private readonly service: KnowledgeEntityService) {}

  @RequirePermissions(KNOWLEDGE_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<KnowledgeEntity> {
    const dto = parseBody(createEntitySchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      entityTypeKey: dto.entityTypeKey,
      sourceDomain: dto.sourceDomain,
      sourceRef: dto.sourceRef,
      label: dto.label ?? null,
    });
  }

  @RequirePermissions(KNOWLEDGE_WRITE)
  @Post(":id/relabel")
  @HttpCode(200)
  async relabel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<KnowledgeEntity> {
    const dto = parseBody(relabelEntitySchema, body);
    return this.service.relabel(tenantOf(principal), id as Uuid, dto.label);
  }

  @RequirePermissions(KNOWLEDGE_WRITE)
  @Post(":id/merge")
  @HttpCode(200)
  async merge(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<KnowledgeEntity> {
    const dto = parseBody(mergeEntitySchema, body);
    return this.service.merge(tenantOf(principal), id as Uuid, dto.intoId as Uuid);
  }

  @RequirePermissions(KNOWLEDGE_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<KnowledgeEntity> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(KNOWLEDGE_READ)
  @Get("by-type/:entityTypeKey")
  async listByType(
    @CurrentPrincipal() principal: Principal,
    @Param("entityTypeKey") entityTypeKey: string,
  ): Promise<KnowledgeEntity[]> {
    return this.service.listByType(tenantOf(principal), entityTypeKey);
  }

  @RequirePermissions(KNOWLEDGE_READ)
  @Get("by-source/:sourceDomain/:sourceRef")
  async getBySource(
    @CurrentPrincipal() principal: Principal,
    @Param("sourceDomain") sourceDomain: string,
    @Param("sourceRef") sourceRef: string,
  ): Promise<KnowledgeEntity | null> {
    return this.service.getBySource(tenantOf(principal), sourceDomain, sourceRef);
  }

  @RequirePermissions(KNOWLEDGE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<KnowledgeEntity> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
