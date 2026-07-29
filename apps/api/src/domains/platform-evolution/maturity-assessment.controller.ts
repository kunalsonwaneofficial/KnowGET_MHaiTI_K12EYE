import type { Principal } from "@knowget/auth";
import { type MaturityAssessment, MaturityAssessmentService } from "@knowget/platform-evolution";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  EVOLUTION_ASSESS,
  EVOLUTION_READ,
  actorOf,
  parseBody,
  tenantOf,
} from "./platform-evolution-http";
import { assessAreaSchema, openAssessmentSchema } from "./platform-evolution.dto";
import { PE_ASSESSMENT_SERVICE } from "./platform-evolution.tokens";

/**
 * REST surface for maturity assessments (P2-D30) — the institution's periodic answer about itself.
 *
 * The whole surface has one scope, `evolution:assess`, and that is the point rather than an economy. Assessing
 * an institution's own maturity is a distinct act from running its improvement process: the people who own the
 * areas being scored are exactly the people whose scores would be flattering, so the ability to open, score and
 * publish is granted as a single separable thing an institution can put somewhere else.
 *
 * The order of the two write routes carries the integrity argument. Weights are declared at opening, before any
 * area is scored, and are fixed from then on — a weighting editable after the readings landed would let a
 * disappointing index be improved by discovering that the weak areas were never important. Readings then land
 * one at a time, and an area scored with zero evidence is recordable but does not count toward coverage, so an
 * assessment assembled from opinion reads as an assessment assembled from opinion instead of failing.
 *
 * Publication is a separate act because the index is a number leadership acts on. A draft assessment is
 * something somebody is still assembling; publishing puts a name against it and admits it to the trend line,
 * and the trend is the only part of a maturity index that ever supports a decision — three is neither good nor
 * bad without knowing what last year was.
 */
@Controller("evolution/maturity")
export class MaturityAssessmentController {
  constructor(@Inject(PE_ASSESSMENT_SERVICE) private readonly service: MaturityAssessmentService) {}

  /** Open an assessment against a declared weighting — what the institution says matters, said first. */
  @RequirePermissions(EVOLUTION_ASSESS)
  @Post()
  @HttpCode(201)
  async open(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<MaturityAssessment> {
    const dto = parseBody(openAssessmentSchema, body);
    return this.service.open({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      assessmentKey: dto.assessmentKey,
      period: dto.period,
      weights: dto.weights,
      openedBy: actorOf(principal),
    });
  }

  /**
   * Score one area, with the count of evidence standing behind it. The evidence count is not decoration: it is
   * what separates a maturity index the institution can defend from a number somebody felt, and coverage
   * travels with the index for exactly that reason.
   */
  @RequirePermissions(EVOLUTION_ASSESS)
  @Post(":id/readings")
  @HttpCode(200)
  async assess(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<MaturityAssessment> {
    const dto = parseBody(assessAreaSchema, body);
    return this.service.assess(tenantOf(principal), id as Uuid, {
      area: dto.area,
      score: dto.score,
      evidenceCount: dto.evidenceCount,
    });
  }

  /** Publish it, with a name against it. The moment a working number becomes one the institution stands behind. */
  @RequirePermissions(EVOLUTION_ASSESS)
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MaturityAssessment> {
    return this.service.publish(tenantOf(principal), id as Uuid, actorOf(principal));
  }

  /** Every assessment in the tenant, drafts included. */
  @RequirePermissions(EVOLUTION_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly MaturityAssessment[]> {
    return this.service.list(tenantOf(principal));
  }

  /** The trend line — published assessments in period order, which is the only reading that means anything. */
  @RequirePermissions(EVOLUTION_READ)
  @Get("published/:organizationId")
  async listPublished(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly MaturityAssessment[]> {
    return this.service.listPublished(tenantOf(principal), organizationId as Uuid);
  }

  /** One assessment by key, which is how a series names its own members. */
  @RequirePermissions(EVOLUTION_READ)
  @Get("by-key/:assessmentKey")
  async getByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("assessmentKey") assessmentKey: string,
  ): Promise<MaturityAssessment> {
    return this.service.getByKey(tenantOf(principal), assessmentKey);
  }

  /** One assessment, or a 404. */
  @RequirePermissions(EVOLUTION_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MaturityAssessment> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
