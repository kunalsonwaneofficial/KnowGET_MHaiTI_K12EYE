import type { Principal } from "@knowget/auth";
import {
  type Assignment,
  AssignmentService,
  type RecordSubmissionInput,
} from "@knowget/teaching-learning";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  createAssignmentSchema,
  recordSubmissionSchema,
  renameSchema,
  setInstructionsSchema,
  setScheduleSchema,
  setSubmissionWindowSchema,
} from "./teaching-learning.dto";
import { parseBody, TEACHING_READ, TEACHING_WRITE, tenantOf } from "./teaching-learning-http";
import { TL_ASSIGNMENT_SERVICE } from "./teaching-learning.tokens";

/** REST surface for assignments (P2-D09). Gated by teaching:*; tenant-scoped. */
@Controller("teaching-learning/assignments")
export class AssignmentController {
  constructor(@Inject(TL_ASSIGNMENT_SERVICE) private readonly service: AssignmentService) {}

  @RequirePermissions(TEACHING_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Assignment> {
    const dto = parseBody(createAssignmentSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      subjectId: dto.subjectId as Uuid,
      title: dto.title,
      assignmentType: dto.assignmentType,
      ...(dto.sectionId !== undefined ? { sectionId: dto.sectionId as Uuid } : {}),
      ...(dto.lessonPlanId !== undefined ? { lessonPlanId: dto.lessonPlanId as Uuid } : {}),
      ...(dto.instructions !== undefined ? { instructions: dto.instructions } : {}),
      ...(dto.assignedDate !== undefined ? { assignedDate: dto.assignedDate } : {}),
      ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate } : {}),
      ...(dto.submissionOpensAt !== undefined ? { submissionOpensAt: dto.submissionOpensAt } : {}),
      ...(dto.submissionClosesAt !== undefined
        ? { submissionClosesAt: dto.submissionClosesAt }
        : {}),
    });
  }

  @RequirePermissions(TEACHING_READ)
  @Get("by-subject/:subjectId")
  async listForSubject(
    @CurrentPrincipal() principal: Principal,
    @Param("subjectId") subjectId: string,
  ): Promise<Assignment[]> {
    return this.service.listForSubject(tenantOf(principal), subjectId as Uuid);
  }

  @RequirePermissions(TEACHING_READ)
  @Get("by-section/:sectionId")
  async listForSection(
    @CurrentPrincipal() principal: Principal,
    @Param("sectionId") sectionId: string,
  ): Promise<Assignment[]> {
    return this.service.listForSection(tenantOf(principal), sectionId as Uuid);
  }

  @RequirePermissions(TEACHING_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Assignment[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(TEACHING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Assignment> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Assignment> {
    const dto = parseBody(renameSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.title);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/instructions")
  @HttpCode(200)
  async setInstructions(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Assignment> {
    const dto = parseBody(setInstructionsSchema, body);
    return this.service.setInstructions(tenantOf(principal), id as Uuid, dto.instructions);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/schedule")
  @HttpCode(200)
  async setSchedule(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Assignment> {
    const dto = parseBody(setScheduleSchema, body);
    return this.service.setSchedule(tenantOf(principal), id as Uuid, dto.assignedDate, dto.dueDate);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/submission-window")
  @HttpCode(200)
  async setSubmissionWindow(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Assignment> {
    const dto = parseBody(setSubmissionWindowSchema, body);
    return this.service.setSubmissionWindow(
      tenantOf(principal),
      id as Uuid,
      dto.opensAt,
      dto.closesAt,
    );
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Assignment> {
    return this.service.publish(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/submissions")
  @HttpCode(200)
  async recordSubmission(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Assignment> {
    const dto = parseBody(recordSubmissionSchema, body);
    const input: RecordSubmissionInput = {
      studentId: dto.studentId as Uuid,
      status: dto.status,
      ...(dto.submittedAt !== undefined ? { submittedAt: dto.submittedAt } : {}),
      ...(dto.note !== undefined ? { note: dto.note } : {}),
    };
    return this.service.recordSubmission(tenantOf(principal), id as Uuid, input);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/close")
  @HttpCode(200)
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Assignment> {
    return this.service.close(tenantOf(principal), id as Uuid);
  }
}
