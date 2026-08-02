import type { Principal } from "@knowget/auth";
import { type MeshSubscription, MeshSubscriptionService } from "@knowget/event-mesh";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { MESH_DELIVER, MESH_READ, actorOf, parseBody, tenantOf } from "./event-mesh-http";
import {
  refilterMeshSubscriptionSchema,
  registerMeshSubscriptionSchema,
  reviseSubscriptionDeliverySchema,
} from "./event-mesh.dto";
import { EM_SUBSCRIPTION_SERVICE } from "./event-mesh.tokens";

/**
 * REST surface for mesh subscriptions (P3-D02) — who reads a stream, and under what terms.
 *
 * A subscription is the other half of `mesh:deliver`. A binding names the backbone a stream is carried on; a
 * subscription names a consumer group reading from it, the filter that decides which messages that group is
 * shown, the delivery semantics it is promised and how many attempts a failure is worth before the message
 * becomes somebody's problem in the dead-letter surface. Together the two answer *where does this end up*, which
 * is why they share a key rather than each having their own.
 *
 * `refilter` is a full replacement rather than an add-and-remove pair, and that is the opposite of the choice made
 * for a stream's event types one file over. The difference is what the two collections are. A stream's accepted
 * types are a vocabulary, where admitting one kind of fact and removing another are separate decisions with
 * separate consequences. A filter is a single predicate expressed as a conjunction of clauses — narrowing one
 * clause while widening another changes what the consumer sees in a way that only makes sense read whole, and a
 * partial edit would let a filter pass through an intermediate state that delivers messages nobody intended.
 *
 * Semantics and maximum attempts move together in `revise-delivery` for a related reason: at-most-once with five
 * attempts is a contradiction, and letting the two be set independently would let a caller pass through it. The
 * aggregate refuses the contradiction; this surface makes it impossible to express by accident.
 *
 * `pause` is the operation that keeps this domain honest under load. A consumer that cannot keep up is paused
 * rather than deleted, so its checkpoints survive, its lag stays visible and it resumes from where it stopped —
 * where deleting it would silently abandon a position and the eventual replacement would start from nothing.
 */
@Controller("event-mesh/subscriptions")
export class MeshSubscriptionController {
  constructor(@Inject(EM_SUBSCRIPTION_SERVICE) private readonly service: MeshSubscriptionService) {}

  /**
   * Register a consumer against a stream. Semantics, attempts and filter all default, because the common case is
   * a consumer that wants everything at least once — and it starts registered rather than active, so nothing is
   * delivered until somebody looks at the record and says so.
   */
  @RequirePermissions(MESH_DELIVER)
  @Post()
  @HttpCode(201)
  async register(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<MeshSubscription> {
    const dto = parseBody(registerMeshSubscriptionSchema, body);
    return this.service.register({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      subscriptionKey: dto.subscriptionKey,
      streamKey: dto.streamKey,
      consumerGroup: dto.consumerGroup,
      title: dto.title,
      semantics: dto.semantics,
      maxAttempts: dto.maxAttempts,
      filter: dto.filter,
    });
  }

  /**
   * Replace the filter outright. A predicate read whole rather than amended clause by clause, so it never passes
   * through an intermediate state that delivers a consumer something nobody meant it to see.
   */
  @RequirePermissions(MESH_DELIVER)
  @Post(":id/refilter")
  @HttpCode(200)
  async refilter(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<MeshSubscription> {
    const dto = parseBody(refilterMeshSubscriptionSchema, body);
    return this.service.refilter(tenantOf(principal), id as Uuid, dto.filter);
  }

  /** Change the delivery terms. Both fields together, because a semantics and an attempt budget can contradict. */
  @RequirePermissions(MESH_DELIVER)
  @Post(":id/revise-delivery")
  @HttpCode(200)
  async reviseDelivery(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<MeshSubscription> {
    const dto = parseBody(reviseSubscriptionDeliverySchema, body);
    return this.service.reviseDelivery(
      tenantOf(principal),
      id as Uuid,
      dto.semantics,
      dto.maxAttempts,
    );
  }

  /** Begin delivering. Attributed, because switching a consumer on is somebody's decision about load. */
  @RequirePermissions(MESH_DELIVER)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MeshSubscription> {
    return this.service.activate(tenantOf(principal), id as Uuid, actorOf(principal));
  }

  /** Stop delivering without forgetting where it got to. The reason this domain has no delete. */
  @RequirePermissions(MESH_DELIVER)
  @Post(":id/pause")
  @HttpCode(200)
  async pause(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MeshSubscription> {
    return this.service.pause(tenantOf(principal), id as Uuid);
  }

  /** End the arrangement. The record and its checkpoints stay, because who read what is a durable question. */
  @RequirePermissions(MESH_DELIVER)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MeshSubscription> {
    return this.service.retire(tenantOf(principal), id as Uuid);
  }

  /** Every subscription in the tenant, retired ones included. */
  @RequirePermissions(MESH_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly MeshSubscription[]> {
    return this.service.list(tenantOf(principal));
  }

  /** Everyone registered against one stream — who would notice if this stream changed shape. */
  @RequirePermissions(MESH_READ)
  @Get("by-stream/:streamKey")
  async listByStream(
    @CurrentPrincipal() principal: Principal,
    @Param("streamKey") streamKey: string,
  ): Promise<readonly MeshSubscription[]> {
    return this.service.listByStream(tenantOf(principal), streamKey);
  }

  /** Who is actually being delivered to right now, which is a different and smaller question. */
  @RequirePermissions(MESH_READ)
  @Get("deliverable/:streamKey")
  async listDeliverable(
    @CurrentPrincipal() principal: Principal,
    @Param("streamKey") streamKey: string,
  ): Promise<readonly MeshSubscription[]> {
    return this.service.listDeliverable(tenantOf(principal), streamKey);
  }

  /** One subscription by the key its checkpoints and dead letters carry. */
  @RequirePermissions(MESH_READ)
  @Get("by-key/:subscriptionKey")
  async getByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("subscriptionKey") subscriptionKey: string,
  ): Promise<MeshSubscription> {
    return this.service.getByKey(tenantOf(principal), subscriptionKey);
  }

  /** One subscription, or a 404. */
  @RequirePermissions(MESH_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MeshSubscription> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
