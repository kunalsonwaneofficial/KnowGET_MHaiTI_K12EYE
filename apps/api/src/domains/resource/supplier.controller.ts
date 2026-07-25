import type { Principal } from "@knowget/auth";
import { type Supplier, SupplierService } from "@knowget/resource";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { PROCUREMENT_READ, PROCUREMENT_WRITE, parseBody, tenantOf } from "./resource-http";
import {
  createSupplierSchema,
  renameSupplierSchema,
  setSupplierCategorySchema,
  setSupplierContactSchema,
} from "./resource.dto";
import { RES_SUPPLIER_SERVICE } from "./resource.tokens";

/** REST surface for suppliers (P2-D15). Gated by procurement:*; tenant-scoped. */
@Controller("procurement/suppliers")
export class SupplierController {
  constructor(@Inject(RES_SUPPLIER_SERVICE) private readonly service: SupplierService) {}

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post()
  @HttpCode(201)
  async create(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Supplier> {
    const dto = parseBody(createSupplierSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      name: dto.name,
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.contactEmail !== undefined ? { contactEmail: dto.contactEmail } : {}),
      ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone } : {}),
    });
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Supplier> {
    const dto = parseBody(renameSupplierSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/category")
  @HttpCode(200)
  async setCategory(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Supplier> {
    const dto = parseBody(setSupplierCategorySchema, body);
    return this.service.setCategory(tenantOf(principal), id as Uuid, dto.category);
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/contact")
  @HttpCode(200)
  async setContact(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Supplier> {
    const dto = parseBody(setSupplierContactSchema, body);
    return this.service.setContact(
      tenantOf(principal),
      id as Uuid,
      dto.contactEmail,
      dto.contactPhone,
    );
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/suspend")
  @HttpCode(200)
  async suspend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Supplier> {
    return this.service.suspend(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/reinstate")
  @HttpCode(200)
  async reinstate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Supplier> {
    return this.service.reinstate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/blacklist")
  @HttpCode(200)
  async blacklist(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Supplier> {
    return this.service.blacklist(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Supplier[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get("by-code/:code")
  async getByCode(
    @CurrentPrincipal() principal: Principal,
    @Param("code") code: string,
  ): Promise<Supplier> {
    return this.service.getByCode(tenantOf(principal), code);
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Supplier[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Supplier> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
