import type { Principal } from "@knowget/auth";
import {
  type AccessCredential,
  AccessCredentialService,
  type CredentialHolderType,
} from "@knowget/campus-security";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { parseBody, SECURITY_READ, SECURITY_WRITE, tenantOf } from "./campus-security-http";
import {
  credentialZoneSchema,
  issueCredentialSchema,
  setCredentialExpirySchema,
} from "./campus-security.dto";
import { CS_CREDENTIAL_SERVICE } from "./campus-security.tokens";

/** REST surface for access credentials (P2-D21). Gated by security:*; tenant-scoped. */
@Controller("security/credentials")
export class AccessCredentialController {
  constructor(@Inject(CS_CREDENTIAL_SERVICE) private readonly service: AccessCredentialService) {}

  @RequirePermissions(SECURITY_WRITE)
  @Post()
  @HttpCode(201)
  async issue(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AccessCredential> {
    const dto = parseBody(issueCredentialSchema, body);
    return this.service.issue({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      credentialNumber: dto.credentialNumber,
      holderType: dto.holderType,
      holderId: dto.holderId as Uuid,
      grantedZoneIds: dto.grantedZoneIds as Uuid[] | undefined,
      issuedOn: dto.issuedOn,
      expiresOn: dto.expiresOn,
    });
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/grant-zone")
  @HttpCode(200)
  async grantZone(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AccessCredential> {
    const dto = parseBody(credentialZoneSchema, body);
    return this.service.grantZone(tenantOf(principal), id as Uuid, dto.zoneId as Uuid);
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/revoke-zone")
  @HttpCode(200)
  async revokeZoneGrant(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AccessCredential> {
    const dto = parseBody(credentialZoneSchema, body);
    return this.service.revokeZoneGrant(tenantOf(principal), id as Uuid, dto.zoneId as Uuid);
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/expiry")
  @HttpCode(200)
  async setExpiry(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AccessCredential> {
    const dto = parseBody(setCredentialExpirySchema, body);
    return this.service.setExpiry(tenantOf(principal), id as Uuid, dto.expiresOn);
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/suspend")
  @HttpCode(200)
  async suspend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AccessCredential> {
    return this.service.suspend(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/reinstate")
  @HttpCode(200)
  async reinstate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AccessCredential> {
    return this.service.reinstate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/revoke")
  @HttpCode(200)
  async revoke(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AccessCredential> {
    return this.service.revoke(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SECURITY_READ)
  @Get("by-number/:number")
  async getByNumber(
    @CurrentPrincipal() principal: Principal,
    @Param("number") credentialNumber: string,
  ): Promise<AccessCredential> {
    return this.service.getByNumber(tenantOf(principal), credentialNumber);
  }

  @RequirePermissions(SECURITY_READ)
  @Get("by-holder/:holderType/:holderId")
  async listForHolder(
    @CurrentPrincipal() principal: Principal,
    @Param("holderType") holderType: string,
    @Param("holderId") holderId: string,
  ): Promise<AccessCredential[]> {
    return this.service.listForHolder(
      tenantOf(principal),
      holderType as CredentialHolderType,
      holderId as Uuid,
    );
  }

  @RequirePermissions(SECURITY_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<AccessCredential[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(SECURITY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AccessCredential> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
