import type { Principal } from "@knowget/auth";
import { type Announcement, AnnouncementService } from "@knowget/engagement";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { COMMUNICATION_READ, COMMUNICATION_WRITE, parseBody, tenantOf } from "./engagement-http";
import {
  draftAnnouncementSchema,
  editAnnouncementContentSchema,
  publishAnnouncementSchema,
  scheduleAnnouncementSchema,
  setAnnouncementCategorySchema,
  setAnnouncementPrioritySchema,
} from "./engagement.dto";
import { EN_ANNOUNCEMENT_SERVICE } from "./engagement.tokens";

/** REST surface for announcements (P2-D22). Gated by communication:*; tenant-scoped. */
@Controller("communication/announcements")
export class AnnouncementController {
  constructor(@Inject(EN_ANNOUNCEMENT_SERVICE) private readonly service: AnnouncementService) {}

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post()
  @HttpCode(201)
  async draft(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Announcement> {
    const dto = parseBody(draftAnnouncementSchema, body);
    return this.service.draft({
      tenantId: tenantOf(principal),
      audienceId: dto.audienceId as Uuid,
      authorPersonId: dto.authorPersonId as Uuid,
      title: dto.title,
      body: dto.body,
      category: dto.category,
      priority: dto.priority,
    });
  }

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post(":id/content")
  @HttpCode(200)
  async editContent(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Announcement> {
    const dto = parseBody(editAnnouncementContentSchema, body);
    return this.service.editContent(tenantOf(principal), id as Uuid, dto.title, dto.body);
  }

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post(":id/category")
  @HttpCode(200)
  async setCategory(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Announcement> {
    const dto = parseBody(setAnnouncementCategorySchema, body);
    return this.service.setCategory(tenantOf(principal), id as Uuid, dto.category);
  }

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post(":id/priority")
  @HttpCode(200)
  async setPriority(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Announcement> {
    const dto = parseBody(setAnnouncementPrioritySchema, body);
    return this.service.setPriority(tenantOf(principal), id as Uuid, dto.priority);
  }

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post(":id/schedule")
  @HttpCode(200)
  async schedule(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Announcement> {
    const dto = parseBody(scheduleAnnouncementSchema, body);
    return this.service.schedule(tenantOf(principal), id as Uuid, dto.scheduledFor);
  }

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Announcement> {
    const dto = parseBody(publishAnnouncementSchema, body);
    return this.service.publish(tenantOf(principal), id as Uuid, dto.publishedAt);
  }

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post(":id/pin")
  @HttpCode(200)
  async pin(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Announcement> {
    return this.service.pin(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post(":id/unpin")
  @HttpCode(200)
  async unpin(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Announcement> {
    return this.service.unpin(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Announcement> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Announcement> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COMMUNICATION_READ)
  @Get("by-audience/:audienceId")
  async listForAudience(
    @CurrentPrincipal() principal: Principal,
    @Param("audienceId") audienceId: string,
  ): Promise<Announcement[]> {
    return this.service.listForAudience(tenantOf(principal), audienceId as Uuid);
  }

  @RequirePermissions(COMMUNICATION_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Announcement[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(COMMUNICATION_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Announcement> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
