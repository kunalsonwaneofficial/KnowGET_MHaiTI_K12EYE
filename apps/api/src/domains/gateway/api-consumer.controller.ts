import type { Principal } from "@knowget/auth";
import { type ApiConsumer, ApiConsumerService } from "@knowget/gateway";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { GATEWAY_ADMIT, GATEWAY_READ, actorOf, parseBody, tenantOf } from "./gateway-http";
import {
  changeConsumerScopesSchema,
  reassignApiConsumerSchema,
  registerApiConsumerSchema,
  renameApiConsumerSchema,
  rotateConsumerCredentialSchema,
  suspendApiConsumerSchema,
} from "./gateway.dto";
import { GW_CONSUMER_SERVICE } from "./gateway.tokens";

/**
 * REST surface for API consumers (P3-D01) — the outside systems the institution has agreed may call it.
 *
 * Every write here sits behind `gateway:admit`, alone, because this is the surface that hands out reach. Granting
 * a scope is authorization amplification: whoever can call `grant-scopes` can give an external system access it
 * did not have, and nothing about publishing a contract or arranging a webhook feed implies anybody should be able
 * to do that. A registration that starts `registered` rather than `active` is the same principle held one step
 * longer — the record exists, attributable and scoped and reviewable, before the credential it names opens
 * anything, and `activate` is a separate decision somebody makes with the record in front of them.
 *
 * This surface returns the consumer record rather than the package's `ConsumerView`. The view exists for handing a
 * consumer its own registration, and its own documentation is explicit that what it omits — the owner, the
 * suspension reason, the timestamps — remains available through the record to callers inside the platform. This
 * controller is that inside caller: an administrator reviewing who holds keys needs the owner in order to ask, the
 * suspension reason in order to answer, and `rotatedAt` in order to find the integration still running on the key
 * it was issued three years ago. The one projection that is compulsory in this domain is the route surface's, and
 * it is enforced there rather than by making every read here narrower than the question it answers.
 *
 * `credentialRef` crosses in both directions and is a reference rather than a secret. The aggregate refuses
 * anything that looks like credential material, so what an administrator reads and rotates here is the handle to
 * something held in the platform's custody layer — which is exactly the operational fact rotation needs, and
 * exactly not the fact a gateway is the worst place to leak.
 */
@Controller("gateway/consumers")
export class ApiConsumerController {
  constructor(@Inject(GW_CONSUMER_SERVICE) private readonly service: ApiConsumerService) {}

  /**
   * Admit an outside system. The person answerable for the admission comes from the principal and never from the
   * body, and the initial scopes are checked against the platform's own scope catalogue — a consumer cannot be
   * granted reach that does not exist, at registration or afterwards.
   */
  @RequirePermissions(GATEWAY_ADMIT)
  @Post()
  @HttpCode(201)
  async register(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ApiConsumer> {
    const dto = parseBody(registerApiConsumerSchema, body);
    return this.service.register({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      consumerKey: dto.consumerKey,
      displayName: dto.displayName,
      authScheme: dto.authScheme,
      credentialRef: dto.credentialRef,
      grantedScopes: dto.grantedScopes,
      ownerId: dto.ownerId as Uuid,
      registeredBy: actorOf(principal),
    });
  }

  /** Change the label an operator reads. The consumer key is what every other record refers to and does not move. */
  @RequirePermissions(GATEWAY_ADMIT)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ApiConsumer> {
    const dto = parseBody(renameApiConsumerSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.displayName);
  }

  /**
   * Hand the integration to a different accountable person. Its own route rather than a field on an edit, because
   * this is what keeps an integration governable when whoever arranged it leaves, and it is the step that gets
   * skipped when it is one field among seven.
   */
  @RequirePermissions(GATEWAY_ADMIT)
  @Post(":id/reassign")
  @HttpCode(200)
  async reassign(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ApiConsumer> {
    const dto = parseBody(reassignApiConsumerSchema, body);
    return this.service.reassign(tenantOf(principal), id as Uuid, dto.ownerId as Uuid);
  }

  /** Point the consumer at a different secret. The platform learns that a rotation happened, not what rotated. */
  @RequirePermissions(GATEWAY_ADMIT)
  @Post(":id/rotate-credential")
  @HttpCode(200)
  async rotateCredential(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ApiConsumer> {
    const dto = parseBody(rotateConsumerCredentialSchema, body);
    return this.service.rotateCredential(tenantOf(principal), id as Uuid, dto.credentialRef);
  }

  /**
   * Widen what this system may reach. Each scope is resolved against the platform's permission vocabulary, so a
   * grant naming a scope nobody defined is refused here rather than becoming a permission that silently matches
   * nothing until the day somebody defines it.
   */
  @RequirePermissions(GATEWAY_ADMIT)
  @Post(":id/grant-scopes")
  @HttpCode(200)
  async grantScopes(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ApiConsumer> {
    const dto = parseBody(changeConsumerScopesSchema, body);
    return this.service.grantScopes(tenantOf(principal), id as Uuid, dto.scopes);
  }

  /**
   * Narrow it again. Nothing is resolved against the catalogue on the way out, deliberately: a scope that has
   * since stopped existing must still be revocable, or the platform's only way to take back reach it no longer
   * recognises would be to retire the consumer.
   */
  @RequirePermissions(GATEWAY_ADMIT)
  @Post(":id/revoke-scopes")
  @HttpCode(200)
  async revokeScopes(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ApiConsumer> {
    const dto = parseBody(changeConsumerScopesSchema, body);
    return this.service.revokeScopes(tenantOf(principal), id as Uuid, dto.scopes);
  }

  /** Let it in. The moment the credential this record names starts opening what the scopes say it opens. */
  @RequirePermissions(GATEWAY_ADMIT)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ApiConsumer> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  /**
   * Cut it off, reversibly, with the reason written down. Suspension is what an institution reaches for at speed —
   * a leaked key, an integrator hammering an endpoint — and the reason field is the part that lets the call that
   * follows be answered by somebody other than whoever pressed it.
   */
  @RequirePermissions(GATEWAY_ADMIT)
  @Post(":id/suspend")
  @HttpCode(200)
  async suspend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ApiConsumer> {
    const dto = parseBody(suspendApiConsumerSchema, body);
    return this.service.suspend(tenantOf(principal), id as Uuid, dto.reason);
  }

  /** End the arrangement. The record stays, because who could once reach the institution is a durable question. */
  @RequirePermissions(GATEWAY_ADMIT)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ApiConsumer> {
    return this.service.retire(tenantOf(principal), id as Uuid);
  }

  /** Every consumer in the tenant, retired ones included. */
  @RequirePermissions(GATEWAY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly ApiConsumer[]> {
    return this.service.list(tenantOf(principal));
  }

  /** Who can reach this organization right now — the list a key review is actually about. */
  @RequirePermissions(GATEWAY_READ)
  @Get("active/:organizationId")
  async listActive(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly ApiConsumer[]> {
    return this.service.listActive(tenantOf(principal), organizationId as Uuid);
  }

  /** What one person is answerable for. The read a departure checklist needs and rarely has. */
  @RequirePermissions(GATEWAY_READ)
  @Get("by-owner/:ownerId")
  async listByOwner(
    @CurrentPrincipal() principal: Principal,
    @Param("ownerId") ownerId: string,
  ): Promise<readonly ApiConsumer[]> {
    return this.service.listByOwner(tenantOf(principal), ownerId as Uuid);
  }

  /** One consumer by the key an integrator authenticates as. */
  @RequirePermissions(GATEWAY_READ)
  @Get("by-key/:consumerKey")
  async getByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("consumerKey") consumerKey: string,
  ): Promise<ApiConsumer> {
    return this.service.getByKey(tenantOf(principal), consumerKey);
  }

  /** One consumer, or a 404. */
  @RequirePermissions(GATEWAY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ApiConsumer> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
