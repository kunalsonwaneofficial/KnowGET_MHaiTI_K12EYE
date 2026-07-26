import type { Principal } from "@knowget/auth";
import {
  type HostelInspection,
  HostelInspectionService,
  type InspectionCompliance,
} from "@knowget/residential";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { HOSTEL_READ, HOSTEL_WRITE, parseBody, tenantOf } from "./residential-http";
import {
  recordInspectionSchema,
  reinspectSchema,
  setInspectionNotesSchema,
} from "./residential.dto";
import { RS_INSPECTION_SERVICE } from "./residential.tokens";

/** REST surface for hostel inspections (P2-D17). Gated by hostel:*; tenant-scoped. */
@Controller("hostel/inspections")
export class HostelInspectionController {
  constructor(@Inject(RS_INSPECTION_SERVICE) private readonly service: HostelInspectionService) {}

  @RequirePermissions(HOSTEL_WRITE)
  @Post()
  @HttpCode(201)
  async record(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<HostelInspection> {
    const dto = parseBody(recordInspectionSchema, body);
    return this.service.record({
      tenantId: tenantOf(principal),
      hostelId: dto.hostelId as Uuid,
      type: dto.type,
      conductedOn: dto.conductedOn,
      outcome: dto.outcome,
      nextDueOn: dto.nextDueOn,
      ...(dto.inspector !== undefined ? { inspector: dto.inspector } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
    });
  }

  @RequirePermissions(HOSTEL_WRITE)
  @Post(":id/reinspect")
  @HttpCode(200)
  async reinspect(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<HostelInspection> {
    const dto = parseBody(reinspectSchema, body);
    return this.service.reinspect(
      tenantOf(principal),
      id as Uuid,
      dto.conductedOn,
      dto.outcome,
      dto.nextDueOn,
      dto.inspector,
    );
  }

  @RequirePermissions(HOSTEL_WRITE)
  @Post(":id/notes")
  @HttpCode(200)
  async setNotes(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<HostelInspection> {
    const dto = parseBody(setInspectionNotesSchema, body);
    return this.service.setNotes(tenantOf(principal), id as Uuid, dto.notes);
  }

  @RequirePermissions(HOSTEL_READ)
  @Get("by-hostel/:hostelId")
  async listForHostel(
    @CurrentPrincipal() principal: Principal,
    @Param("hostelId") hostelId: string,
  ): Promise<HostelInspection[]> {
    return this.service.listForHostel(tenantOf(principal), hostelId as Uuid);
  }

  @RequirePermissions(HOSTEL_READ)
  @Get(":id/compliance/:asOfDate")
  async complianceFor(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("asOfDate") asOfDate: string,
  ): Promise<InspectionCompliance> {
    return this.service.complianceFor(tenantOf(principal), id as Uuid, asOfDate);
  }

  @RequirePermissions(HOSTEL_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<HostelInspection> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
