import type { Principal } from "@knowget/auth";
import { type IntegrationEndpoint, IntegrationEndpointService } from "@knowget/gateway";
import type { ISODateString, Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  GATEWAY_INTEGRATE,
  GATEWAY_OPERATE,
  GATEWAY_READ,
  parseBody,
  tenantOf,
} from "./gateway-http";
import {
  disableIntegrationEndpointSchema,
  rebindEndpointAdapterSchema,
  registerIntegrationEndpointSchema,
  renameIntegrationEndpointSchema,
  rotateEndpointCredentialSchema,
  sweepEndpointQuarantineSchema,
} from "./gateway.dto";
import { GW_ENDPOINT_SERVICE } from "./gateway.tokens";

/**
 * REST surface for integration endpoints (P3-D01) — the things outside the platform that the platform may call.
 *
 * An endpoint here is a protocol, an adapter key and a credential *reference*. It is not a URL, a socket or a
 * client, and nothing on this surface performs a call: the fabric describes what may be called and the adapter at
 * the composition root does the calling, which is what keeps every external vendor behind an adapter instead of
 * behind a hostname somebody typed into a record. Registration is refused unless the named adapter exists and
 * supports the endpoint's protocol, so an endpoint pointing at an unbuilt adapter fails here rather than on the
 * first delivery.
 *
 * Health is observed rather than declared. There is no route that sets an endpoint healthy or unreachable, because
 * that would let an operator's opinion overwrite what the platform actually experienced — the circuit posture and
 * the health summary are computed from recorded outcomes, and recording an outcome is a delivery worker's act,
 * which is why `recordOutcomes` is deliberately absent from this surface. What an operator does get is the two
 * decisions the platform will not make on its own: `quarantine`, to take something out of service now, and
 * `disable`, to take it out with a reason and keep it out.
 *
 * The sweep is the exception that proves the shape. It quarantines every endpoint whose circuit has been open long
 * enough to stop being an incident, judges the whole batch against one instant supplied by the caller, and returns
 * what it quarantined rather than a count — because the caller is a scheduled job whose log line is the only
 * record anybody will read of why four endpoints went out of service overnight. It sits under `gateway:operate`
 * rather than `gateway:integrate`: it operates arrangements somebody else made and creates nothing.
 */
@Controller("gateway/endpoints")
export class IntegrationEndpointController {
  constructor(@Inject(GW_ENDPOINT_SERVICE) private readonly service: IntegrationEndpointService) {}

  /**
   * Register something the platform may call. Starts `registered` rather than `active` for the reason a consumer
   * does — the arrangement is reviewable before anything travels over it.
   */
  @RequirePermissions(GATEWAY_INTEGRATE)
  @Post()
  @HttpCode(201)
  async register(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<IntegrationEndpoint> {
    const dto = parseBody(registerIntegrationEndpointSchema, body);
    return this.service.register({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      endpointKey: dto.endpointKey,
      displayName: dto.displayName,
      protocol: dto.protocol,
      adapterKey: dto.adapterKey,
      credentialRef: dto.credentialRef,
    });
  }

  /** Change the label. The endpoint key is what subscriptions and deliveries refer to and does not move. */
  @RequirePermissions(GATEWAY_INTEGRATE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<IntegrationEndpoint> {
    const dto = parseBody(renameIntegrationEndpointSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.displayName);
  }

  /**
   * Send this endpoint's calls through a different adapter. The new adapter must support the endpoint's protocol,
   * which is checked against the adapter registry rather than assumed — the protocol is the one thing about an
   * endpoint that cannot be rebound, because it is what the far side speaks.
   */
  @RequirePermissions(GATEWAY_INTEGRATE)
  @Post(":id/rebind-adapter")
  @HttpCode(200)
  async rebindAdapter(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<IntegrationEndpoint> {
    const dto = parseBody(rebindEndpointAdapterSchema, body);
    return this.service.rebindAdapter(tenantOf(principal), id as Uuid, dto.adapterKey);
  }

  /**
   * Point the endpoint at different credential material, or at none. An explicit `null` is how *this needs no
   * credential of ours* is said, and it is a different statement from a field nobody filled in.
   */
  @RequirePermissions(GATEWAY_INTEGRATE)
  @Post(":id/rotate-credential")
  @HttpCode(200)
  async rotateCredential(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<IntegrationEndpoint> {
    const dto = parseBody(rotateEndpointCredentialSchema, body);
    return this.service.rotateCredential(tenantOf(principal), id as Uuid, dto.credentialRef);
  }

  /** Put it in service. Also the way back from a quarantine an operator has decided was resolved. */
  @RequirePermissions(GATEWAY_INTEGRATE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<IntegrationEndpoint> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  /**
   * Take it out of service now, without waiting for the sweep. The manual form of what an open circuit eventually
   * causes, for the case where a human already knows what the platform is about to find out.
   */
  @RequirePermissions(GATEWAY_INTEGRATE)
  @Post(":id/quarantine")
  @HttpCode(200)
  async quarantine(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<IntegrationEndpoint> {
    return this.service.quarantine(tenantOf(principal), id as Uuid);
  }

  /**
   * Take it out of service and keep it out, with the reason recorded. Every subscription behind this endpoint
   * stops being deliverable, which is why the reason is compulsory and why the read below exists.
   */
  @RequirePermissions(GATEWAY_INTEGRATE)
  @Post(":id/disable")
  @HttpCode(200)
  async disable(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<IntegrationEndpoint> {
    const dto = parseBody(disableIntegrationEndpointSchema, body);
    return this.service.disable(tenantOf(principal), id as Uuid, dto.reason);
  }

  /** End the arrangement. The record stays, because what the platform used to call is a durable question. */
  @RequirePermissions(GATEWAY_INTEGRATE)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<IntegrationEndpoint> {
    return this.service.retire(tenantOf(principal), id as Uuid);
  }

  /**
   * Quarantine every open circuit that has been open long enough, as of one instant, and say which.
   *
   * Not a creation, so 200 rather than 201, and the instant is an argument rather than a clock reading: an
   * endpoint that crossed the threshold on the boundary falls in this run or the next one, never in both, and a
   * sweep can be re-run against a past instant to establish what it would have done.
   */
  @RequirePermissions(GATEWAY_OPERATE)
  @Post("sweep")
  @HttpCode(200)
  async sweepQuarantine(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<readonly IntegrationEndpoint[]> {
    const dto = parseBody(sweepEndpointQuarantineSchema, body);
    return this.service.sweepQuarantine(tenantOf(principal), dto.asOf as ISODateString);
  }

  /** Every endpoint in the tenant, retired ones included. */
  @RequirePermissions(GATEWAY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly IntegrationEndpoint[]> {
    return this.service.list(tenantOf(principal));
  }

  /** What the platform can actually reach for this organization right now. */
  @RequirePermissions(GATEWAY_READ)
  @Get("callable/:organizationId")
  async listCallable(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly IntegrationEndpoint[]> {
    return this.service.listCallable(tenantOf(principal), organizationId as Uuid);
  }

  /**
   * What is currently failing, oldest breakage first. Tenant-wide and not scoped to an organization, because this
   * is the read an operator opens when something is wrong and does not yet know where.
   */
  @RequirePermissions(GATEWAY_READ)
  @Get("open-circuits")
  async listOpenCircuits(
    @CurrentPrincipal() principal: Principal,
  ): Promise<readonly IntegrationEndpoint[]> {
    return this.service.listOpenCircuits(tenantOf(principal));
  }

  /** One endpoint by the key subscriptions name it with. */
  @RequirePermissions(GATEWAY_READ)
  @Get("by-key/:endpointKey")
  async getByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("endpointKey") endpointKey: string,
  ): Promise<IntegrationEndpoint> {
    return this.service.getByKey(tenantOf(principal), endpointKey);
  }

  /** One endpoint, or a 404. */
  @RequirePermissions(GATEWAY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<IntegrationEndpoint> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
