import type { Principal } from "@knowget/auth";
import { type ObservationSeries, ObservationSeriesService } from "@knowget/predictive-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  FORECAST_READ,
  FORECAST_RECORD,
  parseBody,
  tenantOf,
} from "./predictive-intelligence-http";
import {
  correctObservationSchema,
  declareCycleSchema,
  declareSeriesSchema,
  recordObservationsSchema,
  withdrawObservationSchema,
} from "./predictive-intelligence.dto";
import { PI_SERIES_SERVICE } from "./predictive-intelligence.tokens";

/**
 * REST surface for observation series (P2-D28) — the measured history everything downstream is projected from.
 *
 * This is the evidence layer, and it is gated apart from everything else in the domain for one reason: a
 * correction here is retroactive. Every published model was fitted against this history, every backtest was
 * scored on it, and every run pinned the version of it that stood when it was produced. Restating a figure
 * does not adjust a number — it changes what a set of already-published forecasts were computed from, which is
 * why `forecast:record` is not implied by the ability to run a projection and is not granted by it.
 *
 * Periods are integers on the series' own grid rather than dates, and they therefore travel in bodies rather
 * than paths. That is not only house convention: a period is a coordinate whose meaning the series supplies,
 * and a bare integer in a URL invites a caller to treat it as one the platform could interpret on its own.
 */
@Controller("forecast/series")
export class ObservationSeriesController {
  constructor(@Inject(PI_SERIES_SERVICE) private readonly service: ObservationSeriesService) {}

  /**
   * Open a series to measure something.
   *
   * The subject reference is optional because not every series is about a record — an institution-wide
   * enrolment total is measured about the institution, and inventing a subject for it would make the series
   * claim a specificity it does not have.
   */
  @RequirePermissions(FORECAST_RECORD)
  @Post()
  @HttpCode(201)
  async declare(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ObservationSeries> {
    const dto = parseBody(declareSeriesSchema, body);
    return this.service.declare({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      seriesKey: dto.seriesKey,
      metricKey: dto.metricKey,
      sourceDomain: dto.sourceDomain,
      subjectRef: dto.subjectRef ?? null,
      grain: dto.grain,
      direction: dto.direction,
      cycleLength: dto.cycleLength ?? null,
      unit: dto.unit ?? null,
    });
  }

  /**
   * Declare the season, or declare that there is none.
   *
   * `null` is a statement rather than an omission, and the distinction is load-bearing: a series with no
   * declared cycle cannot be projected seasonally at all, while one declared acyclic has been examined and
   * found to have no season. Both refuse a seasonal method; only one of them has been thought about.
   */
  @RequirePermissions(FORECAST_RECORD)
  @Post(":id/cycle")
  @HttpCode(200)
  async declareCycle(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ObservationSeries> {
    const dto = parseBody(declareCycleSchema, body);
    return this.service.declareCycle(tenantOf(principal), id as Uuid, dto.cycleLength);
  }

  /**
   * Append readings.
   *
   * A batch is one act on the series and advances its version once, so a month of daily figures arriving
   * together does not produce thirty versions no forecast could ever have been pinned to. A period already
   * present is refused rather than overwritten — restating one is a correction, and the difference between an
   * append and a correction is exactly the difference between new evidence and revised evidence.
   */
  @RequirePermissions(FORECAST_RECORD)
  @Post(":id/observations")
  @HttpCode(200)
  async record(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ObservationSeries> {
    const dto = parseBody(recordObservationsSchema, body);
    return this.service.record(tenantOf(principal), id as Uuid, dto.observations);
  }

  /** Restate a reading. Announced separately because it invalidates conclusions an append does not. */
  @RequirePermissions(FORECAST_RECORD)
  @Post(":id/observations/correct")
  @HttpCode(200)
  async correct(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ObservationSeries> {
    const dto = parseBody(correctObservationSchema, body);
    return this.service.correct(tenantOf(principal), id as Uuid, dto.period, dto.value, dto.label);
  }

  /** Take a reading back entirely. A period nobody measured is not a period measured at zero. */
  @RequirePermissions(FORECAST_RECORD)
  @Post(":id/observations/withdraw")
  @HttpCode(200)
  async withdraw(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ObservationSeries> {
    const dto = parseBody(withdrawObservationSchema, body);
    return this.service.withdraw(tenantOf(principal), id as Uuid, dto.period);
  }

  /** Stop admitting readings. Everything already measured stays exactly as it is. */
  @RequirePermissions(FORECAST_RECORD)
  @Post(":id/close")
  @HttpCode(200)
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ObservationSeries> {
    return this.service.close(tenantOf(principal), id as Uuid);
  }

  /** Admit readings again — a cohort that resumed, a metric an institution went back to keeping. */
  @RequirePermissions(FORECAST_RECORD)
  @Post(":id/reopen")
  @HttpCode(200)
  async reopen(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ObservationSeries> {
    return this.service.reopen(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FORECAST_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly ObservationSeries[]> {
    return this.service.list(tenantOf(principal));
  }

  /** The series an organization keeps under a key, or `null` where it keeps none. */
  @RequirePermissions(FORECAST_READ)
  @Get("by-key/:organizationId/:seriesKey")
  async findByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
    @Param("seriesKey") seriesKey: string,
  ): Promise<ObservationSeries | null> {
    return this.service.findByKey(tenantOf(principal), organizationId as Uuid, seriesKey);
  }

  /**
   * Every series measuring one metric, across however many subjects it is measured on. What a plan reviewing
   * itself against that metric reads, and what a change in the metric's definition puts in question.
   */
  @RequirePermissions(FORECAST_READ)
  @Get("by-metric/:metricKey")
  async listByMetric(
    @CurrentPrincipal() principal: Principal,
    @Param("metricKey") metricKey: string,
  ): Promise<readonly ObservationSeries[]> {
    return this.service.listByMetric(tenantOf(principal), metricKey);
  }

  /** Every series measured about one record in one operational domain — one cohort's whole measured life. */
  @RequirePermissions(FORECAST_READ)
  @Get("by-subject/:sourceDomain/:subjectRef")
  async listBySubject(
    @CurrentPrincipal() principal: Principal,
    @Param("sourceDomain") sourceDomain: string,
    @Param("subjectRef") subjectRef: string,
  ): Promise<readonly ObservationSeries[]> {
    return this.service.listBySubject(tenantOf(principal), sourceDomain, subjectRef);
  }

  @RequirePermissions(FORECAST_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ObservationSeries> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
