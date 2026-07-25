import type { Principal } from "@knowget/auth";
import { type Invoice, InvoiceService } from "@knowget/financial";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { FINANCE_READ, FINANCE_WRITE, parseBody, tenantOf } from "./financial-http";
import {
  addInvoiceLineSchema,
  draftInvoiceSchema,
  setInvoiceNotesSchema,
  updateInvoiceLineAmountSchema,
} from "./financial.dto";
import { FIN_INVOICE_SERVICE } from "./financial.tokens";

/** REST surface for invoices (P2-D14). Gated by finance:*; tenant-scoped. */
@Controller("finance/invoices")
export class InvoiceController {
  constructor(@Inject(FIN_INVOICE_SERVICE) private readonly service: InvoiceService) {}

  @RequirePermissions(FINANCE_WRITE)
  @Post()
  @HttpCode(201)
  async draft(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Invoice> {
    const dto = parseBody(draftInvoiceSchema, body);
    return this.service.draft({
      tenantId: tenantOf(principal),
      studentId: dto.studentId as Uuid,
      number: dto.number,
      currency: dto.currency,
      dueDate: dto.dueDate,
      ...(dto.feeStructureId !== undefined ? { feeStructureId: dto.feeStructureId as Uuid } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      lines: dto.lines ?? [],
    });
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/lines")
  @HttpCode(200)
  async addLine(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Invoice> {
    const dto = parseBody(addInvoiceLineSchema, body);
    return this.service.addLine(tenantOf(principal), id as Uuid, dto);
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/lines/:key/remove")
  @HttpCode(200)
  async removeLine(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("key") key: string,
  ): Promise<Invoice> {
    return this.service.removeLine(tenantOf(principal), id as Uuid, key);
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/lines/:key/amount")
  @HttpCode(200)
  async updateLineAmount(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("key") key: string,
    @Body() body: unknown,
  ): Promise<Invoice> {
    const dto = parseBody(updateInvoiceLineAmountSchema, body);
    return this.service.updateLineAmount(tenantOf(principal), id as Uuid, key, dto.amountMinor);
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/notes")
  @HttpCode(200)
  async setNotes(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Invoice> {
    const dto = parseBody(setInvoiceNotesSchema, body);
    return this.service.setNotes(tenantOf(principal), id as Uuid, dto.notes);
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/issue")
  @HttpCode(200)
  async issue(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Invoice> {
    return this.service.issue(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/overdue")
  @HttpCode(200)
  async markOverdue(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Invoice> {
    return this.service.markOverdue(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Invoice> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FINANCE_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Invoice[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(FINANCE_READ)
  @Get("by-number/:number")
  async getByNumber(
    @CurrentPrincipal() principal: Principal,
    @Param("number") number: string,
  ): Promise<Invoice> {
    return this.service.getByNumber(tenantOf(principal), number);
  }

  @RequirePermissions(FINANCE_READ)
  @Get("by-student/:studentId")
  async listForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<Invoice[]> {
    return this.service.listForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(FINANCE_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Invoice[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FINANCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Invoice> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
