import type { Principal } from "@knowget/auth";
import {
  type EvidenceRef,
  type LearningSignal,
  LearningSignalService,
} from "@knowget/learning-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { captureSignalSchema } from "./learning-intelligence.dto";
import { INSIGHT_READ, INSIGHT_WRITE, parseBody, tenantOf } from "./learning-intelligence-http";
import { LI_SIGNAL_SERVICE } from "./learning-intelligence.tokens";

/** REST surface for learning signals (P2-D11). Gated by insight:*; tenant-scoped. */
@Controller("learning-intelligence/signals")
export class LearningSignalController {
  constructor(@Inject(LI_SIGNAL_SERVICE) private readonly service: LearningSignalService) {}

  @RequirePermissions(INSIGHT_WRITE)
  @Post()
  @HttpCode(201)
  async capture(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<LearningSignal> {
    const dto = parseBody(captureSignalSchema, body);
    return this.service.capture({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      studentId: dto.studentId as Uuid,
      dimension: dto.dimension,
      source: dto.source,
      metric: dto.metric,
      value: dto.value,
      ...(dto.trend !== undefined ? { trend: dto.trend } : {}),
      ...(dto.observedAt !== undefined ? { observedAt: dto.observedAt } : {}),
      ...(dto.evidence !== undefined ? { evidence: dto.evidence as Partial<EvidenceRef> } : {}),
      ...(dto.note !== undefined ? { note: dto.note } : {}),
    });
  }

  @RequirePermissions(INSIGHT_READ)
  @Get("by-student/:studentId")
  async listForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<LearningSignal[]> {
    return this.service.listForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(INSIGHT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<LearningSignal[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(INSIGHT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LearningSignal> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
