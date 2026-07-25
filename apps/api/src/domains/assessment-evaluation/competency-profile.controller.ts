import {
  type CompetencyProfile,
  CompetencyProfileService,
  type SetMasteryParams,
} from "@knowget/assessment-evaluation";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  ASSESSMENT_READ,
  ASSESSMENT_WRITE,
  parseBody,
  tenantOf,
} from "./assessment-evaluation-http";
import { ensureCompetencyProfileSchema, setMasterySchema } from "./assessment-evaluation.dto";
import { AE_COMPETENCY_PROFILE_SERVICE } from "./assessment-evaluation.tokens";

/** REST surface for competency profiles (P2-D10). Gated by assessment:*; tenant-scoped. */
@Controller("assessment-evaluation/competency-profiles")
export class CompetencyProfileController {
  constructor(
    @Inject(AE_COMPETENCY_PROFILE_SERVICE) private readonly service: CompetencyProfileService,
  ) {}

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post()
  @HttpCode(201)
  async ensure(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<CompetencyProfile> {
    const dto = parseBody(ensureCompetencyProfileSchema, body);
    return this.service.ensure(
      tenantOf(principal),
      dto.organizationId as Uuid,
      dto.studentId as Uuid,
    );
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get("by-student/:studentId")
  async getByStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<CompetencyProfile | null> {
    return this.service.getByStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<CompetencyProfile[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<CompetencyProfile> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/mastery")
  @HttpCode(200)
  async setMastery(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CompetencyProfile> {
    const dto = parseBody(setMasterySchema, body);
    const params: SetMasteryParams = {
      competencyId: dto.competencyId,
      name: dto.name,
      masteryLevel: dto.masteryLevel,
      ...(dto.evidenceRefs !== undefined ? { evidenceRefs: dto.evidenceRefs as Uuid[] } : {}),
      ...(dto.note !== undefined ? { note: dto.note } : {}),
    };
    return this.service.setMastery(tenantOf(principal), id as Uuid, params);
  }
}
