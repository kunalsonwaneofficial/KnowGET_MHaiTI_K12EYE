import { type SchedulingPolicy, SchedulingPolicyService } from "@knowget/academic-scheduling";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { parseBody, SCHEDULING_READ, SCHEDULING_WRITE, tenantOf } from "./academic-scheduling-http";
import {
  createPolicySchema,
  noteSchema,
  renameSchema,
  setPolicyDescriptionSchema,
  setPolicyParametersSchema,
} from "./academic-scheduling.dto";
import { SCHED_POLICY_SERVICE } from "./academic-scheduling.tokens";

/** REST surface for scheduling policies (P2-D07). Gated by scheduling:*; tenant-scoped. */
@Controller("academic-scheduling/policies")
export class SchedulingPolicyController {
  constructor(@Inject(SCHED_POLICY_SERVICE) private readonly service: SchedulingPolicyService) {}

  @RequirePermissions(SCHEDULING_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<SchedulingPolicy> {
    const dto = parseBody(createPolicySchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      name: dto.name,
      ruleType: dto.ruleType,
      ...(dto.parameters !== undefined ? { parameters: dto.parameters } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
    });
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<SchedulingPolicy[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<SchedulingPolicy[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<SchedulingPolicy> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<SchedulingPolicy> {
    const dto = parseBody(renameSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/parameters")
  @HttpCode(200)
  async setParameters(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<SchedulingPolicy> {
    const dto = parseBody(setPolicyParametersSchema, body);
    return this.service.setParameters(tenantOf(principal), id as Uuid, dto.parameters);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/description")
  @HttpCode(200)
  async setDescription(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<SchedulingPolicy> {
    const dto = parseBody(setPolicyDescriptionSchema, body);
    return this.service.setDescription(tenantOf(principal), id as Uuid, dto.description);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<SchedulingPolicy> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/revise")
  @HttpCode(200)
  async revise(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<SchedulingPolicy> {
    const dto = parseBody(noteSchema, body);
    return this.service.revise(tenantOf(principal), id as Uuid, dto.note);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<SchedulingPolicy> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }
}
