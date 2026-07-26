import type { Principal } from "@knowget/auth";
import { type AlumniEvent, AlumniEventService } from "@knowget/alumni";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { COMMUNITY_READ, COMMUNITY_WRITE, parseBody, tenantOf } from "./alumni-http";
import {
  createEventSchema,
  renameEventSchema,
  setEventCapacitySchema,
  setEventTypeSchema,
  setEventWindowSchema,
} from "./alumni.dto";
import { AL_EVENT_SERVICE } from "./alumni.tokens";

/** REST surface for alumni events (P2-D24). Gated by community:*; tenant-scoped. */
@Controller("community/events")
export class AlumniEventController {
  constructor(@Inject(AL_EVENT_SERVICE) private readonly service: AlumniEventService) {}

  @RequirePermissions(COMMUNITY_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AlumniEvent> {
    const dto = parseBody(createEventSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      name: dto.name,
      type: dto.type,
      capacity: dto.capacity ?? 0,
      startsOn: dto.startsOn ?? null,
      endsOn: dto.endsOn ?? null,
    });
  }

  @RequirePermissions(COMMUNITY_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AlumniEvent> {
    const dto = parseBody(renameEventSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(COMMUNITY_WRITE)
  @Post(":id/type")
  @HttpCode(200)
  async setType(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AlumniEvent> {
    const dto = parseBody(setEventTypeSchema, body);
    return this.service.setType(tenantOf(principal), id as Uuid, dto.type);
  }

  @RequirePermissions(COMMUNITY_WRITE)
  @Post(":id/capacity")
  @HttpCode(200)
  async setCapacity(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AlumniEvent> {
    const dto = parseBody(setEventCapacitySchema, body);
    return this.service.setCapacity(tenantOf(principal), id as Uuid, dto.capacity);
  }

  @RequirePermissions(COMMUNITY_WRITE)
  @Post(":id/window")
  @HttpCode(200)
  async setWindow(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AlumniEvent> {
    const dto = parseBody(setEventWindowSchema, body);
    return this.service.setWindow(tenantOf(principal), id as Uuid, dto.startsOn, dto.endsOn);
  }

  @RequirePermissions(COMMUNITY_WRITE)
  @Post(":id/schedule")
  @HttpCode(200)
  async schedule(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AlumniEvent> {
    return this.service.schedule(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COMMUNITY_WRITE)
  @Post(":id/open")
  @HttpCode(200)
  async open(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AlumniEvent> {
    return this.service.open(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COMMUNITY_WRITE)
  @Post(":id/close")
  @HttpCode(200)
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AlumniEvent> {
    return this.service.close(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COMMUNITY_WRITE)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AlumniEvent> {
    return this.service.complete(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COMMUNITY_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AlumniEvent> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COMMUNITY_READ)
  @Get("by-code/:code")
  async getByCode(
    @CurrentPrincipal() principal: Principal,
    @Param("code") code: string,
  ): Promise<AlumniEvent> {
    return this.service.getByCode(tenantOf(principal), code);
  }

  @RequirePermissions(COMMUNITY_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<AlumniEvent[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(COMMUNITY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AlumniEvent> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
