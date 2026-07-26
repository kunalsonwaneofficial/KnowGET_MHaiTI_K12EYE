import type { Principal } from "@knowget/auth";
import { type Appointment, AppointmentService } from "@knowget/health-centre";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { CLINICAL_READ, CLINICAL_WRITE, parseBody, tenantOf } from "./health-centre-http";
import {
  requestAppointmentSchema,
  rescheduleAppointmentSchema,
  scheduleAppointmentSchema,
} from "./health-centre.dto";
import { HC_APPOINTMENT_SERVICE } from "./health-centre.tokens";

/** REST surface for appointments (P2-D19). Gated by clinical:*; tenant-scoped. */
@Controller("clinical/appointments")
export class AppointmentController {
  constructor(@Inject(HC_APPOINTMENT_SERVICE) private readonly service: AppointmentService) {}

  @RequirePermissions(CLINICAL_WRITE)
  @Post()
  @HttpCode(201)
  async request(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Appointment> {
    const dto = parseBody(requestAppointmentSchema, body);
    return this.service.request({
      tenantId: tenantOf(principal),
      centreId: dto.centreId as Uuid,
      patientId: dto.patientId as Uuid,
      scheduledFor: dto.scheduledFor,
      clinicianId: dto.clinicianId as Uuid | null | undefined,
    });
  }

  @RequirePermissions(CLINICAL_WRITE)
  @Post(":id/schedule")
  @HttpCode(200)
  async schedule(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Appointment> {
    const dto = parseBody(scheduleAppointmentSchema, body);
    return this.service.schedule(tenantOf(principal), id as Uuid, dto.clinicianId as Uuid | null);
  }

  @RequirePermissions(CLINICAL_WRITE)
  @Post(":id/reschedule")
  @HttpCode(200)
  async reschedule(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Appointment> {
    const dto = parseBody(rescheduleAppointmentSchema, body);
    return this.service.reschedule(tenantOf(principal), id as Uuid, dto.scheduledFor);
  }

  @RequirePermissions(CLINICAL_WRITE)
  @Post(":id/check-in")
  @HttpCode(200)
  async checkIn(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Appointment> {
    return this.service.checkIn(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CLINICAL_WRITE)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Appointment> {
    return this.service.complete(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CLINICAL_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Appointment> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CLINICAL_WRITE)
  @Post(":id/no-show")
  @HttpCode(200)
  async noShow(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Appointment> {
    return this.service.markNoShow(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get("by-patient/:patientId")
  async listForPatient(
    @CurrentPrincipal() principal: Principal,
    @Param("patientId") patientId: string,
  ): Promise<Appointment[]> {
    return this.service.listForPatient(tenantOf(principal), patientId as Uuid);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get("by-centre/:centreId")
  async listForCentre(
    @CurrentPrincipal() principal: Principal,
    @Param("centreId") centreId: string,
  ): Promise<Appointment[]> {
    return this.service.listForCentre(tenantOf(principal), centreId as Uuid);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Appointment[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Appointment> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
