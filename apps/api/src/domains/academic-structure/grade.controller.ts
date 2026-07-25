import { type Grade, GradeService } from "@knowget/academic-structure";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ACADEMIC_READ, ACADEMIC_WRITE, parseBody, tenantOf } from "./academic-structure-http";
import {
  createGradeSchema,
  renameSchema,
  setAgeGuidelinesSchema,
  setGradeLevelSchema,
  setNextGradeSchema,
  setPromotionRuleSchema,
} from "./academic-structure.dto";
import { AS_GRADE_SERVICE } from "./academic-structure.tokens";

/** REST surface for grades (P2-D06). Gated by academic:*; tenant-scoped. */
@Controller("academic-structure/grades")
export class GradeController {
  constructor(@Inject(AS_GRADE_SERVICE) private readonly service: GradeService) {}

  @RequirePermissions(ACADEMIC_WRITE)
  @Post()
  @HttpCode(201)
  async create(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Grade> {
    const dto = parseBody(createGradeSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      programId: dto.programId as Uuid,
      name: dto.name,
      code: dto.code,
      level: dto.level,
      ...(dto.promotionRule !== undefined ? { promotionRule: dto.promotionRule } : {}),
      ...(dto.minAge !== undefined ? { minAge: dto.minAge } : {}),
      ...(dto.maxAge !== undefined ? { maxAge: dto.maxAge } : {}),
    });
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Grade[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get("by-program/:programId")
  async listForProgram(
    @CurrentPrincipal() principal: Principal,
    @Param("programId") programId: string,
  ): Promise<Grade[]> {
    return this.service.listForProgram(tenantOf(principal), programId as Uuid);
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Grade[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get(":id")
  async getById(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Grade> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Grade> {
    const dto = parseBody(renameSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/level")
  @HttpCode(200)
  async setLevel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Grade> {
    const dto = parseBody(setGradeLevelSchema, body);
    return this.service.setLevel(tenantOf(principal), id as Uuid, dto.level);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/promotion-rule")
  @HttpCode(200)
  async setPromotionRule(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Grade> {
    const dto = parseBody(setPromotionRuleSchema, body);
    return this.service.setPromotionRule(tenantOf(principal), id as Uuid, dto.rule);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/age-guidelines")
  @HttpCode(200)
  async setAgeGuidelines(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Grade> {
    const dto = parseBody(setAgeGuidelinesSchema, body);
    return this.service.setAgeGuidelines(tenantOf(principal), id as Uuid, dto.minAge, dto.maxAge);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/next-grade")
  @HttpCode(200)
  async setNextGrade(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Grade> {
    const dto = parseBody(setNextGradeSchema, body);
    return this.service.setNextGrade(
      tenantOf(principal),
      id as Uuid,
      dto.nextGradeId as Uuid | null,
    );
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Grade> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Grade> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }
}
