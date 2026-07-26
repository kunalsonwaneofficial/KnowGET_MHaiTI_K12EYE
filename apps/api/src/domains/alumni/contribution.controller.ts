import type { Principal } from "@knowget/auth";
import { type Contribution, ContributionService } from "@knowget/alumni";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ALUMNI_READ, ALUMNI_WRITE, parseBody, tenantOf } from "./alumni-http";
import { recordContributionSchema } from "./alumni.dto";
import { AL_CONTRIBUTION_SERVICE } from "./alumni.tokens";

/** REST surface for contributions (P2-D24) — the append-only giving log. alumni:*; tenant-scoped. */
@Controller("alumni/contributions")
export class ContributionController {
  constructor(@Inject(AL_CONTRIBUTION_SERVICE) private readonly service: ContributionService) {}

  @RequirePermissions(ALUMNI_WRITE)
  @Post()
  @HttpCode(201)
  async record(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Contribution> {
    const dto = parseBody(recordContributionSchema, body);
    return this.service.record({
      tenantId: tenantOf(principal),
      alumniProfileId: dto.alumniProfileId as Uuid,
      type: dto.type,
      recognitionTier: dto.recognitionTier,
      contributedOn: dto.contributedOn,
      campaignRef: dto.campaignRef ?? null,
    });
  }

  @RequirePermissions(ALUMNI_READ)
  @Get("by-alumnus/:alumniProfileId")
  async listForAlumnus(
    @CurrentPrincipal() principal: Principal,
    @Param("alumniProfileId") alumniProfileId: string,
  ): Promise<Contribution[]> {
    return this.service.listForAlumnus(tenantOf(principal), alumniProfileId as Uuid);
  }

  @RequirePermissions(ALUMNI_READ)
  @Get("by-alumnus/:alumniProfileId/count")
  async countForAlumnus(
    @CurrentPrincipal() principal: Principal,
    @Param("alumniProfileId") alumniProfileId: string,
  ): Promise<{ count: number }> {
    return {
      count: await this.service.countForAlumnus(tenantOf(principal), alumniProfileId as Uuid),
    };
  }

  @RequirePermissions(ALUMNI_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Contribution | null> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
