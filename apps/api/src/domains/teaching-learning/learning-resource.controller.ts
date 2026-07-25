import type { Principal } from "@knowget/auth";
import { type LearningResource, LearningResourceService } from "@knowget/teaching-learning";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  createLearningResourceSchema,
  noteSchema,
  renameSchema,
  setDescriptionSchema,
  setUrlSchema,
  stringListSchema,
  uuidListSchema,
} from "./teaching-learning.dto";
import { parseBody, TEACHING_READ, TEACHING_WRITE, tenantOf } from "./teaching-learning-http";
import { TL_LEARNING_RESOURCE_SERVICE } from "./teaching-learning.tokens";

/** REST surface for learning resources (P2-D09). Gated by teaching:*; tenant-scoped. */
@Controller("teaching-learning/learning-resources")
export class LearningResourceController {
  constructor(
    @Inject(TL_LEARNING_RESOURCE_SERVICE) private readonly service: LearningResourceService,
  ) {}

  @RequirePermissions(TEACHING_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<LearningResource> {
    const dto = parseBody(createLearningResourceSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      title: dto.title,
      resourceType: dto.resourceType,
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.url !== undefined ? { url: dto.url } : {}),
      ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
      ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId as Uuid } : {}),
      ...(dto.learningOutcomeIds !== undefined
        ? { learningOutcomeIds: dto.learningOutcomeIds as Uuid[] }
        : {}),
    });
  }

  @RequirePermissions(TEACHING_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<LearningResource[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(TEACHING_READ)
  @Get("by-subject/:subjectId")
  async listForSubject(
    @CurrentPrincipal() principal: Principal,
    @Param("subjectId") subjectId: string,
  ): Promise<LearningResource[]> {
    return this.service.listForSubject(tenantOf(principal), subjectId as Uuid);
  }

  @RequirePermissions(TEACHING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LearningResource> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LearningResource> {
    const dto = parseBody(renameSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.title);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/description")
  @HttpCode(200)
  async setDescription(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LearningResource> {
    const dto = parseBody(setDescriptionSchema, body);
    return this.service.setDescription(tenantOf(principal), id as Uuid, dto.description);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/url")
  @HttpCode(200)
  async setUrl(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LearningResource> {
    const dto = parseBody(setUrlSchema, body);
    return this.service.setUrl(tenantOf(principal), id as Uuid, dto.url);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/tags")
  @HttpCode(200)
  async setTags(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LearningResource> {
    const dto = parseBody(stringListSchema, body);
    return this.service.setTags(tenantOf(principal), id as Uuid, dto.items);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/outcomes")
  @HttpCode(200)
  async setOutcomes(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LearningResource> {
    const dto = parseBody(uuidListSchema, body);
    return this.service.setOutcomes(tenantOf(principal), id as Uuid, dto.ids as Uuid[]);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LearningResource> {
    return this.service.publish(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/revise")
  @HttpCode(200)
  async revise(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LearningResource> {
    const dto = parseBody(noteSchema, body);
    return this.service.revise(tenantOf(principal), id as Uuid, dto.note);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LearningResource> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }
}
