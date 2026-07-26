import type { Principal } from "@knowget/auth";
import { type RelationshipType, RelationshipTypeService } from "@knowget/knowledge-graph";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ONTOLOGY_READ, ONTOLOGY_WRITE, parseBody, tenantOf } from "./knowledge-graph-http";
import {
  createRelationshipTypeSchema,
  describeRelationshipTypeSchema,
  setCardinalitySchema,
} from "./knowledge-graph.dto";
import { KG_RELATIONSHIP_TYPE_SERVICE } from "./knowledge-graph.tokens";

/** REST surface for ontology relationship types (P2-D25) — the graph's edge grammar. ontology:*; tenant-scoped. */
@Controller("ontology/relationship-types")
export class RelationshipTypeController {
  constructor(
    @Inject(KG_RELATIONSHIP_TYPE_SERVICE) private readonly service: RelationshipTypeService,
  ) {}

  @RequirePermissions(ONTOLOGY_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<RelationshipType> {
    const dto = parseBody(createRelationshipTypeSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      key: dto.key,
      label: dto.label,
      sourceEntityTypeKey: dto.sourceEntityTypeKey,
      targetEntityTypeKey: dto.targetEntityTypeKey,
      cardinality: dto.cardinality,
      description: dto.description ?? null,
    });
  }

  @RequirePermissions(ONTOLOGY_WRITE)
  @Post(":id/describe")
  @HttpCode(200)
  async describe(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<RelationshipType> {
    const dto = parseBody(describeRelationshipTypeSchema, body);
    return this.service.describe(tenantOf(principal), id as Uuid, dto);
  }

  @RequirePermissions(ONTOLOGY_WRITE)
  @Post(":id/cardinality")
  @HttpCode(200)
  async setCardinality(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<RelationshipType> {
    const dto = parseBody(setCardinalitySchema, body);
    return this.service.setCardinality(tenantOf(principal), id as Uuid, dto.cardinality);
  }

  @RequirePermissions(ONTOLOGY_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<RelationshipType> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ONTOLOGY_WRITE)
  @Post(":id/deprecate")
  @HttpCode(200)
  async deprecate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<RelationshipType> {
    return this.service.deprecate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ONTOLOGY_READ)
  @Get("by-key/:key")
  async getByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("key") key: string,
  ): Promise<RelationshipType | null> {
    return this.service.getByKey(tenantOf(principal), key);
  }

  @RequirePermissions(ONTOLOGY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<RelationshipType[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(ONTOLOGY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<RelationshipType> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
