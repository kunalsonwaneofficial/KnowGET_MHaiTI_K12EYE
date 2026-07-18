import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import { type Relationship, RelationshipService } from "@knowget/relationship";
import type { TenantId, Uuid } from "@knowget/types";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { endRelationshipSchema, relateSchema } from "./relationship.dto";
import { RELATIONSHIP_SERVICE } from "./relationship.tokens";

const READ = "relationship:read";
const WRITE = "relationship:write";

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
 * REST surface for the relationship domain. Tenant-scoped to the caller's
 * principal and permission-gated (`relationship:read`/`:write`). A thin adapter
 * over {@link RelationshipService}; all invariants (person existence,
 * self-relationship and duplicate guards, lifecycle) live in the domain.
 */
@Controller("relationships")
export class RelationshipController {
  constructor(@Inject(RELATIONSHIP_SERVICE) private readonly service: RelationshipService) {}

  @RequirePermissions(WRITE)
  @Post()
  @HttpCode(201)
  async relate(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Relationship> {
    const dto = parse(relateSchema, body);
    return this.service.relate({
      tenantId: this.tenantOf(principal),
      fromPersonId: dto.fromPersonId as Uuid,
      toPersonId: dto.toPersonId as Uuid,
      kind: dto.kind,
      ...(dto.startDate !== undefined ? { startDate: dto.startDate } : {}),
    });
  }

  @RequirePermissions(READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Relationship[]> {
    return this.service.list(this.tenantOf(principal));
  }

  @RequirePermissions(READ)
  @Get("by-person/:personId")
  async listForPerson(
    @CurrentPrincipal() principal: Principal,
    @Param("personId") personId: string,
  ): Promise<Relationship[]> {
    return this.service.listForPerson(this.tenantOf(principal), personId as Uuid);
  }

  @RequirePermissions(READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Relationship> {
    return this.service.getById(this.tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WRITE)
  @Post(":id/end")
  @HttpCode(200)
  async end(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Relationship> {
    const dto = parse(endRelationshipSchema, body);
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
