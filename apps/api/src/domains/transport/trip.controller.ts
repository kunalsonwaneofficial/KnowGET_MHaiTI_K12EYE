import type { Principal } from "@knowget/auth";
import { type Trip, type TripOccupancy, TripService } from "@knowget/transport";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { TRANSPORT_READ, TRANSPORT_WRITE, parseBody, tenantOf } from "./transport-http";
import { recordBoardingSchema, scheduleTripSchema } from "./transport.dto";
import { TR_TRIP_SERVICE } from "./transport.tokens";

/** REST surface for trips (P2-D16). Gated by transport:*; tenant-scoped. */
@Controller("transport/trips")
export class TripController {
  constructor(@Inject(TR_TRIP_SERVICE) private readonly service: TripService) {}

  @RequirePermissions(TRANSPORT_WRITE)
  @Post()
  @HttpCode(201)
  async schedule(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Trip> {
    const dto = parseBody(scheduleTripSchema, body);
    return this.service.schedule({
      tenantId: tenantOf(principal),
      routeId: dto.routeId as Uuid,
      vehicleId: dto.vehicleId as Uuid,
      driverId: dto.driverId as Uuid,
      serviceDate: dto.serviceDate,
      direction: dto.direction,
    });
  }

  @RequirePermissions(TRANSPORT_WRITE)
  @Post(":id/start")
  @HttpCode(200)
  async start(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Trip> {
    return this.service.start(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TRANSPORT_WRITE)
  @Post(":id/boarding")
  @HttpCode(200)
  async recordBoarding(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Trip> {
    const dto = parseBody(recordBoardingSchema, body);
    return this.service.recordBoarding(tenantOf(principal), id as Uuid, {
      studentId: dto.studentId as Uuid,
      stopKey: dto.stopKey,
      type: dto.type,
      occurredAt: dto.occurredAt,
    });
  }

  @RequirePermissions(TRANSPORT_WRITE)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Trip> {
    return this.service.complete(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TRANSPORT_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Trip> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get(":id/occupancy")
  async occupancy(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<TripOccupancy> {
    return this.service.occupancyFor(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get("by-route/:routeId")
  async listForRoute(
    @CurrentPrincipal() principal: Principal,
    @Param("routeId") routeId: string,
  ): Promise<Trip[]> {
    return this.service.listForRoute(tenantOf(principal), routeId as Uuid);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get("by-vehicle/:vehicleId")
  async listForVehicle(
    @CurrentPrincipal() principal: Principal,
    @Param("vehicleId") vehicleId: string,
  ): Promise<Trip[]> {
    return this.service.listForVehicle(tenantOf(principal), vehicleId as Uuid);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Trip[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get(":id")
  async getById(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Trip> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
