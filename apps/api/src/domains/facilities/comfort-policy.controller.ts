import type { Principal } from "@knowget/auth";
import { type ComfortPolicy, ComfortPolicyService } from "@knowget/facilities";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ENVIRONMENT_READ, ENVIRONMENT_WRITE, parseBody, tenantOf } from "./facilities-http";
import { draftPolicySchema, renamePolicySchema, setThresholdsSchema } from "./facilities.dto";
import { FAC_POLICY_SERVICE } from "./facilities.tokens";

/** REST surface for comfort policies (P2-D20). Gated by environment:*; tenant-scoped. */
@Controller("environment/comfort-policies")
export class ComfortPolicyController {
  constructor(@Inject(FAC_POLICY_SERVICE) private readonly service: ComfortPolicyService) {}

  @RequirePermissions(ENVIRONMENT_WRITE)
  @Post()
  @HttpCode(201)
  async draft(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ComfortPolicy> {
    const dto = parseBody(draftPolicySchema, body);
    return this.service.draft({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      name: dto.name,
      version: dto.version,
      thresholds: dto.thresholds,
    });
  }

  @RequirePermissions(ENVIRONMENT_WRITE)
  @Post(":id/thresholds")
  @HttpCode(200)
  async setThresholds(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ComfortPolicy> {
    const dto = parseBody(setThresholdsSchema, body);
    return this.service.setThresholds(tenantOf(principal), id as Uuid, dto.thresholds);
  }

  @RequirePermissions(ENVIRONMENT_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ComfortPolicy> {
    const dto = parseBody(renamePolicySchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(ENVIRONMENT_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ComfortPolicy> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ENVIRONMENT_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ComfortPolicy> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ENVIRONMENT_READ)
  @Get("active/:organizationId")
  async getActiveForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<ComfortPolicy | null> {
    return this.service.getActiveForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ENVIRONMENT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<ComfortPolicy[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ENVIRONMENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ComfortPolicy> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
