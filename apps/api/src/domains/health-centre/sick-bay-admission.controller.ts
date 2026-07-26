import type { Principal } from "@knowget/auth";
import { AdmissionService, type BayOccupancy, type SickBayAdmission } from "@knowget/health-centre";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { CLINICAL_READ, CLINICAL_WRITE, parseBody, tenantOf } from "./health-centre-http";
import { admitSchema, dischargeSchema } from "./health-centre.dto";
import { HC_ADMISSION_SERVICE } from "./health-centre.tokens";

/** REST surface for sick-bay admissions (P2-D19). Gated by clinical:*; tenant-scoped. */
@Controller("clinical/admissions")
export class SickBayAdmissionController {
  constructor(@Inject(HC_ADMISSION_SERVICE) private readonly service: AdmissionService) {}

  @RequirePermissions(CLINICAL_WRITE)
  @Post()
  @HttpCode(201)
  async admit(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<SickBayAdmission> {
    const dto = parseBody(admitSchema, body);
    return this.service.admit({
      tenantId: tenantOf(principal),
      centreId: dto.centreId as Uuid,
      patientId: dto.patientId as Uuid,
      bedLabel: dto.bedLabel,
      admittedOn: dto.admittedOn,
      reason: dto.reason,
    });
  }

  @RequirePermissions(CLINICAL_WRITE)
  @Post(":id/discharge")
  @HttpCode(200)
  async discharge(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<SickBayAdmission> {
    const dto = parseBody(dischargeSchema, body);
    return this.service.discharge(tenantOf(principal), id as Uuid, dto.dischargedOn);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get("occupancy/:centreId")
  async occupancy(
    @CurrentPrincipal() principal: Principal,
    @Param("centreId") centreId: string,
  ): Promise<BayOccupancy> {
    return this.service.occupancy(tenantOf(principal), centreId as Uuid);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get("by-patient/:patientId")
  async listForPatient(
    @CurrentPrincipal() principal: Principal,
    @Param("patientId") patientId: string,
  ): Promise<SickBayAdmission[]> {
    return this.service.listForPatient(tenantOf(principal), patientId as Uuid);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get("active/by-centre/:centreId")
  async listActiveForCentre(
    @CurrentPrincipal() principal: Principal,
    @Param("centreId") centreId: string,
  ): Promise<SickBayAdmission[]> {
    return this.service.listActiveForCentre(tenantOf(principal), centreId as Uuid);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get("by-centre/:centreId")
  async listForCentre(
    @CurrentPrincipal() principal: Principal,
    @Param("centreId") centreId: string,
  ): Promise<SickBayAdmission[]> {
    return this.service.listForCentre(tenantOf(principal), centreId as Uuid);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<SickBayAdmission> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
