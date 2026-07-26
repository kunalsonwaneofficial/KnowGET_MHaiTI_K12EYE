import type { Principal } from "@knowget/auth";
import { type Audience, AudienceService } from "@knowget/engagement";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { COMMUNICATION_READ, COMMUNICATION_WRITE, parseBody, tenantOf } from "./engagement-http";
import {
  audienceMembersSchema,
  createAudienceSchema,
  renameAudienceSchema,
  setAudienceCriteriaSchema,
  setAudienceDescriptionSchema,
} from "./engagement.dto";
import { EN_AUDIENCE_SERVICE } from "./engagement.tokens";

/** REST surface for audiences (P2-D22). Gated by communication:*; tenant-scoped. */
@Controller("communication/audiences")
export class AudienceController {
  constructor(@Inject(EN_AUDIENCE_SERVICE) private readonly service: AudienceService) {}

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post()
  @HttpCode(201)
  async create(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Audience> {
    const dto = parseBody(createAudienceSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      criteriaLabel: dto.criteriaLabel ?? null,
      memberPersonIds: (dto.memberPersonIds ?? []) as Uuid[],
    });
  }

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Audience> {
    const dto = parseBody(renameAudienceSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post(":id/description")
  @HttpCode(200)
  async setDescription(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Audience> {
    const dto = parseBody(setAudienceDescriptionSchema, body);
    return this.service.setDescription(tenantOf(principal), id as Uuid, dto.description);
  }

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post(":id/criteria")
  @HttpCode(200)
  async setCriteria(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Audience> {
    const dto = parseBody(setAudienceCriteriaSchema, body);
    return this.service.setCriteria(tenantOf(principal), id as Uuid, dto.criteriaLabel);
  }

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post(":id/members/add")
  @HttpCode(200)
  async addMembers(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Audience> {
    const dto = parseBody(audienceMembersSchema, body);
    return this.service.addMembers(tenantOf(principal), id as Uuid, dto.personIds as Uuid[]);
  }

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post(":id/members/remove")
  @HttpCode(200)
  async removeMembers(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Audience> {
    const dto = parseBody(audienceMembersSchema, body);
    return this.service.removeMembers(tenantOf(principal), id as Uuid, dto.personIds as Uuid[]);
  }

  @RequirePermissions(COMMUNICATION_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Audience> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COMMUNICATION_READ)
  @Get("by-code/:code")
  async getByCode(
    @CurrentPrincipal() principal: Principal,
    @Param("code") code: string,
  ): Promise<Audience> {
    return this.service.getByCode(tenantOf(principal), code);
  }

  @RequirePermissions(COMMUNICATION_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Audience[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(COMMUNICATION_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Audience> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
