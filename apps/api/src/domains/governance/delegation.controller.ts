import type { Principal } from "@knowget/auth";
import { type Delegation, DelegationService } from "@knowget/governance";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { GOVERNANCE_READ, GOVERNANCE_WRITE, parseBody, tenantOf } from "./governance-http";
import { grantDelegationSchema, revokeDelegationSchema } from "./governance.dto";
import { GOVERNANCE_DELEGATION_SERVICE } from "./governance.tokens";

/** REST surface for delegations of authority (P2-D02). Permission-gated; tenant-scoped. */
@Controller("governance/delegations")
export class DelegationController {
  constructor(@Inject(GOVERNANCE_DELEGATION_SERVICE) private readonly service: DelegationService) {}

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post()
  @HttpCode(201)
  async grant(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Delegation> {
    const dto = parseBody(grantDelegationSchema, body);
    return this.service.grant({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      delegatorId: dto.delegatorId as Uuid,
      delegateId: dto.delegateId as Uuid,
      scope: dto.scope,
      effectiveFrom: dto.effectiveFrom,
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.monetaryLimit !== undefined ? { monetaryLimit: dto.monetaryLimit } : {}),
      ...(dto.effectiveUntil !== undefined ? { effectiveUntil: dto.effectiveUntil } : {}),
    });
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Delegation[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get("by-delegate/:delegateId")
  async listForDelegate(
    @CurrentPrincipal() principal: Principal,
    @Param("delegateId") delegateId: string,
  ): Promise<Delegation[]> {
    return this.service.listForDelegate(tenantOf(principal), delegateId as Uuid);
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get("approval-matrix/:organizationId")
  async approvalMatrix(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Delegation[]> {
    return this.service.approvalMatrix(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Delegation> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/revoke")
  @HttpCode(200)
  async revoke(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Delegation> {
    const dto = parseBody(revokeDelegationSchema, body);
    return this.service.revoke(tenantOf(principal), id as Uuid, {
      ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
      ...(dto.revokedOn !== undefined ? { revokedOn: dto.revokedOn } : {}),
    });
  }
}
