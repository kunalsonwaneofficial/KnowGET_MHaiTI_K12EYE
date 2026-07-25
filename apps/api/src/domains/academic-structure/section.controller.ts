import { type Section, SectionService } from "@knowget/academic-structure";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ACADEMIC_READ, ACADEMIC_WRITE, parseBody, tenantOf } from "./academic-structure-http";
import { createSectionSchema, renameSchema, setCapacitySchema } from "./academic-structure.dto";
import { AS_SECTION_SERVICE } from "./academic-structure.tokens";

/** REST surface for sections (P2-D06). Gated by academic:*; tenant-scoped. */
@Controller("academic-structure/sections")
export class SectionController {
  constructor(@Inject(AS_SECTION_SERVICE) private readonly service: SectionService) {}

  @RequirePermissions(ACADEMIC_WRITE)
  @Post()
  @HttpCode(201)
  async create(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Section> {
    const dto = parseBody(createSectionSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      classId: dto.classId as Uuid,
      name: dto.name,
      capacity: dto.capacity,
    });
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Section[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get("by-class/:classId")
  async listForClass(
    @CurrentPrincipal() principal: Principal,
    @Param("classId") classId: string,
  ): Promise<Section[]> {
    return this.service.listForClass(tenantOf(principal), classId as Uuid);
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Section[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Section> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Section> {
    const dto = parseBody(renameSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/capacity")
  @HttpCode(200)
  async setCapacity(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Section> {
    const dto = parseBody(setCapacitySchema, body);
    return this.service.setCapacity(tenantOf(principal), id as Uuid, dto.capacity);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Section> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/close")
  @HttpCode(200)
  async close(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Section> {
    return this.service.close(tenantOf(principal), id as Uuid);
  }
}
