import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import { type Membership, MembershipService } from "@knowget/membership";
import type { TenantId, Uuid } from "@knowget/types";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { changeRolesSchema, endMembershipSchema, grantMembershipSchema } from "./membership.dto";
import { MEMBERSHIP_SERVICE } from "./membership.tokens";

const READ = "membership:read";
const WRITE = "membership:write";

/** Parse a body with a zod schema, mapping failure to a 400 ValidationError. */
function parse<T>(
  schema: {
    safeParse: (
      v: unknown,
    ) => { success: true; data: T } | { success: false; error: { issues: unknown } };
  },
  body: unknown,
): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError("Invalid request body", { details: { issues: result.error.issues } });
  }
  return result.data;
}

/**
 * REST surface for the membership domain. Tenant-scoped to the caller's
 * principal and permission-gated (`membership:read`/`:write`). A thin adapter
 * over {@link MembershipService}; all invariants (person/org existence, one
 * active membership per person per org, lifecycle) live in the domain.
 */
@Controller("memberships")
export class MembershipController {
  constructor(@Inject(MEMBERSHIP_SERVICE) private readonly service: MembershipService) {}

  @RequirePermissions(WRITE)
  @Post()
  @HttpCode(201)
  async grant(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Membership> {
    const dto = parse(grantMembershipSchema, body);
    return this.service.grant({
      tenantId: this.tenantOf(principal),
      personId: dto.personId as Uuid,
      organizationId: dto.organizationId as Uuid,
      roles: dto.roles,
      ...(dto.startDate !== undefined ? { startDate: dto.startDate } : {}),
    });
  }

  @RequirePermissions(READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Membership[]> {
    return this.service.list(this.tenantOf(principal));
  }

  @RequirePermissions(READ)
  @Get("by-person/:personId")
  async listByPerson(
    @CurrentPrincipal() principal: Principal,
    @Param("personId") personId: string,
  ): Promise<Membership[]> {
    return this.service.listByPerson(this.tenantOf(principal), personId as Uuid);
  }

  @RequirePermissions(READ)
  @Get("by-organization/:organizationId")
  async listByOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Membership[]> {
    return this.service.listByOrganization(this.tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Membership> {
    return this.service.getById(this.tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WRITE)
  @Patch(":id/roles")
  async changeRoles(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Membership> {
    const dto = parse(changeRolesSchema, body);
    return this.service.changeRoles(this.tenantOf(principal), id as Uuid, dto.roles);
  }

  @RequirePermissions(WRITE)
  @Post(":id/suspend")
  @HttpCode(200)
  async suspend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Membership> {
    return this.service.suspend(this.tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WRITE)
  @Post(":id/reinstate")
  @HttpCode(200)
  async reinstate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Membership> {
    return this.service.reinstate(this.tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WRITE)
  @Post(":id/end")
  @HttpCode(200)
  async end(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Membership> {
    const dto = parse(endMembershipSchema, body);
    return this.service.end(
      this.tenantOf(principal),
      id as Uuid,
      dto.endDate !== undefined ? dto.endDate : null,
    );
  }

  @RequirePermissions(WRITE)
  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<void> {
    await this.service.remove(this.tenantOf(principal), id as Uuid);
  }

  private tenantOf(principal: Principal): TenantId {
    if (!principal.tenantId) {
      throw new ValidationError("No tenant is associated with the current principal");
    }
    return principal.tenantId;
  }
}
