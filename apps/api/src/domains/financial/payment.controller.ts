import type { Principal } from "@knowget/auth";
import { type Payment, PaymentService } from "@knowget/financial";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { FINANCE_READ, FINANCE_WRITE, parseBody, tenantOf } from "./financial-http";
import { recordPaymentSchema } from "./financial.dto";
import { FIN_PAYMENT_SERVICE } from "./financial.tokens";

/** REST surface for payments (P2-D14). Gated by finance:*; tenant-scoped. */
@Controller("finance/payments")
export class PaymentController {
  constructor(@Inject(FIN_PAYMENT_SERVICE) private readonly service: PaymentService) {}

  @RequirePermissions(FINANCE_WRITE)
  @Post()
  @HttpCode(201)
  async record(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Payment> {
    const dto = parseBody(recordPaymentSchema, body);
    return this.service.record({
      tenantId: tenantOf(principal),
      invoiceId: dto.invoiceId as Uuid,
      amountMinor: dto.amountMinor,
      method: dto.method,
      receivedAt: dto.receivedAt,
      ...(dto.reference !== undefined ? { reference: dto.reference } : {}),
    });
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/clear")
  @HttpCode(200)
  async clear(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Payment> {
    return this.service.clear(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/fail")
  @HttpCode(200)
  async fail(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Payment> {
    return this.service.fail(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/refund")
  @HttpCode(200)
  async refund(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Payment> {
    return this.service.refund(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FINANCE_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Payment[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(FINANCE_READ)
  @Get("by-invoice/:invoiceId")
  async listForInvoice(
    @CurrentPrincipal() principal: Principal,
    @Param("invoiceId") invoiceId: string,
  ): Promise<Payment[]> {
    return this.service.listForInvoice(tenantOf(principal), invoiceId as Uuid);
  }

  @RequirePermissions(FINANCE_READ)
  @Get("by-student/:studentId")
  async listForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<Payment[]> {
    return this.service.listForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(FINANCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Payment> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
