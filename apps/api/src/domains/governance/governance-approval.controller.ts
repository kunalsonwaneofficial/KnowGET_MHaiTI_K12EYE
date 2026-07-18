import type { Principal } from "@knowget/auth";
import {
  type ApprovalKind,
  type GovernanceApproval,
  GovernanceApprovalService,
} from "@knowget/governance";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { GOVERNANCE_READ, GOVERNANCE_WRITE, parseBody, tenantOf } from "./governance-http";
import { decideApprovalSchema, openApprovalSchema, requestChangesSchema } from "./governance.dto";
import { GOVERNANCE_APPROVAL_SERVICE } from "./governance.tokens";

/**
 * REST surface for the reusable governance approval workflow (P2-D02) — one
 * approval process for policy, committee, resolution and delegation approval.
 * Permission-gated; tenant-scoped.
 */
@Controller("governance/approvals")
export class GovernanceApprovalController {
  constructor(
    @Inject(GOVERNANCE_APPROVAL_SERVICE) private readonly service: GovernanceApprovalService,
  ) {}

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post()
  @HttpCode(201)
  async open(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<GovernanceApproval> {
    const dto = parseBody(openApprovalSchema, body);
    return this.service.open({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      kind: dto.kind,
      subjectId: dto.subjectId as Uuid,
      submittedById: dto.submittedById as Uuid,
      ...(dto.note !== undefined ? { note: dto.note } : {}),
    });
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<GovernanceApproval[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get("by-subject/:kind/:subjectId")
  async listForSubject(
    @CurrentPrincipal() principal: Principal,
    @Param("kind") kind: string,
    @Param("subjectId") subjectId: string,
  ): Promise<GovernanceApproval[]> {
    return this.service.listForSubject(
      tenantOf(principal),
      kind as ApprovalKind,
      subjectId as Uuid,
    );
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<GovernanceApproval[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<GovernanceApproval> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/submit")
  @HttpCode(200)
  async submit(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<GovernanceApproval> {
    return this.service.submit(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/approve")
  @HttpCode(200)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<GovernanceApproval> {
    const dto = parseBody(decideApprovalSchema, body);
    return this.service.approve(tenantOf(principal), id as Uuid, {
      decidedById: dto.decidedById as Uuid,
      ...(dto.note !== undefined ? { note: dto.note } : {}),
    });
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/reject")
  @HttpCode(200)
  async reject(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<GovernanceApproval> {
    const dto = parseBody(decideApprovalSchema, body);
    return this.service.reject(tenantOf(principal), id as Uuid, {
      decidedById: dto.decidedById as Uuid,
      ...(dto.note !== undefined ? { note: dto.note } : {}),
    });
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/request-changes")
  @HttpCode(200)
  async requestChanges(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<GovernanceApproval> {
    const dto = parseBody(requestChangesSchema, body);
    return this.service.requestChanges(
      tenantOf(principal),
      id as Uuid,
      dto.note !== undefined ? dto.note : null,
    );
  }
}
