import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import {
  type Organization,
  type OrganizationNode,
  OrganizationService,
} from "@knowget/organization";
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
import {
  createOrganizationSchema,
  moveOrganizationSchema,
  renameOrganizationSchema,
  setStatusSchema,
} from "./organization.dto";
import { ORGANIZATION_SERVICE } from "./organization.tokens";

const READ = "organization:read";
const WRITE = "organization:write";

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
 * REST surface for the organization domain. Every route is tenant-scoped to the
 * caller's principal and permission-gated (`organization:read`/`:write`). The
 * controller is a thin adapter over {@link OrganizationService}; all invariants
 * live in the domain.
 */
@Controller("organizations")
export class OrganizationController {
  constructor(@Inject(ORGANIZATION_SERVICE) private readonly service: OrganizationService) {}

  @RequirePermissions(WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Organization> {
    const dto = parse(createOrganizationSchema, body);
    return this.service.create({
      tenantId: this.tenantOf(principal),
      type: dto.type,
      name: dto.name,
      code: dto.code,
      ...(dto.parentId !== undefined ? { parentId: dto.parentId as Uuid } : {}),
    });
  }

  @RequirePermissions(READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Organization[]> {
    return this.service.list(this.tenantOf(principal));
  }

  @RequirePermissions(READ)
  @Get("tree")
  async tree(@CurrentPrincipal() principal: Principal): Promise<OrganizationNode[]> {
    return this.service.tree(this.tenantOf(principal));
  }

  @RequirePermissions(READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Organization> {
    return this.service.getById(this.tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WRITE)
  @Patch(":id")
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Organization> {
    const dto = parse(renameOrganizationSchema, body);
    return this.service.rename(this.tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(WRITE)
  @Post(":id/move")
  @HttpCode(200)
  async move(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Organization> {
    const dto = parse(moveOrganizationSchema, body);
    return this.service.move(this.tenantOf(principal), id as Uuid, dto.parentId as Uuid | null);
  }

  @RequirePermissions(WRITE)
  @Post(":id/status")
  @HttpCode(200)
  async setStatus(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Organization> {
    const dto = parse(setStatusSchema, body);
    return this.service.setStatus(this.tenantOf(principal), id as Uuid, dto.status);
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
