import type { Principal } from "@knowget/auth";
import { type ClinicalEncounter, EncounterService } from "@knowget/health-centre";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { CLINICAL_READ, CLINICAL_WRITE, parseBody, tenantOf } from "./health-centre-http";
import {
  assignEncounterClinicianSchema,
  completeEncounterSchema,
  openEncounterSchema,
  recordAssessmentSchema,
  setComplaintSchema,
  setTriageSchema,
} from "./health-centre.dto";
import { HC_ENCOUNTER_SERVICE } from "./health-centre.tokens";

/** REST surface for clinical encounters (P2-D19). Gated by clinical:*; tenant-scoped. */
@Controller("clinical/encounters")
export class ClinicalEncounterController {
  constructor(@Inject(HC_ENCOUNTER_SERVICE) private readonly service: EncounterService) {}

  @RequirePermissions(CLINICAL_WRITE)
  @Post()
  @HttpCode(201)
  async open(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ClinicalEncounter> {
    const dto = parseBody(openEncounterSchema, body);
    return this.service.open({
      tenantId: tenantOf(principal),
      centreId: dto.centreId as Uuid,
      patientId: dto.patientId as Uuid,
      triageAcuity: dto.triageAcuity,
      chiefComplaint: dto.chiefComplaint,
      clinicianId: dto.clinicianId as Uuid | null | undefined,
    });
  }

  @RequirePermissions(CLINICAL_WRITE)
  @Post(":id/triage")
  @HttpCode(200)
  async setTriage(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ClinicalEncounter> {
    const dto = parseBody(setTriageSchema, body);
    return this.service.setTriage(tenantOf(principal), id as Uuid, dto.triageAcuity);
  }

  @RequirePermissions(CLINICAL_WRITE)
  @Post(":id/complaint")
  @HttpCode(200)
  async setComplaint(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ClinicalEncounter> {
    const dto = parseBody(setComplaintSchema, body);
    return this.service.setComplaint(tenantOf(principal), id as Uuid, dto.chiefComplaint);
  }

  @RequirePermissions(CLINICAL_WRITE)
  @Post(":id/assign-clinician")
  @HttpCode(200)
  async assignClinician(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ClinicalEncounter> {
    const dto = parseBody(assignEncounterClinicianSchema, body);
    return this.service.assignClinician(tenantOf(principal), id as Uuid, dto.clinicianId as Uuid);
  }

  @RequirePermissions(CLINICAL_WRITE)
  @Post(":id/start")
  @HttpCode(200)
  async start(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ClinicalEncounter> {
    return this.service.start(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CLINICAL_WRITE)
  @Post(":id/assessment")
  @HttpCode(200)
  async recordAssessment(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ClinicalEncounter> {
    const dto = parseBody(recordAssessmentSchema, body);
    return this.service.recordAssessment(tenantOf(principal), id as Uuid, dto.assessment);
  }

  @RequirePermissions(CLINICAL_WRITE)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ClinicalEncounter> {
    const dto = parseBody(completeEncounterSchema, body);
    return this.service.complete(tenantOf(principal), id as Uuid, dto.disposition);
  }

  @RequirePermissions(CLINICAL_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ClinicalEncounter> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get("by-patient/:patientId")
  async listForPatient(
    @CurrentPrincipal() principal: Principal,
    @Param("patientId") patientId: string,
  ): Promise<ClinicalEncounter[]> {
    return this.service.listForPatient(tenantOf(principal), patientId as Uuid);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get("open/by-centre/:centreId")
  async listOpenForCentre(
    @CurrentPrincipal() principal: Principal,
    @Param("centreId") centreId: string,
  ): Promise<ClinicalEncounter[]> {
    return this.service.listOpenForCentre(tenantOf(principal), centreId as Uuid);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get("by-centre/:centreId")
  async listForCentre(
    @CurrentPrincipal() principal: Principal,
    @Param("centreId") centreId: string,
  ): Promise<ClinicalEncounter[]> {
    return this.service.listForCentre(tenantOf(principal), centreId as Uuid);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ClinicalEncounter> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
