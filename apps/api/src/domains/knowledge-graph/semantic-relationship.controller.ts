import type { Principal } from "@knowget/auth";
import { type SemanticRelationship, SemanticRelationshipService } from "@knowget/knowledge-graph";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { KNOWLEDGE_READ, KNOWLEDGE_WRITE, parseBody, tenantOf } from "./knowledge-graph-http";
import {
  assertRelationshipSchema,
  closeRelationshipSchema,
  supersedeRelationshipSchema,
} from "./knowledge-graph.dto";
import { KG_RELATIONSHIP_SERVICE } from "./knowledge-graph.tokens";

/** REST surface for semantic relationships (P2-D25) — the versioned, time-aware edges. knowledge:*; tenant-scoped. */
@Controller("knowledge/relationships")
export class SemanticRelationshipController {
  constructor(
    @Inject(KG_RELATIONSHIP_SERVICE) private readonly service: SemanticRelationshipService,
  ) {}

  @RequirePermissions(KNOWLEDGE_WRITE)
  @Post()
  @HttpCode(201)
  async assert(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<SemanticRelationship> {
    const dto = parseBody(assertRelationshipSchema, body);
    return this.service.assert({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      relationshipTypeKey: dto.relationshipTypeKey,
      sourceEntityId: dto.sourceEntityId as Uuid,
      targetEntityId: dto.targetEntityId as Uuid,
      validFrom: dto.validFrom,
      validTo: dto.validTo ?? null,
    });
  }

  @RequirePermissions(KNOWLEDGE_WRITE)
  @Post(":id/close")
  @HttpCode(200)
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<SemanticRelationship> {
    const dto = parseBody(closeRelationshipSchema, body);
    return this.service.close(tenantOf(principal), id as Uuid, dto.validTo);
  }

  @RequirePermissions(KNOWLEDGE_WRITE)
  @Post(":id/supersede")
  @HttpCode(201)
  async supersede(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<SemanticRelationship> {
    const dto = parseBody(supersedeRelationshipSchema, body);
    return this.service.supersede(tenantOf(principal), id as Uuid, {
      validFrom: dto.validFrom,
      validTo: dto.validTo,
    });
  }

  @RequirePermissions(KNOWLEDGE_WRITE)
  @Post(":id/retract")
  @HttpCode(200)
  async retract(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<SemanticRelationship> {
    return this.service.retract(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(KNOWLEDGE_READ)
  @Get("by-entity/:entityId")
  async listForEntity(
    @CurrentPrincipal() principal: Principal,
    @Param("entityId") entityId: string,
  ): Promise<SemanticRelationship[]> {
    return this.service.listForEntity(tenantOf(principal), entityId as Uuid);
  }

  @RequirePermissions(KNOWLEDGE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<SemanticRelationship> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
