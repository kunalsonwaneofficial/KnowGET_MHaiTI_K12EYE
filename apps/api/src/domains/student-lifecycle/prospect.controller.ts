import type { Principal } from "@knowget/auth";
import { type Prospect, ProspectService } from "@knowget/student-lifecycle";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { captureProspectSchema, recordFollowUpSchema } from "./student-lifecycle.dto";
import { parseBody, STUDENT_READ, STUDENT_WRITE, tenantOf } from "./student-lifecycle-http";
import { STUDENT_PROSPECT_SERVICE } from "./student-lifecycle.tokens";

/** REST surface for prospects — the enquiry funnel (P2-D03). Permission-gated; tenant-scoped. */
@Controller("student-lifecycle/prospects")
export class ProspectController {
  constructor(@Inject(STUDENT_PROSPECT_SERVICE) private readonly service: ProspectService) {}

  @RequirePermissions(STUDENT_WRITE)
  @Post()
  @HttpCode(201)
  async capture(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Prospect> {
    const dto = parseBody(captureProspectSchema, body);
    return this.service.capture({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      personId: dto.personId as Uuid,
      leadSource: dto.leadSource,
      ...(dto.campaign !== undefined ? { campaign: dto.campaign } : {}),
      ...(dto.interests !== undefined ? { interests: dto.interests } : {}),
    });
  }

  @RequirePermissions(STUDENT_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Prospect[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(STUDENT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Prospect[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(STUDENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Prospect> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/follow-ups")
  @HttpCode(200)
  async recordFollowUp(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Prospect> {
    const dto = parseBody(recordFollowUpSchema, body);
    return this.service.recordFollowUp(
      tenantOf(principal),
      id as Uuid,
      dto.note,
      dto.byId as Uuid | undefined,
    );
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/contact")
  @HttpCode(200)
  async contact(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Prospect> {
    return this.service.contact(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/qualify")
  @HttpCode(200)
  async qualify(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Prospect> {
    return this.service.qualify(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/convert")
  @HttpCode(200)
  async convert(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Prospect> {
    return this.service.convert(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/lose")
  @HttpCode(200)
  async lose(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Prospect> {
    return this.service.lose(tenantOf(principal), id as Uuid);
  }
}
