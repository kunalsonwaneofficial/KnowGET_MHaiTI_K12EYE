import type { Principal } from "@knowget/auth";
import { type AlumniChapter, AlumniChapterService } from "@knowget/alumni";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { COMMUNITY_READ, COMMUNITY_WRITE, parseBody, tenantOf } from "./alumni-http";
import {
  createChapterSchema,
  renameChapterSchema,
  setChapterRegionSchema,
  setChapterTypeSchema,
} from "./alumni.dto";
import { AL_CHAPTER_SERVICE } from "./alumni.tokens";

/** REST surface for alumni chapters (P2-D24). Gated by community:*; tenant-scoped. */
@Controller("community/chapters")
export class AlumniChapterController {
  constructor(@Inject(AL_CHAPTER_SERVICE) private readonly service: AlumniChapterService) {}

  @RequirePermissions(COMMUNITY_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AlumniChapter> {
    const dto = parseBody(createChapterSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      name: dto.name,
      type: dto.type,
      region: dto.region ?? null,
    });
  }

  @RequirePermissions(COMMUNITY_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AlumniChapter> {
    const dto = parseBody(renameChapterSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(COMMUNITY_WRITE)
  @Post(":id/type")
  @HttpCode(200)
  async setType(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AlumniChapter> {
    const dto = parseBody(setChapterTypeSchema, body);
    return this.service.setType(tenantOf(principal), id as Uuid, dto.type);
  }

  @RequirePermissions(COMMUNITY_WRITE)
  @Post(":id/region")
  @HttpCode(200)
  async setRegion(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AlumniChapter> {
    const dto = parseBody(setChapterRegionSchema, body);
    return this.service.setRegion(tenantOf(principal), id as Uuid, dto.region);
  }

  @RequirePermissions(COMMUNITY_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AlumniChapter> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COMMUNITY_WRITE)
  @Post(":id/deactivate")
  @HttpCode(200)
  async deactivate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AlumniChapter> {
    return this.service.deactivate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COMMUNITY_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AlumniChapter> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COMMUNITY_READ)
  @Get("by-code/:code")
  async getByCode(
    @CurrentPrincipal() principal: Principal,
    @Param("code") code: string,
  ): Promise<AlumniChapter> {
    return this.service.getByCode(tenantOf(principal), code);
  }

  @RequirePermissions(COMMUNITY_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<AlumniChapter[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(COMMUNITY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AlumniChapter> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
