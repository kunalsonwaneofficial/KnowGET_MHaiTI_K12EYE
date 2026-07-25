import { type Subject, SubjectService } from "@knowget/academic-structure";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ACADEMIC_READ, ACADEMIC_WRITE, parseBody, tenantOf } from "./academic-structure-http";
import {
  createSubjectSchema,
  prerequisiteSchema,
  renameSchema,
  setCrossDisciplinarySchema,
  setElectiveGroupSchema,
  setSubjectCreditsSchema,
  setSubjectKindSchema,
} from "./academic-structure.dto";
import { AS_SUBJECT_SERVICE } from "./academic-structure.tokens";

/** REST surface for subjects (P2-D06). Gated by academic:*; tenant-scoped. */
@Controller("academic-structure/subjects")
export class SubjectController {
  constructor(@Inject(AS_SUBJECT_SERVICE) private readonly service: SubjectService) {}

  @RequirePermissions(ACADEMIC_WRITE)
  @Post()
  @HttpCode(201)
  async create(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Subject> {
    const dto = parseBody(createSubjectSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      name: dto.name,
      code: dto.code,
      kind: dto.kind,
      ...(dto.credits !== undefined ? { credits: dto.credits } : {}),
      ...(dto.electiveGroup !== undefined ? { electiveGroup: dto.electiveGroup } : {}),
      ...(dto.crossDisciplinary !== undefined ? { crossDisciplinary: dto.crossDisciplinary } : {}),
    });
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Subject[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Subject[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Subject> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Subject> {
    const dto = parseBody(renameSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/kind")
  @HttpCode(200)
  async setKind(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Subject> {
    const dto = parseBody(setSubjectKindSchema, body);
    return this.service.setKind(tenantOf(principal), id as Uuid, dto.kind);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/credits")
  @HttpCode(200)
  async setCredits(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Subject> {
    const dto = parseBody(setSubjectCreditsSchema, body);
    return this.service.setCredits(tenantOf(principal), id as Uuid, dto.credits);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/elective-group")
  @HttpCode(200)
  async setElectiveGroup(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Subject> {
    const dto = parseBody(setElectiveGroupSchema, body);
    return this.service.setElectiveGroup(tenantOf(principal), id as Uuid, dto.electiveGroup);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/cross-disciplinary")
  @HttpCode(200)
  async setCrossDisciplinary(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Subject> {
    const dto = parseBody(setCrossDisciplinarySchema, body);
    return this.service.setCrossDisciplinary(
      tenantOf(principal),
      id as Uuid,
      dto.crossDisciplinary,
    );
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/prerequisites")
  @HttpCode(200)
  async addPrerequisite(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Subject> {
    const dto = parseBody(prerequisiteSchema, body);
    return this.service.addPrerequisite(
      tenantOf(principal),
      id as Uuid,
      dto.prerequisiteId as Uuid,
    );
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/prerequisites/:prerequisiteId/remove")
  @HttpCode(200)
  async removePrerequisite(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("prerequisiteId") prerequisiteId: string,
  ): Promise<Subject> {
    return this.service.removePrerequisite(tenantOf(principal), id as Uuid, prerequisiteId as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Subject> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Subject> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }
}
