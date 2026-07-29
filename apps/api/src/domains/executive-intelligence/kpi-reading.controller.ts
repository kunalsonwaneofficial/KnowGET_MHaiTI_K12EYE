import type { Principal } from "@knowget/auth";
import { type KpiReading, KpiReadingService } from "@knowget/executive-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  COMMAND_MEASURE,
  COMMAND_READ,
  parseBody,
  periodOf,
  tenantOf,
} from "./executive-intelligence-http";
import { recordKpiReadingSchema, withdrawKpiReadingSchema } from "./executive-intelligence.dto";
import { EI_KPI_READING_SERVICE } from "./executive-intelligence.tokens";

/**
 * REST surface for KPI readings (P2-D29) — the figures an institution has actually filed.
 *
 * This is the contract's evidence surface, and the only one in the domain that can change what everything
 * downstream already stood on. An assessment consumes the readings standing at the moment it runs and an issued
 * briefing pins the number it reported, so a reading recorded here is not a row: it is the thing a filed score
 * and a board minute are both ultimately resting on.
 *
 * Every reading carries citations, and the domain refuses one that cites nothing or cites evidence the platform
 * cannot reach. That refusal is the contract's third clause made structural rather than aspirational — there is
 * no route here that files a figure now and attaches its provenance afterwards, because an indicator whose
 * numbers are *usually* traceable teaches its readers that the provenance link is decoration.
 *
 * There is no correction route and no delete. A figure that turns out to be wrong is withdrawn with a reason,
 * which frees its period for a fresh reading and leaves the original in place saying what the institution
 * reported and that it stopped standing behind it. That is the whole difference between a restated quarter and a
 * quarter that quietly became a different quarter.
 */
@Controller("command/kpi-readings")
export class KpiReadingController {
  constructor(@Inject(EI_KPI_READING_SERVICE) private readonly service: KpiReadingService) {}

  /**
   * File a measurement against a live indicator, with the evidence it rests on.
   *
   * The indicator is named by id in the body rather than in the path because a reading is a statement about an
   * indicator *at a period*, and neither half identifies it alone. The domain refuses a second standing reading
   * at a period that already has one, so a re-file is a withdrawal followed by a record and never a silent
   * overwrite of a number somebody may already have reported.
   */
  @RequirePermissions(COMMAND_MEASURE)
  @Post()
  @HttpCode(201)
  async record(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<KpiReading> {
    const dto = parseBody(recordKpiReadingSchema, body);
    return this.service.record(tenantOf(principal), dto.kpiDefinitionId as Uuid, {
      period: dto.period,
      rawValue: dto.rawValue,
      citations: dto.citations,
    });
  }

  /**
   * Stop standing behind a filed figure.
   *
   * The reason is compulsory, unlike every other reason in this domain. A withdrawal is a retroactive edit to
   * history an assessment already consumed, and the person reconstructing a restated period later cannot ask
   * whoever did it — so the record has to explain itself without them.
   */
  @RequirePermissions(COMMAND_MEASURE)
  @Post(":id/withdraw")
  @HttpCode(200)
  async withdraw(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<KpiReading> {
    const dto = parseBody(withdrawKpiReadingSchema, body);
    return this.service.withdraw(tenantOf(principal), id as Uuid, dto.reason);
  }

  @RequirePermissions(COMMAND_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly KpiReading[]> {
    return this.service.list(tenantOf(principal));
  }

  /**
   * The most recent standing figure for each of an organization's indicators — the read a dashboard's KPI
   * panels are served from. Withdrawn readings are absent by construction, so a panel never shows a number the
   * institution has taken back.
   */
  @RequirePermissions(COMMAND_READ)
  @Get("latest/:organizationId")
  async listLatest(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly KpiReading[]> {
    return this.service.listLatest(tenantOf(principal), organizationId as Uuid);
  }

  /**
   * One indicator's whole series, oldest first, withdrawals included. Withdrawn figures are part of the answer
   * to "what has this institution reported" rather than an erasure of it, and a series that hid them would make
   * a restated period indistinguishable from one that was never questioned.
   */
  @RequirePermissions(COMMAND_READ)
  @Get("by-kpi/:kpiDefinitionId")
  async listByKpi(
    @CurrentPrincipal() principal: Principal,
    @Param("kpiDefinitionId") kpiDefinitionId: string,
  ): Promise<readonly KpiReading[]> {
    return this.service.listByKpi(tenantOf(principal), kpiDefinitionId as Uuid);
  }

  /**
   * The figure standing for one indicator at one period, or `null` where none stands. `null` rather than a 404
   * because a period with no filed reading is an ordinary state of an institution's measurement — it is exactly
   * what a coverage gap is made of, and the assessment engine asks this question about periods it expects to be
   * empty.
   */
  @RequirePermissions(COMMAND_READ)
  @Get("by-kpi/:kpiDefinitionId/period/:period")
  async findForPeriod(
    @CurrentPrincipal() principal: Principal,
    @Param("kpiDefinitionId") kpiDefinitionId: string,
    @Param("period") period: string,
  ): Promise<KpiReading | null> {
    return this.service.findForPeriod(
      tenantOf(principal),
      kpiDefinitionId as Uuid,
      periodOf(period),
    );
  }

  @RequirePermissions(COMMAND_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<KpiReading> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
