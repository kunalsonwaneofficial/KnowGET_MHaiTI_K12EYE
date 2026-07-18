import type { Principal } from "@knowget/auth";
import { type GovernanceCalendarEntry, GovernanceCalendarService } from "@knowget/governance";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { GOVERNANCE_READ, GOVERNANCE_WRITE, parseBody, tenantOf } from "./governance-http";
import { completeEntrySchema, rescheduleEntrySchema, scheduleEntrySchema } from "./governance.dto";
import { GOVERNANCE_CALENDAR_SERVICE } from "./governance.tokens";

/** REST surface for the governance calendar (P2-D02). Permission-gated; tenant-scoped. */
@Controller("governance/calendar")
export class GovernanceCalendarController {
  constructor(
    @Inject(GOVERNANCE_CALENDAR_SERVICE) private readonly service: GovernanceCalendarService,
  ) {}

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post()
  @HttpCode(201)
  async schedule(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<GovernanceCalendarEntry> {
    const dto = parseBody(scheduleEntrySchema, body);
    return this.service.schedule({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      type: dto.type,
      title: dto.title,
      scheduledOn: dto.scheduledOn,
      ...(dto.governanceBodyId !== undefined
        ? { governanceBodyId: dto.governanceBodyId as Uuid }
        : {}),
      ...(dto.committeeId !== undefined ? { committeeId: dto.committeeId as Uuid } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
    });
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<GovernanceCalendarEntry[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<GovernanceCalendarEntry[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get("upcoming")
  async upcoming(@CurrentPrincipal() principal: Principal): Promise<GovernanceCalendarEntry[]> {
    return this.service.upcoming(tenantOf(principal));
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<GovernanceCalendarEntry> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/reschedule")
  @HttpCode(200)
  async reschedule(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<GovernanceCalendarEntry> {
    const dto = parseBody(rescheduleEntrySchema, body);
    return this.service.reschedule(tenantOf(principal), id as Uuid, dto.scheduledOn);
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<GovernanceCalendarEntry> {
    const dto = parseBody(completeEntrySchema, body);
    return this.service.complete(tenantOf(principal), id as Uuid, {
      ...(dto.completedOn !== undefined ? { completedOn: dto.completedOn } : {}),
      ...(dto.minutes !== undefined ? { minutes: dto.minutes } : {}),
      ...(dto.attendeeIds !== undefined ? { attendeeIds: dto.attendeeIds as Uuid[] } : {}),
    });
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<GovernanceCalendarEntry> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }
}
