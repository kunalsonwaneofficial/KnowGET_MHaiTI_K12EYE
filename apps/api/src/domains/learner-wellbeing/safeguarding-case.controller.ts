import type { Principal } from "@knowget/auth";
import {
  type ExternalAgencyInvolvement,
  type SafeguardingCase,
  SafeguardingCaseService,
  type SafeguardingEscalation,
  type SafeguardingIncidentReport,
} from "@knowget/learner-wellbeing";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  classifyRiskSchema,
  coordinateExternalAgencySchema,
  escalateSchema,
  fileIncidentReportSchema,
  openSafeguardingCaseSchema,
  resolveSafeguardingCaseSchema,
} from "./learner-wellbeing.dto";
import {
  parseBody,
  SAFEGUARDING_READ,
  SAFEGUARDING_WRITE,
  tenantOf,
} from "./learner-wellbeing-http";
import { LW_SAFEGUARDING_CASE_SERVICE } from "./learner-wellbeing.tokens";

/**
 * REST surface for safeguarding cases (P2-D05). Gated by the most restricted
 * safeguarding:* scope; tenant-scoped. Escalation is traceable and event-published.
 */
@Controller("learner-wellbeing/safeguarding-cases")
export class SafeguardingCaseController {
  constructor(
    @Inject(LW_SAFEGUARDING_CASE_SERVICE) private readonly service: SafeguardingCaseService,
  ) {}

  @RequirePermissions(SAFEGUARDING_WRITE)
  @Post()
  @HttpCode(201)
  async open(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<SafeguardingCase> {
    const dto = parseBody(openSafeguardingCaseSchema, body);
    return this.service.open({
      tenantId: tenantOf(principal),
      studentId: dto.studentId as Uuid,
      concern: dto.concern,
      category: dto.category,
      reportedBy: dto.reportedBy as Uuid,
      ...(dto.riskLevel !== undefined ? { riskLevel: dto.riskLevel } : {}),
    });
  }

  @RequirePermissions(SAFEGUARDING_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<SafeguardingCase[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(SAFEGUARDING_READ)
  @Get("by-student/:studentId")
  async listForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<SafeguardingCase[]> {
    return this.service.listForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(SAFEGUARDING_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<SafeguardingCase[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(SAFEGUARDING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<SafeguardingCase> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SAFEGUARDING_WRITE)
  @Post(":id/risk")
  @HttpCode(200)
  async classifyRisk(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<SafeguardingCase> {
    const dto = parseBody(classifyRiskSchema, body);
    return this.service.classifyRisk(tenantOf(principal), id as Uuid, dto.riskLevel);
  }

  @RequirePermissions(SAFEGUARDING_WRITE)
  @Post(":id/begin-investigation")
  @HttpCode(200)
  async beginInvestigation(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<SafeguardingCase> {
    return this.service.beginInvestigation(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SAFEGUARDING_WRITE)
  @Post(":id/incident-reports")
  @HttpCode(201)
  async fileIncidentReport(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ kase: SafeguardingCase; report: SafeguardingIncidentReport }> {
    const dto = parseBody(fileIncidentReportSchema, body);
    return this.service.fileIncidentReport(tenantOf(principal), id as Uuid, {
      description: dto.description,
      reportedBy: dto.reportedBy as Uuid,
      ...(dto.occurredOn !== undefined ? { occurredOn: dto.occurredOn } : {}),
    });
  }

  @RequirePermissions(SAFEGUARDING_WRITE)
  @Post(":id/escalate")
  @HttpCode(200)
  async escalate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ kase: SafeguardingCase; escalation: SafeguardingEscalation }> {
    const dto = parseBody(escalateSchema, body);
    return this.service.escalate(tenantOf(principal), id as Uuid, {
      escalatedTo: dto.escalatedTo,
      reason: dto.reason,
      escalatedBy: dto.escalatedBy as Uuid,
    });
  }

  @RequirePermissions(SAFEGUARDING_WRITE)
  @Post(":id/external-agencies")
  @HttpCode(201)
  async coordinateExternalAgency(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ kase: SafeguardingCase; involvement: ExternalAgencyInvolvement }> {
    const dto = parseBody(coordinateExternalAgencySchema, body);
    return this.service.coordinateExternalAgency(tenantOf(principal), id as Uuid, {
      agency: dto.agency,
      ...(dto.reference !== undefined ? { reference: dto.reference } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
    });
  }

  @RequirePermissions(SAFEGUARDING_WRITE)
  @Post(":id/resolve")
  @HttpCode(200)
  async resolve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<SafeguardingCase> {
    const dto = parseBody(resolveSafeguardingCaseSchema, body);
    return this.service.resolve(tenantOf(principal), id as Uuid, dto.resolution);
  }
}
