import type { Principal } from "@knowget/auth";
import {
  type ResponsibilityProfile,
  type StudentGuardianRelationship,
  StudentGuardianRelationshipService,
} from "@knowget/family-guardian";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  endRelationshipSchema,
  linkGuardianSchema,
  setAuthorizationSchema,
  setEmergencyPrioritySchema,
  setRelationshipTypeSchema,
  updateResponsibilitiesSchema,
} from "./family-guardian.dto";
import { FAMILY_READ, FAMILY_WRITE, parseBody, tenantOf } from "./family-guardian-http";
import { FG_RELATIONSHIP_SERVICE } from "./family-guardian.tokens";

interface ResponsibilityPatch {
  legal?: boolean;
  educational?: boolean;
  financial?: boolean;
  pickupAuthorized?: boolean;
  medicalAuthorized?: boolean;
}

/** Build a clean responsibilities patch, omitting absent keys (exactOptionalPropertyTypes). */
function cleanResponsibilities(r: ResponsibilityPatch): Partial<ResponsibilityProfile> {
  return {
    ...(r.legal !== undefined ? { legal: r.legal } : {}),
    ...(r.educational !== undefined ? { educational: r.educational } : {}),
    ...(r.financial !== undefined ? { financial: r.financial } : {}),
    ...(r.pickupAuthorized !== undefined ? { pickupAuthorized: r.pickupAuthorized } : {}),
    ...(r.medicalAuthorized !== undefined ? { medicalAuthorized: r.medicalAuthorized } : {}),
  };
}

/** REST surface for student–guardian relationships (P2-D04). Permission-gated; tenant-scoped. */
@Controller("family-guardian/relationships")
export class StudentGuardianRelationshipController {
  constructor(
    @Inject(FG_RELATIONSHIP_SERVICE)
    private readonly service: StudentGuardianRelationshipService,
  ) {}

  @RequirePermissions(FAMILY_WRITE)
  @Post()
  @HttpCode(201)
  async link(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<StudentGuardianRelationship> {
    const dto = parseBody(linkGuardianSchema, body);
    return this.service.link({
      tenantId: tenantOf(principal),
      studentId: dto.studentId as Uuid,
      guardianId: dto.guardianId as Uuid,
      relationshipType: dto.relationshipType,
      ...(dto.responsibilities !== undefined
        ? { responsibilities: cleanResponsibilities(dto.responsibilities) }
        : {}),
      ...(dto.emergencyPriority !== undefined ? { emergencyPriority: dto.emergencyPriority } : {}),
      ...(dto.effectiveFrom !== undefined ? { effectiveFrom: dto.effectiveFrom } : {}),
    });
  }

  @RequirePermissions(FAMILY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<StudentGuardianRelationship[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(FAMILY_READ)
  @Get("by-student/:studentId")
  async listForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<StudentGuardianRelationship[]> {
    return this.service.listForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(FAMILY_READ)
  @Get("by-guardian/:guardianId")
  async listForGuardian(
    @CurrentPrincipal() principal: Principal,
    @Param("guardianId") guardianId: string,
  ): Promise<StudentGuardianRelationship[]> {
    return this.service.listForGuardian(tenantOf(principal), guardianId as Uuid);
  }

  @RequirePermissions(FAMILY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<StudentGuardianRelationship> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/type")
  @HttpCode(200)
  async setRelationshipType(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<StudentGuardianRelationship> {
    const dto = parseBody(setRelationshipTypeSchema, body);
    return this.service.setRelationshipType(tenantOf(principal), id as Uuid, dto.relationshipType);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/responsibilities")
  @HttpCode(200)
  async updateResponsibilities(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<StudentGuardianRelationship> {
    const dto = parseBody(updateResponsibilitiesSchema, body);
    return this.service.updateResponsibilities(
      tenantOf(principal),
      id as Uuid,
      cleanResponsibilities(dto),
    );
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/pickup")
  @HttpCode(200)
  async setPickup(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<StudentGuardianRelationship> {
    const dto = parseBody(setAuthorizationSchema, body);
    return this.service.setPickupAuthorization(tenantOf(principal), id as Uuid, dto.authorized);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/medical")
  @HttpCode(200)
  async setMedical(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<StudentGuardianRelationship> {
    const dto = parseBody(setAuthorizationSchema, body);
    return this.service.setMedicalAuthorization(tenantOf(principal), id as Uuid, dto.authorized);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/emergency-priority")
  @HttpCode(200)
  async setEmergencyPriority(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<StudentGuardianRelationship> {
    const dto = parseBody(setEmergencyPrioritySchema, body);
    return this.service.setEmergencyPriority(tenantOf(principal), id as Uuid, dto.priority);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/end")
  @HttpCode(200)
  async end(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<StudentGuardianRelationship> {
    const dto = parseBody(endRelationshipSchema, body);
    return this.service.end(tenantOf(principal), id as Uuid, dto.effectiveTo ?? null);
  }
}
