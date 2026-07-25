import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { ConcessionController } from "./concession.controller";
import { FeeStructureController } from "./fee-structure.controller";
import { FinancialAccountController } from "./financial-account.controller";
import { FinancialModule } from "./financial.module";
import { FinancialPeriodController } from "./financial-period.controller";
import {
  FIN_ACCOUNT_SERVICE,
  FIN_CONCESSION_SERVICE,
  FIN_FEE_STRUCTURE_SERVICE,
  FIN_INVOICE_SERVICE,
  FIN_PAYMENT_SERVICE,
  FIN_PAYROLL_RUN_SERVICE,
  FIN_PAYSLIP_SERVICE,
  FIN_PERIOD_SERVICE,
} from "./financial.tokens";
import { InvoiceController } from "./invoice.controller";
import { PaymentController } from "./payment.controller";
import { PayrollRunController } from "./payroll-run.controller";
import { PayslipController } from "./payslip.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) the domain modules inject,
 * so the financial DI graph — including the imported Organization, Student Lifecycle and Workforce
 * modules — compiles without a live database. The Prisma adapters only store the handle at
 * construction.
 */
@Global()
@Module({
  providers: [
    { provide: DATABASE, useValue: {} },
    { provide: EVENT_BUS, useValue: { publish: async () => undefined } },
  ],
  exports: [DATABASE, EVENT_BUS],
})
class MockGlobalsModule {}

describe("FinancialModule (integration)", () => {
  it("compiles the full financial DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, FinancialModule],
    }).compile();

    expect(moduleRef.get(FinancialPeriodController)).toBeInstanceOf(FinancialPeriodController);
    expect(moduleRef.get(FeeStructureController)).toBeInstanceOf(FeeStructureController);
    expect(moduleRef.get(InvoiceController)).toBeInstanceOf(InvoiceController);
    expect(moduleRef.get(PaymentController)).toBeInstanceOf(PaymentController);
    expect(moduleRef.get(ConcessionController)).toBeInstanceOf(ConcessionController);
    expect(moduleRef.get(FinancialAccountController)).toBeInstanceOf(FinancialAccountController);
    expect(moduleRef.get(PayrollRunController)).toBeInstanceOf(PayrollRunController);
    expect(moduleRef.get(PayslipController)).toBeInstanceOf(PayslipController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, FinancialModule],
    }).compile();

    for (const token of [
      FIN_PERIOD_SERVICE,
      FIN_FEE_STRUCTURE_SERVICE,
      FIN_INVOICE_SERVICE,
      FIN_PAYMENT_SERVICE,
      FIN_CONCESSION_SERVICE,
      FIN_ACCOUNT_SERVICE,
      FIN_PAYROLL_RUN_SERVICE,
      FIN_PAYSLIP_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
