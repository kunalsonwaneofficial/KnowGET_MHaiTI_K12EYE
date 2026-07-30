import type { Principal } from "@knowget/auth";
import { type OutboundDelivery, OutboundDeliveryService } from "@knowget/gateway";
import type { ISODateString, Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { GATEWAY_OPERATE, GATEWAY_READ, parseBody, tenantOf } from "./gateway-http";
import { abandonOutboundDeliverySchema, dueDeliveriesQuerySchema } from "./gateway.dto";
import { GW_DELIVERY_SERVICE } from "./gateway.tokens";

/**
 * REST surface for outbound deliveries (P3-D01) — what the institution owes an integrator, and how it went.
 *
 * A delivery is one event owed to one subscription, and this surface is deliberately the narrowest in the domain.
 * Nothing here schedules a delivery, makes an attempt, or records the result of one: dispatch belongs to whatever
 * recorded the fact, the attempt belongs to the delivery worker in `@knowget/jobs`, and the outcome belongs to
 * whoever made the attempt. A route that let an operator mark a delivery delivered would let the record say the
 * institution had told somebody something it never told them, which is the one thing this table exists to prevent.
 *
 * What is left is reading and two endings. `replay` sends a dead-lettered delivery again as a *new* record aimed
 * at wherever its subscription now points, leaving the original exactly as it failed — a replay that mutated the
 * original would erase the failure it exists because of, and the attempt history is what a consumer asking "did
 * you ever try" is owed. `abandon` is the other ending, and it takes a reason because nothing else records one:
 * dead-lettered is the platform saying it could not get through, abandoned is a person saying to stop trying, and
 * only the reason distinguishes a considered decision from a queue somebody cleared to make a number go down.
 *
 * Both sit under `gateway:operate` rather than `gateway:integrate`. Neither creates an arrangement; both dispose
 * of work inside one somebody else made, which is the operational rota's business and not the integrator's.
 */
@Controller("gateway/deliveries")
export class OutboundDeliveryController {
  constructor(@Inject(GW_DELIVERY_SERVICE) private readonly service: OutboundDeliveryService) {}

  /**
   * Send a dead-lettered delivery again. Returns the replay rather than the original, so the caller holds the
   * record that is going to be attempted instead of the one that already failed.
   */
  @RequirePermissions(GATEWAY_OPERATE)
  @Post(":id/replay")
  @HttpCode(200)
  async replay(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<OutboundDelivery> {
    return this.service.replay(tenantOf(principal), id as Uuid);
  }

  /** Stop trying, for good, with the reason recorded. The only place that reason is ever written down. */
  @RequirePermissions(GATEWAY_OPERATE)
  @Post(":id/abandon")
  @HttpCode(200)
  async abandon(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<OutboundDelivery> {
    const dto = parseBody(abandonOutboundDeliverySchema, body);
    return this.service.abandon(tenantOf(principal), id as Uuid, dto.reason);
  }

  /** Every delivery in the tenant, in every outcome. */
  @RequirePermissions(GATEWAY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly OutboundDelivery[]> {
    return this.service.list(tenantOf(principal));
  }

  /**
   * What is owed and due as of one instant, across the whole tenant — the read a delivery worker drains.
   *
   * Tenant-wide rather than per institution, because a worker drains a queue rather than serving a school, and
   * the instant is a required argument rather than a clock reading: a worker that let the server pick could not
   * say afterwards which window it had drained. Two workers reading the same window is a race the delivery
   * record settles on write, not one this read tries to prevent.
   */
  @RequirePermissions(GATEWAY_READ)
  @Get("due")
  async listDue(
    @CurrentPrincipal() principal: Principal,
    @Query() query: unknown,
  ): Promise<readonly OutboundDelivery[]> {
    const dto = parseBody(dueDeliveriesQuerySchema, query);
    return this.service.listDue(tenantOf(principal), dto.asOf as ISODateString);
  }

  /**
   * What the institution failed to deliver and stopped trying to. The list somebody works through: every entry
   * is an event a consumer's system does not know about, and both endings above start here.
   */
  @RequirePermissions(GATEWAY_READ)
  @Get("dead-lettered/:organizationId")
  async listDeadLettered(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly OutboundDelivery[]> {
    return this.service.listDeadLettered(tenantOf(principal), organizationId as Uuid);
  }

  /** Every delivery ever made for one subscription, settled or not. One integrator's whole history. */
  @RequirePermissions(GATEWAY_READ)
  @Get("by-subscription/:subscriptionId")
  async listBySubscription(
    @CurrentPrincipal() principal: Principal,
    @Param("subscriptionId") subscriptionId: string,
  ): Promise<readonly OutboundDelivery[]> {
    return this.service.listBySubscription(tenantOf(principal), subscriptionId as Uuid);
  }

  /** One delivery, or a 404. */
  @RequirePermissions(GATEWAY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<OutboundDelivery> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
