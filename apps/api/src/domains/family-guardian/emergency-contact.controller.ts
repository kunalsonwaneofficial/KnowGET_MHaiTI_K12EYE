import type { Principal } from "@knowget/auth";
import {
  type EmergencyAuthorizations,
  type EmergencyContact,
  EmergencyContactService,
} from "@knowget/family-guardian";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  recordAttemptSchema,
  registerEmergencyContactSchema,
  setEmergencyAuthorizationsSchema,
  setEmergencyAvailabilitySchema,
  setEmergencyPrioritySimpleSchema,
  setPhoneSchema,
  setRelationshipLabelSchema,
} from "./family-guardian.dto";
import { FAMILY_READ, FAMILY_WRITE, parseBody, tenantOf } from "./family-guardian-http";
import { FG_EMERGENCY_CONTACT_SERVICE } from "./family-guardian.tokens";

/** Build a clean authorizations patch, omitting absent keys (exactOptionalPropertyTypes). */
function cleanAuthorizations(a: {
  pickup?: boolean;
  medical?: boolean;
}): Partial<EmergencyAuthorizations> {
  return {
    ...(a.pickup !== undefined ? { pickup: a.pickup } : {}),
    ...(a.medical !== undefined ? { medical: a.medical } : {}),
  };
}

/** REST surface for prioritized emergency contacts (P2-D04). Permission-gated; tenant-scoped. */
@Controller("family-guardian/emergency-contacts")
export class EmergencyContactController {
  constructor(
    @Inject(FG_EMERGENCY_CONTACT_SERVICE) private readonly service: EmergencyContactService,
  ) {}

  @RequirePermissions(FAMILY_WRITE)
  @Post()
  @HttpCode(201)
  async register(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<EmergencyContact> {
    const dto = parseBody(registerEmergencyContactSchema, body);
    return this.service.register({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      studentId: dto.studentId as Uuid,
      personId: dto.personId as Uuid,
      priority: dto.priority,
      relationshipLabel: dto.relationshipLabel,
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.availabilityNote !== undefined ? { availabilityNote: dto.availabilityNote } : {}),
      ...(dto.authorizations !== undefined
        ? { authorizations: cleanAuthorizations(dto.authorizations) }
        : {}),
    });
  }

  @RequirePermissions(FAMILY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<EmergencyContact[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(FAMILY_READ)
  @Get("by-student/:studentId")
  async listForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<EmergencyContact[]> {
    return this.service.listForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(FAMILY_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<EmergencyContact[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FAMILY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EmergencyContact> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/priority")
  @HttpCode(200)
  async setPriority(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EmergencyContact> {
    const dto = parseBody(setEmergencyPrioritySimpleSchema, body);
    return this.service.setPriority(tenantOf(principal), id as Uuid, dto.priority);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/authorizations")
  @HttpCode(200)
  async setAuthorizations(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EmergencyContact> {
    const dto = parseBody(setEmergencyAuthorizationsSchema, body);
    return this.service.setAuthorizations(
      tenantOf(principal),
      id as Uuid,
      cleanAuthorizations(dto),
    );
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/label")
  @HttpCode(200)
  async setRelationshipLabel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EmergencyContact> {
    const dto = parseBody(setRelationshipLabelSchema, body);
    return this.service.setRelationshipLabel(tenantOf(principal), id as Uuid, dto.label);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/phone")
  @HttpCode(200)
  async setPhone(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EmergencyContact> {
    const dto = parseBody(setPhoneSchema, body);
    return this.service.setPhone(tenantOf(principal), id as Uuid, dto.phone);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/availability")
  @HttpCode(200)
  async setAvailability(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EmergencyContact> {
    const dto = parseBody(setEmergencyAvailabilitySchema, body);
    return this.service.setAvailability(tenantOf(principal), id as Uuid, dto.note);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/attempts")
  @HttpCode(200)
  async recordAttempt(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EmergencyContact> {
    const dto = parseBody(recordAttemptSchema, body);
    return this.service.recordContactAttempt(tenantOf(principal), id as Uuid, {
      outcome: dto.outcome,
      ...(dto.note !== undefined ? { note: dto.note } : {}),
    });
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EmergencyContact> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }
}
