import type { Principal } from "@knowget/auth";
import { type WebhookSubscription, WebhookSubscriptionService } from "@knowget/gateway";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { GATEWAY_INTEGRATE, GATEWAY_READ, parseBody, tenantOf } from "./gateway-http";
import {
  createWebhookSubscriptionSchema,
  rebindSubscriptionEndpointSchema,
  renameWebhookSubscriptionSchema,
  resubscribeWebhookSubscriptionSchema,
  rotateSubscriptionSecretSchema,
  suspendWebhookSubscriptionSchema,
} from "./gateway.dto";
import { GW_SUBSCRIPTION_SERVICE } from "./gateway.tokens";

/**
 * REST surface for webhook subscriptions (P3-D01) — standing arrangements to be told when something happens.
 *
 * A subscription is a consumer, an endpoint and a set of event types, and the three together are the only egress
 * path the platform has that nobody triggers. Every other outbound call answers a request; these fire because a
 * fact was recorded, which is why the whole surface sits under `gateway:integrate` rather than beside the reads:
 * arranging one is arranging for institutional facts to leave the institution on their own schedule.
 *
 * The event types are checked against the published catalogue rather than against everything the platform emits.
 * That distinction is the contract. A curated catalogue means a subscriber names facts the institution has decided
 * to stand behind, and an internal step that happens to be an event cannot become a public promise by somebody
 * subscribing to it and coming to depend on it.
 *
 * Pausing and suspending are the same effect from opposite directions, and keeping them apart is what makes the
 * status legible six months later. A consumer pausing their own feed owes nobody an explanation; an institution
 * stopping somebody else's owes them one, so the suspension carries a reason and the pause does not. `resume`
 * lifts either, because the question a resume answers is *should this be sending again*, not *who stopped it*.
 * Revocation is the end, and the record stays: what the institution used to send, to whom, is a durable question
 * a subscription nobody kept would leave unanswerable.
 *
 * There is no route here that records a delivery attempt. `recordOutcome` is how a subscription accumulates the
 * consecutive failures that eventually suspend it, and that is a delivery worker reporting what happened rather
 * than an operator asserting it — an operator who could report failures could also suspend a competitor's feed
 * without ever touching the suspension route.
 */
@Controller("gateway/subscriptions")
export class WebhookSubscriptionController {
  constructor(
    @Inject(GW_SUBSCRIPTION_SERVICE) private readonly service: WebhookSubscriptionService,
  ) {}

  /**
   * Arrange the feed. Active immediately, because a subscription that had to be switched on separately would
   * silently miss everything that happened between the two steps and look identical to one that was working.
   */
  @RequirePermissions(GATEWAY_INTEGRATE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<WebhookSubscription> {
    const dto = parseBody(createWebhookSubscriptionSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      consumerId: dto.consumerId as Uuid,
      subscriptionKey: dto.subscriptionKey,
      displayName: dto.displayName,
      endpointId: dto.endpointId as Uuid,
      eventTypes: dto.eventTypes,
      deliveryMode: dto.deliveryMode,
      secretRef: dto.secretRef,
    });
  }

  /** Change the label. The subscription key is what the consumer's own tooling refers to and does not move. */
  @RequirePermissions(GATEWAY_INTEGRATE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<WebhookSubscription> {
    const dto = parseBody(renameWebhookSubscriptionSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.displayName);
  }

  /**
   * Replace what the subscription is interested in, wholesale. Deliveries already scheduled are untouched: they
   * were selected against the set in force when the event happened, which is the set the consumer had asked for.
   */
  @RequirePermissions(GATEWAY_INTEGRATE)
  @Post(":id/resubscribe")
  @HttpCode(200)
  async resubscribe(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<WebhookSubscription> {
    const dto = parseBody(resubscribeWebhookSubscriptionSchema, body);
    return this.service.resubscribe(tenantOf(principal), id as Uuid, dto.eventTypes);
  }

  /**
   * Send this feed through a different endpoint, leaving the filter alone. The endpoint must be one the platform
   * can still reach, so a subscription cannot be moved onto something disabled and quietly stop arriving.
   */
  @RequirePermissions(GATEWAY_INTEGRATE)
  @Post(":id/rebind-endpoint")
  @HttpCode(200)
  async rebindEndpoint(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<WebhookSubscription> {
    const dto = parseBody(rebindSubscriptionEndpointSchema, body);
    return this.service.rebindEndpoint(tenantOf(principal), id as Uuid, dto.endpointId as Uuid);
  }

  /**
   * Point the subscription at different signing material, or at none. An explicit `null` says *this consumer
   * verifies deliveries some other way*, which is a different statement from a secret nobody filled in.
   */
  @RequirePermissions(GATEWAY_INTEGRATE)
  @Post(":id/rotate-secret")
  @HttpCode(200)
  async rotateSecret(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<WebhookSubscription> {
    const dto = parseBody(rotateSubscriptionSecretSchema, body);
    return this.service.rotateSecret(tenantOf(principal), id as Uuid, dto.secretRef);
  }

  /** Stop sending at the consumer's own request. No reason is asked for; it is their subscription. */
  @RequirePermissions(GATEWAY_INTEGRATE)
  @Post(":id/pause")
  @HttpCode(200)
  async pause(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<WebhookSubscription> {
    return this.service.pause(tenantOf(principal), id as Uuid);
  }

  /** Start sending again, from a pause or a suspension. The question is whether it should send now. */
  @RequirePermissions(GATEWAY_INTEGRATE)
  @Post(":id/resume")
  @HttpCode(200)
  async resume(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<WebhookSubscription> {
    return this.service.resume(tenantOf(principal), id as Uuid);
  }

  /**
   * Stop sending on the institution's initiative, with the reason recorded. The manual form of what repeated
   * delivery failures eventually cause on their own, and the field the consumer is owed when they ask why.
   */
  @RequirePermissions(GATEWAY_INTEGRATE)
  @Post(":id/suspend")
  @HttpCode(200)
  async suspend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<WebhookSubscription> {
    const dto = parseBody(suspendWebhookSubscriptionSchema, body);
    return this.service.suspend(tenantOf(principal), id as Uuid, dto.reason);
  }

  /** End the arrangement for good. The record stays; what was sent to whom is not a question time should erase. */
  @RequirePermissions(GATEWAY_INTEGRATE)
  @Post(":id/revoke")
  @HttpCode(200)
  async revoke(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<WebhookSubscription> {
    return this.service.revoke(tenantOf(principal), id as Uuid);
  }

  /** Every subscription in the tenant, revoked ones included. */
  @RequirePermissions(GATEWAY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly WebhookSubscription[]> {
    return this.service.list(tenantOf(principal));
  }

  /** Everything one consumer has subscribed to, in every status. Their own view of their integration. */
  @RequirePermissions(GATEWAY_READ)
  @Get("by-consumer/:consumerId")
  async listByConsumer(
    @CurrentPrincipal() principal: Principal,
    @Param("consumerId") consumerId: string,
  ): Promise<readonly WebhookSubscription[]> {
    return this.service.listByConsumer(tenantOf(principal), consumerId as Uuid);
  }

  /**
   * Everything that would be affected by one endpoint going away. The read that makes retiring an endpoint an
   * informed decision — the only question here whose answer is a list of people.
   */
  @RequirePermissions(GATEWAY_READ)
  @Get("by-endpoint/:endpointId")
  async listByEndpoint(
    @CurrentPrincipal() principal: Principal,
    @Param("endpointId") endpointId: string,
  ): Promise<readonly WebhookSubscription[]> {
    return this.service.listByEndpoint(tenantOf(principal), endpointId as Uuid);
  }

  /**
   * Who is currently being sent one event type, for one institution. Paused and suspended subscriptions are
   * excluded by the read itself, so *not currently sending* is a fact about the record rather than a filter
   * every caller has to remember to apply.
   */
  @RequirePermissions(GATEWAY_READ)
  @Get("interested-in/:organizationId/:eventType")
  async listInterestedIn(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
    @Param("eventType") eventType: string,
  ): Promise<readonly WebhookSubscription[]> {
    return this.service.listInterestedIn(tenantOf(principal), organizationId as Uuid, eventType);
  }

  /** One subscription by the key its own consumer refers to it with. */
  @RequirePermissions(GATEWAY_READ)
  @Get("by-key/:consumerId/:subscriptionKey")
  async getByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("consumerId") consumerId: string,
    @Param("subscriptionKey") subscriptionKey: string,
  ): Promise<WebhookSubscription> {
    return this.service.getByKey(tenantOf(principal), consumerId as Uuid, subscriptionKey);
  }

  /** One subscription, or a 404. */
  @RequirePermissions(GATEWAY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<WebhookSubscription> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
