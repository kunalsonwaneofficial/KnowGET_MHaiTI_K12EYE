import type { Principal } from "@knowget/auth";
import { type PerformanceReview, PerformanceReviewService } from "@knowget/workforce";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { draftReviewSchema, setNarrativeSchema, setRatingSchema } from "./workforce.dto";
import { parseBody, tenantOf, WORKFORCE_READ, WORKFORCE_WRITE } from "./workforce-http";
import { WF_REVIEW_SERVICE } from "./workforce.tokens";

/** REST surface for performance reviews (P2-D12). Gated by workforce:*; tenant-scoped. */
@Controller("workforce/reviews")
export class PerformanceReviewController {
  constructor(@Inject(WF_REVIEW_SERVICE) private readonly service: PerformanceReviewService) {}

  @RequirePermissions(WORKFORCE_WRITE)
  @Post()
  @HttpCode(201)
  async draft(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<PerformanceReview> {
    const dto = parseBody(draftReviewSchema, body);
    return this.service.draft({
      tenantId: tenantOf(principal),
      employeeId: dto.employeeId as Uuid,
      period: dto.period,
      ...(dto.reviewerId !== undefined ? { reviewerId: dto.reviewerId as Uuid | null } : {}),
      ...(dto.overallRating !== undefined ? { overallRating: dto.overallRating } : {}),
      ...(dto.summary !== undefined ? { summary: dto.summary } : {}),
      ...(dto.strengths !== undefined ? { strengths: dto.strengths } : {}),
      ...(dto.improvements !== undefined ? { improvements: dto.improvements } : {}),
    });
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/rating")
  @HttpCode(200)
  async setRating(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<PerformanceReview> {
    const dto = parseBody(setRatingSchema, body);
    return this.service.setRating(tenantOf(principal), id as Uuid, dto.overallRating);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/narrative")
  @HttpCode(200)
  async setNarrative(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<PerformanceReview> {
    const dto = parseBody(setNarrativeSchema, body);
    return this.service.setNarrative(tenantOf(principal), id as Uuid, {
      ...(dto.summary !== undefined ? { summary: dto.summary } : {}),
      ...(dto.strengths !== undefined ? { strengths: dto.strengths } : {}),
      ...(dto.improvements !== undefined ? { improvements: dto.improvements } : {}),
    });
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/submit")
  @HttpCode(200)
  async submit(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<PerformanceReview> {
    return this.service.submit(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/acknowledge")
  @HttpCode(200)
  async acknowledge(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<PerformanceReview> {
    return this.service.acknowledge(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/finalize")
  @HttpCode(200)
  async finalize(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<PerformanceReview> {
    return this.service.finalize(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<PerformanceReview[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get("by-employee/:employeeId")
  async listForEmployee(
    @CurrentPrincipal() principal: Principal,
    @Param("employeeId") employeeId: string,
  ): Promise<PerformanceReview[]> {
    return this.service.listForEmployee(tenantOf(principal), employeeId as Uuid);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<PerformanceReview> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
