import type { Principal } from "@knowget/auth";
import {
  type FacultyProfile,
  FacultyProfileService,
  type FacultySummary,
} from "@knowget/faculty-excellence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { refreshProfileSchema } from "./faculty-excellence.dto";
import { FACULTY_READ, FACULTY_WRITE, parseBody, tenantOf } from "./faculty-excellence-http";
import { FE_PROFILE_SERVICE } from "./faculty-excellence.tokens";

/**
 * REST surface for the faculty profile (P2-D13) — the descriptive, AI-ready indicator snapshot per
 * staff member and the organization rollup. Gated by faculty:*; tenant-scoped. Descriptive only,
 * never a prediction (P2-D28).
 */
@Controller("faculty/profiles")
export class FacultyProfileController {
  constructor(@Inject(FE_PROFILE_SERVICE) private readonly service: FacultyProfileService) {}

  @RequirePermissions(FACULTY_WRITE)
  @Post("by-employee/:employeeId/refresh")
  @HttpCode(200)
  async refresh(
    @CurrentPrincipal() principal: Principal,
    @Param("employeeId") employeeId: string,
    @Body() body: unknown,
  ): Promise<FacultyProfile> {
    const dto = parseBody(refreshProfileSchema, body);
    return this.service.refresh(tenantOf(principal), employeeId as Uuid, dto.period);
  }

  @RequirePermissions(FACULTY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<FacultyProfile[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(FACULTY_READ)
  @Get("by-employee/:employeeId")
  async getByEmployee(
    @CurrentPrincipal() principal: Principal,
    @Param("employeeId") employeeId: string,
  ): Promise<FacultyProfile | null> {
    return this.service.getByEmployee(tenantOf(principal), employeeId as Uuid);
  }

  @RequirePermissions(FACULTY_READ)
  @Get("summary/:organizationId")
  async summarizeOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<FacultySummary> {
    return this.service.summarizeOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FACULTY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<FacultyProfile> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
