import type { Principal } from "@knowget/auth";
import { type GovernanceBody, GovernanceBodyService } from "@knowget/governance";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { GOVERNANCE_READ, GOVERNANCE_WRITE, parseBody, tenantOf } from "./governance-http";
import {
  dissolveBodySchema,
  establishBodySchema,
  renameBodySchema,
  reviseTermsSchema,
} from "./governance.dto";
import { GOVERNANCE_BODY_SERVICE } from "./governance.tokens";

/** REST surface for governance bodies (P2-D02). Permission-gated; tenant-scoped. */
@Controller("governance/bodies")
export class GovernanceBodyController {
  constructor(@Inject(GOVERNANCE_BODY_SERVICE) private readonly service: GovernanceBodyService) {}

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post()
  @HttpCode(201)
  async establish(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<GovernanceBody> {
    const dto = parseBody(establishBodySchema, body);
    return this.service.establish({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      name: dto.name,
      type: dto.type,
      ...(dto.parentBodyId !== undefined ? { parentBodyId: dto.parentBodyId as Uuid } : {}),
      ...(dto.termsOfReference !== undefined ? { termsOfReference: dto.termsOfReference } : {}),
      ...(dto.establishedOn !== undefined ? { establishedOn: dto.establishedOn } : {}),
    });
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<GovernanceBody[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<GovernanceBody[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<GovernanceBody> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get(":id/children")
  async children(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<GovernanceBody[]> {
    return this.service.children(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<GovernanceBody> {
    const dto = parseBody(renameBodySchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/terms")
  @HttpCode(200)
  async reviseTerms(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<GovernanceBody> {
    const dto = parseBody(reviseTermsSchema, body);
    return this.service.reviseTerms(tenantOf(principal), id as Uuid, dto.termsOfReference);
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/dissolve")
  @HttpCode(200)
  async dissolve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<GovernanceBody> {
    const dto = parseBody(dissolveBodySchema, body);
    return this.service.dissolve(
      tenantOf(principal),
      id as Uuid,
      dto.dissolvedOn !== undefined ? dto.dissolvedOn : null,
    );
  }
}
