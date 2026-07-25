import type { Principal } from "@knowget/auth";
import {
  type FleetUtilizationSummary,
  type RouteUtilizationProfile,
  RouteUtilizationProfileService,
} from "@knowget/transport";
import type { Uuid } from "@knowget/types";
import { Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { TRANSPORT_READ, TRANSPORT_WRITE, tenantOf } from "./transport-http";
import { TR_UTILIZATION_SERVICE } from "./transport.tokens";

/**
 * REST surface for route utilization profiles (P2-D16) — the descriptive seat-usage read model. A
 * profile is always derived: `refresh` reconciles a route's active subscribers against its assigned
 * vehicle's capacity through the pure engine. Gated by transport:*; tenant-scoped.
 */
@Controller("transport/utilization")
export class RouteUtilizationProfileController {
  constructor(
    @Inject(TR_UTILIZATION_SERVICE) private readonly service: RouteUtilizationProfileService,
  ) {}

  @RequirePermissions(TRANSPORT_WRITE)
  @Post("refresh/:routeId")
  @HttpCode(200)
  async refresh(
    @CurrentPrincipal() principal: Principal,
    @Param("routeId") routeId: string,
  ): Promise<RouteUtilizationProfile> {
    return this.service.refresh(tenantOf(principal), routeId as Uuid);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get("by-route/:routeId")
  async getForRoute(
    @CurrentPrincipal() principal: Principal,
    @Param("routeId") routeId: string,
  ): Promise<RouteUtilizationProfile> {
    return this.service.getForRoute(tenantOf(principal), routeId as Uuid);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<RouteUtilizationProfile[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get("by-organization/:organizationId/summary")
  async fleetSummary(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<FleetUtilizationSummary> {
    return this.service.fleetSummaryFor(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<RouteUtilizationProfile> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
