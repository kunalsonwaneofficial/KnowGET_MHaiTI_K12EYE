import type { Principal } from "@knowget/auth";
import { type EventRegistration, EventRegistrationService } from "@knowget/alumni";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { COMMUNITY_READ, COMMUNITY_WRITE, parseBody, tenantOf } from "./alumni-http";
import { registerForEventSchema, respondRegistrationSchema } from "./alumni.dto";
import { AL_REGISTRATION_SERVICE } from "./alumni.tokens";

/** REST surface for event registrations (P2-D24). Gated by community:*; tenant-scoped. */
@Controller("community/registrations")
export class EventRegistrationController {
  constructor(
    @Inject(AL_REGISTRATION_SERVICE) private readonly service: EventRegistrationService,
  ) {}

  @RequirePermissions(COMMUNITY_WRITE)
  @Post()
  @HttpCode(201)
  async register(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<EventRegistration> {
    const dto = parseBody(registerForEventSchema, body);
    return this.service.register({
      tenantId: tenantOf(principal),
      eventId: dto.eventId as Uuid,
      alumniProfileId: dto.alumniProfileId as Uuid,
      registeredOn: dto.registeredOn,
    });
  }

  @RequirePermissions(COMMUNITY_WRITE)
  @Post(":id/attend")
  @HttpCode(200)
  async attend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EventRegistration> {
    const dto = parseBody(respondRegistrationSchema, body);
    return this.service.markAttended(tenantOf(principal), id as Uuid, dto.respondedOn);
  }

  @RequirePermissions(COMMUNITY_WRITE)
  @Post(":id/no-show")
  @HttpCode(200)
  async noShow(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EventRegistration> {
    const dto = parseBody(respondRegistrationSchema, body);
    return this.service.markNoShow(tenantOf(principal), id as Uuid, dto.respondedOn);
  }

  @RequirePermissions(COMMUNITY_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EventRegistration> {
    const dto = parseBody(respondRegistrationSchema, body);
    return this.service.cancel(tenantOf(principal), id as Uuid, dto.respondedOn);
  }

  @RequirePermissions(COMMUNITY_READ)
  @Get("by-event/:eventId")
  async listForEvent(
    @CurrentPrincipal() principal: Principal,
    @Param("eventId") eventId: string,
  ): Promise<EventRegistration[]> {
    return this.service.listForEvent(tenantOf(principal), eventId as Uuid);
  }

  @RequirePermissions(COMMUNITY_READ)
  @Get("by-alumnus/:alumniProfileId")
  async listForAlumnus(
    @CurrentPrincipal() principal: Principal,
    @Param("alumniProfileId") alumniProfileId: string,
  ): Promise<EventRegistration[]> {
    return this.service.listForAlumnus(tenantOf(principal), alumniProfileId as Uuid);
  }

  @RequirePermissions(COMMUNITY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EventRegistration> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
