import type { Principal } from "@knowget/auth";
import { type Scenario, ScenarioService } from "@knowget/predictive-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  FORECAST_MANAGE,
  FORECAST_READ,
  parseBody,
  tenantOf,
} from "./predictive-intelligence-http";
import {
  addLeversSchema,
  amendLeverSchema,
  amendScenarioSchema,
  declareScenarioSchema,
  reviseScenarioSchema,
} from "./predictive-intelligence.dto";
import { PI_SCENARIO_SERVICE } from "./predictive-intelligence.tokens";

/**
 * REST surface for scenarios (P2-D28) — the named cases an institution is willing to explore.
 *
 * A scenario is a set of levers and nothing else: it holds no numbers of its own, projects nothing, and means
 * nothing until it is run against a standing forecast. That separation is what keeps "what if we added two
 * sections" a question the institution can ask repeatedly as the outlook changes, rather than an answer frozen
 * to whatever the forecast happened to say on the day someone wrote the case down.
 *
 * Publishing freezes the lever set, for the same reason publishing freezes a model. A simulated outcome pins
 * the scenario's version, and a lever edited afterwards would change what a recorded outcome claimed to be a
 * departure *from*. The way to change a published case is {@link revise}, which mints a sibling under its own
 * key — a second edition of a case the record already cites would be a rewriting of that record.
 *
 * Lever order is a property of the set rather than of any lever in it, and it matters: an override applied
 * after a multiplier is a different scenario from a multiplier applied after an override.
 */
@Controller("forecast/scenarios")
export class ScenarioController {
  constructor(@Inject(PI_SCENARIO_SERVICE) private readonly service: ScenarioService) {}

  /** Open a case. Levers may be supplied here or added afterwards while it is still a draft. */
  @RequirePermissions(FORECAST_MANAGE)
  @Post()
  @HttpCode(201)
  async declare(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Scenario> {
    const dto = parseBody(declareScenarioSchema, body);
    return this.service.declare({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      scenarioKey: dto.scenarioKey,
      name: dto.name,
      description: dto.description ?? null,
      levers: dto.levers,
    });
  }

  /** Rename or redescribe a draft. The levers are changed through their own routes, never through this one. */
  @RequirePermissions(FORECAST_MANAGE)
  @Post(":id/amend")
  @HttpCode(200)
  async amend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Scenario> {
    const dto = parseBody(amendScenarioSchema, body);
    return this.service.amend(tenantOf(principal), id as Uuid, dto);
  }

  /**
   * Open a sibling case from a published one, carrying its levers forward.
   *
   * `201`, because this mints an aggregate rather than changing one. The key is required and is not the key
   * being revised: a published scenario is cited by every outcome simulated against it, so what a revision
   * produces is a new case under its own name rather than a second version of one the record already refers to.
   */
  @RequirePermissions(FORECAST_MANAGE)
  @Post(":id/revise")
  @HttpCode(201)
  async revise(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Scenario> {
    const dto = parseBody(reviseScenarioSchema, body);
    return this.service.revise(tenantOf(principal), id as Uuid, dto.scenarioKey, {
      name: dto.name,
      description: dto.description,
    });
  }

  /** Add levers to a draft, in the order they should apply. */
  @RequirePermissions(FORECAST_MANAGE)
  @Post(":id/levers")
  @HttpCode(200)
  async addLevers(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Scenario> {
    const dto = parseBody(addLeversSchema, body);
    return this.service.addLevers(tenantOf(principal), id as Uuid, dto.levers);
  }

  /** Restate one lever. Its key is its identity and is therefore in the path, not the body. */
  @RequirePermissions(FORECAST_MANAGE)
  @Post(":id/levers/:leverKey/amend")
  @HttpCode(200)
  async amendLever(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("leverKey") leverKey: string,
    @Body() body: unknown,
  ): Promise<Scenario> {
    const dto = parseBody(amendLeverSchema, body);
    return this.service.amendLever(tenantOf(principal), id as Uuid, leverKey, dto);
  }

  /** Freeze the lever set and admit the case to simulation. */
  @RequirePermissions(FORECAST_MANAGE)
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Scenario> {
    return this.service.publish(tenantOf(principal), id as Uuid);
  }

  /**
   * Retire a case from use. Archived rather than removed, because outcomes cite it and an archived case still
   * answers what they were exploring — a deleted one would leave them describing a departure from nothing.
   */
  @RequirePermissions(FORECAST_MANAGE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Scenario> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FORECAST_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly Scenario[]> {
    return this.service.list(tenantOf(principal));
  }

  /** The cases that may currently be simulated against. */
  @RequirePermissions(FORECAST_READ)
  @Get("published")
  async listPublished(@CurrentPrincipal() principal: Principal): Promise<readonly Scenario[]> {
    return this.service.listPublished(tenantOf(principal));
  }

  /** The case an organization keeps under a key, or `null` where it keeps none. */
  @RequirePermissions(FORECAST_READ)
  @Get("by-key/:organizationId/:scenarioKey")
  async findByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
    @Param("scenarioKey") scenarioKey: string,
  ): Promise<Scenario | null> {
    return this.service.findByKey(tenantOf(principal), organizationId as Uuid, scenarioKey);
  }

  /** Every case one organization has ever written down — drafts, published and archived alike. */
  @RequirePermissions(FORECAST_READ)
  @Get("by-organization/:organizationId")
  async listByOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly Scenario[]> {
    return this.service.listByOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FORECAST_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Scenario> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }

  /** Take a lever out of a draft. Returns the case, because what remains is the thing the caller needs. */
  @RequirePermissions(FORECAST_MANAGE)
  @Delete(":id/levers/:leverKey")
  @HttpCode(200)
  async removeLever(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("leverKey") leverKey: string,
  ): Promise<Scenario> {
    return this.service.removeLever(tenantOf(principal), id as Uuid, leverKey);
  }

  /**
   * Discard a draft nothing was ever simulated against. Refused on a published case, which is archived — the
   * distinction is whether anything in the record depends on the case still being there to explain itself.
   */
  @RequirePermissions(FORECAST_MANAGE)
  @Delete(":id")
  @HttpCode(204)
  async discard(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<void> {
    await this.service.discard(tenantOf(principal), id as Uuid);
  }
}
