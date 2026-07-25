import type { Principal } from "@knowget/auth";
import { type FeeComponentInput, type FeeStructure, FeeStructureService } from "@knowget/financial";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { FINANCE_READ, FINANCE_WRITE, parseBody, tenantOf } from "./financial-http";
import {
  addFeeComponentSchema,
  createFeeStructureSchema,
  renameFeeStructureSchema,
  setAcademicYearSchema,
  updateComponentAmountSchema,
} from "./financial.dto";
import { FIN_FEE_STRUCTURE_SERVICE } from "./financial.tokens";

/** A fee-component input with only its defined optional fields (avoids explicit-undefined). */
function toComponentInput(c: {
  key: string;
  name: string;
  category?: string | null;
  amountMinor: number;
}): FeeComponentInput {
  return {
    key: c.key,
    name: c.name,
    amountMinor: c.amountMinor,
    ...(c.category !== undefined ? { category: c.category } : {}),
  };
}

/** REST surface for fee structures (P2-D14). Gated by finance:*; tenant-scoped. */
@Controller("finance/fee-structures")
export class FeeStructureController {
  constructor(@Inject(FIN_FEE_STRUCTURE_SERVICE) private readonly service: FeeStructureService) {}

  @RequirePermissions(FINANCE_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<FeeStructure> {
    const dto = parseBody(createFeeStructureSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      name: dto.name,
      currency: dto.currency,
      ...(dto.academicYear !== undefined ? { academicYear: dto.academicYear } : {}),
      components: (dto.components ?? []).map(toComponentInput),
    });
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<FeeStructure> {
    const dto = parseBody(renameFeeStructureSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/academic-year")
  @HttpCode(200)
  async setAcademicYear(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<FeeStructure> {
    const dto = parseBody(setAcademicYearSchema, body);
    return this.service.setAcademicYear(tenantOf(principal), id as Uuid, dto.academicYear);
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/components")
  @HttpCode(200)
  async addComponent(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<FeeStructure> {
    const dto = parseBody(addFeeComponentSchema, body);
    return this.service.addComponent(tenantOf(principal), id as Uuid, toComponentInput(dto));
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/components/:key/remove")
  @HttpCode(200)
  async removeComponent(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("key") key: string,
  ): Promise<FeeStructure> {
    return this.service.removeComponent(tenantOf(principal), id as Uuid, key);
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/components/:key/amount")
  @HttpCode(200)
  async updateComponentAmount(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("key") key: string,
    @Body() body: unknown,
  ): Promise<FeeStructure> {
    const dto = parseBody(updateComponentAmountSchema, body);
    return this.service.updateComponentAmount(
      tenantOf(principal),
      id as Uuid,
      key,
      dto.amountMinor,
    );
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<FeeStructure> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<FeeStructure> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FINANCE_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<FeeStructure[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(FINANCE_READ)
  @Get("by-code/:code")
  async getByCode(
    @CurrentPrincipal() principal: Principal,
    @Param("code") code: string,
  ): Promise<FeeStructure> {
    return this.service.getByCode(tenantOf(principal), code);
  }

  @RequirePermissions(FINANCE_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<FeeStructure[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FINANCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<FeeStructure> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
