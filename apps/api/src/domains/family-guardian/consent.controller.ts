import type { Principal } from "@knowget/auth";
import {
  type Consent,
  ConsentService,
  type ConsentType,
  type ConsentVerification,
} from "@knowget/family-guardian";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { grantConsentSchema, withdrawConsentSchema } from "./family-guardian.dto";
import { FAMILY_READ, FAMILY_WRITE, parseBody, tenantOf } from "./family-guardian-http";
import { FG_CONSENT_SERVICE } from "./family-guardian.tokens";

/** REST surface for institutional consents (P2-D04). Permission-gated; tenant-scoped. */
@Controller("family-guardian/consents")
export class ConsentController {
  constructor(@Inject(FG_CONSENT_SERVICE) private readonly service: ConsentService) {}

  @RequirePermissions(FAMILY_WRITE)
  @Post()
  @HttpCode(201)
  async grant(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Consent> {
    const dto = parseBody(grantConsentSchema, body);
    return this.service.grant({
      tenantId: tenantOf(principal),
      studentId: dto.studentId as Uuid,
      guardianId: dto.guardianId as Uuid,
      consentType: dto.consentType,
      ...(dto.policyId !== undefined ? { policyId: (dto.policyId as Uuid | null) ?? null } : {}),
      ...(dto.note !== undefined ? { note: dto.note } : {}),
      ...(dto.effectiveOn !== undefined ? { effectiveOn: dto.effectiveOn } : {}),
      ...(dto.expiresOn !== undefined ? { expiresOn: dto.expiresOn } : {}),
    });
  }

  @RequirePermissions(FAMILY_WRITE)
  @Post("withdraw")
  @HttpCode(201)
  async withdraw(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Consent> {
    const dto = parseBody(withdrawConsentSchema, body);
    return this.service.withdraw({
      tenantId: tenantOf(principal),
      studentId: dto.studentId as Uuid,
      guardianId: dto.guardianId as Uuid,
      consentType: dto.consentType,
      ...(dto.note !== undefined ? { note: dto.note } : {}),
      ...(dto.effectiveOn !== undefined ? { effectiveOn: dto.effectiveOn } : {}),
    });
  }

  @RequirePermissions(FAMILY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Consent[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(FAMILY_READ)
  @Get("verify/:studentId/:consentType")
  async verify(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
    @Param("consentType") consentType: string,
  ): Promise<ConsentVerification> {
    return this.service.verify(tenantOf(principal), studentId as Uuid, consentType as ConsentType);
  }

  @RequirePermissions(FAMILY_READ)
  @Get("history/:studentId")
  async history(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<Consent[]> {
    return this.service.history(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(FAMILY_READ)
  @Get("history/:studentId/:consentType")
  async historyByType(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
    @Param("consentType") consentType: string,
  ): Promise<Consent[]> {
    return this.service.history(tenantOf(principal), studentId as Uuid, consentType as ConsentType);
  }

  @RequirePermissions(FAMILY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Consent> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
