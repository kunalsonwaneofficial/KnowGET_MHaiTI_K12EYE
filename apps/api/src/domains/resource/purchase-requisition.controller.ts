import type { Principal } from "@knowget/auth";
import { type PurchaseRequisition, PurchaseRequisitionService } from "@knowget/resource";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { PROCUREMENT_READ, PROCUREMENT_WRITE, parseBody, tenantOf } from "./resource-http";
import {
  addRequisitionLineSchema,
  draftRequisitionSchema,
  reviewRequisitionSchema,
  setRequisitionJustificationSchema,
} from "./resource.dto";
import { RES_REQUISITION_SERVICE } from "./resource.tokens";

/** REST surface for purchase requisitions (P2-D15). Gated by procurement:*; tenant-scoped. */
@Controller("procurement/requisitions")
export class PurchaseRequisitionController {
  constructor(
    @Inject(RES_REQUISITION_SERVICE) private readonly service: PurchaseRequisitionService,
  ) {}

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post()
  @HttpCode(201)
  async draft(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<PurchaseRequisition> {
    const dto = parseBody(draftRequisitionSchema, body);
    return this.service.draft({
      tenantId: tenantOf(principal),
      requesterId: dto.requesterId as Uuid,
      title: dto.title,
      currency: dto.currency,
      ...(dto.justification !== undefined ? { justification: dto.justification } : {}),
      ...(dto.lines !== undefined ? { lines: dto.lines } : {}),
    });
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/justification")
  @HttpCode(200)
  async setJustification(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<PurchaseRequisition> {
    const dto = parseBody(setRequisitionJustificationSchema, body);
    return this.service.setJustification(tenantOf(principal), id as Uuid, dto.justification);
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/lines")
  @HttpCode(200)
  async addLine(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<PurchaseRequisition> {
    const dto = parseBody(addRequisitionLineSchema, body);
    return this.service.addLine(tenantOf(principal), id as Uuid, dto);
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/lines/:key/remove")
  @HttpCode(200)
  async removeLine(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("key") key: string,
  ): Promise<PurchaseRequisition> {
    return this.service.removeLine(tenantOf(principal), id as Uuid, key);
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/submit")
  @HttpCode(200)
  async submit(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<PurchaseRequisition> {
    return this.service.submit(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/approve")
  @HttpCode(200)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<PurchaseRequisition> {
    const dto = parseBody(reviewRequisitionSchema, body);
    return this.service.approve(tenantOf(principal), id as Uuid, dto.reviewNote);
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/reject")
  @HttpCode(200)
  async reject(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<PurchaseRequisition> {
    const dto = parseBody(reviewRequisitionSchema, body);
    return this.service.reject(tenantOf(principal), id as Uuid, dto.reviewNote);
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<PurchaseRequisition[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get("by-requester/:requesterId")
  async listForRequester(
    @CurrentPrincipal() principal: Principal,
    @Param("requesterId") requesterId: string,
  ): Promise<PurchaseRequisition[]> {
    return this.service.listForRequester(tenantOf(principal), requesterId as Uuid);
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<PurchaseRequisition[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<PurchaseRequisition> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
