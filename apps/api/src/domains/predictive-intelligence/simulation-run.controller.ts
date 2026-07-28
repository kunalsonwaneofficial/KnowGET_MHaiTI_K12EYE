import type { Principal } from "@knowget/auth";
import { type SimulationRun, SimulationRunService } from "@knowget/predictive-intelligence";
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
import { produceSimulationSchema, supersedeRunSchema } from "./predictive-intelligence.dto";
import { PI_SIMULATION_RUN_SERVICE } from "./predictive-intelligence.tokens";

/**
 * REST surface for simulation runs (P2-D28) — a published case run against a standing forecast.
 *
 * Nothing about the projection is restated in a request. The baseline is loaded by id and re-verified before a
 * single lever is applied, so a simulation cannot quietly depart from numbers other than the ones the
 * institution actually published — which is what makes a delta meaningful rather than merely arithmetic.
 *
 * The uncertainty of the baseline is inherited rather than recomputed, and that is the honest treatment. A
 * lever is a decision, not a measurement: applying one does not narrow what is knowable about the future, so a
 * scenario built on a wide forecast is a wide scenario however confident the lever's author is. Where a lever
 * overrides a projected value outright the run says so, because an overridden point is an assertion and no
 * longer a projection, and the interval around it was earned by a number that is no longer there.
 *
 * `listStandingOn` is the read that matters most at the worst moment. When a forecast is invalidated the
 * institution has to be told which of its explored outcomes just stopped meaning what they said, and a
 * question that is expensive to ask is a question that stops being asked.
 */
@Controller("forecast/simulations")
export class SimulationRunController {
  constructor(@Inject(PI_SIMULATION_RUN_SERVICE) private readonly service: SimulationRunService) {}

  /**
   * Run a case against a forecast.
   *
   * Both sides are snapshotted into the result — the scenario's key and lever-set version, the baseline's
   * whole pinned identity down to its digest. The digest is the load-bearing one: once the baseline is
   * superseded its id still resolves but no longer says what was forecast, while the digest still does.
   */
  @RequirePermissions(FORECAST_OPERATE)
  @Post()
  @HttpCode(201)
  async produce(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<SimulationRun> {
    const dto = parseBody(produceSimulationSchema, body);
    return this.service.produce(tenantOf(principal), {
      scenarioId: dto.scenarioId as Uuid,
      forecastRunId: dto.forecastRunId as Uuid,
      ranByUserId: actorOf(principal),
    });
  }

  /** Retire an outcome in favour of another. The replacement is loaded before the link is recorded. */
  @RequirePermissions(FORECAST_OPERATE)
  @Post(":id/supersede")
  @HttpCode(200)
  async supersede(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<SimulationRun> {
    const dto = parseBody(supersedeRunSchema, body);
    return this.service.supersede(tenantOf(principal), id as Uuid, dto.replacementRunId as Uuid);
  }

  @RequirePermissions(FORECAST_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly SimulationRun[]> {
    return this.service.list(tenantOf(principal));
  }

  /** The outcome currently standing for a case. Superseded ones are history, not candidates. */
  @RequirePermissions(FORECAST_READ)
  @Get("by-scenario/:scenarioId/current")
  async findCurrentForScenario(
    @CurrentPrincipal() principal: Principal,
    @Param("scenarioId") scenarioId: string,
  ): Promise<SimulationRun | null> {
    return this.service.findCurrentForScenario(tenantOf(principal), scenarioId as Uuid);
  }

  /** Every time a case has been run — how the answer to one question moved as the outlook did. */
  @RequirePermissions(FORECAST_READ)
  @Get("by-scenario/:scenarioId")
  async listByScenario(
    @CurrentPrincipal() principal: Principal,
    @Param("scenarioId") scenarioId: string,
  ): Promise<readonly SimulationRun[]> {
    return this.service.listByScenario(tenantOf(principal), scenarioId as Uuid);
  }

  /** Everything explored on top of one forecast — what withdrawing it calls into doubt. */
  @RequirePermissions(FORECAST_READ)
  @Get("by-forecast-run/:forecastRunId")
  async listStandingOn(
    @CurrentPrincipal() principal: Principal,
    @Param("forecastRunId") forecastRunId: string,
  ): Promise<readonly SimulationRun[]> {
    return this.service.listStandingOn(tenantOf(principal), forecastRunId as Uuid);
  }

  @RequirePermissions(FORECAST_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<SimulationRun> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
