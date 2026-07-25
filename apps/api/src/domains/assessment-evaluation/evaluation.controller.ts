import { type Evaluation, EvaluationService } from "@knowget/assessment-evaluation";
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
  actorNoteSchema,
  actorSchema,
  amendRemarksSchema,
  createEvaluationSchema,
  recordMarksSchema,
  recordRubricScoresSchema,
} from "./assessment-evaluation.dto";
import { AE_EVALUATION_SERVICE } from "./assessment-evaluation.tokens";

/** REST surface for evaluations (P2-D10). Gated by assessment:*; tenant-scoped. */
@Controller("assessment-evaluation/evaluations")
export class EvaluationController {
  constructor(@Inject(AE_EVALUATION_SERVICE) private readonly service: EvaluationService) {}

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Evaluation> {
    const dto = parseBody(createEvaluationSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      assessmentId: dto.assessmentId as Uuid,
      studentId: dto.studentId as Uuid,
      ...(dto.evaluationType !== undefined ? { evaluationType: dto.evaluationType } : {}),
      ...(dto.evaluatedBy !== undefined ? { evaluatedBy: dto.evaluatedBy as Uuid | null } : {}),
    });
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get("by-assessment/:assessmentId")
  async listForAssessment(
    @CurrentPrincipal() principal: Principal,
    @Param("assessmentId") assessmentId: string,
  ): Promise<Evaluation[]> {
    return this.service.listForAssessment(tenantOf(principal), assessmentId as Uuid);
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get("by-student/:studentId")
  async listForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<Evaluation[]> {
    return this.service.listForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Evaluation> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/marks")
  @HttpCode(200)
  async recordMarks(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Evaluation> {
    const dto = parseBody(recordMarksSchema, body);
    return this.service.recordMarks(
      tenantOf(principal),
      id as Uuid,
      dto.marksAwarded,
      (dto.actor as Uuid | null | undefined) ?? null,
    );
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/rubric-scores")
  @HttpCode(200)
  async recordRubricScores(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Evaluation> {
    const dto = parseBody(recordRubricScoresSchema, body);
    return this.service.recordRubricScores(
      tenantOf(principal),
      id as Uuid,
      dto.rubricScores,
      (dto.actor as Uuid | null | undefined) ?? null,
    );
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/remarks")
  @HttpCode(200)
  async amendRemarks(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Evaluation> {
    const dto = parseBody(amendRemarksSchema, body);
    return this.service.amendRemarks(tenantOf(principal), id as Uuid, dto.remarks);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/submit")
  @HttpCode(200)
  async submit(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Evaluation> {
    const dto = parseBody(actorSchema, body);
    return this.service.submit(
      tenantOf(principal),
      id as Uuid,
      (dto.actor as Uuid | null | undefined) ?? null,
    );
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/moderate")
  @HttpCode(200)
  async moderate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Evaluation> {
    const dto = parseBody(actorNoteSchema, body);
    return this.service.moderate(
      tenantOf(principal),
      id as Uuid,
      (dto.actor as Uuid | null | undefined) ?? null,
      dto.note ?? null,
    );
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/approve")
  @HttpCode(200)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Evaluation> {
    const dto = parseBody(actorNoteSchema, body);
    return this.service.approve(
      tenantOf(principal),
      id as Uuid,
      (dto.actor as Uuid | null | undefined) ?? null,
      dto.note ?? null,
    );
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/reopen")
  @HttpCode(200)
  async reopen(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Evaluation> {
    const dto = parseBody(actorNoteSchema, body);
    return this.service.reopen(
      tenantOf(principal),
      id as Uuid,
      (dto.actor as Uuid | null | undefined) ?? null,
      dto.note ?? null,
    );
  }
}
