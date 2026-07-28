import type { Principal } from "@knowget/auth";
import { type ForecastModel, ForecastModelService } from "@knowget/predictive-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  FORECAST_MANAGE,
  FORECAST_READ,
  parseBody,
  tenantOf,
  versionOf,
} from "./predictive-intelligence-http";
import {
  amendModelSchema,
  draftModelSchema,
  publishModelSchema,
} from "./predictive-intelligence.dto";
import { PI_MODEL_SERVICE } from "./predictive-intelligence.tokens";

/**
 * REST surface for forecast models (P2-D28) — the named, frozen, versioned ways an institution may project.
 *
 * Publishing freezes, and everything about this surface follows from that. A published version cannot be
 * amended, only revised into a new draft carrying its settings forward, because every run that pinned version
 * 3 recorded its method by reference: editing version 3 afterwards would rewrite the inputs of forecasts that
 * have already been published and acted on, and the digest would go on agreeing while the thing it attested
 * to had quietly changed underneath it.
 *
 * Publication is `forecast:manage` rather than `forecast:operate`, and it takes a body naming the backtest
 * that earned it. The aggregate refuses a backtest that did not beat carrying the last figure forward, so the
 * gate that matters is the score rather than the second signature — but deciding what the institution is
 * permitted to project with is a standing decision, made by people who answer for the method, and not an act
 * of whichever operator happens to be producing an answer with it.
 */
@Controller("forecast/models")
export class ForecastModelController {
  constructor(@Inject(PI_MODEL_SERVICE) private readonly service: ForecastModelService) {}

  /** Open a draft. Nothing may be forecast with it until a backtest earns it a version. */
  @RequirePermissions(FORECAST_MANAGE)
  @Post()
  @HttpCode(201)
  async draft(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ForecastModel> {
    const dto = parseBody(draftModelSchema, body);
    return this.service.draft({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      modelKey: dto.modelKey,
      name: dto.name,
      description: dto.description ?? null,
      method: dto.method,
      parameters: dto.parameters,
      confidenceLevels: dto.confidenceLevels,
    });
  }

  /** Change a draft in place. Refused on anything published — that is what a revision is for. */
  @RequirePermissions(FORECAST_MANAGE)
  @Post(":id/amend")
  @HttpCode(200)
  async amend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ForecastModel> {
    const dto = parseBody(amendModelSchema, body);
    return this.service.amend(tenantOf(principal), id as Uuid, dto);
  }

  /**
   * Open a new draft from a published or retired version, carrying its settings forward.
   *
   * `201` rather than `200`, because this mints an aggregate rather than changing one: new id, version back
   * to `0`, same model key. The version being revised keeps standing for exactly what it stood for, and both
   * versions stay on the record. An empty body is meaningful — it opens the same method again, to be
   * re-earned against history that has moved since it was last scored.
   */
  @RequirePermissions(FORECAST_MANAGE)
  @Post(":id/revise")
  @HttpCode(201)
  async revise(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ForecastModel> {
    const dto = parseBody(amendModelSchema, body);
    return this.service.revise(tenantOf(principal), id as Uuid, dto);
  }

  /**
   * Freeze the draft at a version, on the evidence of a backtest.
   *
   * The version may be supplied or left to the service, which takes the next free one under the key.
   * Supplying it is for the institution that numbers its methods deliberately; omitting it is for everyone
   * else. Either way a number already taken is refused, because `(modelKey, version)` is what a run pins.
   */
  @RequirePermissions(FORECAST_MANAGE)
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ForecastModel> {
    const dto = parseBody(publishModelSchema, body);
    return this.service.publish(tenantOf(principal), id as Uuid, {
      backtestId: dto.backtestId as Uuid,
      version: dto.version,
    });
  }

  /**
   * Withdraw a published version from use. Runs that pinned it are untouched and stay reproducible — a
   * retired method is one the institution has stopped projecting with, not one it has stopped standing behind.
   */
  @RequirePermissions(FORECAST_MANAGE)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ForecastModel> {
    return this.service.retire(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FORECAST_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly ForecastModel[]> {
    return this.service.list(tenantOf(principal));
  }

  /** Everything the institution may currently project with. */
  @RequirePermissions(FORECAST_READ)
  @Get("published")
  async listPublished(@CurrentPrincipal() principal: Principal): Promise<readonly ForecastModel[]> {
    return this.service.listPublished(tenantOf(principal));
  }

  /** The version standing under a key today — what a fresh run against it would pin. */
  @RequirePermissions(FORECAST_READ)
  @Get("by-key/:modelKey/published")
  async findPublished(
    @CurrentPrincipal() principal: Principal,
    @Param("modelKey") modelKey: string,
  ): Promise<ForecastModel | null> {
    return this.service.findPublished(tenantOf(principal), modelKey);
  }

  /**
   * Exactly the version a run pinned, however long ago and whatever has been published since.
   *
   * This is the read that makes an old run auditable rather than merely archived: the run records `modelKey`
   * and `modelVersion` and nothing else about its method, and this resolves that pair back to the frozen
   * thing itself. Declared before the collection route so the version segment is never read as a keyword.
   */
  @RequirePermissions(FORECAST_READ)
  @Get("by-key/:modelKey/versions/:version")
  async findVersion(
    @CurrentPrincipal() principal: Principal,
    @Param("modelKey") modelKey: string,
    @Param("version") version: string,
  ): Promise<ForecastModel | null> {
    return this.service.findVersion(tenantOf(principal), modelKey, versionOf(version));
  }

  /** Every version ever opened under a key, oldest first — how a method arrived at what it now is. */
  @RequirePermissions(FORECAST_READ)
  @Get("by-key/:modelKey/versions")
  async listVersions(
    @CurrentPrincipal() principal: Principal,
    @Param("modelKey") modelKey: string,
  ): Promise<readonly ForecastModel[]> {
    return this.service.listVersions(tenantOf(principal), modelKey);
  }

  @RequirePermissions(FORECAST_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ForecastModel> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }

  /**
   * Discard a draft that was never published. Refused on anything carrying a version, because a version is
   * what a run pinned and removing it would leave a published forecast pointing at a method that is gone.
   */
  @RequirePermissions(FORECAST_MANAGE)
  @Delete(":id")
  @HttpCode(204)
  async discard(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<void> {
    await this.service.discard(tenantOf(principal), id as Uuid);
  }
}
