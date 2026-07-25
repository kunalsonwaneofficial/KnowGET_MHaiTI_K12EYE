/** Dependency-injection tokens for the Fees, Finance & Payroll Platform (P2-D14). */

// Repositories (Prisma/RLS adapters over the financial ports).
export const FIN_PERIOD_REPOSITORY = Symbol("FIN_PERIOD_REPOSITORY");
export const FIN_FEE_STRUCTURE_REPOSITORY = Symbol("FIN_FEE_STRUCTURE_REPOSITORY");
export const FIN_INVOICE_REPOSITORY = Symbol("FIN_INVOICE_REPOSITORY");
export const FIN_PAYMENT_REPOSITORY = Symbol("FIN_PAYMENT_REPOSITORY");
export const FIN_CONCESSION_REPOSITORY = Symbol("FIN_CONCESSION_REPOSITORY");
export const FIN_PAYROLL_RUN_REPOSITORY = Symbol("FIN_PAYROLL_RUN_REPOSITORY");
export const FIN_PAYSLIP_REPOSITORY = Symbol("FIN_PAYSLIP_REPOSITORY");
export const FIN_ACCOUNT_REPOSITORY = Symbol("FIN_ACCOUNT_REPOSITORY");

// Cross-domain read ports (directories over Organization, Student, Workforce Employee).
export const FIN_ORGANIZATION_DIRECTORY = Symbol("FIN_ORGANIZATION_DIRECTORY");
export const FIN_STUDENT_DIRECTORY = Symbol("FIN_STUDENT_DIRECTORY");
export const FIN_EMPLOYEE_COMPENSATION_DIRECTORY = Symbol("FIN_EMPLOYEE_COMPENSATION_DIRECTORY");

// The institution's pay scale (grade/band label -> earning lines) the payslip boundary reads.
export const FIN_PAY_SCALE = Symbol("FIN_PAY_SCALE");

// Application services.
export const FIN_PERIOD_SERVICE = Symbol("FIN_PERIOD_SERVICE");
export const FIN_FEE_STRUCTURE_SERVICE = Symbol("FIN_FEE_STRUCTURE_SERVICE");
export const FIN_INVOICE_SERVICE = Symbol("FIN_INVOICE_SERVICE");
export const FIN_PAYMENT_SERVICE = Symbol("FIN_PAYMENT_SERVICE");
export const FIN_CONCESSION_SERVICE = Symbol("FIN_CONCESSION_SERVICE");
export const FIN_PAYROLL_RUN_SERVICE = Symbol("FIN_PAYROLL_RUN_SERVICE");
export const FIN_PAYSLIP_SERVICE = Symbol("FIN_PAYSLIP_SERVICE");
export const FIN_ACCOUNT_SERVICE = Symbol("FIN_ACCOUNT_SERVICE");
