import type { Principal } from "@knowget/auth";
import { type Applicant, ApplicantService } from "@knowget/student-lifecycle";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  addDocumentSchema,
  decideApplicationSchema,
  interviewOutcomeSchema,
  scheduleInterviewSchema,
  setDocumentStatusSchema,
  startApplicationSchema,
} from "./student-lifecycle.dto";
import { parseBody, STUDENT_READ, STUDENT_WRITE, tenantOf } from "./student-lifecycle-http";
import { STUDENT_APPLICANT_SERVICE } from "./student-lifecycle.tokens";

/** REST surface for admissions applications (P2-D03). Permission-gated; tenant-scoped. */
@Controller("student-lifecycle/applications")
export class ApplicantController {
  constructor(@Inject(STUDENT_APPLICANT_SERVICE) private readonly service: ApplicantService) {}

  @RequirePermissions(STUDENT_WRITE)
  @Post()
  @HttpCode(201)
  async start(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Applicant> {
    const dto = parseBody(startApplicationSchema, body);
    return this.service.start({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      personId: dto.personId as Uuid,
      ...(dto.prospectId !== undefined ? { prospectId: dto.prospectId as Uuid } : {}),
      ...(dto.programId !== undefined ? { programId: dto.programId as Uuid } : {}),
      ...(dto.requiredDocuments !== undefined ? { requiredDocuments: dto.requiredDocuments } : {}),
    });
  }

  @RequirePermissions(STUDENT_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Applicant[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(STUDENT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Applicant[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(STUDENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Applicant> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/documents")
  @HttpCode(200)
  async addDocument(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Applicant> {
    const dto = parseBody(addDocumentSchema, body);
    return this.service.addDocument(tenantOf(principal), id as Uuid, dto.type);
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/documents/:type/status")
  @HttpCode(200)
  async setDocumentStatus(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("type") type: string,
    @Body() body: unknown,
  ): Promise<Applicant> {
    const dto = parseBody(setDocumentStatusSchema, body);
    return this.service.setDocumentStatus(tenantOf(principal), id as Uuid, type, dto.status);
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/submit")
  @HttpCode(200)
  async submit(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Applicant> {
    return this.service.submit(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/review")
  @HttpCode(200)
  async beginReview(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Applicant> {
    return this.service.beginReview(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/interview")
  @HttpCode(200)
  async scheduleInterview(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Applicant> {
    const dto = parseBody(scheduleInterviewSchema, body);
    return this.service.scheduleInterview(tenantOf(principal), id as Uuid, {
      scheduledOn: dto.scheduledOn,
      ...(dto.mode !== undefined ? { mode: dto.mode } : {}),
    });
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/interview/outcome")
  @HttpCode(200)
  async recordInterviewOutcome(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Applicant> {
    const dto = parseBody(interviewOutcomeSchema, body);
    return this.service.recordInterviewOutcome(tenantOf(principal), id as Uuid, dto.outcome);
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/approve")
  @HttpCode(200)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Applicant> {
    const dto = parseBody(decideApplicationSchema, body);
    return this.service.approve(tenantOf(principal), id as Uuid, {
      ...(dto.decidedById !== undefined ? { decidedById: dto.decidedById as Uuid } : {}),
      ...(dto.decidedOn !== undefined ? { decidedOn: dto.decidedOn } : {}),
      ...(dto.note !== undefined ? { note: dto.note } : {}),
    });
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/reject")
  @HttpCode(200)
  async reject(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Applicant> {
    const dto = parseBody(decideApplicationSchema, body);
    return this.service.reject(tenantOf(principal), id as Uuid, {
      ...(dto.decidedById !== undefined ? { decidedById: dto.decidedById as Uuid } : {}),
      ...(dto.decidedOn !== undefined ? { decidedOn: dto.decidedOn } : {}),
      ...(dto.note !== undefined ? { note: dto.note } : {}),
    });
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/withdraw")
  @HttpCode(200)
  async withdraw(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Applicant> {
    return this.service.withdraw(tenantOf(principal), id as Uuid);
  }
}
