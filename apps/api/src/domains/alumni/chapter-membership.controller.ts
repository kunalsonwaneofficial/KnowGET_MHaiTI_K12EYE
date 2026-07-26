import type { Principal } from "@knowget/auth";
import { type ChapterMembership, ChapterMembershipService } from "@knowget/alumni";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { COMMUNITY_READ, COMMUNITY_WRITE, parseBody, tenantOf } from "./alumni-http";
import { joinChapterSchema, leaveMembershipSchema, setMembershipRoleSchema } from "./alumni.dto";
import { AL_MEMBERSHIP_SERVICE } from "./alumni.tokens";

/** REST surface for chapter memberships (P2-D24). Gated by community:*; tenant-scoped. */
@Controller("community/memberships")
export class ChapterMembershipController {
  constructor(@Inject(AL_MEMBERSHIP_SERVICE) private readonly service: ChapterMembershipService) {}

  @RequirePermissions(COMMUNITY_WRITE)
  @Post()
  @HttpCode(201)
  async join(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ChapterMembership> {
    const dto = parseBody(joinChapterSchema, body);
    return this.service.join({
      tenantId: tenantOf(principal),
      chapterId: dto.chapterId as Uuid,
      alumniProfileId: dto.alumniProfileId as Uuid,
      joinedOn: dto.joinedOn,
      role: dto.role,
    });
  }

  @RequirePermissions(COMMUNITY_WRITE)
  @Post(":id/role")
  @HttpCode(200)
  async setRole(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ChapterMembership> {
    const dto = parseBody(setMembershipRoleSchema, body);
    return this.service.setRole(tenantOf(principal), id as Uuid, dto.role);
  }

  @RequirePermissions(COMMUNITY_WRITE)
  @Post(":id/leave")
  @HttpCode(200)
  async leave(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ChapterMembership> {
    const dto = parseBody(leaveMembershipSchema, body);
    return this.service.leave(tenantOf(principal), id as Uuid, dto.leftOn);
  }

  @RequirePermissions(COMMUNITY_READ)
  @Get("by-chapter/:chapterId")
  async listForChapter(
    @CurrentPrincipal() principal: Principal,
    @Param("chapterId") chapterId: string,
  ): Promise<ChapterMembership[]> {
    return this.service.listForChapter(tenantOf(principal), chapterId as Uuid);
  }

  @RequirePermissions(COMMUNITY_READ)
  @Get("by-alumnus/:alumniProfileId")
  async listForAlumnus(
    @CurrentPrincipal() principal: Principal,
    @Param("alumniProfileId") alumniProfileId: string,
  ): Promise<ChapterMembership[]> {
    return this.service.listForAlumnus(tenantOf(principal), alumniProfileId as Uuid);
  }

  @RequirePermissions(COMMUNITY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ChapterMembership> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
