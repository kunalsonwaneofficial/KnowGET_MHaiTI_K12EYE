import type { Principal } from "@knowget/auth";
import { type Visitor, VisitorService } from "@knowget/campus-security";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { parseBody, tenantOf, VISITOR_READ, VISITOR_WRITE } from "./campus-security-http";
import {
  registerVisitorSchema,
  setVisitorTypeSchema,
  updateVisitorContactSchema,
} from "./campus-security.dto";
import { CS_VISITOR_SERVICE } from "./campus-security.tokens";

/** REST surface for visitors (P2-D21). Gated by visitor:*; tenant-scoped. */
@Controller("visitors")
export class VisitorController {
  constructor(@Inject(CS_VISITOR_SERVICE) private readonly service: VisitorService) {}

  @RequirePermissions(VISITOR_WRITE)
  @Post()
  @HttpCode(201)
  async register(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Visitor> {
    const dto = parseBody(registerVisitorSchema, body);
    return this.service.register({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      fullName: dto.fullName,
      type: dto.type,
      phone: dto.phone,
      email: dto.email,
      company: dto.company,
    });
  }

  @RequirePermissions(VISITOR_WRITE)
  @Post(":id/type")
  @HttpCode(200)
  async setType(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Visitor> {
    const dto = parseBody(setVisitorTypeSchema, body);
    return this.service.setType(tenantOf(principal), id as Uuid, dto.type);
  }

  @RequirePermissions(VISITOR_WRITE)
  @Post(":id/contact")
  @HttpCode(200)
  async updateContact(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Visitor> {
    const dto = parseBody(updateVisitorContactSchema, body);
    return this.service.updateContact(tenantOf(principal), id as Uuid, dto);
  }

  @RequirePermissions(VISITOR_WRITE)
  @Post(":id/block")
  @HttpCode(200)
  async block(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Visitor> {
    return this.service.block(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(VISITOR_WRITE)
  @Post(":id/unblock")
  @HttpCode(200)
  async unblock(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Visitor> {
    return this.service.unblock(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(VISITOR_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Visitor> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(VISITOR_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Visitor[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(VISITOR_READ)
  @Get("by-code/:code")
  async getByCode(
    @CurrentPrincipal() principal: Principal,
    @Param("code") code: string,
  ): Promise<Visitor> {
    return this.service.getByCode(tenantOf(principal), code);
  }

  @RequirePermissions(VISITOR_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Visitor[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(VISITOR_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Visitor> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
