import type { Principal } from "@knowget/auth";
import {
  type LagAssessment,
  type SubscriptionCheckpoint,
  SubscriptionCheckpointService,
} from "@knowget/event-mesh";
import type { ISODateString, Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  MESH_OPERATE,
  MESH_READ,
  actorOf,
  parseBody,
  partitionOf,
  tenantOf,
} from "./event-mesh-http";
import {
  assessLagQuerySchema,
  commitCheckpointSchema,
  openCheckpointSchema,
  resetCheckpointSchema,
} from "./event-mesh.dto";
import { EM_CHECKPOINT_SERVICE } from "./event-mesh.tokens";

/**
 * REST surface for subscription checkpoints (P3-D02) — how far each consumer has got, one partition at a time.
 *
 * Everything that moves a position sits behind `mesh:operate`, because none of it changes what the platform
 * carries or who is entitled to read it. A commit moves a consumer forward through work the subscription already
 * authorised; opening a checkpoint records a position that was going to exist the moment delivery started. These
 * are the running mesh, not its governance, and they belong to whoever is on call rather than to whoever decides
 * what the institution publishes.
 *
 * `reset` is the exception inside that rule, and it is why this surface takes a reason and an actor. Moving a
 * position backwards re-delivers everything between the new position and the old one to a consumer that has
 * already acted on all of it, and the consumer cannot tell — it was written to read a stream forwards, so what it
 * sees is simply more messages. On a stream a projection is built from, that is a projection that ends up in a
 * state no sequence of real events could have produced. The aggregate takes the reason because six months later
 * the only way to explain a duplicated cohort is the sentence somebody typed at the time.
 *
 * Everything here is per-partition, and that shape is load-bearing rather than incidental. A subscription
 * summarised to one number is a subscription whose one stalled partition is averaged away by seven healthy ones,
 * and the seven are what somebody looks at before deciding nothing is wrong. `:id/lag` reports one partition's
 * distance from its head as of a stated instant, and the instant is an argument rather than a clock so that the
 * same question asked twice about the same moment gets the same answer.
 */
@Controller("event-mesh/checkpoints")
export class SubscriptionCheckpointController {
  constructor(
    @Inject(EM_CHECKPOINT_SERVICE) private readonly service: SubscriptionCheckpointService,
  ) {}

  /**
   * Open a position for one consumer on one partition. Uncommitted rather than zero to begin with, because a
   * consumer that has read nothing and a consumer that has read the first message are different states and a
   * single zero would conflate them.
   */
  @RequirePermissions(MESH_OPERATE)
  @Post()
  @HttpCode(201)
  async open(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<SubscriptionCheckpoint> {
    const dto = parseBody(openCheckpointSchema, body);
    return this.service.open(tenantOf(principal), dto.subscriptionId as Uuid, dto.partition);
  }

  /** Move the position forward. The aggregate refuses a position that would move it back — that is `reset`. */
  @RequirePermissions(MESH_OPERATE)
  @Post(":id/commit")
  @HttpCode(200)
  async commit(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<SubscriptionCheckpoint> {
    const dto = parseBody(commitCheckpointSchema, body);
    return this.service.commit(tenantOf(principal), id as Uuid, dto.position);
  }

  /**
   * Move the position anywhere, with a name and a reason attached. The only route in the domain that re-delivers
   * work a consumer has already done, which is why it is the only one on this surface that records who did it.
   */
  @RequirePermissions(MESH_OPERATE)
  @Post(":id/reset")
  @HttpCode(200)
  async reset(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<SubscriptionCheckpoint> {
    const dto = parseBody(resetCheckpointSchema, body);
    return this.service.reset(
      tenantOf(principal),
      id as Uuid,
      dto.position,
      actorOf(principal),
      dto.reason,
    );
  }

  /** Every checkpoint in the tenant, by subscription and then partition. */
  @RequirePermissions(MESH_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly SubscriptionCheckpoint[]> {
    return this.service.list(tenantOf(principal));
  }

  /** Every position one consumer holds — the only honest shape for looking at whether it is keeping up. */
  @RequirePermissions(MESH_READ)
  @Get("by-subscription/:subscriptionId")
  async listBySubscription(
    @CurrentPrincipal() principal: Principal,
    @Param("subscriptionId") subscriptionId: string,
  ): Promise<readonly SubscriptionCheckpoint[]> {
    return this.service.listBySubscription(tenantOf(principal), subscriptionId as Uuid);
  }

  /** One consumer's position on one partition, which is the uniqueness this table exists to hold. */
  @RequirePermissions(MESH_READ)
  @Get("by-partition/:subscriptionId/:partition")
  async getByPartition(
    @CurrentPrincipal() principal: Principal,
    @Param("subscriptionId") subscriptionId: string,
    @Param("partition") partition: string,
  ): Promise<SubscriptionCheckpoint> {
    return this.service.getByPartition(
      tenantOf(principal),
      subscriptionId as Uuid,
      partitionOf(partition),
    );
  }

  /** How far behind this partition is as of a stated instant, and which band that puts it in. */
  @RequirePermissions(MESH_READ)
  @Get(":id/lag")
  async assessLag(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Query() query: unknown,
  ): Promise<LagAssessment> {
    const dto = parseBody(assessLagQuerySchema, query);
    return this.service.assessLag(tenantOf(principal), id as Uuid, dto.asOf as ISODateString);
  }

  /** One checkpoint, or a 404. */
  @RequirePermissions(MESH_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<SubscriptionCheckpoint> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
