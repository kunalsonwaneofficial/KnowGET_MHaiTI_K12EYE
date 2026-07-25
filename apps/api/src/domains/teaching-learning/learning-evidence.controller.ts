import type { Principal } from "@knowget/auth";
import {
  type InstructionalActivityKind,
  type LearningEvidence,
  LearningEvidenceService,
} from "@knowget/teaching-learning";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  captureLearningEvidenceSchema,
  setDescriptionSchema,
  uuidListSchema,
} from "./teaching-learning.dto";
import { parseBody, TEACHING_READ, TEACHING_WRITE, tenantOf } from "./teaching-learning-http";
import { TL_LEARNING_EVIDENCE_SERVICE } from "./teaching-learning.tokens";

/** REST surface for learning evidence (P2-D09). Gated by teaching:*; tenant-scoped. */
@Controller("teaching-learning/learning-evidence")
export class LearningEvidenceController {
  constructor(
    @Inject(TL_LEARNING_EVIDENCE_SERVICE) private readonly service: LearningEvidenceService,
  ) {}

  @RequirePermissions(TEACHING_WRITE)
  @Post()
  @HttpCode(201)
  async capture(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<LearningEvidence> {
    const dto = parseBody(captureLearningEvidenceSchema, body);
    return this.service.capture({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      studentId: dto.studentId as Uuid,
      evidenceType: dto.evidenceType,
      activityKind: dto.activityKind,
      activityId: dto.activityId as Uuid,
      title: dto.title,
      ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId as Uuid } : {}),
      ...(dto.learningOutcomeIds !== undefined
        ? { learningOutcomeIds: dto.learningOutcomeIds as Uuid[] }
        : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.capturedAt !== undefined ? { capturedAt: dto.capturedAt } : {}),
      ...(dto.capturedBy !== undefined ? { capturedBy: dto.capturedBy as Uuid } : {}),
    });
  }

  @RequirePermissions(TEACHING_READ)
  @Get("by-student/:studentId")
  async listForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<LearningEvidence[]> {
    return this.service.listForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(TEACHING_READ)
  @Get("by-activity/:activityKind/:activityId")
  async listForActivity(
    @CurrentPrincipal() principal: Principal,
    @Param("activityKind") activityKind: string,
    @Param("activityId") activityId: string,
  ): Promise<LearningEvidence[]> {
    return this.service.listForActivity(
      tenantOf(principal),
      activityKind as InstructionalActivityKind,
      activityId as Uuid,
    );
  }

  @RequirePermissions(TEACHING_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<LearningEvidence[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(TEACHING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LearningEvidence> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/description")
  @HttpCode(200)
  async amendDescription(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LearningEvidence> {
    const dto = parseBody(setDescriptionSchema, body);
    return this.service.amendDescription(tenantOf(principal), id as Uuid, dto.description);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/outcomes")
  @HttpCode(200)
  async setOutcomes(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LearningEvidence> {
    const dto = parseBody(uuidListSchema, body);
    return this.service.setOutcomes(tenantOf(principal), id as Uuid, dto.ids as Uuid[]);
  }
}
