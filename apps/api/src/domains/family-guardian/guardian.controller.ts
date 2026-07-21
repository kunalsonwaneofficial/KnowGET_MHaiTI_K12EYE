import type { Principal } from "@knowget/auth";
import { type Guardian, GuardianService } from "@knowget/family-guardian";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  putGuardianContactSchema,
  registerGuardianSchema,
  setGuardianAvailabilitySchema,
  updateLegalAuthoritySchema,
  verifyGuardianSchema,
} from "./family-guardian.dto";
import { FAMILY_READ, FAMILY_WRITE, parseBody, tenantOf } from "./family-guardian-http";
import { GUARDIAN_SERVICE } from "./family-guardian.tokens";

/** REST surface for guardians (P2-D04). Permission-gated; tenant-scoped. */
@Controller("family-guardian/guardians")
export class GuardianController {
  constructor(@Inject(GUARDIAN_SERVICE) private readonly service: GuardianService) {}

  @RequirePermissions(FAMILY_WRITE)
  @Post()
  @HttpCode(201)
  async register(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Guardian> {
    const dto = parseBody(registerGuardianSchema, body);
    return this.service.register({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      personId: dto.personId as Uuid,
      ...(dto.legalAuthority !== undefined ? { legalAuthority: dto.legalAuthority } : {}),
      ...(dto.contacts !== undefined ? { contacts: dto.contacts } : {}),
      ...(dto.availabilityNote !== undefined ? { availabilityNote: dto.availabilityNote } : {}),
    });
  }

  @RequirePermissions(FAMILY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Guardian[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(FAMILY_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Guardian[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FAMILY_READ)
  @Get("by-person/:personId")
  async listForPerson(
    @CurrentPrincipal() principal: Principal,
    @Param("personId") personId: string,
  ): Promise<Guardian[]> {
    return this.service.listForPerson(tenantOf(principal), personId as Uuid);
  }

  @RequirePermissions(FAMILY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Guardian> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/submit-verification")
  @HttpCode(200)
  async submitForVerification(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Guardian> {
    return this.service.submitForVerification(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/verify")
  @HttpCode(200)
  async verify(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Guardian> {
    const dto = parseBody(verifyGuardianSchema, body);
    return this.service.verify(tenantOf(principal), id as Uuid, dto.verifiedOn ?? null);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/reject-verification")
  @HttpCode(200)
  async rejectVerification(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Guardian> {
    return this.service.rejectVerification(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Guardian> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/suspend")
  @HttpCode(200)
  async suspend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Guardian> {
    return this.service.suspend(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Guardian> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/legal-authority")
  @HttpCode(200)
  async updateLegalAuthority(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Guardian> {
    const dto = parseBody(updateLegalAuthoritySchema, body);
    return this.service.updateLegalAuthority(tenantOf(principal), id as Uuid, dto.legalAuthority);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/contacts")
  @HttpCode(200)
  async putContact(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Guardian> {
    const dto = parseBody(putGuardianContactSchema, body);
    return this.service.putContact(tenantOf(principal), id as Uuid, {
      channel: dto.channel,
      value: dto.value,
      isPrimary: dto.isPrimary,
    });
  }

  @RequirePermissions(FAMILY_WRITE)
  @Delete(":id/contacts/:value")
  async removeContact(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("value") value: string,
  ): Promise<Guardian> {
    return this.service.removeContact(tenantOf(principal), id as Uuid, value);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/availability")
  @HttpCode(200)
  async setAvailability(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Guardian> {
    const dto = parseBody(setGuardianAvailabilitySchema, body);
    return this.service.setAvailability(tenantOf(principal), id as Uuid, dto.note);
  }
}
