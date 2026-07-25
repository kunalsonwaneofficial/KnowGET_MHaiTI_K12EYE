import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import {
  ConcessionService,
  type ConcessionRepository,
  type EmployeeCompensationDirectory,
  FeeStructureService,
  type FeeStructureRepository,
  FinancialAccountService,
  type FinancialPeriodRepository,
  FinancialPeriodService,
  InvoiceService,
  type InvoiceRepository,
  type OrganizationDirectory,
  PaymentService,
  type PaymentRepository,
  PayrollRunService,
  type PayrollRunRepository,
  PayslipService,
  type PayslipRepository,
  type StudentDirectory,
  type StudentFinancialAccountRepository,
} from "@knowget/financial";
import type { OrganizationService } from "@knowget/organization";
import type { StudentService } from "@knowget/student-lifecycle";
import type { EmployeeService, EmploymentContractService } from "@knowget/workforce";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { StudentLifecycleModule } from "../student-lifecycle/student-lifecycle.module";
import { STUDENT_SERVICE } from "../student-lifecycle/student-lifecycle.tokens";
import { WorkforceModule } from "../workforce/workforce.module";
import { WF_CONTRACT_SERVICE, WF_EMPLOYEE_SERVICE } from "../workforce/workforce.tokens";
import { ConcessionController } from "./concession.controller";
import {
  EmployeeCompensationServiceDirectory,
  OrganizationServiceDirectory,
  type PayScale,
  StudentServiceDirectory,
} from "./directory.adapters";
import { FeeStructureController } from "./fee-structure.controller";
import { FinancialAccountController } from "./financial-account.controller";
import { FinancialPeriodController } from "./financial-period.controller";
import {
  FIN_ACCOUNT_REPOSITORY,
  FIN_ACCOUNT_SERVICE,
  FIN_CONCESSION_REPOSITORY,
  FIN_CONCESSION_SERVICE,
  FIN_EMPLOYEE_COMPENSATION_DIRECTORY,
  FIN_FEE_STRUCTURE_REPOSITORY,
  FIN_FEE_STRUCTURE_SERVICE,
  FIN_INVOICE_REPOSITORY,
  FIN_INVOICE_SERVICE,
  FIN_ORGANIZATION_DIRECTORY,
  FIN_PAY_SCALE,
  FIN_PAYMENT_REPOSITORY,
  FIN_PAYMENT_SERVICE,
  FIN_PAYROLL_RUN_REPOSITORY,
  FIN_PAYROLL_RUN_SERVICE,
  FIN_PAYSLIP_REPOSITORY,
  FIN_PAYSLIP_SERVICE,
  FIN_PERIOD_REPOSITORY,
  FIN_PERIOD_SERVICE,
  FIN_STUDENT_DIRECTORY,
} from "./financial.tokens";
import { InvoiceController } from "./invoice.controller";
import { PaymentController } from "./payment.controller";
import { PayrollRunController } from "./payroll-run.controller";
import { PayslipController } from "./payslip.controller";
import { PrismaConcessionRepository } from "./prisma-concession.repository";
import { PrismaFeeStructureRepository } from "./prisma-fee-structure.repository";
import { PrismaFinancialPeriodRepository } from "./prisma-financial-period.repository";
import { PrismaInvoiceRepository } from "./prisma-invoice.repository";
import { PrismaPaymentRepository } from "./prisma-payment.repository";
import { PrismaPayrollRunRepository } from "./prisma-payroll-run.repository";
import { PrismaPayslipRepository } from "./prisma-payslip.repository";
import { PrismaStudentFinancialAccountRepository } from "./prisma-student-financial-account.repository";

const repositories: Provider[] = [
  {
    provide: FIN_PERIOD_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaFinancialPeriodRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FIN_FEE_STRUCTURE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaFeeStructureRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FIN_INVOICE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaInvoiceRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FIN_PAYMENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaPaymentRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FIN_CONCESSION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaConcessionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FIN_PAYROLL_RUN_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaPayrollRunRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FIN_PAYSLIP_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaPayslipRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FIN_ACCOUNT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaStudentFinancialAccountRepository(db),
    inject: [DATABASE],
  },
];

/**
 * The institution's pay scale (grade/band label -> earning lines). Empty by default: an institution
 * configures its salary structure here, and the workforce grade label on an employee's contract then
 * resolves to concrete payslip earnings. A grade with no entry yields no derivable earnings (the
 * payslip-from-employee endpoint returns 404 until the band is configured).
 */
const payScale: Provider = { provide: FIN_PAY_SCALE, useValue: {} satisfies PayScale };

const directories: Provider[] = [
  {
    provide: FIN_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: FIN_STUDENT_DIRECTORY,
    useFactory: (students: StudentService) => new StudentServiceDirectory(students),
    inject: [STUDENT_SERVICE],
  },
  {
    provide: FIN_EMPLOYEE_COMPENSATION_DIRECTORY,
    useFactory: (
      employees: EmployeeService,
      contracts: EmploymentContractService,
      scale: PayScale,
    ) => new EmployeeCompensationServiceDirectory(employees, contracts, scale),
    inject: [WF_EMPLOYEE_SERVICE, WF_CONTRACT_SERVICE, FIN_PAY_SCALE],
  },
];

const services: Provider[] = [
  {
    provide: FIN_PERIOD_SERVICE,
    useFactory: (
      repository: FinancialPeriodRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new FinancialPeriodService({ repository, organizations, events }),
    inject: [FIN_PERIOD_REPOSITORY, FIN_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: FIN_FEE_STRUCTURE_SERVICE,
    useFactory: (
      repository: FeeStructureRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new FeeStructureService({ repository, organizations, events }),
    inject: [FIN_FEE_STRUCTURE_REPOSITORY, FIN_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: FIN_INVOICE_SERVICE,
    useFactory: (repository: InvoiceRepository, students: StudentDirectory, events: EventBus) =>
      new InvoiceService({ repository, students, events }),
    inject: [FIN_INVOICE_REPOSITORY, FIN_STUDENT_DIRECTORY, EVENT_BUS],
  },
  {
    provide: FIN_PAYMENT_SERVICE,
    useFactory: (repository: PaymentRepository, invoices: InvoiceService, events: EventBus) =>
      new PaymentService({ repository, invoices, events }),
    inject: [FIN_PAYMENT_REPOSITORY, FIN_INVOICE_SERVICE, EVENT_BUS],
  },
  {
    provide: FIN_CONCESSION_SERVICE,
    useFactory: (repository: ConcessionRepository, students: StudentDirectory, events: EventBus) =>
      new ConcessionService({ repository, students, events }),
    inject: [FIN_CONCESSION_REPOSITORY, FIN_STUDENT_DIRECTORY, EVENT_BUS],
  },
  {
    provide: FIN_PAYROLL_RUN_SERVICE,
    useFactory: (
      repository: PayrollRunRepository,
      organizations: OrganizationDirectory,
      periods: FinancialPeriodRepository,
      events: EventBus,
    ) => new PayrollRunService({ repository, organizations, periods, events }),
    inject: [
      FIN_PAYROLL_RUN_REPOSITORY,
      FIN_ORGANIZATION_DIRECTORY,
      FIN_PERIOD_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: FIN_PAYSLIP_SERVICE,
    useFactory: (
      repository: PayslipRepository,
      runs: PayrollRunRepository,
      employees: EmployeeCompensationDirectory,
      events: EventBus,
    ) => new PayslipService({ repository, runs, employees, events }),
    inject: [
      FIN_PAYSLIP_REPOSITORY,
      FIN_PAYROLL_RUN_REPOSITORY,
      FIN_EMPLOYEE_COMPENSATION_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: FIN_ACCOUNT_SERVICE,
    useFactory: (
      repository: StudentFinancialAccountRepository,
      invoices: InvoiceRepository,
      payments: PaymentRepository,
      students: StudentDirectory,
      events: EventBus,
    ) => new FinancialAccountService({ repository, invoices, payments, students, events }),
    inject: [
      FIN_ACCOUNT_REPOSITORY,
      FIN_INVOICE_REPOSITORY,
      FIN_PAYMENT_REPOSITORY,
      FIN_STUDENT_DIRECTORY,
      EVENT_BUS,
    ],
  },
];

/**
 * The Fees, Finance & Payroll Platform (P2-D14) — the institution's money system. Follows the domain
 * architecture pattern (ADR-0010): the pure `@knowget/financial` package (eight aggregates plus the
 * money core and the account-statement/receivables engines) behind repository ports, Prisma/RLS
 * adapters, application services on the platform event bus, and permission-gated, tenant-scoped REST
 * controllers. Money is integer minor units end to end. `finance:*` gates the student-facing money
 * (periods, fee structures, invoices, payments, concessions, accounts); `payroll:*` gates staff
 * compensation (runs, payslips). Organization (P2-D01-M01), Student (P2-D03) and Employee (P2-D12)
 * existence enter through injected directory ports; the workforce grade/band becomes concrete pay via
 * the configurable pay scale. The third contract of Program C; exports every service token.
 */
@Module({
  imports: [OrganizationModule, StudentLifecycleModule, WorkforceModule],
  controllers: [
    FinancialPeriodController,
    FeeStructureController,
    InvoiceController,
    PaymentController,
    ConcessionController,
    FinancialAccountController,
    PayrollRunController,
    PayslipController,
  ],
  providers: [...repositories, payScale, ...directories, ...services],
  exports: [
    FIN_PERIOD_SERVICE,
    FIN_FEE_STRUCTURE_SERVICE,
    FIN_INVOICE_SERVICE,
    FIN_PAYMENT_SERVICE,
    FIN_CONCESSION_SERVICE,
    FIN_PAYROLL_RUN_SERVICE,
    FIN_PAYSLIP_SERVICE,
    FIN_ACCOUNT_SERVICE,
  ],
})
export class FinancialModule {}
