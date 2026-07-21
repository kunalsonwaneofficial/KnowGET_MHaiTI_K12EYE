import type { Principal } from "@knowget/auth";
import { type CommunicationProfile, CommunicationProfileService } from "@knowget/family-guardian";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  createCommunicationProfileSchema,
  putScheduleSchema,
  setAccessibilitySchema,
  setNotificationPreferenceSchema,
  setPreferredChannelsSchema,
  setPreferredLanguageSchema,
} from "./family-guardian.dto";
import { FAMILY_READ, FAMILY_WRITE, parseBody, tenantOf } from "./family-guardian-http";
import { FG_COMMUNICATION_PROFILE_SERVICE } from "./family-guardian.tokens";

/** REST surface for family communication profiles (P2-D04). Permission-gated; tenant-scoped. */
@Controller("family-guardian/communication-profiles")
export class CommunicationProfileController {
  constructor(
    @Inject(FG_COMMUNICATION_PROFILE_SERVICE)
    private readonly service: CommunicationProfileService,
  ) {}

  @RequirePermissions(FAMILY_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<CommunicationProfile> {
    const dto = parseBody(createCommunicationProfileSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      familyId: dto.familyId as Uuid,
      ...(dto.preferredLanguage !== undefined ? { preferredLanguage: dto.preferredLanguage } : {}),
      ...(dto.preferredChannels !== undefined ? { preferredChannels: dto.preferredChannels } : {}),
    });
  }

  @RequirePermissions(FAMILY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<CommunicationProfile[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(FAMILY_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<CommunicationProfile[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FAMILY_READ)
  @Get("by-family/:familyId")
  async getByFamily(
    @CurrentPrincipal() principal: Principal,
    @Param("familyId") familyId: string,
  ): Promise<CommunicationProfile> {
    return this.service.getByFamily(tenantOf(principal), familyId as Uuid);
  }

  @RequirePermissions(FAMILY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<CommunicationProfile> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/language")
  @HttpCode(200)
  async setPreferredLanguage(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CommunicationProfile> {
    const dto = parseBody(setPreferredLanguageSchema, body);
    return this.service.setPreferredLanguage(tenantOf(principal), id as Uuid, dto.language);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/channels")
  @HttpCode(200)
  async setPreferredChannels(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CommunicationProfile> {
    const dto = parseBody(setPreferredChannelsSchema, body);
    return this.service.setPreferredChannels(tenantOf(principal), id as Uuid, dto.channels);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/schedules")
  @HttpCode(200)
  async putSchedule(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CommunicationProfile> {
    const dto = parseBody(putScheduleSchema, body);
    return this.service.putSchedule(tenantOf(principal), id as Uuid, {
      label: dto.label,
      days: dto.days,
      fromTime: dto.fromTime,
      toTime: dto.toTime,
    });
  }

  @RequirePermissions(FAMILY_WRITE)
  @Delete(":id/schedules/:label")
  async removeSchedule(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("label") label: string,
  ): Promise<CommunicationProfile> {
    return this.service.removeSchedule(tenantOf(principal), id as Uuid, label);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/notifications")
  @HttpCode(200)
  async setNotificationPreference(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CommunicationProfile> {
    const dto = parseBody(setNotificationPreferenceSchema, body);
    return this.service.setNotificationPreference(
      tenantOf(principal),
      id as Uuid,
      dto.category,
      dto.level,
    );
  }

  @RequirePermissions(FAMILY_WRITE)
  @Delete(":id/notifications/:category")
  async clearNotificationPreference(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("category") category: string,
  ): Promise<CommunicationProfile> {
    return this.service.clearNotificationPreference(tenantOf(principal), id as Uuid, category);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/accessibility")
  @HttpCode(200)
  async setAccessibility(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CommunicationProfile> {
    const dto = parseBody(setAccessibilitySchema, body);
    return this.service.setAccessibilityRequirements(
      tenantOf(principal),
      id as Uuid,
      dto.requirements,
    );
  }
}
