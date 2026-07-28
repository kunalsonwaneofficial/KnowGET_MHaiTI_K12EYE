import type { Principal } from "@knowget/auth";
import {
  type HealthIndexAssessment,
  HealthIndexAssessmentService,
  type ReproductionVerdict,
} from "@knowget/executive-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  COMMAND_OPERATE,
  COMMAND_READ,
  parseBody,
  periodOf,
  tenantOf,
} from "./executive-intelligence-http";
import { assessHealthIndexSchema, invalidateAssessmentSchema } from "./executive-intelligence.dto";
import { EI_ASSESSMENT_SERVICE } from "./executive-intelligence.tokens";

/**
 * REST surface for health index assessments (P2-D29) — the institution's score for a period, and its working.
 *
 * This is the contract's second clause arriving at the boundary: a reproducible Institutional Health Index
 * across the ten pillars. An assessment is not a number with an audit log bolted to it. It records the
 * composition it was computed under, every reading it drew on, the coverage it achieved per pillar, and a
 * fingerprint over the whole input set — so {@link verify} can recompute from what was recorded and say whether
 * the figure still comes out the same.
 *
 * That verdict is the point. A score nobody can reproduce is an assertion, and an institution reporting one to
 * a board is asking to be trusted rather than checked. `verify` is a read: re-deriving the arithmetic changes
 * nothing, and gating it behind an operator's scope would mean the people most in need of checking a figure —
 * governors, auditors, anyone reading a briefing — could see the number but not test it.
 *
 * Coverage floors are refusals rather than warnings. An assessment that could not reach enough of the pillars,
 * or enough indicators within them, is not filed with a caveat: it is refused, because a score computed over a
 * third of an institution reads exactly like a score computed over all of it once it reaches a slide.
 *
 * Nothing is deleted. An assessment that no longer stands is invalidated, keeping its inputs and its
 * fingerprint, so a briefing that cited it can still show what was computed and why it stopped holding.
 */
@Controller("command/assessments")
export class HealthIndexAssessmentController {
  constructor(
    @Inject(EI_ASSESSMENT_SERVICE) private readonly service: HealthIndexAssessmentService,
  ) {}

  /**
   * Compute the index for a period.
   *
   * The index is named by key rather than by definition id, deliberately. The published composition for that key
   * is what the institution is currently measuring itself under, and resolving it here is what makes the
   * recorded definition id an answer rather than the caller's assertion — a caller who could pin the definition
   * could score a period under a composition that had been superseded before the period began.
   */
  @RequirePermissions(COMMAND_OPERATE)
  @Post()
  @HttpCode(201)
  async assess(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<HealthIndexAssessment> {
    const dto = parseBody(assessHealthIndexSchema, body);
    return this.service.assess(tenantOf(principal), dto.indexKey, dto.period);
  }

  /**
   * Settle a provisional assessment as the institution's filed figure for the period. Until this happens the
   * score exists but is not something a briefing may cite — drafting a board pack from a figure still being
   * argued about is the failure this transition exists to prevent.
   */
  @RequirePermissions(COMMAND_OPERATE)
  @Post(":id/finalize")
  @HttpCode(200)
  async finalize(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<HealthIndexAssessment> {
    return this.service.finalize(tenantOf(principal), id as Uuid);
  }

  /**
   * Withdraw a filed score the institution no longer stands behind — usually because a reading beneath it was
   * withdrawn and {@link verify} stopped reproducing.
   *
   * The reason is optional here and compulsory on a reading withdrawal, and the asymmetry is deliberate: an
   * invalidated assessment keeps its inputs and its fingerprint, so the record can still show exactly what it
   * computed and demonstrate why it no longer reproduces without anyone having to have written it down.
   */
  @RequirePermissions(COMMAND_OPERATE)
  @Post(":id/invalidate")
  @HttpCode(200)
  async invalidate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<HealthIndexAssessment> {
    const dto = parseBody(invalidateAssessmentSchema, body);
    return this.service.invalidate(tenantOf(principal), id as Uuid, dto.reason ?? null);
  }

  /**
   * Recompute the score from what the assessment recorded and report whether it still comes out the same.
   *
   * A read, and gated as one. Re-deriving arithmetic changes nothing in the record, and the people who most need
   * to test a figure are the ones reading it rather than the ones producing it — a reproducibility check only an
   * operator could run would leave every other reader taking the number on trust, which is the exact posture
   * this contract's second clause exists to remove.
   *
   * The verdict distinguishes inputs that no longer match from a value that no longer computes, because those
   * are different failures: the first says the evidence beneath the score moved, the second says the arithmetic
   * itself does not hold, and an institution responds to them differently.
   */
  @RequirePermissions(COMMAND_READ)
  @Get(":id/verify")
  async verify(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ReproductionVerdict> {
    return this.service.verify(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COMMAND_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly HealthIndexAssessment[]> {
    return this.service.list(tenantOf(principal));
  }

  /**
   * The assessment standing for one index at one period, or `null` where none was ever computed. `null` rather
   * than a 404 because an unassessed period is an ordinary state of an institution's record — most periods are
   * unassessed until somebody runs them.
   */
  @RequirePermissions(COMMAND_READ)
  @Get("by-index/:indexKey/period/:period")
  async findForPeriod(
    @CurrentPrincipal() principal: Principal,
    @Param("indexKey") indexKey: string,
    @Param("period") period: string,
  ): Promise<HealthIndexAssessment | null> {
    return this.service.findForPeriod(tenantOf(principal), indexKey, periodOf(period));
  }

  /**
   * The scores leading up to a period, oldest first — the series the trend and sustained-decline engines read.
   * Invalidated assessments are absent, because a withdrawn figure is not a point a trend may be drawn through:
   * a decline computed across a score the institution has taken back would be an alarm about arithmetic nobody
   * stands behind.
   */
  @RequirePermissions(COMMAND_READ)
  @Get("by-index/:indexKey/history/:period")
  async history(
    @CurrentPrincipal() principal: Principal,
    @Param("indexKey") indexKey: string,
    @Param("period") period: string,
  ): Promise<readonly HealthIndexAssessment[]> {
    return this.service.history(tenantOf(principal), indexKey, periodOf(period));
  }

  @RequirePermissions(COMMAND_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<HealthIndexAssessment> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
