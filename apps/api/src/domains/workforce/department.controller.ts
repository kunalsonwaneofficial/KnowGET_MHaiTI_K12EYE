import type { Principal } from "@knowget/auth";
import { type Department, DepartmentService } from "@knowget/workforce";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  assignHeadSchema,
  createDepartmentSchema,
  renameDepartmentSchema,
  reparentSchema,
  setCostCenterSchema,
  setDescriptionSchema,
} from "./workforce.dto";
import { parseBody, tenantOf, WORKFORCE_READ, WORKFORCE_WRITE } from "./workforce-http";
import { WF_DEPARTMENT_SERVICE } from "./workforce.tokens";

/** REST surface for departments (P2-D12) — the HR org tree. Gated by workforce:*; tenant-scoped. */
@Controller("workforce/departments")
export class DepartmentController {
  constructor(@Inject(WF_DEPARTMENT_SERVICE) private readonly service: DepartmentService) {}

  @RequirePermissions(WORKFORCE_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Department> {
    const dto = parseBody(createDepartmentSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      name: dto.name,
      ...(dto.parentDepartmentId !== undefined
        ? { parentDepartmentId: dto.parentDepartmentId as Uuid | null }
        : {}),
      ...(dto.costCenter !== undefined ? { costCenter: dto.costCenter } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
    });
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Department> {
    const dto = parseBody(renameDepartmentSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/cost-center")
  @HttpCode(200)
  async setCostCenter(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Department> {
    const dto = parseBody(setCostCenterSchema, body);
    return this.service.setCostCenter(tenantOf(principal), id as Uuid, dto.costCenter);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/description")
  @HttpCode(200)
  async setDescription(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Department> {
    const dto = parseBody(setDescriptionSchema, body);
    return this.service.setDescription(tenantOf(principal), id as Uuid, dto.description);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/head")
  @HttpCode(200)
  async assignHead(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Department> {
    const dto = parseBody(assignHeadSchema, body);
    return this.service.assignHead(
      tenantOf(principal),
      id as Uuid,
      dto.headEmployeeId as Uuid | null,
    );
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/reparent")
  @HttpCode(200)
  async reparent(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Department> {
    const dto = parseBody(reparentSchema, body);
    return this.service.reparent(
      tenantOf(principal),
      id as Uuid,
      dto.parentDepartmentId as Uuid | null,
    );
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Department> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/reactivate")
  @HttpCode(200)
  async reactivate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Department> {
    return this.service.reactivate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Department[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Department[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get(":id/children")
  async listChildren(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Department[]> {
    return this.service.listChildren(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Department> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
