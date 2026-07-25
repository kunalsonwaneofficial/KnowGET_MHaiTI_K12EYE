import type { Principal } from "@knowget/auth";
import {
  type CompetencyFramework,
  CompetencyFrameworkService,
  type CompetencyInput,
} from "@knowget/faculty-excellence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  addCompetencySchema,
  createFrameworkSchema,
  renameFrameworkSchema,
  setFrameworkDescriptionSchema,
} from "./faculty-excellence.dto";
import { FACULTY_READ, FACULTY_WRITE, parseBody, tenantOf } from "./faculty-excellence-http";
import { FE_FRAMEWORK_SERVICE } from "./faculty-excellence.tokens";

/** A competency input with only its defined optional fields (avoids explicit-undefined). */
function toCompetencyInput(c: {
  key: string;
  name: string;
  domain?: string | null;
  description?: string | null;
}): CompetencyInput {
  return {
    key: c.key,
    name: c.name,
    ...(c.domain !== undefined ? { domain: c.domain } : {}),
    ...(c.description !== undefined ? { description: c.description } : {}),
  };
}

/** REST surface for competency frameworks (P2-D13). Gated by faculty:*; tenant-scoped. */
@Controller("faculty/frameworks")
export class CompetencyFrameworkController {
  constructor(@Inject(FE_FRAMEWORK_SERVICE) private readonly service: CompetencyFrameworkService) {}

  @RequirePermissions(FACULTY_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<CompetencyFramework> {
    const dto = parseBody(createFrameworkSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      name: dto.name,
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      competencies: (dto.competencies ?? []).map(toCompetencyInput),
    });
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CompetencyFramework> {
    const dto = parseBody(renameFrameworkSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post(":id/description")
  @HttpCode(200)
  async setDescription(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CompetencyFramework> {
    const dto = parseBody(setFrameworkDescriptionSchema, body);
    return this.service.setDescription(tenantOf(principal), id as Uuid, dto.description);
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post(":id/competencies")
  @HttpCode(200)
  async addCompetency(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CompetencyFramework> {
    const dto = parseBody(addCompetencySchema, body);
    return this.service.addCompetency(tenantOf(principal), id as Uuid, toCompetencyInput(dto));
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post(":id/competencies/:key/remove")
  @HttpCode(200)
  async removeCompetency(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("key") key: string,
  ): Promise<CompetencyFramework> {
    return this.service.removeCompetency(tenantOf(principal), id as Uuid, key);
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<CompetencyFramework> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<CompetencyFramework> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACULTY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<CompetencyFramework[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(FACULTY_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<CompetencyFramework[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FACULTY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<CompetencyFramework> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
