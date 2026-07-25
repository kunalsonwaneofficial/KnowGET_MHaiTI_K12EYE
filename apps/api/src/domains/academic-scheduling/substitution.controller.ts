import { type Substitution, SubstitutionService } from "@knowget/academic-scheduling";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { parseBody, SCHEDULING_READ, SCHEDULING_WRITE, tenantOf } from "./academic-scheduling-http";
import { assignSubstitutionSchema } from "./academic-scheduling.dto";
import { SCHED_SUBSTITUTION_SERVICE } from "./academic-scheduling.tokens";

/** REST surface for substitutions (P2-D07). Gated by scheduling:*; tenant-scoped. */
@Controller("academic-scheduling/substitutions")
export class SubstitutionController {
  constructor(@Inject(SCHED_SUBSTITUTION_SERVICE) private readonly service: SubstitutionService) {}

  @RequirePermissions(SCHEDULING_WRITE)
  @Post()
  @HttpCode(201)
  async assign(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Substitution> {
    const dto = parseBody(assignSubstitutionSchema, body);
    return this.service.assign({
      tenantId: tenantOf(principal),
      scheduleSlotId: dto.scheduleSlotId as Uuid,
      substitutionType: dto.substitutionType,
      originalId: dto.originalId as Uuid,
      replacementId: dto.replacementId as Uuid,
      ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
      ...(dto.date !== undefined ? { date: dto.date } : {}),
    });
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get("by-slot/:scheduleSlotId")
  async listForSlot(
    @CurrentPrincipal() principal: Principal,
    @Param("scheduleSlotId") scheduleSlotId: string,
  ): Promise<Substitution[]> {
    return this.service.listForSlot(tenantOf(principal), scheduleSlotId as Uuid);
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Substitution[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Substitution> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Substitution> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Substitution> {
    return this.service.complete(tenantOf(principal), id as Uuid);
  }
}
