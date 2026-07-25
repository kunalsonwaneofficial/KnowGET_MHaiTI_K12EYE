import {
  type AcademicRecord,
  AcademicRecordService,
  type GradeEntry,
} from "@knowget/assessment-evaluation";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  ASSESSMENT_READ,
  ASSESSMENT_WRITE,
  parseBody,
  tenantOf,
} from "./assessment-evaluation-http";
import {
  amendGradeEntriesSchema,
  amendPromotionDecisionSchema,
  createAcademicRecordSchema,
  setGradeEntriesSchema,
  setPromotionDecisionSchema,
} from "./assessment-evaluation.dto";
import { AE_ACADEMIC_RECORD_SERVICE } from "./assessment-evaluation.tokens";

/** REST surface for academic records (P2-D10). Gated by assessment:*; tenant-scoped. */
@Controller("assessment-evaluation/academic-records")
export class AcademicRecordController {
  constructor(
    @Inject(AE_ACADEMIC_RECORD_SERVICE) private readonly service: AcademicRecordService,
  ) {}

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AcademicRecord> {
    const dto = parseBody(createAcademicRecordSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      studentId: dto.studentId as Uuid,
      academicYear: dto.academicYear,
      term: dto.term,
      ...(dto.gradeEntries !== undefined ? { gradeEntries: dto.gradeEntries as GradeEntry[] } : {}),
    });
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get("by-student/:studentId")
  async listForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<AcademicRecord[]> {
    return this.service.listForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<AcademicRecord[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AcademicRecord> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/grade-entries")
  @HttpCode(200)
  async setGradeEntries(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AcademicRecord> {
    const dto = parseBody(setGradeEntriesSchema, body);
    return this.service.setGradeEntries(
      tenantOf(principal),
      id as Uuid,
      dto.gradeEntries as GradeEntry[],
    );
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/promotion-decision")
  @HttpCode(200)
  async setPromotionDecision(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AcademicRecord> {
    const dto = parseBody(setPromotionDecisionSchema, body);
    return this.service.setPromotionDecision(
      tenantOf(principal),
      id as Uuid,
      dto.promotionDecision,
    );
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AcademicRecord> {
    return this.service.publish(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/amend-grade-entries")
  @HttpCode(200)
  async amendGradeEntries(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AcademicRecord> {
    const dto = parseBody(amendGradeEntriesSchema, body);
    return this.service.amendGradeEntries(
      tenantOf(principal),
      id as Uuid,
      dto.gradeEntries as GradeEntry[],
      dto.reason,
      (dto.amendedBy as Uuid | null | undefined) ?? null,
    );
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/amend-promotion-decision")
  @HttpCode(200)
  async amendPromotionDecision(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AcademicRecord> {
    const dto = parseBody(amendPromotionDecisionSchema, body);
    return this.service.amendPromotionDecision(
      tenantOf(principal),
      id as Uuid,
      dto.promotionDecision,
      dto.reason,
      (dto.amendedBy as Uuid | null | undefined) ?? null,
    );
  }
}
