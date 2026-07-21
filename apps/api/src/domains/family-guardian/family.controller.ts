import type { Principal } from "@knowget/auth";
import { type Family, FamilyService } from "@knowget/family-guardian";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  addMemberSchema,
  mergeFamilySchema,
  putAddressSchema,
  registerFamilySchema,
  renameFamilySchema,
  setMemberRoleSchema,
  setPreferredCommunicationSchema,
  setPrimaryContactSchema,
  splitFamilySchema,
} from "./family-guardian.dto";
import { FAMILY_READ, FAMILY_WRITE, parseBody, tenantOf } from "./family-guardian-http";
import { FAMILY_SERVICE } from "./family-guardian.tokens";

/** REST surface for family units (P2-D04). Permission-gated; tenant-scoped. */
@Controller("family-guardian/families")
export class FamilyController {
  constructor(@Inject(FAMILY_SERVICE) private readonly service: FamilyService) {}

  @RequirePermissions(FAMILY_WRITE)
  @Post()
  @HttpCode(201)
  async register(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Family> {
    const dto = parseBody(registerFamilySchema, body);
    return this.service.register({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      familyNumber: dto.familyNumber,
      name: dto.name,
      ...(dto.members !== undefined
        ? { members: dto.members.map((m) => ({ personId: m.personId as Uuid, role: m.role })) }
        : {}),
      ...(dto.preferredLanguage !== undefined ? { preferredLanguage: dto.preferredLanguage } : {}),
      ...(dto.preferredChannel !== undefined ? { preferredChannel: dto.preferredChannel } : {}),
    });
  }

  @RequirePermissions(FAMILY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Family[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(FAMILY_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Family[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FAMILY_READ)
  @Get("by-number/:familyNumber")
  async getByFamilyNumber(
    @CurrentPrincipal() principal: Principal,
    @Param("familyNumber") familyNumber: string,
  ): Promise<Family> {
    return this.service.getByFamilyNumber(tenantOf(principal), familyNumber);
  }

  @RequirePermissions(FAMILY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Family> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/members")
  @HttpCode(200)
  async addMember(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Family> {
    const dto = parseBody(addMemberSchema, body);
    return this.service.addMember(tenantOf(principal), id as Uuid, {
      personId: dto.personId as Uuid,
      role: dto.role,
    });
  }

  @RequirePermissions(FAMILY_WRITE)
  @Delete(":id/members/:personId")
  async removeMember(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("personId") personId: string,
  ): Promise<Family> {
    return this.service.removeMember(tenantOf(principal), id as Uuid, personId as Uuid);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/members/:personId/role")
  @HttpCode(200)
  async setMemberRole(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("personId") personId: string,
    @Body() body: unknown,
  ): Promise<Family> {
    const dto = parseBody(setMemberRoleSchema, body);
    return this.service.setMemberRole(tenantOf(principal), id as Uuid, personId as Uuid, dto.role);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/primary-contact")
  @HttpCode(200)
  async setPrimaryContact(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Family> {
    const dto = parseBody(setPrimaryContactSchema, body);
    return this.service.setPrimaryContact(tenantOf(principal), id as Uuid, dto.personId as Uuid);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/addresses")
  @HttpCode(200)
  async putAddress(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Family> {
    const dto = parseBody(putAddressSchema, body);
    return this.service.putAddress(tenantOf(principal), id as Uuid, {
      label: dto.label,
      line1: dto.line1,
      line2: dto.line2 ?? null,
      city: dto.city,
      region: dto.region ?? null,
      postalCode: dto.postalCode ?? null,
      country: dto.country,
      isPrimary: dto.isPrimary,
    });
  }

  @RequirePermissions(FAMILY_WRITE)
  @Delete(":id/addresses/:label")
  async removeAddress(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("label") label: string,
  ): Promise<Family> {
    return this.service.removeAddress(tenantOf(principal), id as Uuid, label);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/communication")
  @HttpCode(200)
  async setPreferredCommunication(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Family> {
    const dto = parseBody(setPreferredCommunicationSchema, body);
    return this.service.setPreferredCommunication(tenantOf(principal), id as Uuid, {
      ...(dto.preferredLanguage !== undefined ? { preferredLanguage: dto.preferredLanguage } : {}),
      ...(dto.preferredChannel !== undefined ? { preferredChannel: dto.preferredChannel } : {}),
    });
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Family> {
    const dto = parseBody(renameFamilySchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/merge")
  @HttpCode(200)
  async merge(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Family> {
    const dto = parseBody(mergeFamilySchema, body);
    return this.service.merge(tenantOf(principal), id as Uuid, dto.targetId as Uuid);
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/split")
  @HttpCode(200)
  async split(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Family> {
    const dto = parseBody(splitFamilySchema, body);
    const result = await this.service.split(tenantOf(principal), id as Uuid, {
      newFamilyNumber: dto.newFamilyNumber,
      name: dto.name,
      memberPersonIds: dto.memberPersonIds as Uuid[],
    });
    return result.created;
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Family> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }
}
