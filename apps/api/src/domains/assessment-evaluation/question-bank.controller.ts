import {
  type QuestionBank,
  type QuestionInput,
  QuestionBankService,
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
  createQuestionBankSchema,
  noteSchema,
  questionInputSchema,
  renameTitleSchema,
} from "./assessment-evaluation.dto";
import { AE_QUESTION_BANK_SERVICE } from "./assessment-evaluation.tokens";

type QuestionDto = ReturnType<typeof questionInputSchema.parse>;

const toQuestionInput = (dto: QuestionDto): QuestionInput => ({
  text: dto.text,
  questionType: dto.questionType,
  difficulty: dto.difficulty,
  ...(dto.bloomLevel !== undefined ? { bloomLevel: dto.bloomLevel } : {}),
  ...(dto.marks !== undefined ? { marks: dto.marks } : {}),
  ...(dto.competencies !== undefined ? { competencies: dto.competencies } : {}),
  ...(dto.learningOutcomeIds !== undefined
    ? { learningOutcomeIds: dto.learningOutcomeIds as Uuid[] }
    : {}),
});

/** REST surface for question banks (P2-D10). Gated by assessment:*; tenant-scoped. */
@Controller("assessment-evaluation/question-banks")
export class QuestionBankController {
  constructor(@Inject(AE_QUESTION_BANK_SERVICE) private readonly service: QuestionBankService) {}

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<QuestionBank> {
    const dto = parseBody(createQuestionBankSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      title: dto.title,
      ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId as Uuid } : {}),
    });
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<QuestionBank[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get("by-subject/:subjectId")
  async listForSubject(
    @CurrentPrincipal() principal: Principal,
    @Param("subjectId") subjectId: string,
  ): Promise<QuestionBank[]> {
    return this.service.listForSubject(tenantOf(principal), subjectId as Uuid);
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get("by-code/:organizationId/:code")
  async getByCode(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
    @Param("code") code: string,
  ): Promise<QuestionBank | null> {
    return this.service.getByCode(tenantOf(principal), organizationId as Uuid, code);
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<QuestionBank> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<QuestionBank> {
    const dto = parseBody(renameTitleSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.title);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/questions")
  @HttpCode(200)
  async addQuestion(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<QuestionBank> {
    const dto = parseBody(questionInputSchema, body);
    return this.service.addQuestion(tenantOf(principal), id as Uuid, toQuestionInput(dto));
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/questions/:questionId")
  @HttpCode(200)
  async updateQuestion(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("questionId") questionId: string,
    @Body() body: unknown,
  ): Promise<QuestionBank> {
    const dto = parseBody(questionInputSchema, body);
    return this.service.updateQuestion(
      tenantOf(principal),
      id as Uuid,
      questionId as Uuid,
      toQuestionInput(dto),
    );
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/questions/:questionId/remove")
  @HttpCode(200)
  async removeQuestion(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("questionId") questionId: string,
  ): Promise<QuestionBank> {
    return this.service.removeQuestion(tenantOf(principal), id as Uuid, questionId as Uuid);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<QuestionBank> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/revise")
  @HttpCode(200)
  async revise(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<QuestionBank> {
    const dto = parseBody(noteSchema, body);
    return this.service.revise(tenantOf(principal), id as Uuid, dto.note);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<QuestionBank> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }
}
