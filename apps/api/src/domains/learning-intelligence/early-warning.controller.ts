import type { Principal } from "@knowget/auth";
import {
  type EarlyWarning,
  EarlyWarningService,
  type EvidenceRef,
} from "@knowget/learning-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { actorNoteSchema, raiseWarningSchema } from "./learning-intelligence.dto";
import { INSIGHT_READ, INSIGHT_WRITE, parseBody, tenantOf } from "./learning-intelligence-http";
import { LI_EARLY_WARNING_SERVICE } from "./learning-intelligence.tokens";

/** REST surface for early warnings (P2-D11). Gated by insight:*; tenant-scoped. */
@Controller("learning-intelligence/early-warnings")
export class EarlyWarningController {
  constructor(@Inject(LI_EARLY_WARNING_SERVICE) private readonly service: EarlyWarningService) {}

  @RequirePermissions(INSIGHT_WRITE)
  @Post()
  @HttpCode(201)
  async raise(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<EarlyWarning> {
    const dto = parseBody(raiseWarningSchema, body);
    return this.service.raise({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      studentId: dto.studentId as Uuid,
      dimension: dto.dimension,
      ruleId: dto.ruleId,
      severity: dto.severity,
      observedScore: dto.observedScore,
      rationale: dto.rationale,
      ...(dto.evidence !== undefined ? { evidence: dto.evidence as EvidenceRef[] } : {}),
      ...(dto.raisedBy !== undefined ? { raisedBy: dto.raisedBy as Uuid | null } : {}),
    });
  }

  @RequirePermissions(INSIGHT_READ)
  @Get("by-student/:studentId")
  async listForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<EarlyWarning[]> {
    return this.service.listForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(INSIGHT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<EarlyWarning[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(INSIGHT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EarlyWarning> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/acknowledge")
  @HttpCode(200)
  async acknowledge(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EarlyWarning> {
    const dto = parseBody(actorNoteSchema, body);
    return this.service.acknowledge(
      tenantOf(principal),
      id as Uuid,
      (dto.actor as Uuid | null | undefined) ?? null,
      dto.note ?? null,
    );
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/resolve")
  @HttpCode(200)
  async resolve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EarlyWarning> {
    const dto = parseBody(actorNoteSchema, body);
    return this.service.resolve(
      tenantOf(principal),
      id as Uuid,
      (dto.actor as Uuid | null | undefined) ?? null,
      dto.note ?? null,
    );
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/dismiss")
  @HttpCode(200)
  async dismiss(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EarlyWarning> {
    const dto = parseBody(actorNoteSchema, body);
    return this.service.dismiss(
      tenantOf(principal),
      id as Uuid,
      (dto.actor as Uuid | null | undefined) ?? null,
      dto.note ?? null,
    );
  }
}
