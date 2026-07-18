import type { Principal } from "@knowget/auth";
import { type Policy, type PolicyAcknowledgment, PolicyService } from "@knowget/governance";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { GOVERNANCE_READ, GOVERNANCE_WRITE, parseBody, tenantOf } from "./governance-http";
import {
  acknowledgePolicySchema,
  approvePolicySchema,
  authorPolicySchema,
  publishPolicySchema,
  retirePolicySchema,
  updateDraftSchema,
} from "./governance.dto";
import { GOVERNANCE_POLICY_SERVICE } from "./governance.tokens";

/** REST surface for the policy registry (P2-D02). Permission-gated; tenant-scoped. */
@Controller("governance/policies")
export class PolicyController {
  constructor(@Inject(GOVERNANCE_POLICY_SERVICE) private readonly service: PolicyService) {}

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post()
  @HttpCode(201)
  async author(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Policy> {
    const dto = parseBody(authorPolicySchema, body);
    return this.service.author({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      category: dto.category,
      title: dto.title,
      ownerId: dto.ownerId as Uuid,
      ...(dto.body !== undefined ? { body: dto.body } : {}),
    });
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Policy[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get("applicable/:organizationId")
  async listApplicable(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Policy[]> {
    return this.service.listApplicable(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Policy> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(GOVERNANCE_READ)
  @Get(":id/acknowledgments")
  async listAcknowledgments(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<PolicyAcknowledgment[]> {
    return this.service.listAcknowledgments(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/draft")
  @HttpCode(200)
  async editDraft(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Policy> {
    const dto = parseBody(updateDraftSchema, body);
    return this.service.editDraft(tenantOf(principal), id as Uuid, {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.body !== undefined ? { body: dto.body } : {}),
    });
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/approve")
  @HttpCode(200)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Policy> {
    const dto = parseBody(approvePolicySchema, body);
    return this.service.approve(
      tenantOf(principal),
      id as Uuid,
      dto.approvedOn !== undefined ? dto.approvedOn : null,
    );
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Policy> {
    const dto = parseBody(publishPolicySchema, body);
    return this.service.publish(tenantOf(principal), id as Uuid, {
      ...(dto.effectiveOn !== undefined ? { effectiveOn: dto.effectiveOn } : {}),
      ...(dto.publishedOn !== undefined ? { publishedOn: dto.publishedOn } : {}),
    });
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/amend")
  @HttpCode(200)
  async amend(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Policy> {
    return this.service.amend(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Policy> {
    const dto = parseBody(retirePolicySchema, body);
    return this.service.retire(
      tenantOf(principal),
      id as Uuid,
      dto.retiredOn !== undefined ? dto.retiredOn : null,
    );
  }

  @RequirePermissions(GOVERNANCE_WRITE)
  @Post(":id/acknowledge")
  @HttpCode(201)
  async acknowledge(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<PolicyAcknowledgment> {
    const dto = parseBody(acknowledgePolicySchema, body);
    return this.service.acknowledgePolicy(tenantOf(principal), id as Uuid, dto.personId as Uuid);
  }
}
