import type { Principal } from "@knowget/auth";
import {
  type EvidenceRef,
  type Recommendation,
  RecommendationService,
} from "@knowget/learning-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  actorNoteSchema,
  deciderNoteSchema,
  proposeRecommendationSchema,
  reviseRecommendationSchema,
  setPrioritySchema,
} from "./learning-intelligence.dto";
import { INSIGHT_READ, INSIGHT_WRITE, parseBody, tenantOf } from "./learning-intelligence-http";
import { LI_RECOMMENDATION_SERVICE } from "./learning-intelligence.tokens";

/** REST surface for recommendations (P2-D11). Gated by insight:*; tenant-scoped. */
@Controller("learning-intelligence/recommendations")
export class RecommendationController {
  constructor(@Inject(LI_RECOMMENDATION_SERVICE) private readonly service: RecommendationService) {}

  @RequirePermissions(INSIGHT_WRITE)
  @Post()
  @HttpCode(201)
  async propose(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Recommendation> {
    const dto = parseBody(proposeRecommendationSchema, body);
    return this.service.propose({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      studentId: dto.studentId as Uuid,
      category: dto.category,
      action: dto.action,
      rationale: dto.rationale,
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.targetDimension !== undefined ? { targetDimension: dto.targetDimension } : {}),
      ...(dto.evidence !== undefined ? { evidence: dto.evidence as EvidenceRef[] } : {}),
      ...(dto.proposedBy !== undefined ? { proposedBy: dto.proposedBy as Uuid | null } : {}),
    });
  }

  @RequirePermissions(INSIGHT_READ)
  @Get("by-student/:studentId")
  async listForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<Recommendation[]> {
    return this.service.listForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(INSIGHT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Recommendation[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(INSIGHT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Recommendation> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/revise")
  @HttpCode(200)
  async revise(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Recommendation> {
    const dto = parseBody(reviseRecommendationSchema, body);
    return this.service.revise(tenantOf(principal), id as Uuid, dto.action, dto.rationale);
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/priority")
  @HttpCode(200)
  async setPriority(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Recommendation> {
    const dto = parseBody(setPrioritySchema, body);
    return this.service.setPriority(tenantOf(principal), id as Uuid, dto.priority);
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/accept")
  @HttpCode(200)
  async accept(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Recommendation> {
    const dto = parseBody(deciderNoteSchema, body);
    return this.service.accept(
      tenantOf(principal),
      id as Uuid,
      (dto.decidedBy as Uuid | null | undefined) ?? null,
      dto.note ?? null,
    );
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/reject")
  @HttpCode(200)
  async reject(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Recommendation> {
    const dto = parseBody(deciderNoteSchema, body);
    return this.service.reject(
      tenantOf(principal),
      id as Uuid,
      (dto.decidedBy as Uuid | null | undefined) ?? null,
      dto.note ?? null,
    );
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/action")
  @HttpCode(200)
  async action(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Recommendation> {
    const dto = parseBody(actorNoteSchema, body);
    return this.service.action(
      tenantOf(principal),
      id as Uuid,
      (dto.actor as Uuid | null | undefined) ?? null,
      dto.note ?? null,
    );
  }
}
