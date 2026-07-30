import type { Principal } from "@knowget/auth";
import { type TrafficPolicy, TrafficPolicyService } from "@knowget/gateway";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { GATEWAY_OPERATE, GATEWAY_READ, parseBody, tenantOf } from "./gateway-http";
import {
  defineTrafficPolicySchema,
  renameTrafficPolicySchema,
  reviseTrafficPolicySchema,
} from "./gateway.dto";
import { GW_POLICY_SERVICE } from "./gateway.tokens";

/**
 * REST surface for traffic policies (P3-D01) — how much of the platform an integrator may use.
 *
 * A policy sets limits and does not count anything. Counting belongs to `@knowget/security`, the timer to
 * `@knowget/reliability`, and this domain holds only the number the counter is compared against — which is why
 * there is no route here that reads a consumer's current consumption. That question has an owner, and it is not
 * this contract.
 *
 * Four scopes exist and the resolver picks exactly one: the most specific policy that matches wins wholesale, and
 * limits are never merged across scopes. Everything else on this surface follows from that. Revision replaces the
 * limits outright rather than patching a field, because a partial update would give *omitted* a second meaning in
 * the one domain where an omitted limit already means *not enforced*. Every field in the body defaults to `null`
 * for the same reason from the other side — a consumer-scoped rate limit that has to spell out four explicit nulls
 * to say nothing about payload size is a request somebody eventually fills in by copying another policy.
 *
 * `consumerId` and `capabilityKey` are nullable but never optional, and the service checks the pair against the
 * scope as one fact: a `consumer` policy naming no consumer and a `global` policy naming one are both refused.
 * A consumer named here is resolved against the consumer register, so a limit cannot be set on an integration that
 * does not exist and then sit inert while somebody wonders why it never bites.
 *
 * The whole surface is `gateway:operate`, apart from the scopes that decide what exists and who may reach it.
 * Tightening a limit is the intervention an operations rota makes at three in the morning; it changes nothing about
 * the arrangement itself, and the account that can do it should not also be able to admit a consumer or publish a
 * route. Deactivation rather than deletion is the same instinct — a limit that was in force last Tuesday is how
 * last Tuesday's throttling gets explained.
 */
@Controller("gateway/policies")
export class TrafficPolicyController {
  constructor(@Inject(GW_POLICY_SERVICE) private readonly service: TrafficPolicyService) {}

  /**
   * Set a limit. Active from the moment it is defined, because a policy that had to be switched on separately
   * would leave the window between the two steps unlimited exactly when somebody had decided it should not be.
   */
  @RequirePermissions(GATEWAY_OPERATE)
  @Post()
  @HttpCode(201)
  async define(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<TrafficPolicy> {
    const dto = parseBody(defineTrafficPolicySchema, body);
    return this.service.define({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      scope: dto.scope,
      consumerId: dto.consumerId as Uuid | null,
      capabilityKey: dto.capabilityKey,
      displayName: dto.displayName,
      limits: dto.limits,
    });
  }

  /** Replace the limits outright. Wholesale, exactly as the resolver applies them. */
  @RequirePermissions(GATEWAY_OPERATE)
  @Post(":id/revise")
  @HttpCode(200)
  async revise(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<TrafficPolicy> {
    const dto = parseBody(reviseTrafficPolicySchema, body);
    return this.service.revise(tenantOf(principal), id as Uuid, dto.limits);
  }

  /** Change the label. The scope and its subject are what the resolver matches on and are not editable. */
  @RequirePermissions(GATEWAY_OPERATE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<TrafficPolicy> {
    const dto = parseBody(renameTrafficPolicySchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.displayName);
  }

  /**
   * Stop enforcing it. The next-most-specific policy takes over, or nothing does — which is a real outcome and the
   * reason this is a deliberate act rather than a cleanup: deactivating a consumer-scoped limit does not fall back
   * to something stricter, it falls back to whatever the wider scope happens to say.
   */
  @RequirePermissions(GATEWAY_OPERATE)
  @Post(":id/deactivate")
  @HttpCode(200)
  async deactivate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<TrafficPolicy> {
    return this.service.deactivate(tenantOf(principal), id as Uuid);
  }

  /**
   * Put it back in force. Refused if another active policy has since taken the same scope tuple, because two
   * policies claiming one tuple would make which limit applies a question about row order.
   */
  @RequirePermissions(GATEWAY_OPERATE)
  @Post(":id/reactivate")
  @HttpCode(200)
  async reactivate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<TrafficPolicy> {
    return this.service.reactivate(tenantOf(principal), id as Uuid);
  }

  /** Every policy in the tenant, including the ones no longer in force. */
  @RequirePermissions(GATEWAY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly TrafficPolicy[]> {
    return this.service.list(tenantOf(principal));
  }

  /** What is actually being enforced for this organization — the set the resolver draws from. */
  @RequirePermissions(GATEWAY_READ)
  @Get("active/:organizationId")
  async listActive(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly TrafficPolicy[]> {
    return this.service.listActive(tenantOf(principal), organizationId as Uuid);
  }

  /** One policy, or a 404. */
  @RequirePermissions(GATEWAY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<TrafficPolicy> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
