import type { Principal } from "@knowget/auth";
import { type IdentityAccount, IdentityAccountService } from "@knowget/enterprise-identity";
import { ValidationError } from "@knowget/exceptions";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  identifierBodySchema,
  lockAccountSchema,
  provisionAccountSchema,
  setCredentialSchema,
} from "./identity.dto";
import { IDENTITY_ACCOUNT_SERVICE } from "./identity.tokens";

const READ = "identity:read";
const WRITE = "identity:write";

/**
 * The credential hash is never exposed over the API; callers see only whether a
 * credential is set.
 */
export type IdentityAccountView = Omit<IdentityAccount, "credentialHash"> & {
  readonly hasCredential: boolean;
};

function toView(account: IdentityAccount): IdentityAccountView {
  const { credentialHash, ...rest } = account;
  return { ...rest, hasCredential: credentialHash !== null };
}

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
 * REST surface for the enterprise identity domain. Tenant-scoped to the caller's
 * principal and permission-gated (`identity:read`/`:write`). A thin adapter over
 * {@link IdentityAccountService}; all invariants (person link, identifier
 * uniqueness, lifecycle) live in the domain. Credential hashes are never returned.
 */
@Controller("identities")
export class IdentityController {
  constructor(@Inject(IDENTITY_ACCOUNT_SERVICE) private readonly service: IdentityAccountService) {}

  @RequirePermissions(WRITE)
  @Post()
  @HttpCode(201)
  async provision(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<IdentityAccountView> {
    const dto = parse(provisionAccountSchema, body);
    const account = await this.service.provision({
      tenantId: this.tenantOf(principal),
      personId: dto.personId as Uuid,
      identifiers: dto.identifiers,
      ...(dto.password !== undefined ? { password: dto.password } : {}),
      ...(dto.activate !== undefined ? { activate: dto.activate } : {}),
    });
    return toView(account);
  }

  @RequirePermissions(READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<IdentityAccountView[]> {
    return (await this.service.list(this.tenantOf(principal))).map(toView);
  }

  @RequirePermissions(READ)
  @Get("by-person/:personId")
  async listByPerson(
    @CurrentPrincipal() principal: Principal,
    @Param("personId") personId: string,
  ): Promise<IdentityAccountView[]> {
    return (await this.service.listByPerson(this.tenantOf(principal), personId as Uuid)).map(
      toView,
    );
  }

  @RequirePermissions(READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<IdentityAccountView> {
    return toView(await this.service.getById(this.tenantOf(principal), id as Uuid));
  }

  @RequirePermissions(WRITE)
  @Post(":id/identifiers")
  @HttpCode(200)
  async addIdentifier(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<IdentityAccountView> {
    const dto = parse(identifierBodySchema, body);
    return toView(await this.service.addIdentifier(this.tenantOf(principal), id as Uuid, dto));
  }

  @RequirePermissions(WRITE)
  @Delete(":id/identifiers")
  @HttpCode(200)
  async removeIdentifier(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<IdentityAccountView> {
    const dto = parse(identifierBodySchema, body);
    return toView(await this.service.removeIdentifier(this.tenantOf(principal), id as Uuid, dto));
  }

  @RequirePermissions(WRITE)
  @Post(":id/credential")
  @HttpCode(200)
  async setCredential(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<IdentityAccountView> {
    const dto = parse(setCredentialSchema, body);
    return toView(
      await this.service.setCredential(this.tenantOf(principal), id as Uuid, dto.password),
    );
  }

  @RequirePermissions(WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<IdentityAccountView> {
    return toView(await this.service.activate(this.tenantOf(principal), id as Uuid));
  }

  @RequirePermissions(WRITE)
  @Post(":id/suspend")
  @HttpCode(200)
  async suspend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<IdentityAccountView> {
    return toView(await this.service.suspend(this.tenantOf(principal), id as Uuid));
  }

  @RequirePermissions(WRITE)
  @Post(":id/disable")
  @HttpCode(200)
  async disable(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<IdentityAccountView> {
    return toView(await this.service.disable(this.tenantOf(principal), id as Uuid));
  }

  @RequirePermissions(WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<IdentityAccountView> {
    return toView(await this.service.archive(this.tenantOf(principal), id as Uuid));
  }

  @RequirePermissions(WRITE)
  @Post(":id/lock")
  @HttpCode(200)
  async lock(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<IdentityAccountView> {
    const dto = parse(lockAccountSchema, body);
    return toView(
      await this.service.lock(this.tenantOf(principal), id as Uuid, toIso(new Date(dto.until))),
    );
  }

  @RequirePermissions(WRITE)
  @Post(":id/unlock")
  @HttpCode(200)
  async unlock(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<IdentityAccountView> {
    return toView(await this.service.unlock(this.tenantOf(principal), id as Uuid));
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
