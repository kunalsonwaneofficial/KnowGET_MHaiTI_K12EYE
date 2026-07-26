import type { Principal } from "@knowget/auth";
import {
  type MedicationSchedule,
  type Prescription,
  PrescriptionService,
} from "@knowget/health-centre";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { CLINICAL_READ, CLINICAL_WRITE, parseBody, tenantOf } from "./health-centre-http";
import { issuePrescriptionSchema, recordDoseSchema } from "./health-centre.dto";
import { HC_PRESCRIPTION_SERVICE } from "./health-centre.tokens";

/** REST surface for prescriptions (P2-D19). Gated by clinical:*; tenant-scoped. */
@Controller("clinical/prescriptions")
export class PrescriptionController {
  constructor(@Inject(HC_PRESCRIPTION_SERVICE) private readonly service: PrescriptionService) {}

  @RequirePermissions(CLINICAL_WRITE)
  @Post()
  @HttpCode(201)
  async issue(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Prescription> {
    const dto = parseBody(issuePrescriptionSchema, body);
    return this.service.issue({
      tenantId: tenantOf(principal),
      centreId: dto.centreId as Uuid,
      patientId: dto.patientId as Uuid,
      clinicianId: dto.clinicianId as Uuid,
      medication: dto.medication,
      dosage: dto.dosage,
      frequencyPerDay: dto.frequencyPerDay,
      durationDays: dto.durationDays,
      startDate: dto.startDate,
    });
  }

  @RequirePermissions(CLINICAL_WRITE)
  @Post(":id/record-dose")
  @HttpCode(200)
  async recordDose(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Prescription> {
    const dto = parseBody(recordDoseSchema, body);
    return this.service.recordDose(tenantOf(principal), id as Uuid, dto.count);
  }

  @RequirePermissions(CLINICAL_WRITE)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Prescription> {
    return this.service.complete(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CLINICAL_WRITE)
  @Post(":id/discontinue")
  @HttpCode(200)
  async discontinue(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Prescription> {
    return this.service.discontinue(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get(":id/schedule/:asOfDate")
  async scheduleStatus(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("asOfDate") asOfDate: string,
  ): Promise<MedicationSchedule> {
    return this.service.scheduleStatus(tenantOf(principal), id as Uuid, asOfDate);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get("by-patient/:patientId")
  async listForPatient(
    @CurrentPrincipal() principal: Principal,
    @Param("patientId") patientId: string,
  ): Promise<Prescription[]> {
    return this.service.listForPatient(tenantOf(principal), patientId as Uuid);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get("active/by-centre/:centreId")
  async listActiveForCentre(
    @CurrentPrincipal() principal: Principal,
    @Param("centreId") centreId: string,
  ): Promise<Prescription[]> {
    return this.service.listActiveForCentre(tenantOf(principal), centreId as Uuid);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get("by-centre/:centreId")
  async listForCentre(
    @CurrentPrincipal() principal: Principal,
    @Param("centreId") centreId: string,
  ): Promise<Prescription[]> {
    return this.service.listForCentre(tenantOf(principal), centreId as Uuid);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Prescription> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
