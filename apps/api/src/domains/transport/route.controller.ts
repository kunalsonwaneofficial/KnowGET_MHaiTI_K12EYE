import type { Principal } from "@knowget/auth";
import { type Route, RouteService } from "@knowget/transport";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { TRANSPORT_READ, TRANSPORT_WRITE, parseBody, tenantOf } from "./transport-http";
import {
  addRouteStopSchema,
  draftRouteSchema,
  renameRouteSchema,
  setDepartureSchema,
} from "./transport.dto";
import { TR_ROUTE_SERVICE } from "./transport.tokens";

/** REST surface for routes (P2-D16). Gated by transport:*; tenant-scoped. */
@Controller("transport/routes")
export class RouteController {
  constructor(@Inject(TR_ROUTE_SERVICE) private readonly service: RouteService) {}

  @RequirePermissions(TRANSPORT_WRITE)
  @Post()
  @HttpCode(201)
  async draft(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Route> {
    const dto = parseBody(draftRouteSchema, body);
    return this.service.draft({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      name: dto.name,
      direction: dto.direction,
      departureMinutes: dto.departureMinutes,
      ...(dto.stops !== undefined ? { stops: dto.stops } : {}),
    });
  }

  @RequirePermissions(TRANSPORT_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Route> {
    const dto = parseBody(renameRouteSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(TRANSPORT_WRITE)
  @Post(":id/departure")
  @HttpCode(200)
  async setDeparture(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Route> {
    const dto = parseBody(setDepartureSchema, body);
    return this.service.setDeparture(tenantOf(principal), id as Uuid, dto.departureMinutes);
  }

  @RequirePermissions(TRANSPORT_WRITE)
  @Post(":id/stops")
  @HttpCode(200)
  async addStop(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Route> {
    const dto = parseBody(addRouteStopSchema, body);
    return this.service.addStop(tenantOf(principal), id as Uuid, dto);
  }

  @RequirePermissions(TRANSPORT_WRITE)
  @Post(":id/stops/:key/remove")
  @HttpCode(200)
  async removeStop(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("key") key: string,
  ): Promise<Route> {
    return this.service.removeStop(tenantOf(principal), id as Uuid, key);
  }

  @RequirePermissions(TRANSPORT_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Route> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TRANSPORT_WRITE)
  @Post(":id/suspend")
  @HttpCode(200)
  async suspend(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Route> {
    return this.service.suspend(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TRANSPORT_WRITE)
  @Post(":id/resume")
  @HttpCode(200)
  async resume(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Route> {
    return this.service.resume(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TRANSPORT_WRITE)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Route> {
    return this.service.retire(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Route[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get("by-code/:code")
  async getByCode(
    @CurrentPrincipal() principal: Principal,
    @Param("code") code: string,
  ): Promise<Route> {
    return this.service.getByCode(tenantOf(principal), code);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Route[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get(":id")
  async getById(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Route> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
