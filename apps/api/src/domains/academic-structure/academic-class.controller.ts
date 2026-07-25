import { type AcademicClass, AcademicClassService } from "@knowget/academic-structure";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ACADEMIC_READ, ACADEMIC_WRITE, parseBody, tenantOf } from "./academic-structure-http";
import {
  assignClassCurriculumSchema,
  createClassSchema,
  renameSchema,
} from "./academic-structure.dto";
import { AS_CLASS_SERVICE } from "./academic-structure.tokens";

/** REST surface for classes (P2-D06). Gated by academic:*; tenant-scoped. */
@Controller("academic-structure/classes")
export class AcademicClassController {
  constructor(@Inject(AS_CLASS_SERVICE) private readonly service: AcademicClassService) {}

  @RequirePermissions(ACADEMIC_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AcademicClass> {
    const dto = parseBody(createClassSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      gradeId: dto.gradeId as Uuid,
      academicYear: dto.academicYear,
      name: dto.name,
      ...(dto.curriculumFrameworkId !== undefined
        ? { curriculumFrameworkId: dto.curriculumFrameworkId as Uuid | null }
        : {}),
    });
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<AcademicClass[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get("by-grade/:gradeId")
  async listForGrade(
    @CurrentPrincipal() principal: Principal,
    @Param("gradeId") gradeId: string,
  ): Promise<AcademicClass[]> {
    return this.service.listForGrade(tenantOf(principal), gradeId as Uuid);
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<AcademicClass[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AcademicClass> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AcademicClass> {
    const dto = parseBody(renameSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/curriculum")
  @HttpCode(200)
  async assignCurriculum(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AcademicClass> {
    const dto = parseBody(assignClassCurriculumSchema, body);
    return this.service.assignCurriculum(
      tenantOf(principal),
      id as Uuid,
      dto.curriculumFrameworkId as Uuid | null,
    );
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AcademicClass> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AcademicClass> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }
}
