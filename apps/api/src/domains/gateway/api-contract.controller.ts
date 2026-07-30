import type { Principal } from "@knowget/auth";
import { type ApiContract, ApiContractService } from "@knowget/gateway";
import type { ISODateString, Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { GATEWAY_PUBLISH, GATEWAY_READ, actorOf, parseBody, tenantOf } from "./gateway-http";
import {
  defineApiContractSchema,
  deprecateApiContractSchema,
  reviseApiContractSchema,
} from "./gateway.dto";
import { GW_CONTRACT_SERVICE } from "./gateway.tokens";

/**
 * REST surface for API contracts (P3-D01) — the versioned promises the institution makes to the outside world.
 *
 * A contract is the unit of that promise, and the lifecycle on this surface is what makes *expose capabilities,
 * never implementation* survive contact with a second release. A draft can be restated freely and a published one
 * cannot be touched at all: there is no route here that edits a published contract's shape, because an integrator
 * who built against a shape is entitled to keep finding it, and a new shape is a new version standing beside the
 * old one rather than a change to it. That is why revision reaches only the title, the summary and the
 * specification reference — the three fields that describe the promise — and never the capability, the version or
 * the style, which are the three that identify it.
 *
 * Deprecation is a dated announcement rather than a state somebody flips. Both instants arrive in the body and
 * neither is read from the server's clock, so the notice period is a fact about what was promised rather than an
 * artefact of when the request happened, and the aggregate refuses a notice too short for an integrator to act on.
 * The successor version is compulsory for the same reason: *this is going away* without *use this instead* is an
 * outage with a lead time, and the service checks the successor is actually usable before accepting the notice.
 *
 * Everything here is gated by `gateway:publish`, held apart from `gateway:admit`. Deciding what the platform
 * offers and deciding who may call it are different acts with different consequences, and a person who defines the
 * institution's public surface still cannot hand out a key to it.
 */
@Controller("gateway/contracts")
export class ApiContractController {
  constructor(@Inject(GW_CONTRACT_SERVICE) private readonly service: ApiContractService) {}

  /**
   * Declare a version of a capability. Starts as a draft, because a contract's shape is negotiable exactly until
   * somebody outside can see it, and publication is the separate act that ends the negotiation.
   */
  @RequirePermissions(GATEWAY_PUBLISH)
  @Post()
  @HttpCode(201)
  async define(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ApiContract> {
    const dto = parseBody(defineApiContractSchema, body);
    return this.service.define({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      capabilityKey: dto.capabilityKey,
      contractVersion: dto.contractVersion,
      title: dto.title,
      summary: dto.summary,
      style: dto.style,
      specificationRef: dto.specificationRef,
    });
  }

  /** Say the same promise better, while it is still a draft. Nothing is announced, because nobody has looked yet. */
  @RequirePermissions(GATEWAY_PUBLISH)
  @Post(":id/revise")
  @HttpCode(200)
  async revise(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ApiContract> {
    const dto = parseBody(reviseApiContractSchema, body);
    return this.service.revise(tenantOf(principal), id as Uuid, {
      title: dto.title,
      summary: dto.summary,
      specificationRef: dto.specificationRef,
    });
  }

  /**
   * Make the promise, in the name of the person answerable for it. The moment the shape stops moving — taken from
   * the principal rather than the body, because the one attribution that matters on a public commitment is whose
   * commitment it was.
   */
  @RequirePermissions(GATEWAY_PUBLISH)
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ApiContract> {
    return this.service.publish(tenantOf(principal), id as Uuid, actorOf(principal));
  }

  /**
   * Announce that this version is going away, from when, and what to move to. The notice period is measured
   * between the two instants named here, and the successor is checked for being something a caller could actually
   * migrate onto before the announcement is accepted.
   */
  @RequirePermissions(GATEWAY_PUBLISH)
  @Post(":id/deprecate")
  @HttpCode(200)
  async deprecate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ApiContract> {
    const dto = parseBody(deprecateApiContractSchema, body);
    return this.service.deprecate(
      tenantOf(principal),
      id as Uuid,
      dto.announcedAt as ISODateString,
      dto.sunsetAt as ISODateString,
      dto.supersededByVersion,
    );
  }

  /**
   * Stop answering. Reachable from a deprecation whose notice has run, and from a draft nobody published — the
   * record stays either way, because what the institution used to offer is how a caller's failure gets explained.
   */
  @RequirePermissions(GATEWAY_PUBLISH)
  @Post(":id/sunset")
  @HttpCode(200)
  async sunset(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ApiContract> {
    return this.service.sunset(tenantOf(principal), id as Uuid);
  }

  /** Every contract in the tenant, drafts and sunset versions included. */
  @RequirePermissions(GATEWAY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly ApiContract[]> {
    return this.service.list(tenantOf(principal));
  }

  /** What this organization is answering right now: published, plus deprecated and not yet past its sunset. */
  @RequirePermissions(GATEWAY_READ)
  @Get("servable/:organizationId")
  async listServable(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly ApiContract[]> {
    return this.service.listServable(tenantOf(principal), organizationId as Uuid);
  }

  /** What is on notice — the worklist a migration campaign is drawn from. */
  @RequirePermissions(GATEWAY_READ)
  @Get("deprecated/:organizationId")
  async listDeprecated(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly ApiContract[]> {
    return this.service.listDeprecated(tenantOf(principal), organizationId as Uuid);
  }

  /** One version of one capability. */
  @RequirePermissions(GATEWAY_READ)
  @Get("by-capability/:capabilityKey/:contractVersion")
  async getByCapabilityAndVersion(
    @CurrentPrincipal() principal: Principal,
    @Param("capabilityKey") capabilityKey: string,
    @Param("contractVersion") contractVersion: string,
  ): Promise<ApiContract> {
    return this.service.getByCapabilityAndVersion(
      tenantOf(principal),
      capabilityKey,
      contractVersion,
    );
  }

  /** Every version of one capability, oldest version string first. The read a version history is. */
  @RequirePermissions(GATEWAY_READ)
  @Get("by-capability/:capabilityKey")
  async listByCapability(
    @CurrentPrincipal() principal: Principal,
    @Param("capabilityKey") capabilityKey: string,
  ): Promise<readonly ApiContract[]> {
    return this.service.listByCapability(tenantOf(principal), capabilityKey);
  }

  /** One contract, or a 404. */
  @RequirePermissions(GATEWAY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ApiContract> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
