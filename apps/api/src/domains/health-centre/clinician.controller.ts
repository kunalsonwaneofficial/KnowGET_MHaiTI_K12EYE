import type { Principal } from "@knowget/auth";
import { type Clinician, ClinicianService } from "@knowget/health-centre";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { CLINIC_READ, CLINIC_WRITE, parseBody, tenantOf } from "./health-centre-http";
import {
  registerClinicianSchema,
  setClinicianRoleSchema,
  setRegistrationSchema,
} from "./health-centre.dto";
import { HC_CLINICIAN_SERVICE } from "./health-centre.tokens";

/** REST surface for clinicians (P2-D19). Gated by clinic:*; tenant-scoped. */
@Controller("clinic/clinicians")
export class ClinicianController {
  constructor(@Inject(HC_CLINICIAN_SERVICE) private readonly service: ClinicianService) {}

  @RequirePermissions(CLINIC_WRITE)
  @Post()
  @HttpCode(201)
  async register(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Clinician> {
    const dto = parseBody(registerClinicianSchema, body);
    return this.service.register({
      tenantId: tenantOf(principal),
      employeeId: dto.employeeId as Uuid,
      role: dto.role,
      registrationNumber: dto.registrationNumber,
    });
  }

  @RequirePermissions(CLINIC_WRITE)
  @Post(":id/role")
  @HttpCode(200)
  async setRole(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Clinician> {
    const dto = parseBody(setClinicianRoleSchema, body);
    return this.service.setRole(tenantOf(principal), id as Uuid, dto.role);
  }

  @RequirePermissions(CLINIC_WRITE)
  @Post(":id/registration")
  @HttpCode(200)
  async setRegistration(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Clinician> {
    const dto = parseBody(setRegistrationSchema, body);
    return this.service.setRegistration(tenantOf(principal), id as Uuid, dto.registrationNumber);
  }

  @RequirePermissions(CLINIC_WRITE)
  @Post(":id/suspend")
  @HttpCode(200)
  async suspend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Clinician> {
    return this.service.suspend(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CLINIC_WRITE)
  @Post(":id/reinstate")
  @HttpCode(200)
  async reinstate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Clinician> {
    return this.service.reinstate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CLINIC_WRITE)
  @Post(":id/relieve")
  @HttpCode(200)
  async relieve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Clinician> {
    return this.service.relieve(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CLINIC_READ)
  @Get("by-employee/:employeeId")
  async getByEmployee(
    @CurrentPrincipal() principal: Principal,
    @Param("employeeId") employeeId: string,
  ): Promise<Clinician | null> {
    return this.service.getByEmployee(tenantOf(principal), employeeId as Uuid);
  }

  @RequirePermissions(CLINIC_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Clinician[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(CLINIC_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Clinician> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
