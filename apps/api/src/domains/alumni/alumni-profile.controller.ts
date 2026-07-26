import type { Principal } from "@knowget/auth";
import { type AlumniProfile, AlumniProfileService } from "@knowget/alumni";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ALUMNI_READ, ALUMNI_WRITE, parseBody, tenantOf } from "./alumni-http";
import { createAlumniProfileSchema, updateAlumniProfileSchema } from "./alumni.dto";
import { AL_PROFILE_SERVICE } from "./alumni.tokens";

/** REST surface for alumni profiles (P2-D24) — the network-membership anchor. alumni:*; tenant-scoped. */
@Controller("alumni/profiles")
export class AlumniProfileController {
  constructor(@Inject(AL_PROFILE_SERVICE) private readonly service: AlumniProfileService) {}

  @RequirePermissions(ALUMNI_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AlumniProfile> {
    const dto = parseBody(createAlumniProfileSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      alumnusPersonId: dto.alumnusPersonId as Uuid,
      graduationYear: dto.graduationYear,
      program: dto.program ?? null,
    });
  }

  @RequirePermissions(ALUMNI_WRITE)
  @Post(":id/update")
  @HttpCode(200)
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AlumniProfile> {
    const dto = parseBody(updateAlumniProfileSchema, body);
    return this.service.update(tenantOf(principal), id as Uuid, dto);
  }

  @RequirePermissions(ALUMNI_WRITE)
  @Post(":id/lapse")
  @HttpCode(200)
  async lapse(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AlumniProfile> {
    return this.service.markLapsed(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ALUMNI_WRITE)
  @Post(":id/reactivate")
  @HttpCode(200)
  async reactivate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AlumniProfile> {
    return this.service.reactivate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ALUMNI_WRITE)
  @Post(":id/opt-out")
  @HttpCode(200)
  async optOut(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AlumniProfile> {
    return this.service.optOut(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ALUMNI_READ)
  @Get("by-person/:personId")
  async getByPerson(
    @CurrentPrincipal() principal: Principal,
    @Param("personId") personId: string,
  ): Promise<AlumniProfile | null> {
    return this.service.getByAlumnus(tenantOf(principal), personId as Uuid);
  }

  @RequirePermissions(ALUMNI_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<AlumniProfile[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ALUMNI_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AlumniProfile> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
