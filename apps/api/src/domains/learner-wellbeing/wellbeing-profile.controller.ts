import type { Principal } from "@knowget/auth";
import {
  type WellbeingDimensionKey,
  type WellbeingDimensions,
  type WellbeingIndicators,
  type WellbeingProfile,
  WellbeingProfileService,
} from "@knowget/learner-wellbeing";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  createWellbeingProfileSchema,
  putSuccessMetricSchema,
  setDimensionSchema,
  setLearningSupportIndicatorsSchema,
  updateDimensionsSchema,
  updateIndicatorsSchema,
} from "./learner-wellbeing.dto";
import { parseBody, tenantOf, WELLBEING_READ, WELLBEING_WRITE } from "./learner-wellbeing-http";
import { LW_WELLBEING_PROFILE_SERVICE } from "./learner-wellbeing.tokens";

/** REST surface for wellbeing profiles (P2-D05). Gated by wellbeing:*; tenant-scoped. */
@Controller("learner-wellbeing/wellbeing-profiles")
export class WellbeingProfileController {
  constructor(
    @Inject(LW_WELLBEING_PROFILE_SERVICE) private readonly service: WellbeingProfileService,
  ) {}

  @RequirePermissions(WELLBEING_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<WellbeingProfile> {
    const dto = parseBody(createWellbeingProfileSchema, body);
    return this.service.create({ tenantId: tenantOf(principal), studentId: dto.studentId as Uuid });
  }

  @RequirePermissions(WELLBEING_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<WellbeingProfile[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(WELLBEING_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<WellbeingProfile[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(WELLBEING_READ)
  @Get("by-student/:studentId")
  async getByStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<WellbeingProfile | null> {
    return this.service.getByStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(WELLBEING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<WellbeingProfile> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WELLBEING_WRITE)
  @Post(":id/dimensions/set")
  @HttpCode(200)
  async setDimension(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<WellbeingProfile> {
    const dto = parseBody(setDimensionSchema, body);
    return this.service.setDimension(
      tenantOf(principal),
      id as Uuid,
      dto.dimension as WellbeingDimensionKey,
      dto.level,
    );
  }

  @RequirePermissions(WELLBEING_WRITE)
  @Post(":id/dimensions")
  @HttpCode(200)
  async updateDimensions(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<WellbeingProfile> {
    const dto = parseBody(updateDimensionsSchema, body);
    const patch: Partial<WellbeingDimensions> = {
      ...(dto.physical !== undefined ? { physical: dto.physical } : {}),
      ...(dto.emotional !== undefined ? { emotional: dto.emotional } : {}),
      ...(dto.social !== undefined ? { social: dto.social } : {}),
      ...(dto.behavioural !== undefined ? { behavioural: dto.behavioural } : {}),
    };
    return this.service.updateDimensions(tenantOf(principal), id as Uuid, patch);
  }

  @RequirePermissions(WELLBEING_WRITE)
  @Post(":id/learning-support-indicators")
  @HttpCode(200)
  async setLearningSupportIndicators(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<WellbeingProfile> {
    const dto = parseBody(setLearningSupportIndicatorsSchema, body);
    return this.service.setLearningSupportIndicators(
      tenantOf(principal),
      id as Uuid,
      dto.indicators,
    );
  }

  @RequirePermissions(WELLBEING_WRITE)
  @Post(":id/success-metrics")
  @HttpCode(200)
  async putSuccessMetric(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<WellbeingProfile> {
    const dto = parseBody(putSuccessMetricSchema, body);
    return this.service.putSuccessMetric(tenantOf(principal), id as Uuid, dto.name, dto.value);
  }

  @RequirePermissions(WELLBEING_WRITE)
  @Post(":id/success-metrics/:name/remove")
  @HttpCode(200)
  async removeSuccessMetric(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("name") name: string,
  ): Promise<WellbeingProfile> {
    return this.service.removeSuccessMetric(tenantOf(principal), id as Uuid, name);
  }

  @RequirePermissions(WELLBEING_WRITE)
  @Post(":id/indicators")
  @HttpCode(200)
  async updateIndicators(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<WellbeingProfile> {
    const dto = parseBody(updateIndicatorsSchema, body);
    const patch: Partial<WellbeingIndicators> = {
      ...(dto.wellbeingTrend !== undefined ? { wellbeingTrend: dto.wellbeingTrend } : {}),
      ...(dto.behaviourPattern !== undefined ? { behaviourPattern: dto.behaviourPattern } : {}),
      ...(dto.engagementLevel !== undefined ? { engagementLevel: dto.engagementLevel } : {}),
      ...(dto.attendanceCorrelation !== undefined
        ? { attendanceCorrelation: dto.attendanceCorrelation }
        : {}),
      ...(dto.academicSignal !== undefined ? { academicSignal: dto.academicSignal } : {}),
      ...(dto.interventionEffectiveness !== undefined
        ? { interventionEffectiveness: dto.interventionEffectiveness }
        : {}),
    };
    return this.service.updateIndicators(tenantOf(principal), id as Uuid, patch);
  }
}
