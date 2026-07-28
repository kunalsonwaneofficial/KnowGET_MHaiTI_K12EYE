import type { Principal } from "@knowget/auth";
import { type Backtest, BacktestService } from "@knowget/predictive-intelligence";
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
import { runBacktestSchema } from "./predictive-intelligence.dto";
import { PI_BACKTEST_SERVICE } from "./predictive-intelligence.tokens";

/**
 * REST surface for backtests (P2-D28) — what a method is actually worth against history it was not fitted on.
 *
 * A backtest is how a model earns publication, and it is the reason publication is a claim rather than a
 * preference. The series is split, the method is fitted on the earlier part only, the later part is projected
 * and then compared against what really happened, and the whole comparison is kept — every projected point
 * beside its actual — so the verdict can be re-derived rather than trusted.
 *
 * The baseline is deliberately unflattering: carrying the last observed figure forward. A method that cannot
 * beat that has not earned the right to be called a forecast, whatever its absolute error looks like, because
 * an institution that could have done as well by assuming nothing changes has gained nothing from the model.
 *
 * Nothing here is ever revised. A retune is scored beside the first reading rather than over it, so the
 * sequence of what a method was worth — including the attempts that failed — stays visible.
 */
@Controller("forecast/backtests")
export class BacktestController {
  constructor(@Inject(PI_BACKTEST_SERVICE) private readonly service: BacktestService) {}

  /**
   * Score a model against a series.
   *
   * Omitting the holdout takes the largest honest one the series can support, and that is the right default:
   * a caller who chooses the holdout chooses how flattering the score is, and the least interesting way to
   * pass a backtest is to hold out almost nothing.
   */
  @RequirePermissions(FORECAST_OPERATE)
  @Post()
  @HttpCode(201)
  async run(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Backtest> {
    const dto = parseBody(runBacktestSchema, body);
    return this.service.run(tenantOf(principal), {
      seriesId: dto.seriesId as Uuid,
      modelId: dto.modelId as Uuid,
      holdoutSize: dto.holdoutSize,
      ranByUserId: actorOf(principal),
    });
  }

  @RequirePermissions(FORECAST_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly Backtest[]> {
    return this.service.list(tenantOf(principal));
  }

  /**
   * The most recent scoring of one model against one series, passing or failing.
   *
   * Deliberately not filtered to publishable scores. The question is what the latest evidence says, and a
   * model that just failed its holdout is precisely the case where the honest answer is the failing score
   * rather than the last passing one — showing only successes would make a retune look like a first attempt.
   */
  @RequirePermissions(FORECAST_READ)
  @Get("by-pair/:seriesId/:modelId")
  async findLatestForPair(
    @CurrentPrincipal() principal: Principal,
    @Param("seriesId") seriesId: string,
    @Param("modelId") modelId: string,
  ): Promise<Backtest | null> {
    return this.service.findLatestForPair(tenantOf(principal), seriesId as Uuid, modelId as Uuid);
  }

  /** Every history one method has been tried against — where it holds up, and where it does not. */
  @RequirePermissions(FORECAST_READ)
  @Get("by-model/:modelId")
  async listByModel(
    @CurrentPrincipal() principal: Principal,
    @Param("modelId") modelId: string,
  ): Promise<readonly Backtest[]> {
    return this.service.listByModel(tenantOf(principal), modelId as Uuid);
  }

  /** Every method tried against one history — how an institution arrived at the one it publishes. */
  @RequirePermissions(FORECAST_READ)
  @Get("by-series/:seriesId")
  async listBySeries(
    @CurrentPrincipal() principal: Principal,
    @Param("seriesId") seriesId: string,
  ): Promise<readonly Backtest[]> {
    return this.service.listBySeries(tenantOf(principal), seriesId as Uuid);
  }

  @RequirePermissions(FORECAST_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Backtest> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
