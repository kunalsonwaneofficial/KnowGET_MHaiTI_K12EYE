import type { Principal } from "@knowget/auth";
import { type LibraryMember, LibraryMemberService } from "@knowget/library";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { CIRCULATION_READ, CIRCULATION_WRITE, parseBody, tenantOf } from "./library-http";
import {
  registerMemberSchema,
  setMemberCategorySchema,
  setMemberExpirySchema,
} from "./library.dto";
import { LB_MEMBER_SERVICE } from "./library.tokens";

/** REST surface for library members (P2-D18). Gated by circulation:*; tenant-scoped. */
@Controller("circulation/members")
export class LibraryMemberController {
  constructor(@Inject(LB_MEMBER_SERVICE) private readonly service: LibraryMemberService) {}

  @RequirePermissions(CIRCULATION_WRITE)
  @Post()
  @HttpCode(201)
  async register(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<LibraryMember> {
    const dto = parseBody(registerMemberSchema, body);
    return this.service.register({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      personId: dto.personId as Uuid,
      membershipNumber: dto.membershipNumber,
      category: dto.category,
      joinedOn: dto.joinedOn,
      expiresOn: dto.expiresOn,
    });
  }

  @RequirePermissions(CIRCULATION_WRITE)
  @Post(":id/category")
  @HttpCode(200)
  async setCategory(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LibraryMember> {
    const dto = parseBody(setMemberCategorySchema, body);
    return this.service.setCategory(tenantOf(principal), id as Uuid, dto.category);
  }

  @RequirePermissions(CIRCULATION_WRITE)
  @Post(":id/expiry")
  @HttpCode(200)
  async setExpiry(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LibraryMember> {
    const dto = parseBody(setMemberExpirySchema, body);
    return this.service.setExpiry(tenantOf(principal), id as Uuid, dto.expiresOn);
  }

  @RequirePermissions(CIRCULATION_WRITE)
  @Post(":id/suspend")
  @HttpCode(200)
  async suspend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LibraryMember> {
    return this.service.suspend(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CIRCULATION_WRITE)
  @Post(":id/reinstate")
  @HttpCode(200)
  async reinstate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LibraryMember> {
    return this.service.reinstate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CIRCULATION_WRITE)
  @Post(":id/expire")
  @HttpCode(200)
  async expire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LibraryMember> {
    return this.service.expire(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CIRCULATION_READ)
  @Get("by-membership-number/:membershipNumber")
  async getByMembershipNumber(
    @CurrentPrincipal() principal: Principal,
    @Param("membershipNumber") membershipNumber: string,
  ): Promise<LibraryMember> {
    return this.service.getByMembershipNumber(tenantOf(principal), membershipNumber);
  }

  @RequirePermissions(CIRCULATION_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<LibraryMember[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(CIRCULATION_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LibraryMember> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
