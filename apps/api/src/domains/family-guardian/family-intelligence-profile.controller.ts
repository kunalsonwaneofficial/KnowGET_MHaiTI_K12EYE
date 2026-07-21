import type { Principal } from "@knowget/auth";
import {
  type FamilyIntelligenceIndicators,
  type FamilyIntelligenceProfile,
  FamilyIntelligenceProfileService,
} from "@knowget/family-guardian";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  createIntelligenceProfileSchema,
  recordInteractionSchema,
  updateIndicatorsSchema,
} from "./family-guardian.dto";
import { FAMILY_READ, FAMILY_WRITE, parseBody, tenantOf } from "./family-guardian-http";
import { FG_INTELLIGENCE_PROFILE_SERVICE } from "./family-guardian.tokens";

/** REST surface for family intelligence profiles (P2-D04). Permission-gated; tenant-scoped. */
@Controller("family-guardian/intelligence-profiles")
export class FamilyIntelligenceProfileController {
  constructor(
    @Inject(FG_INTELLIGENCE_PROFILE_SERVICE)
    private readonly service: FamilyIntelligenceProfileService,
  ) {}

  @RequirePermissions(FAMILY_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<FamilyIntelligenceProfile> {
    const dto = parseBody(createIntelligenceProfileSchema, body);
    return this.service.create({ tenantId: tenantOf(principal), familyId: dto.familyId as Uuid });
  }

  @RequirePermissions(FAMILY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<FamilyIntelligenceProfile[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(FAMILY_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<FamilyIntelligenceProfile[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FAMILY_READ)
  @Get("by-family/:familyId")
  async getByFamily(
    @CurrentPrincipal() principal: Principal,
    @Param("familyId") familyId: string,
  ): Promise<FamilyIntelligenceProfile> {
    return this.service.getByFamily(tenantOf(principal), familyId as Uuid);
  }

  @RequirePermissions(FAMILY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<FamilyIntelligenceProfile> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/indicators")
  @HttpCode(200)
  async updateIndicators(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<FamilyIntelligenceProfile> {
    const dto = parseBody(updateIndicatorsSchema, body);
    const patch: Partial<FamilyIntelligenceIndicators> = {
      ...(dto.engagementLevel !== undefined ? { engagementLevel: dto.engagementLevel } : {}),
      ...(dto.communicationResponsiveness !== undefined
        ? { communicationResponsiveness: dto.communicationResponsiveness }
        : {}),
      ...(dto.participationRate !== undefined ? { participationRate: dto.participationRate } : {}),
      ...(dto.consentCompliance !== undefined ? { consentCompliance: dto.consentCompliance } : {}),
    };
    return this.service.updateIndicators(tenantOf(principal), id as Uuid, patch);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/interactions")
  @HttpCode(200)
  async recordInteraction(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<FamilyIntelligenceProfile> {
    const dto = parseBody(recordInteractionSchema, body);
    return this.service.recordInteraction(tenantOf(principal), id as Uuid, {
      kind: dto.kind,
      summary: dto.summary,
    });
  }
}
