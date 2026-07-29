import type { Principal } from "@knowget/auth";
import { type KpiDefinition, KpiDefinitionService } from "@knowget/executive-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { COMMAND_MANAGE, COMMAND_READ, parseBody, tenantOf } from "./executive-intelligence-http";
import {
  defineKpiSchema,
  renameKpiSchema,
  retargetKpiSchema,
  reviseKpiScaleSchema,
} from "./executive-intelligence.dto";
import { EI_KPI_DEFINITION_SERVICE } from "./executive-intelligence.tokens";

/**
 * REST surface for KPI definitions (P2-D29) — the indicators an institution has decided to be measured by.
 *
 * A definition is an instrument, not a figure. It declares which pillar an indicator answers to, which domain
 * the evidence comes from, and the ladder that turns a raw measurement into a comparable score; it holds no
 * measurement of its own and says nothing about how the institution is doing.
 *
 * That separation is why the whole surface sits under `command:manage` rather than under the scope that records
 * numbers. Choosing what to measure and choosing what to report against it are different acts with different
 * consequences: an indicator's scale decides what every past and future reading of it *means*, so someone who
 * could reshape the ladder could move an institution's score without touching a single figure.
 *
 * Activation is the gate the readings surface enforces — a draft indicator accepts no measurements, so the
 * institution settles the instrument before it starts building a series with it. Retirement stops new readings
 * without disturbing the ones already filed, because a retired indicator's history is still what the periods it
 * covered were scored on.
 */
@Controller("command/kpis")
export class KpiDefinitionController {
  constructor(@Inject(EI_KPI_DEFINITION_SERVICE) private readonly service: KpiDefinitionService) {}

  /** Declare an indicator. Starts as a draft, which is where its scale can still be got wrong safely. */
  @RequirePermissions(COMMAND_MANAGE)
  @Post()
  @HttpCode(201)
  async define(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<KpiDefinition> {
    const dto = parseBody(defineKpiSchema, body);
    return this.service.define({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      kpiKey: dto.kpiKey,
      name: dto.name,
      description: dto.description ?? null,
      pillar: dto.pillar,
      sourceDomain: dto.sourceDomain,
      scale: dto.scale,
      targetScore: dto.targetScore ?? null,
    });
  }

  /**
   * Restate the ladder. Admissible only while the indicator is a draft, and the aggregate is what enforces it:
   * a scale changed under a live series would silently rescore every reading already filed against it, so a
   * chart would move without a single measurement having changed.
   */
  @RequirePermissions(COMMAND_MANAGE)
  @Post(":id/scale")
  @HttpCode(200)
  async reviseScale(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<KpiDefinition> {
    const dto = parseBody(reviseKpiScaleSchema, body);
    return this.service.reviseScale(tenantOf(principal), id as Uuid, dto.scale);
  }

  /** Retitle or redescribe an indicator. Its key is its identity and is not changed here or anywhere. */
  @RequirePermissions(COMMAND_MANAGE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<KpiDefinition> {
    const dto = parseBody(renameKpiSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto);
  }

  /**
   * Move or clear the target. Permitted on a live indicator, unlike the scale, and the difference is what each
   * one does to history: a target is what the institution is currently aiming at, so changing it restates an
   * ambition, while changing the ladder restates what every past reading was worth.
   */
  @RequirePermissions(COMMAND_MANAGE)
  @Post(":id/target")
  @HttpCode(200)
  async retarget(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<KpiDefinition> {
    const dto = parseBody(retargetKpiSchema, body);
    return this.service.retarget(tenantOf(principal), id as Uuid, dto.targetScore);
  }

  /** Admit the indicator to measurement. Readings are refused until this happens. */
  @RequirePermissions(COMMAND_MANAGE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<KpiDefinition> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  /**
   * Stop measuring against this indicator. Retired rather than removed, because the readings already filed
   * against it are what past periods were scored on — deleting the instrument would leave a filed assessment
   * citing a figure whose meaning nothing in the platform could any longer explain.
   */
  @RequirePermissions(COMMAND_MANAGE)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<KpiDefinition> {
    return this.service.retire(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COMMAND_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly KpiDefinition[]> {
    return this.service.list(tenantOf(principal));
  }

  /** The indicators an organization is currently measured by — the set an assessment will actually draw on. */
  @RequirePermissions(COMMAND_READ)
  @Get("active/:organizationId")
  async listActive(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly KpiDefinition[]> {
    return this.service.listActive(tenantOf(principal), organizationId as Uuid);
  }

  /** The indicator a tenant keeps under a key. Absent is a 404, because a key names one instrument or none. */
  @RequirePermissions(COMMAND_READ)
  @Get("by-key/:kpiKey")
  async getByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("kpiKey") kpiKey: string,
  ): Promise<KpiDefinition> {
    return this.service.getByKey(tenantOf(principal), kpiKey);
  }

  @RequirePermissions(COMMAND_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<KpiDefinition> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
