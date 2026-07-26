import type { Principal } from "@knowget/auth";
import { type Title, TitleService } from "@knowget/library";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { LIBRARY_READ, LIBRARY_WRITE, parseBody, tenantOf } from "./library-http";
import {
  catalogTitleSchema,
  renameTitleSchema,
  setAuthorsSchema,
  setSubjectsSchema,
  setTitleMetadataSchema,
} from "./library.dto";
import { LB_TITLE_SERVICE } from "./library.tokens";

/** REST surface for catalog titles (P2-D18). Gated by library:*; tenant-scoped. */
@Controller("library/titles")
export class TitleController {
  constructor(@Inject(LB_TITLE_SERVICE) private readonly service: TitleService) {}

  @RequirePermissions(LIBRARY_WRITE)
  @Post()
  @HttpCode(201)
  async catalog(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Title> {
    const dto = parseBody(catalogTitleSchema, body);
    return this.service.catalog({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      title: dto.title,
      type: dto.type,
      isbn: dto.isbn,
      authors: dto.authors,
      subjects: dto.subjects,
      language: dto.language,
      publisher: dto.publisher,
      publicationYear: dto.publicationYear,
    });
  }

  @RequirePermissions(LIBRARY_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Title> {
    const dto = parseBody(renameTitleSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.title);
  }

  @RequirePermissions(LIBRARY_WRITE)
  @Post(":id/authors")
  @HttpCode(200)
  async setAuthors(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Title> {
    const dto = parseBody(setAuthorsSchema, body);
    return this.service.setAuthors(tenantOf(principal), id as Uuid, dto.authors);
  }

  @RequirePermissions(LIBRARY_WRITE)
  @Post(":id/subjects")
  @HttpCode(200)
  async setSubjects(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Title> {
    const dto = parseBody(setSubjectsSchema, body);
    return this.service.setSubjects(tenantOf(principal), id as Uuid, dto.subjects);
  }

  @RequirePermissions(LIBRARY_WRITE)
  @Post(":id/metadata")
  @HttpCode(200)
  async setMetadata(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Title> {
    const dto = parseBody(setTitleMetadataSchema, body);
    return this.service.setMetadata(tenantOf(principal), id as Uuid, dto);
  }

  @RequirePermissions(LIBRARY_WRITE)
  @Post(":id/withdraw")
  @HttpCode(200)
  async withdraw(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Title> {
    return this.service.withdraw(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(LIBRARY_WRITE)
  @Post(":id/restore")
  @HttpCode(200)
  async restore(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Title> {
    return this.service.restore(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(LIBRARY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Title[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(LIBRARY_READ)
  @Get("by-isbn/:isbn")
  async getByIsbn(
    @CurrentPrincipal() principal: Principal,
    @Param("isbn") isbn: string,
  ): Promise<Title> {
    return this.service.getByIsbn(tenantOf(principal), isbn);
  }

  @RequirePermissions(LIBRARY_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Title[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(LIBRARY_READ)
  @Get(":id")
  async getById(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Title> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
