import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import { type Person, PersonService } from "@knowget/person";
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
  addContactSchema,
  changeStatusSchema,
  mergePersonSchema,
  registerPersonSchema,
  renamePersonSchema,
  setDemographicsSchema,
} from "./person.dto";
import { PERSON_SERVICE } from "./person.tokens";

const READ = "person:read";
const WRITE = "person:write";

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
 * REST surface for the person domain. Tenant-scoped to the caller's principal
 * and permission-gated (`person:read`/`:write`). A thin adapter over
 * {@link PersonService}; all invariants (dedup, lifecycle, merge) live in the domain.
 */
@Controller("persons")
export class PersonController {
  constructor(@Inject(PERSON_SERVICE) private readonly service: PersonService) {}

  @RequirePermissions(WRITE)
  @Post()
  @HttpCode(201)
  async register(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Person> {
    const dto = parse(registerPersonSchema, body);
    return this.service.register({
      tenantId: this.tenantOf(principal),
      name: dto.name,
      ...(dto.dateOfBirth !== undefined ? { dateOfBirth: dto.dateOfBirth } : {}),
      ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
      ...(dto.allowDuplicate !== undefined ? { allowDuplicate: dto.allowDuplicate } : {}),
    });
  }

  @RequirePermissions(READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Person[]> {
    return this.service.list(this.tenantOf(principal));
  }

  @RequirePermissions(READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Person> {
    return this.service.getById(this.tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(READ)
  @Get(":id/duplicates")
  async duplicates(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Person[]> {
    return this.service.findPotentialDuplicates(this.tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WRITE)
  @Patch(":id")
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Person> {
    const dto = parse(renamePersonSchema, body);
    return this.service.rename(this.tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(WRITE)
  @Patch(":id/demographics")
  async demographics(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Person> {
    const dto = parse(setDemographicsSchema, body);
    return this.service.setDemographics(this.tenantOf(principal), id as Uuid, {
      ...(dto.dateOfBirth !== undefined ? { dateOfBirth: dto.dateOfBirth } : {}),
      ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
    });
  }

  @RequirePermissions(WRITE)
  @Post(":id/contacts")
  @HttpCode(200)
  async addContact(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Person> {
    const dto = parse(addContactSchema, body);
    return this.service.addContact(this.tenantOf(principal), id as Uuid, dto);
  }

  @RequirePermissions(WRITE)
  @Delete(":id/contacts/:contactId")
  @HttpCode(200)
  async removeContact(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("contactId") contactId: string,
  ): Promise<Person> {
    return this.service.removeContact(this.tenantOf(principal), id as Uuid, contactId as Uuid);
  }

  @RequirePermissions(WRITE)
  @Post(":id/contacts/:contactId/primary")
  @HttpCode(200)
  async setPrimaryContact(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("contactId") contactId: string,
  ): Promise<Person> {
    return this.service.setPrimaryContact(this.tenantOf(principal), id as Uuid, contactId as Uuid);
  }

  @RequirePermissions(WRITE)
  @Post(":id/status")
  @HttpCode(200)
  async changeStatus(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Person> {
    const dto = parse(changeStatusSchema, body);
    return this.service.changeStatus(this.tenantOf(principal), id as Uuid, dto.status);
  }

  @RequirePermissions(WRITE)
  @Post(":id/merge")
  @HttpCode(200)
  async merge(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Person> {
    const dto = parse(mergePersonSchema, body);
    return this.service.merge(this.tenantOf(principal), id as Uuid, dto.mergedId as Uuid);
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
