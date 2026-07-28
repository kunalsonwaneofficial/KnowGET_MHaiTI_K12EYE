import type { Principal } from "@knowget/auth";
import {
  type HealthIndexDefinition,
  HealthIndexDefinitionService,
  type RecompositionResult,
} from "@knowget/executive-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { COMMAND_MANAGE, COMMAND_READ, parseBody, tenantOf } from "./executive-intelligence-http";
import {
  defineHealthIndexSchema,
  recomposeHealthIndexSchema,
  renameHealthIndexSchema,
  reweightHealthIndexSchema,
  supersedeHealthIndexSchema,
} from "./executive-intelligence.dto";
import { EI_INDEX_DEFINITION_SERVICE } from "./executive-intelligence.tokens";

/**
 * REST surface for health index compositions (P2-D29) — how an institution has decided to weigh itself up.
 *
 * A definition is the question, not the answer. It says which of the ten pillars count and how much each one is
 * worth, and every assessment records the definition it was computed under so a reader looking at two periods
 * can tell a change of fortune from a change of question. That distinction is the whole reason this aggregate
 * exists separately from the assessments it produces.
 *
 * At most one definition per key may be published at a time, and the database's partial unique index is what
 * makes that a fact rather than an intention. Two published compositions for one key would give the same period
 * two defensible and different scores with nothing in the record to say which one was asked for.
 *
 * Weights are set whole and never one pillar at a time. They sum to a declared total, so a per-pillar route
 * would leave the composition invalid between two calls, and an assessment run in that window would be scored
 * against a composition the institution never actually held.
 *
 * A published definition is frozen, and {@link recompose} rather than {@link reweight} is how it changes: the
 * incumbent is superseded and a successor takes its place, so every assessment already filed still points at the
 * exact composition it was computed under. Reweighting a live definition would restate history rather than
 * change the future, which is precisely the failure the supersession chain exists to prevent.
 */
@Controller("command/indices")
export class HealthIndexDefinitionController {
  constructor(
    @Inject(EI_INDEX_DEFINITION_SERVICE) private readonly service: HealthIndexDefinitionService,
  ) {}

  /** Declare a composition. Starts as a draft, which is where its weights can still be argued about. */
  @RequirePermissions(COMMAND_MANAGE)
  @Post()
  @HttpCode(201)
  async define(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<HealthIndexDefinition> {
    const dto = parseBody(defineHealthIndexSchema, body);
    return this.service.define({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      indexKey: dto.indexKey,
      name: dto.name,
      description: dto.description ?? null,
      grain: dto.grain,
      weights: dto.weights,
    });
  }

  /** Restate a draft's weights, whole. Refused once published — a live composition changes by supersession. */
  @RequirePermissions(COMMAND_MANAGE)
  @Post(":id/weights")
  @HttpCode(200)
  async reweight(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<HealthIndexDefinition> {
    const dto = parseBody(reweightHealthIndexSchema, body);
    return this.service.reweight(tenantOf(principal), id as Uuid, dto.weights);
  }

  /** Retitle or redescribe. The key is the composition's identity across its whole supersession chain. */
  @RequirePermissions(COMMAND_MANAGE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<HealthIndexDefinition> {
    const dto = parseBody(renameHealthIndexSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto);
  }

  /**
   * Adopt the composition. Refused where the key already has a published incumbent, because that is the state
   * that would let one period be scored two ways.
   */
  @RequirePermissions(COMMAND_MANAGE)
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<HealthIndexDefinition> {
    return this.service.publish(tenantOf(principal), id as Uuid);
  }

  /**
   * Hand a published composition over to a named successor under the same key.
   *
   * The lower-level half of {@link recompose}, and it is exposed because the successor is not always something
   * this call should be minting: an institution that drafted next year's composition months ago, argued about
   * it, and is now adopting it needs to name that draft rather than have a new one written from a weight list.
   */
  @RequirePermissions(COMMAND_MANAGE)
  @Post(":id/supersede")
  @HttpCode(200)
  async supersede(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<HealthIndexDefinition> {
    const dto = parseBody(supersedeHealthIndexSchema, body);
    return this.service.supersede(tenantOf(principal), id as Uuid, dto.successorId as Uuid);
  }

  /**
   * Change what a live composition weighs, the only way a live composition can change.
   *
   * `201`, because this mints an aggregate rather than editing one: a successor is published under the same key
   * and the incumbent is superseded, in one step. Both are returned, and both matter to the caller — the
   * successor is what periods from here on are scored under, and the superseded one is what every assessment
   * already filed still points at and is still explained by.
   */
  @RequirePermissions(COMMAND_MANAGE)
  @Post(":id/recompose")
  @HttpCode(201)
  async recompose(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<RecompositionResult> {
    const dto = parseBody(recomposeHealthIndexSchema, body);
    return this.service.recompose(tenantOf(principal), id as Uuid, dto.weights);
  }

  /**
   * Stop measuring under this composition without putting anything in its place. Retired rather than removed:
   * the assessments computed under it still cite it, and a deleted definition would leave them scoring an
   * institution against a question nobody can any longer read.
   */
  @RequirePermissions(COMMAND_MANAGE)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<HealthIndexDefinition> {
    return this.service.retire(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COMMAND_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly HealthIndexDefinition[]> {
    return this.service.list(tenantOf(principal));
  }

  /**
   * The composition an institution is currently measuring itself under, or `null` where it has adopted none.
   * `null` rather than a 404 because a key with only drafts behind it is an ordinary state — it is what every
   * index looks like before the institution has settled the argument.
   */
  @RequirePermissions(COMMAND_READ)
  @Get("published/:indexKey")
  async findPublished(
    @CurrentPrincipal() principal: Principal,
    @Param("indexKey") indexKey: string,
  ): Promise<HealthIndexDefinition | null> {
    return this.service.findPublished(tenantOf(principal), indexKey);
  }

  /**
   * The whole supersession chain for one key, oldest first. This is the read that makes a long series of scores
   * interpretable: walking it forward shows exactly when the question changed, which is the only way to know
   * whether a step in the index was the institution moving or the measure moving.
   */
  @RequirePermissions(COMMAND_READ)
  @Get("by-key/:indexKey")
  async listByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("indexKey") indexKey: string,
  ): Promise<readonly HealthIndexDefinition[]> {
    return this.service.listByKey(tenantOf(principal), indexKey);
  }

  @RequirePermissions(COMMAND_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<HealthIndexDefinition> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
