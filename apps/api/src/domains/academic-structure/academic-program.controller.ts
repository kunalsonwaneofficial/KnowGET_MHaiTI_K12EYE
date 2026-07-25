import { type AcademicProgram, AcademicProgramService } from "@knowget/academic-structure";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ACADEMIC_READ, ACADEMIC_WRITE, parseBody, tenantOf } from "./academic-structure-http";
import {
  createProgramSchema,
  renameSchema,
  setProgramDescriptionSchema,
  setProgramStageSchema,
} from "./academic-structure.dto";
import { AS_PROGRAM_SERVICE } from "./academic-structure.tokens";

/** REST surface for academic programs (P2-D06). Gated by academic:*; tenant-scoped. */
@Controller("academic-structure/programs")
export class AcademicProgramController {
  constructor(@Inject(AS_PROGRAM_SERVICE) private readonly service: AcademicProgramService) {}

  @RequirePermissions(ACADEMIC_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AcademicProgram> {
    const dto = parseBody(createProgramSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      name: dto.name,
      code: dto.code,
      stage: dto.stage,
      ...(dto.description !== undefined ? { description: dto.description } : {}),
    });
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<AcademicProgram[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<AcademicProgram[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AcademicProgram> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AcademicProgram> {
    const dto = parseBody(renameSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/description")
  @HttpCode(200)
  async setDescription(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AcademicProgram> {
    const dto = parseBody(setProgramDescriptionSchema, body);
    return this.service.setDescription(tenantOf(principal), id as Uuid, dto.description);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/stage")
  @HttpCode(200)
  async setStage(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AcademicProgram> {
    const dto = parseBody(setProgramStageSchema, body);
    return this.service.setStage(tenantOf(principal), id as Uuid, dto.stage);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AcademicProgram> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AcademicProgram> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }
}
