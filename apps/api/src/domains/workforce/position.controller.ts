import type { Principal } from "@knowget/auth";
import { type Position, PositionService } from "@knowget/workforce";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  createPositionSchema,
  retitleSchema,
  setDescriptionSchema,
  setGradeSchema,
  setHeadcountSchema,
} from "./workforce.dto";
import { parseBody, tenantOf, WORKFORCE_READ, WORKFORCE_WRITE } from "./workforce-http";
import { WF_POSITION_SERVICE } from "./workforce.tokens";

/** REST surface for positions (P2-D12) — defined posts. Gated by workforce:*; tenant-scoped. */
@Controller("workforce/positions")
export class PositionController {
  constructor(@Inject(WF_POSITION_SERVICE) private readonly service: PositionService) {}

  @RequirePermissions(WORKFORCE_WRITE)
  @Post()
  @HttpCode(201)
  async create(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Position> {
    const dto = parseBody(createPositionSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      departmentId: dto.departmentId as Uuid,
      code: dto.code,
      title: dto.title,
      employmentType: dto.employmentType,
      ...(dto.headcount !== undefined ? { headcount: dto.headcount } : {}),
      ...(dto.grade !== undefined ? { grade: dto.grade } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
    });
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/retitle")
  @HttpCode(200)
  async retitle(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Position> {
    const dto = parseBody(retitleSchema, body);
    return this.service.retitle(tenantOf(principal), id as Uuid, dto.title);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/headcount")
  @HttpCode(200)
  async setHeadcount(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Position> {
    const dto = parseBody(setHeadcountSchema, body);
    return this.service.setHeadcount(tenantOf(principal), id as Uuid, dto.headcount);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/grade")
  @HttpCode(200)
  async setGrade(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Position> {
    const dto = parseBody(setGradeSchema, body);
    return this.service.setGrade(tenantOf(principal), id as Uuid, dto.grade);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/description")
  @HttpCode(200)
  async setDescription(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Position> {
    const dto = parseBody(setDescriptionSchema, body);
    return this.service.setDescription(tenantOf(principal), id as Uuid, dto.description);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/open")
  @HttpCode(200)
  async open(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Position> {
    return this.service.open(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/hold")
  @HttpCode(200)
  async hold(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Position> {
    return this.service.hold(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/resume")
  @HttpCode(200)
  async resume(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Position> {
    return this.service.resume(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/close")
  @HttpCode(200)
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Position> {
    return this.service.close(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Position[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get("by-department/:departmentId")
  async listForDepartment(
    @CurrentPrincipal() principal: Principal,
    @Param("departmentId") departmentId: string,
  ): Promise<Position[]> {
    return this.service.listForDepartment(tenantOf(principal), departmentId as Uuid);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Position[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Position> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
