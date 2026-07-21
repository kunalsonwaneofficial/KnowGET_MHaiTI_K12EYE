import type { Principal } from "@knowget/auth";
import {
  type HealthRecord,
  HealthRecordService,
  type MedicalAlert,
} from "@knowget/learner-wellbeing";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  addChronicConditionSchema,
  addImmunizationSchema,
  createHealthRecordSchema,
  putAllergySchema,
  putMedicationSchema,
  raiseMedicalAlertSchema,
  setBloodGroupSchema,
  setEmergencyPlanSchema,
  setMedicalHistorySchema,
} from "./learner-wellbeing.dto";
import { HEALTH_READ, HEALTH_WRITE, parseBody, tenantOf } from "./learner-wellbeing-http";
import { LW_HEALTH_RECORD_SERVICE } from "./learner-wellbeing.tokens";

/**
 * REST surface for learner health records (P2-D05). Gated by the dedicated health:*
 * scope so medical data is authorized independently; tenant-scoped.
 */
@Controller("learner-wellbeing/health-records")
export class HealthRecordController {
  constructor(@Inject(LW_HEALTH_RECORD_SERVICE) private readonly service: HealthRecordService) {}

  @RequirePermissions(HEALTH_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<HealthRecord> {
    const dto = parseBody(createHealthRecordSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      studentId: dto.studentId as Uuid,
      ...(dto.medicalHistory !== undefined ? { medicalHistory: dto.medicalHistory } : {}),
      ...(dto.bloodGroup !== undefined ? { bloodGroup: dto.bloodGroup } : {}),
    });
  }

  @RequirePermissions(HEALTH_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<HealthRecord[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(HEALTH_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<HealthRecord[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(HEALTH_READ)
  @Get("by-student/:studentId")
  async getByStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<HealthRecord | null> {
    return this.service.getByStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(HEALTH_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<HealthRecord> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(HEALTH_WRITE)
  @Post(":id/medical-history")
  @HttpCode(200)
  async setMedicalHistory(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<HealthRecord> {
    const dto = parseBody(setMedicalHistorySchema, body);
    return this.service.setMedicalHistory(tenantOf(principal), id as Uuid, dto.history);
  }

  @RequirePermissions(HEALTH_WRITE)
  @Post(":id/blood-group")
  @HttpCode(200)
  async setBloodGroup(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<HealthRecord> {
    const dto = parseBody(setBloodGroupSchema, body);
    return this.service.setBloodGroup(tenantOf(principal), id as Uuid, dto.bloodGroup);
  }

  @RequirePermissions(HEALTH_WRITE)
  @Post(":id/emergency-plan")
  @HttpCode(200)
  async setEmergencyPlan(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<HealthRecord> {
    const dto = parseBody(setEmergencyPlanSchema, body);
    return this.service.setEmergencyPlan(tenantOf(principal), id as Uuid, dto.plan);
  }

  @RequirePermissions(HEALTH_WRITE)
  @Post(":id/allergies")
  @HttpCode(200)
  async putAllergy(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<HealthRecord> {
    const dto = parseBody(putAllergySchema, body);
    return this.service.putAllergy(tenantOf(principal), id as Uuid, {
      substance: dto.substance,
      reaction: dto.reaction,
      severity: dto.severity,
    });
  }

  @RequirePermissions(HEALTH_WRITE)
  @Post(":id/allergies/:substance/remove")
  @HttpCode(200)
  async removeAllergy(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("substance") substance: string,
  ): Promise<HealthRecord> {
    return this.service.removeAllergy(tenantOf(principal), id as Uuid, substance);
  }

  @RequirePermissions(HEALTH_WRITE)
  @Post(":id/chronic-conditions")
  @HttpCode(200)
  async addChronicCondition(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<HealthRecord> {
    const dto = parseBody(addChronicConditionSchema, body);
    return this.service.addChronicCondition(tenantOf(principal), id as Uuid, {
      name: dto.name,
      notes: dto.notes,
    });
  }

  @RequirePermissions(HEALTH_WRITE)
  @Post(":id/immunizations")
  @HttpCode(200)
  async addImmunization(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<HealthRecord> {
    const dto = parseBody(addImmunizationSchema, body);
    return this.service.addImmunization(tenantOf(principal), id as Uuid, {
      vaccine: dto.vaccine,
      administeredOn: dto.administeredOn,
    });
  }

  @RequirePermissions(HEALTH_WRITE)
  @Post(":id/medications")
  @HttpCode(200)
  async putMedication(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<HealthRecord> {
    const dto = parseBody(putMedicationSchema, body);
    return this.service.putMedication(tenantOf(principal), id as Uuid, {
      name: dto.name,
      dosage: dto.dosage,
      active: dto.active,
    });
  }

  @RequirePermissions(HEALTH_WRITE)
  @Post(":id/medications/:name/discontinue")
  @HttpCode(200)
  async discontinueMedication(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("name") name: string,
  ): Promise<HealthRecord> {
    return this.service.discontinueMedication(tenantOf(principal), id as Uuid, name);
  }

  @RequirePermissions(HEALTH_WRITE)
  @Post(":id/medical-alerts")
  @HttpCode(201)
  async raiseMedicalAlert(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ record: HealthRecord; alert: MedicalAlert }> {
    const dto = parseBody(raiseMedicalAlertSchema, body);
    return this.service.raiseMedicalAlert(tenantOf(principal), id as Uuid, dto.label, dto.severity);
  }

  @RequirePermissions(HEALTH_WRITE)
  @Post(":id/medical-alerts/:alertId/clear")
  @HttpCode(200)
  async clearMedicalAlert(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("alertId") alertId: string,
  ): Promise<HealthRecord> {
    return this.service.clearMedicalAlert(tenantOf(principal), id as Uuid, alertId as Uuid);
  }
}
