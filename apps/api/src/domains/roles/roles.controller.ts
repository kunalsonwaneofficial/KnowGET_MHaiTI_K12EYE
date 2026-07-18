import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import { type Role, RoleService } from "@knowget/roles";
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
  Put,
} from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  defineRoleSchema,
  describeRoleSchema,
  permissionsListSchema,
  renameRoleSchema,
  setPermissionsSchema,
} from "./roles.dto";
import { ROLE_SERVICE } from "./roles.tokens";

const READ = "role:read";
const WRITE = "role:write";

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
 * REST surface for the role catalogue. Tenant-scoped to the caller's principal
 * and permission-gated (`role:read`/`:write`). A thin adapter over
 * {@link RoleService}; all invariants (name uniqueness, system-role protection,
 * lifecycle) live in the domain.
 */
@Controller("roles")
export class RolesController {
  constructor(@Inject(ROLE_SERVICE) private readonly service: RoleService) {}

  @RequirePermissions(WRITE)
  @Post()
  @HttpCode(201)
  async define(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Role> {
    const dto = parse(defineRoleSchema, body);
    return this.service.define({
      tenantId: this.tenantOf(principal),
      name: dto.name,
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.permissions !== undefined ? { permissions: dto.permissions } : {}),
      ...(dto.isSystem !== undefined ? { isSystem: dto.isSystem } : {}),
    });
  }

  @RequirePermissions(READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Role[]> {
    return this.service.list(this.tenantOf(principal));
  }

  @RequirePermissions(READ)
  @Get("by-name/:name")
  async getByName(
    @CurrentPrincipal() principal: Principal,
    @Param("name") name: string,
  ): Promise<Role> {
    return this.service.getByName(this.tenantOf(principal), name);
  }

  @RequirePermissions(READ)
  @Get(":id")
  async getById(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Role> {
    return this.service.getById(this.tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WRITE)
  @Put(":id/permissions")
  @HttpCode(200)
  async setPermissions(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Role> {
    const dto = parse(setPermissionsSchema, body);
    return this.service.setPermissions(this.tenantOf(principal), id as Uuid, dto.permissions);
  }

  @RequirePermissions(WRITE)
  @Post(":id/permissions")
  @HttpCode(200)
  async grantPermissions(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Role> {
    const dto = parse(permissionsListSchema, body);
    return this.service.grantPermissions(this.tenantOf(principal), id as Uuid, dto.permissions);
  }

  @RequirePermissions(WRITE)
  @Delete(":id/permissions")
  @HttpCode(200)
  async revokePermissions(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Role> {
    const dto = parse(permissionsListSchema, body);
    return this.service.revokePermissions(this.tenantOf(principal), id as Uuid, dto.permissions);
  }

  @RequirePermissions(WRITE)
  @Patch(":id/name")
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Role> {
    const dto = parse(renameRoleSchema, body);
    return this.service.rename(this.tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(WRITE)
  @Patch(":id/description")
  async describe(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Role> {
    const dto = parse(describeRoleSchema, body);
    return this.service.describe(this.tenantOf(principal), id as Uuid, dto.description);
  }

  @RequirePermissions(WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Role> {
    return this.service.archive(this.tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WRITE)
  @Post(":id/unarchive")
  @HttpCode(200)
  async unarchive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Role> {
    return this.service.unarchive(this.tenantOf(principal), id as Uuid);
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
