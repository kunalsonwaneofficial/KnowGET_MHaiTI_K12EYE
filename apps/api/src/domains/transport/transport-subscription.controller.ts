import type { Principal } from "@knowget/auth";
import { type TransportSubscription, TransportSubscriptionService } from "@knowget/transport";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { TRANSPORT_READ, TRANSPORT_WRITE, parseBody, tenantOf } from "./transport-http";
import { endSubscriptionSchema, requestSubscriptionSchema } from "./transport.dto";
import { TR_SUBSCRIPTION_SERVICE } from "./transport.tokens";

/** REST surface for student transport subscriptions (P2-D16). Gated by transport:*; tenant-scoped. */
@Controller("transport/subscriptions")
export class TransportSubscriptionController {
  constructor(
    @Inject(TR_SUBSCRIPTION_SERVICE) private readonly service: TransportSubscriptionService,
  ) {}

  @RequirePermissions(TRANSPORT_WRITE)
  @Post()
  @HttpCode(201)
  async request(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<TransportSubscription> {
    const dto = parseBody(requestSubscriptionSchema, body);
    return this.service.request({
      tenantId: tenantOf(principal),
      studentId: dto.studentId as Uuid,
      routeId: dto.routeId as Uuid,
      pickupStopKey: dto.pickupStopKey,
      dropStopKey: dto.dropStopKey,
      direction: dto.direction,
      effectiveFrom: dto.effectiveFrom,
    });
  }

  @RequirePermissions(TRANSPORT_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<TransportSubscription> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TRANSPORT_WRITE)
  @Post(":id/suspend")
  @HttpCode(200)
  async suspend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<TransportSubscription> {
    return this.service.suspend(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TRANSPORT_WRITE)
  @Post(":id/resume")
  @HttpCode(200)
  async resume(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<TransportSubscription> {
    return this.service.resume(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TRANSPORT_WRITE)
  @Post(":id/end")
  @HttpCode(200)
  async end(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<TransportSubscription> {
    const dto = parseBody(endSubscriptionSchema, body);
    return this.service.end(tenantOf(principal), id as Uuid, dto.effectiveTo);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get("by-student/:studentId")
  async listForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<TransportSubscription[]> {
    return this.service.listForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get("by-route/:routeId")
  async listForRoute(
    @CurrentPrincipal() principal: Principal,
    @Param("routeId") routeId: string,
  ): Promise<TransportSubscription[]> {
    return this.service.listForRoute(tenantOf(principal), routeId as Uuid);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<TransportSubscription[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<TransportSubscription> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
