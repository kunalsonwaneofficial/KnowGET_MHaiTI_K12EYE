import type { Principal } from "@knowget/auth";
import { type MentorshipConnection, MentorshipConnectionService } from "@knowget/alumni";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ALUMNI_READ, ALUMNI_WRITE, parseBody, tenantOf } from "./alumni-http";
import {
  activateMentorshipSchema,
  endMentorshipSchema,
  proposeMentorshipSchema,
} from "./alumni.dto";
import { AL_MENTORSHIP_SERVICE } from "./alumni.tokens";

/** REST surface for mentorship connections (P2-D24). Gated by alumni:*; tenant-scoped. */
@Controller("alumni/mentorships")
export class MentorshipConnectionController {
  constructor(
    @Inject(AL_MENTORSHIP_SERVICE) private readonly service: MentorshipConnectionService,
  ) {}

  @RequirePermissions(ALUMNI_WRITE)
  @Post()
  @HttpCode(201)
  async propose(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<MentorshipConnection> {
    const dto = parseBody(proposeMentorshipSchema, body);
    return this.service.propose({
      tenantId: tenantOf(principal),
      mentorProfileId: dto.mentorProfileId as Uuid,
      menteeProfileId: dto.menteeProfileId as Uuid,
      proposedOn: dto.proposedOn,
      focus: dto.focus ?? null,
    });
  }

  @RequirePermissions(ALUMNI_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<MentorshipConnection> {
    const dto = parseBody(activateMentorshipSchema, body);
    return this.service.activate(tenantOf(principal), id as Uuid, dto.startedOn);
  }

  @RequirePermissions(ALUMNI_WRITE)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<MentorshipConnection> {
    const dto = parseBody(endMentorshipSchema, body);
    return this.service.complete(tenantOf(principal), id as Uuid, dto.endedOn);
  }

  @RequirePermissions(ALUMNI_WRITE)
  @Post(":id/end")
  @HttpCode(200)
  async end(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<MentorshipConnection> {
    const dto = parseBody(endMentorshipSchema, body);
    return this.service.end(tenantOf(principal), id as Uuid, dto.endedOn);
  }

  @RequirePermissions(ALUMNI_READ)
  @Get("by-alumnus/:alumniProfileId")
  async listForAlumnus(
    @CurrentPrincipal() principal: Principal,
    @Param("alumniProfileId") alumniProfileId: string,
  ): Promise<MentorshipConnection[]> {
    return this.service.listForAlumnus(tenantOf(principal), alumniProfileId as Uuid);
  }

  @RequirePermissions(ALUMNI_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MentorshipConnection> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
