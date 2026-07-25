import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();
const currency = z.string().regex(/^[A-Z]{3}$/, "must be a 3-letter ISO 4217 code");
const minorNonNeg = z.number().int().nonnegative();
const minorPositive = z.number().int().positive();

// --- Financial period ------------------------------------------------------------
export const openPeriodSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  label: nonEmpty,
  startDate: nonEmpty,
  endDate: nonEmpty,
});
export const relabelPeriodSchema = z.object({ label: nonEmpty });

// --- Fee structure ---------------------------------------------------------------
const feeComponentInput = z.object({
  key: nonEmpty,
  name: nonEmpty,
  category: nullableText.optional(),
  amountMinor: minorNonNeg,
});
export const createFeeStructureSchema = z.object({
  organizationId: uuid,
  code: nonEmpty,
  name: nonEmpty,
  currency,
  academicYear: nullableText.optional(),
  components: z.array(feeComponentInput).optional(),
});
export const renameFeeStructureSchema = z.object({ name: nonEmpty });
export const setAcademicYearSchema = z.object({ academicYear: nullableText });
export const addFeeComponentSchema = feeComponentInput;
export const updateComponentAmountSchema = z.object({ amountMinor: minorNonNeg });

// --- Invoice ---------------------------------------------------------------------
const invoiceLineInput = z.object({
  key: nonEmpty,
  description: nonEmpty,
  amountMinor: minorNonNeg,
});
export const draftInvoiceSchema = z.object({
  studentId: uuid,
  number: nonEmpty,
  currency,
  dueDate: nonEmpty,
  feeStructureId: uuid.optional(),
  notes: nullableText.optional(),
  lines: z.array(invoiceLineInput).optional(),
});
export const addInvoiceLineSchema = invoiceLineInput;
export const updateInvoiceLineAmountSchema = z.object({ amountMinor: minorNonNeg });
export const setInvoiceNotesSchema = z.object({ notes: nullableText });

// --- Payment ---------------------------------------------------------------------
const paymentMethod = z.enum(["cash", "card", "bank_transfer", "cheque", "online", "other"]);
export const recordPaymentSchema = z.object({
  invoiceId: uuid,
  amountMinor: minorPositive,
  method: paymentMethod,
  receivedAt: nonEmpty,
  reference: nullableText.optional(),
});

// --- Concession ------------------------------------------------------------------
const concessionType = z.enum(["percentage", "fixed"]);
export const requestConcessionSchema = z.object({
  studentId: uuid,
  type: concessionType,
  reason: nonEmpty,
  feeStructureId: uuid.optional(),
  percentage: z.number().positive().max(100).optional(),
  amountMinor: minorPositive.optional(),
  currency: currency.optional(),
});
export const reviewConcessionSchema = z.object({ reviewNote: nullableText.optional() });

// --- Payroll run -----------------------------------------------------------------
export const createPayrollRunSchema = z.object({
  organizationId: uuid,
  label: nonEmpty,
  currency,
  periodId: uuid.optional(),
});

// --- Payslip ---------------------------------------------------------------------
const payComponentInput = z.object({
  key: nonEmpty,
  label: nonEmpty,
  amountMinor: minorNonNeg,
});
export const draftPayslipSchema = z.object({
  payrollRunId: uuid,
  employeeId: uuid,
  extraEarnings: z.array(payComponentInput).optional(),
  deductions: z.array(payComponentInput).optional(),
});
export const addPayComponentSchema = payComponentInput;

// --- Account ---------------------------------------------------------------------
export const receivablesQuerySchema = z.object({ currency });
