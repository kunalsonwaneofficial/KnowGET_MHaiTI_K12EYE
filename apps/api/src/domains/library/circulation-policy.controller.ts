import type { Principal } from "@knowget/auth";
import {
  type CirculationPolicy,
  CirculationPolicyService,
  type DefaultRule,
  type MemberCategory,
} from "@knowget/library";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { CIRCULATION_READ, CIRCULATION_WRITE, parseBody, tenantOf } from "./library-http";
import { draftPolicySchema, setPolicyDefaultRuleSchema, setPolicyRulesSchema } from "./library.dto";
import { LB_POLICY_SERVICE } from "./library.tokens";

/**
 * REST surface for circulation policies (P2-D18) — the version-controlled lending rules. Gated by
 * circulation:*; tenant-scoped. One policy may be active per organization (service-enforced, TD-38).
 */
@Controller("circulation/policies")
export class CirculationPolicyController {
  constructor(@Inject(LB_POLICY_SERVICE) private readonly service: CirculationPolicyService) {}

  @RequirePermissions(CIRCULATION_WRITE)
  @Post()
  @HttpCode(201)
  async draft(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<CirculationPolicy> {
    const dto = parseBody(draftPolicySchema, body);
    return this.service.draft({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      name: dto.name,
      defaultRule: dto.defaultRule,
      rules: dto.rules,
    });
  }

  @RequirePermissions(CIRCULATION_WRITE)
  @Post(":id/rules")
  @HttpCode(200)
  async setRules(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CirculationPolicy> {
    const dto = parseBody(setPolicyRulesSchema, body);
    return this.service.setRules(tenantOf(principal), id as Uuid, dto.rules);
  }

  @RequirePermissions(CIRCULATION_WRITE)
  @Post(":id/default-rule")
  @HttpCode(200)
  async setDefaultRule(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CirculationPolicy> {
    const dto = parseBody(setPolicyDefaultRuleSchema, body);
    return this.service.setDefaultRule(tenantOf(principal), id as Uuid, dto.defaultRule);
  }

  @RequirePermissions(CIRCULATION_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<CirculationPolicy> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CIRCULATION_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<CirculationPolicy> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CIRCULATION_READ)
  @Get("by-organization/:organizationId/active")
  async getActiveForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<CirculationPolicy | null> {
    return this.service.getActiveForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(CIRCULATION_READ)
  @Get("by-organization/:organizationId/terms/:category")
  async resolveTerms(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
    @Param("category") category: string,
  ): Promise<DefaultRule> {
    return this.service.resolveTermsForMember(
      tenantOf(principal),
      organizationId as Uuid,
      category as MemberCategory,
    );
  }

  @RequirePermissions(CIRCULATION_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<CirculationPolicy[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(CIRCULATION_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<CirculationPolicy> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
