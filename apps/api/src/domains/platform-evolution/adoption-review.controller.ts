import type { Principal } from "@knowget/auth";
import { type AdoptionReview, AdoptionReviewService } from "@knowget/platform-evolution";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  EVOLUTION_MANAGE,
  EVOLUTION_READ,
  actorOf,
  parseBody,
  tenantOf,
} from "./platform-evolution-http";
import {
  claimBenefitSchema,
  observeBenefitSchema,
  openReviewSchema,
} from "./platform-evolution.dto";
import { PE_ADOPTION_REVIEW_SERVICE } from "./platform-evolution.tokens";

/**
 * REST surface for adoption reviews (P2-D30) — did the change the institution made actually work?
 *
 * This is the surface that keeps the rest of the domain honest. Everything upstream of it is an institution
 * deciding to do something; only this asks, afterwards, whether the thing it promised happened. A change
 * approved through a full governance gate and adopted with everybody's agreement can still have made nothing
 * better, and an improvement process without this route records only its own diligence.
 *
 * The two write routes are deliberately separate and deliberately ordered. A benefit is *claimed* first —
 * measure, direction, baseline and target, stated before anything is measured — and *observed* second. That
 * ordering is the entire epistemic content of a realization review: a target written after the result is known
 * is not a test, and the two-step shape is what stops a change from having always intended whatever it
 * achieved. Benefits that were claimed and never measured stay on the record beside the ones that were, because
 * a change that promised six improvements and could evidence one has not been shown to work.
 *
 * Everything sits under `evolution:manage`. Concluding is not a governance gate — the review does not decide
 * anything about the change, it reports what the measurements came to — but it is the act that fixes the
 * verdict, including the `revert` verdict that is the most valuable record this domain produces and the one an
 * institution has the most reason to wish away.
 */
@Controller("evolution/adoption-reviews")
export class AdoptionReviewController {
  constructor(
    @Inject(PE_ADOPTION_REVIEW_SERVICE) private readonly service: AdoptionReviewService,
  ) {}

  /**
   * Open a review of an adopted change at a stated distance from adoption. The period is part of the review's
   * identity: reviewing at one period and again at four is the normal shape of benefits realization, and early
   * movement that decayed is a finding — while a second review at the *same* distance is the move being
   * refused, because it is how an unwelcome verdict gets asked again until it comes out differently.
   */
  @RequirePermissions(EVOLUTION_MANAGE)
  @Post()
  @HttpCode(201)
  async open(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AdoptionReview> {
    const dto = parseBody(openReviewSchema, body);
    return this.service.open({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      initiativeId: dto.initiativeId as Uuid,
      reviewPeriod: dto.reviewPeriod,
      openedBy: actorOf(principal),
    });
  }

  /** State what the change was supposed to improve, and from what, before any of it is measured. */
  @RequirePermissions(EVOLUTION_MANAGE)
  @Post(":id/benefits")
  @HttpCode(200)
  async claim(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AdoptionReview> {
    const dto = parseBody(claimBenefitSchema, body);
    return this.service.claim(tenantOf(principal), id as Uuid, {
      measureKey: dto.measureKey,
      direction: dto.direction,
      baseline: dto.baseline,
      target: dto.target,
    });
  }

  /** Record what it actually came to. Admissible only against a benefit that was claimed first. */
  @RequirePermissions(EVOLUTION_MANAGE)
  @Post(":id/observations")
  @HttpCode(200)
  async observe(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AdoptionReview> {
    const dto = parseBody(observeBenefitSchema, body);
    return this.service.observe(tenantOf(principal), id as Uuid, dto.measureKey, dto.observed);
  }

  /**
   * Settle the review. The verdict is the realization engine's reading of the benefits as they stand, fixed
   * here with a name against it — a recommendation, including a recommendation to revert, and never an act:
   * reverting a change means opening a reversion gate, which is a decision people make.
   */
  @RequirePermissions(EVOLUTION_MANAGE)
  @Post(":id/conclude")
  @HttpCode(200)
  async conclude(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AdoptionReview> {
    return this.service.conclude(tenantOf(principal), id as Uuid, actorOf(principal));
  }

  /** Every review in the tenant. */
  @RequirePermissions(EVOLUTION_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly AdoptionReview[]> {
    return this.service.list(tenantOf(principal));
  }

  /**
   * The realization trail for one adopted change, in period order. Two reviews reaching different verdicts is
   * the expected result when they were taken at different distances from adoption; unordered, the same two
   * records are just an institution disagreeing with itself about whether something worked.
   */
  @RequirePermissions(EVOLUTION_READ)
  @Get("by-initiative/:initiativeId")
  async listByInitiative(
    @CurrentPrincipal() principal: Principal,
    @Param("initiativeId") initiativeId: string,
  ): Promise<readonly AdoptionReview[]> {
    return this.service.listByInitiative(tenantOf(principal), initiativeId as Uuid);
  }

  /** One review, or a 404. */
  @RequirePermissions(EVOLUTION_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AdoptionReview> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
