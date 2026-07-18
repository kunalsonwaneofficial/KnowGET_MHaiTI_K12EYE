import type { Principal } from "@knowget/auth";
import { type Committee, CommitteeService } from "@knowget/governance";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { GOVERNANCE_READ, GOVERNANCE_WRITE, parseBody, tenantOf } from "./governance-http";
import {
  appointMemberSchema,
  changeRoleSchema,
  formCommitteeSchema,
  reviseTermsSchema,
} from "./governance.dto";
import { GOVERNANCE_COMMITTEE_SERVICE } from "./governance.tokens";

/** REST surface for committees (P2-D02). Permission-gated; tenant-scoped. */
@Controller("governance/committees")
export class CommitteeController {
  constructor(@Inject(GOVERNANCE_COMMITTEE_SERVICE) private readonly service: CommitteeService) {}

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post()
  @HttpCode(201)
  async form(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Committee> {
    const dto = parseBody(formCommitteeSchema, body);
    return this.service.form({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      name: dto.name,
      ...(dto.governanceBodyId !== undefined
        ? { governanceBodyId: dto.governanceBodyId as Uuid }
        : {}),
      ...(dto.purpose !== undefined ? { purpose: dto.purpose } : {}),
      ...(dto.termsOfReference !== undefined ? { termsOfReference: dto.termsOfReference } : {}),
    });
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Committee[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Committee[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Committee> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/members")
  @HttpCode(200)
  async appoint(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Committee> {
    const dto = parseBody(appointMemberSchema, body);
    return this.service.appoint(tenantOf(principal), id as Uuid, {
      personId: dto.personId as Uuid,
      role: dto.role,
      ...(dto.appointedOn !== undefined ? { appointedOn: dto.appointedOn } : {}),
    });
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Delete(":id/members/:personId")
  @HttpCode(200)
  async removeMember(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("personId") personId: string,
  ): Promise<Committee> {
    return this.service.removeMember(tenantOf(principal), id as Uuid, personId as Uuid);
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/members/:personId/role")
  @HttpCode(200)
  async changeRole(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("personId") personId: string,
    @Body() body: unknown,
  ): Promise<Committee> {
    const dto = parseBody(changeRoleSchema, body);
    return this.service.changeRole(tenantOf(principal), id as Uuid, personId as Uuid, dto.role);
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/terms")
  @HttpCode(200)
  async reviseTerms(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Committee> {
    const dto = parseBody(reviseTermsSchema, body);
    return this.service.reviseTerms(tenantOf(principal), id as Uuid, dto.termsOfReference);
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/dissolve")
  @HttpCode(200)
  async dissolve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Committee> {
    return this.service.dissolve(tenantOf(principal), id as Uuid);
  }
}
