import type { Principal } from "@knowget/auth";
import {
  type EducationalInsight,
  EducationalInsightService,
  type EvidenceRef,
} from "@knowget/learning-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  actorNoteSchema,
  proposeInsightSchema,
  reviseInsightSchema,
  setPrioritySchema,
} from "./learning-intelligence.dto";
import { INSIGHT_READ, INSIGHT_WRITE, parseBody, tenantOf } from "./learning-intelligence-http";
import { LI_INSIGHT_SERVICE } from "./learning-intelligence.tokens";

/** REST surface for educational insights (P2-D11). Gated by insight:*; tenant-scoped. */
@Controller("learning-intelligence/insights")
export class EducationalInsightController {
  constructor(@Inject(LI_INSIGHT_SERVICE) private readonly service: EducationalInsightService) {}

  @RequirePermissions(INSIGHT_WRITE)
  @Post()
  @HttpCode(201)
  async propose(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<EducationalInsight> {
    const dto = parseBody(proposeInsightSchema, body);
    return this.service.propose({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      studentId: dto.studentId as Uuid,
      category: dto.category,
      title: dto.title,
      narrative: dto.narrative,
      ...(dto.dimension !== undefined ? { dimension: dto.dimension } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.evidence !== undefined ? { evidence: dto.evidence as EvidenceRef[] } : {}),
      ...(dto.proposedBy !== undefined ? { proposedBy: dto.proposedBy as Uuid | null } : {}),
    });
  }

  @RequirePermissions(INSIGHT_READ)
  @Get("by-student/:studentId")
  async listForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<EducationalInsight[]> {
    return this.service.listForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(INSIGHT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<EducationalInsight[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(INSIGHT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EducationalInsight> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/revise")
  @HttpCode(200)
  async revise(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EducationalInsight> {
    const dto = parseBody(reviseInsightSchema, body);
    return this.service.revise(tenantOf(principal), id as Uuid, dto.title, dto.narrative);
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/priority")
  @HttpCode(200)
  async setPriority(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EducationalInsight> {
    const dto = parseBody(setPrioritySchema, body);
    return this.service.setPriority(tenantOf(principal), id as Uuid, dto.priority);
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EducationalInsight> {
    const dto = parseBody(actorNoteSchema, body);
    return this.service.publish(
      tenantOf(principal),
      id as Uuid,
      (dto.actor as Uuid | null | undefined) ?? null,
    );
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EducationalInsight> {
    const dto = parseBody(actorNoteSchema, body);
    return this.service.archive(
      tenantOf(principal),
      id as Uuid,
      (dto.actor as Uuid | null | undefined) ?? null,
      dto.note ?? null,
    );
  }
}
