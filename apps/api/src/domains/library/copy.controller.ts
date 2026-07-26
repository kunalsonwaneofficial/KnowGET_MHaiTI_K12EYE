import type { Principal } from "@knowget/auth";
import { type Copy, CopyService, type TitleAvailability } from "@knowget/library";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { LIBRARY_READ, LIBRARY_WRITE, parseBody, tenantOf } from "./library-http";
import { accessionCopySchema, setCopyConditionSchema, setCopyLocationSchema } from "./library.dto";
import { LB_COPY_SERVICE } from "./library.tokens";

/** REST surface for physical copies (P2-D18). Gated by library:*; tenant-scoped. */
@Controller("library/copies")
export class CopyController {
  constructor(@Inject(LB_COPY_SERVICE) private readonly service: CopyService) {}

  @RequirePermissions(LIBRARY_WRITE)
  @Post()
  @HttpCode(201)
  async accession(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Copy> {
    const dto = parseBody(accessionCopySchema, body);
    return this.service.accession({
      tenantId: tenantOf(principal),
      titleId: dto.titleId as Uuid,
      barcode: dto.barcode,
      condition: dto.condition,
      location: dto.location,
      acquiredOn: dto.acquiredOn,
    });
  }

  @RequirePermissions(LIBRARY_WRITE)
  @Post(":id/location")
  @HttpCode(200)
  async setLocation(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Copy> {
    const dto = parseBody(setCopyLocationSchema, body);
    return this.service.setLocation(tenantOf(principal), id as Uuid, dto.location);
  }

  @RequirePermissions(LIBRARY_WRITE)
  @Post(":id/condition")
  @HttpCode(200)
  async setCondition(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Copy> {
    const dto = parseBody(setCopyConditionSchema, body);
    return this.service.setCondition(tenantOf(principal), id as Uuid, dto.condition);
  }

  @RequirePermissions(LIBRARY_WRITE)
  @Post(":id/mark-lost")
  @HttpCode(200)
  async markLost(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Copy> {
    return this.service.markLost(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(LIBRARY_WRITE)
  @Post(":id/withdraw")
  @HttpCode(200)
  async withdraw(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Copy> {
    return this.service.withdraw(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(LIBRARY_READ)
  @Get("availability/:titleId")
  async availabilityForTitle(
    @CurrentPrincipal() principal: Principal,
    @Param("titleId") titleId: string,
  ): Promise<TitleAvailability> {
    return this.service.availabilityForTitle(tenantOf(principal), titleId as Uuid);
  }

  @RequirePermissions(LIBRARY_READ)
  @Get("by-barcode/:barcode")
  async getByBarcode(
    @CurrentPrincipal() principal: Principal,
    @Param("barcode") barcode: string,
  ): Promise<Copy> {
    return this.service.getByBarcode(tenantOf(principal), barcode);
  }

  @RequirePermissions(LIBRARY_READ)
  @Get("by-title/:titleId")
  async listForTitle(
    @CurrentPrincipal() principal: Principal,
    @Param("titleId") titleId: string,
  ): Promise<Copy[]> {
    return this.service.listForTitle(tenantOf(principal), titleId as Uuid);
  }

  @RequirePermissions(LIBRARY_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Copy[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(LIBRARY_READ)
  @Get(":id")
  async getById(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Copy> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
