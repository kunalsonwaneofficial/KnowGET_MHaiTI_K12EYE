import type { Principal } from "@knowget/auth";
import {
  type DocumentCompliance,
  type VehicleDocument,
  VehicleDocumentService,
} from "@knowget/transport";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { FLEET_READ, FLEET_WRITE, parseBody, tenantOf } from "./transport-http";
import { recordDocumentSchema, renewDocumentSchema, setDocumentNotesSchema } from "./transport.dto";
import { TR_DOCUMENT_SERVICE } from "./transport.tokens";

/** REST surface for vehicle compliance documents (P2-D16). Gated by fleet:*; tenant-scoped. */
@Controller("fleet/documents")
export class VehicleDocumentController {
  constructor(@Inject(TR_DOCUMENT_SERVICE) private readonly service: VehicleDocumentService) {}

  @RequirePermissions(FLEET_WRITE)
  @Post()
  @HttpCode(201)
  async record(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<VehicleDocument> {
    const dto = parseBody(recordDocumentSchema, body);
    return this.service.record({
      tenantId: tenantOf(principal),
      vehicleId: dto.vehicleId as Uuid,
      type: dto.type,
      documentNumber: dto.documentNumber,
      issuedOn: dto.issuedOn,
      expiresOn: dto.expiresOn,
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
    });
  }

  @RequirePermissions(FLEET_WRITE)
  @Post(":id/renew")
  @HttpCode(200)
  async renew(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<VehicleDocument> {
    const dto = parseBody(renewDocumentSchema, body);
    return this.service.renew(
      tenantOf(principal),
      id as Uuid,
      dto.documentNumber,
      dto.issuedOn,
      dto.expiresOn,
    );
  }

  @RequirePermissions(FLEET_WRITE)
  @Post(":id/notes")
  @HttpCode(200)
  async setNotes(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<VehicleDocument> {
    const dto = parseBody(setDocumentNotesSchema, body);
    return this.service.setNotes(tenantOf(principal), id as Uuid, dto.notes);
  }

  @RequirePermissions(FLEET_READ)
  @Get("by-vehicle/:vehicleId")
  async listForVehicle(
    @CurrentPrincipal() principal: Principal,
    @Param("vehicleId") vehicleId: string,
  ): Promise<VehicleDocument[]> {
    return this.service.listForVehicle(tenantOf(principal), vehicleId as Uuid);
  }

  @RequirePermissions(FLEET_READ)
  @Get("by-vehicle/:vehicleId/compliance/:asOfDate")
  async complianceForVehicle(
    @CurrentPrincipal() principal: Principal,
    @Param("vehicleId") vehicleId: string,
    @Param("asOfDate") asOfDate: string,
  ): Promise<DocumentCompliance[]> {
    return this.service.complianceForVehicle(tenantOf(principal), vehicleId as Uuid, asOfDate);
  }

  @RequirePermissions(FLEET_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<VehicleDocument[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FLEET_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<VehicleDocument> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
