import type { Principal } from "@knowget/auth";
import { type Reservation, ReservationService } from "@knowget/library";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { CIRCULATION_READ, CIRCULATION_WRITE, parseBody, tenantOf } from "./library-http";
import { markReservationReadySchema, placeReservationSchema } from "./library.dto";
import { LB_RESERVATION_SERVICE } from "./library.tokens";

/** REST surface for reservations (P2-D18). Gated by circulation:*; tenant-scoped. */
@Controller("circulation/reservations")
export class ReservationController {
  constructor(@Inject(LB_RESERVATION_SERVICE) private readonly service: ReservationService) {}

  @RequirePermissions(CIRCULATION_WRITE)
  @Post()
  @HttpCode(201)
  async place(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Reservation> {
    const dto = parseBody(placeReservationSchema, body);
    return this.service.place({
      tenantId: tenantOf(principal),
      titleId: dto.titleId as Uuid,
      memberId: dto.memberId as Uuid,
      requestedOn: dto.requestedOn,
    });
  }

  @RequirePermissions(CIRCULATION_WRITE)
  @Post(":id/ready")
  @HttpCode(200)
  async markReady(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Reservation> {
    const dto = parseBody(markReservationReadySchema, body);
    return this.service.markReady(tenantOf(principal), id as Uuid, dto.readyOn, dto.expiresOn);
  }

  @RequirePermissions(CIRCULATION_WRITE)
  @Post(":id/fulfill")
  @HttpCode(200)
  async fulfill(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Reservation> {
    return this.service.fulfill(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CIRCULATION_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Reservation> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CIRCULATION_WRITE)
  @Post(":id/expire")
  @HttpCode(200)
  async expire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Reservation> {
    return this.service.expire(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CIRCULATION_READ)
  @Get("open/by-title/:titleId")
  async listOpenForTitle(
    @CurrentPrincipal() principal: Principal,
    @Param("titleId") titleId: string,
  ): Promise<Reservation[]> {
    return this.service.listOpenForTitle(tenantOf(principal), titleId as Uuid);
  }

  @RequirePermissions(CIRCULATION_READ)
  @Get("by-member/:memberId")
  async listForMember(
    @CurrentPrincipal() principal: Principal,
    @Param("memberId") memberId: string,
  ): Promise<Reservation[]> {
    return this.service.listForMember(tenantOf(principal), memberId as Uuid);
  }

  @RequirePermissions(CIRCULATION_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Reservation> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
