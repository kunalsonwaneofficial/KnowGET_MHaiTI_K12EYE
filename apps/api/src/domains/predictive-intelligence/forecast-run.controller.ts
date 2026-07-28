import type { Principal } from "@knowget/auth";
import {
  type ForecastRun,
  ForecastRunService,
  type ReproductionResult,
} from "@knowget/predictive-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  FORECAST_OPERATE,
  FORECAST_READ,
  actorOf,
  parseBody,
  tenantOf,
} from "./predictive-intelligence-http";
import { produceForecastSchema, supersedeRunSchema } from "./predictive-intelligence.dto";
import { PI_FORECAST_RUN_SERVICE } from "./predictive-intelligence.tokens";

/**
 * REST surface for forecast runs (P2-D28) — where this contract's governing rule is actually enforced.
 *
 * Every response from this controller carries intervals at the levels the model published, the assumptions
 * the projection stands on, a graded assessment of how much the numbers can bear, and the digest that lets
 * anyone recompute it. None of those is optional and none can be suppressed by a request, because a forecast
 * without them is not a smaller forecast — it is a number with a date on it that reads as a promise.
 *
 * Nothing here is ever edited. A run is born completed and leaves by being superseded (something better
 * replaced it) or invalidated (it no longer reproduces, because the history underneath it was corrected).
 * Both keep the original legible, which is the point: the institution decided something on the strength of
 * what this said, and the record of that has to survive the correction.
 *
 * `producedByUserId` is taken from the principal and never from the body. A projection reproduces exactly, and
 * whose judgement stood behind the assumptions it was produced under is the other half of what makes it
 * accountable — an author a caller could type in is a field rather than an accountability record.
 */
@Controller("forecast/runs")
export class ForecastRunController {
  constructor(@Inject(PI_FORECAST_RUN_SERVICE) private readonly service: ForecastRunService) {}

  /**
   * Produce a forecast.
   *
   * At least one assumption is required, at the edge as well as in the domain. A projection standing on no
   * declared grounds is not a weaker forecast, it is an undeclared one — and the assumptions are pinned into
   * the run rather than referenced, so a policy that changes next term cannot retroactively alter what this
   * forecast claimed to be resting on.
   */
  @RequirePermissions(FORECAST_OPERATE)
  @Post()
  @HttpCode(201)
  async produce(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ForecastRun> {
    const dto = parseBody(produceForecastSchema, body);
    return this.service.produce(tenantOf(principal), {
      seriesId: dto.seriesId as Uuid,
      modelId: dto.modelId as Uuid,
      horizon: dto.horizon,
      assumptions: dto.assumptions.map((assumption) => ({
        assumptionKey: assumption.assumptionKey,
        kind: assumption.kind,
        basis: assumption.basis,
        holderId: assumption.holderId ?? null,
        reference: assumption.reference ?? null,
        expectedValue: assumption.expectedValue ?? null,
      })),
      producedByUserId: actorOf(principal),
    });
  }

  /**
   * Retire a run in favour of another. The replacement is loaded before the link is recorded, never taken on
   * trust — a superseded run pointing at nothing would say only that it had been retired, and not by what.
   */
  @RequirePermissions(FORECAST_OPERATE)
  @Post(":id/supersede")
  @HttpCode(200)
  async supersede(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ForecastRun> {
    const dto = parseBody(supersedeRunSchema, body);
    return this.service.supersede(tenantOf(principal), id as Uuid, dto.replacementRunId as Uuid);
  }

  /**
   * Mark a run as no longer reproducing, on the evidence of a re-run.
   *
   * The drift codes are computed rather than accepted: the service reproduces the run against today's series
   * and model and records precisely which inputs moved. A caller cannot declare a forecast invalid, and that
   * matters — invalidation is the platform admitting that something it published no longer holds, and it is
   * only worth anything if the platform is the one that establishes it.
   */
  @RequirePermissions(FORECAST_OPERATE)
  @Post(":id/invalidate")
  @HttpCode(200)
  async invalidate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ForecastRun> {
    return this.service.invalidate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FORECAST_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly ForecastRun[]> {
    return this.service.list(tenantOf(principal));
  }

  /**
   * Has this exact question already been answered?
   *
   * The digest is over the pinned inputs — series key and version, model key and version, resolved
   * parameters, horizon, levels, assumptions — so an identical digest means an identical question, and a
   * completed run under it is the answer without recomputing. A completed run is preferred over a superseded
   * or invalidated one whatever the dates say, because a caller asking by digest wants an answer it can use.
   */
  @RequirePermissions(FORECAST_READ)
  @Get("by-digest/:digest")
  async findByDigest(
    @CurrentPrincipal() principal: Principal,
    @Param("digest") digest: string,
  ): Promise<ForecastRun | null> {
    return this.service.findByDigest(tenantOf(principal), digest);
  }

  /** The forecast currently standing for a series. Superseded and invalidated runs are not candidates. */
  @RequirePermissions(FORECAST_READ)
  @Get("by-series/:seriesId/current")
  async findCurrentForSeries(
    @CurrentPrincipal() principal: Principal,
    @Param("seriesId") seriesId: string,
  ): Promise<ForecastRun | null> {
    return this.service.findCurrentForSeries(tenantOf(principal), seriesId as Uuid);
  }

  /** Everything ever projected over one series, standing or not — how the outlook moved, and when. */
  @RequirePermissions(FORECAST_READ)
  @Get("by-series/:seriesId")
  async listBySeries(
    @CurrentPrincipal() principal: Principal,
    @Param("seriesId") seriesId: string,
  ): Promise<readonly ForecastRun[]> {
    return this.service.listBySeries(tenantOf(principal), seriesId as Uuid);
  }

  /** Everything one model has been used to produce — the blast radius of retiring it. */
  @RequirePermissions(FORECAST_READ)
  @Get("by-model/:modelId")
  async listByModel(
    @CurrentPrincipal() principal: Principal,
    @Param("modelId") modelId: string,
  ): Promise<readonly ForecastRun[]> {
    return this.service.listByModel(tenantOf(principal), modelId as Uuid);
  }

  /**
   * Re-derive the run from its pinned inputs and report whether it still reproduces.
   *
   * A read rather than a write — nothing is recorded and the run's status is untouched, so asking is free of
   * consequence and can be asked as often as anyone likes. It is nonetheless `forecast:operate` rather than
   * `forecast:read`, because it re-runs the engines: this is the operator working the machinery to check its
   * own output, not an observer inspecting what was published.
   *
   * When the answer is negative, {@link invalidate} is the act that puts it on the record. Keeping the two
   * apart means the platform can be asked "does this still hold" without that question itself changing
   * anything — and it means invalidation stays a deliberate act rather than a side effect of curiosity.
   */
  @RequirePermissions(FORECAST_OPERATE)
  @Get(":id/verification")
  async verify(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ReproductionResult> {
    return this.service.verify(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FORECAST_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ForecastRun> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
