import type { Principal } from "@knowget/auth";
import { type SecurityIncident, SecurityIncidentService } from "@knowget/campus-security";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { parseBody, SECURITY_READ, SECURITY_WRITE, tenantOf } from "./campus-security-http";
import {
  assignIncidentSchema,
  reportIncidentSchema,
  resolveIncidentSchema,
  setIncidentSeveritySchema,
} from "./campus-security.dto";
import { CS_INCIDENT_SERVICE } from "./campus-security.tokens";

/** REST surface for security incidents (P2-D21). Gated by security:*; tenant-scoped. */
@Controller("security/incidents")
export class SecurityIncidentController {
  constructor(@Inject(CS_INCIDENT_SERVICE) private readonly service: SecurityIncidentService) {}

  @RequirePermissions(SECURITY_WRITE)
  @Post()
  @HttpCode(201)
  async report(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<SecurityIncident> {
    const dto = parseBody(reportIncidentSchema, body);
    return this.service.report({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      category: dto.category,
      severity: dto.severity,
      zoneId: (dto.zoneId as Uuid | null | undefined) ?? null,
      reportedByPersonId: (dto.reportedByPersonId as Uuid | null | undefined) ?? null,
      summary: dto.summary,
      reportedOn: dto.reportedOn,
    });
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/triage")
  @HttpCode(200)
  async triage(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<SecurityIncident> {
    return this.service.triage(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/assign")
  @HttpCode(200)
  async assign(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<SecurityIncident> {
    const dto = parseBody(assignIncidentSchema, body);
    return this.service.assign(tenantOf(principal), id as Uuid, dto.assigneeId as Uuid);
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/severity")
  @HttpCode(200)
  async setSeverity(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<SecurityIncident> {
    const dto = parseBody(setIncidentSeveritySchema, body);
    return this.service.setSeverity(tenantOf(principal), id as Uuid, dto.severity);
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/start-investigation")
  @HttpCode(200)
  async startInvestigation(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<SecurityIncident> {
    return this.service.startInvestigation(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/resolve")
  @HttpCode(200)
  async resolve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<SecurityIncident> {
    const dto = parseBody(resolveIncidentSchema, body);
    return this.service.resolve(tenantOf(principal), id as Uuid, dto.resolvedOn);
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/close")
  @HttpCode(200)
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<SecurityIncident> {
    return this.service.close(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<SecurityIncident> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SECURITY_READ)
  @Get("open")
  async listOpen(@CurrentPrincipal() principal: Principal): Promise<SecurityIncident[]> {
    return this.service.listOpen(tenantOf(principal));
  }

  @RequirePermissions(SECURITY_READ)
  @Get("by-code/:code")
  async getByCode(
    @CurrentPrincipal() principal: Principal,
    @Param("code") code: string,
  ): Promise<SecurityIncident> {
    return this.service.getByCode(tenantOf(principal), code);
  }

  @RequirePermissions(SECURITY_READ)
  @Get("by-zone/:zoneId")
  async listForZone(
    @CurrentPrincipal() principal: Principal,
    @Param("zoneId") zoneId: string,
  ): Promise<SecurityIncident[]> {
    return this.service.listForZone(tenantOf(principal), zoneId as Uuid);
  }

  @RequirePermissions(SECURITY_READ)
  @Get("by-assignee/:assigneeId")
  async listForAssignee(
    @CurrentPrincipal() principal: Principal,
    @Param("assigneeId") assigneeId: string,
  ): Promise<SecurityIncident[]> {
    return this.service.listForAssignee(tenantOf(principal), assigneeId as Uuid);
  }

  @RequirePermissions(SECURITY_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<SecurityIncident[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(SECURITY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<SecurityIncident> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
