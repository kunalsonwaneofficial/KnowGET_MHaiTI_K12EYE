import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  DuplicatePayComponentKeyError,
  InvalidCurrencyError,
  InvalidPayslipTransitionError,
  PayComponentNotFoundError,
  PayslipNotEditableError,
} from "./errors";
import type { PayslipStatus } from "./finance-value";
import { isCurrencyCode, type Money, subtractMoney } from "./money";
import {
  buildPayComponents,
  makePayComponent,
  type PayComponent,
  type PayComponentInput,
  sumPayComponents,
  sumPayComponentsMinor,
} from "./pay-component";

/**
 * A payslip — an employee's compensation for one payroll run: a list of earnings and a list of
 * deductions in the run's currency. Earnings originate from the workforce grade/band made concrete
 * (see {@link PayComponent}). It runs `draft → approved → paid`; both lists are editable only while
 * draft and frozen once approved. Gross, total deductions and net are computed purely by
 * {@link payslipGross} / {@link payslipDeductions} / {@link payslipNet}; the aggregate stores the
 * lines, not the derived figures.
 */
export interface Payslip {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly payrollRunId: Uuid;
  readonly employeeId: Uuid;
  readonly currency: string;
  readonly earnings: readonly PayComponent[];
  readonly deductions: readonly PayComponent[];
  readonly status: PayslipStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DraftPayslipParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly payrollRunId: Uuid;
  readonly employeeId: Uuid;
  readonly currency: string;
  readonly earnings?: readonly PayComponentInput[];
  readonly deductions?: readonly PayComponentInput[];
}

/** Draft a payslip (status `draft`) with its earnings and deductions. Currency must be valid. */
export function draftPayslip(params: DraftPayslipParams): Payslip {
  if (!isCurrencyCode(params.currency)) {
    throw new InvalidCurrencyError(params.currency);
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    payrollRunId: params.payrollRunId,
    employeeId: params.employeeId,
    currency: params.currency,
    earnings: buildPayComponents(params.earnings ?? []),
    deductions: buildPayComponents(params.deductions ?? []),
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (payslip: Payslip, patch: Partial<Payslip>): Payslip => ({
  ...payslip,
  ...patch,
  updatedAt: nowIso(),
});

const requireDraft = (payslip: Payslip): void => {
  if (payslip.status !== "draft") {
    throw new PayslipNotEditableError(payslip.id, payslip.status);
  }
};

const addComponent = (list: readonly PayComponent[], input: PayComponentInput): PayComponent[] => {
  const component = makePayComponent(input);
  if (list.some((c) => c.key === component.key)) {
    throw new DuplicatePayComponentKeyError(component.key);
  }
  return [...list, component];
};

const removeComponent = (list: readonly PayComponent[], key: string): PayComponent[] => {
  if (!list.some((c) => c.key === key)) {
    throw new PayComponentNotFoundError(key);
  }
  return list.filter((c) => c.key !== key);
};

/** Add an earning to a draft payslip (unique key within earnings). */
export function addPayslipEarning(payslip: Payslip, input: PayComponentInput): Payslip {
  requireDraft(payslip);
  return touch(payslip, { earnings: addComponent(payslip.earnings, input) });
}

/** Remove an earning from a draft payslip. */
export function removePayslipEarning(payslip: Payslip, key: string): Payslip {
  requireDraft(payslip);
  return touch(payslip, { earnings: removeComponent(payslip.earnings, key) });
}

/** Add a deduction to a draft payslip (unique key within deductions). */
export function addPayslipDeduction(payslip: Payslip, input: PayComponentInput): Payslip {
  requireDraft(payslip);
  return touch(payslip, { deductions: addComponent(payslip.deductions, input) });
}

/** Remove a deduction from a draft payslip. */
export function removePayslipDeduction(payslip: Payslip, key: string): Payslip {
  requireDraft(payslip);
  return touch(payslip, { deductions: removeComponent(payslip.deductions, key) });
}

/** Approve a draft payslip (→ `approved`), freezing its lines. */
export function approvePayslip(payslip: Payslip): Payslip {
  if (payslip.status !== "draft") {
    throw new InvalidPayslipTransitionError(payslip.status, "approved");
  }
  return touch(payslip, { status: "approved" });
}

/** Mark an approved payslip paid (→ `paid`). */
export function markPayslipPaid(payslip: Payslip): Payslip {
  if (payslip.status !== "approved") {
    throw new InvalidPayslipTransitionError(payslip.status, "paid");
  }
  return touch(payslip, { status: "paid" });
}

/** Gross pay (sum of earnings) in minor units. */
export const payslipGrossMinor = (payslip: Payslip): number =>
  sumPayComponentsMinor(payslip.earnings);

/** Gross pay as {@link Money}. */
export const payslipGross = (payslip: Payslip): Money =>
  sumPayComponents(payslip.earnings, payslip.currency);

/** Total deductions in minor units. */
export const payslipDeductionsMinor = (payslip: Payslip): number =>
  sumPayComponentsMinor(payslip.deductions);

/** Total deductions as {@link Money}. */
export const payslipDeductions = (payslip: Payslip): Money =>
  sumPayComponents(payslip.deductions, payslip.currency);

/** Net pay (gross − deductions) in minor units. */
export const payslipNetMinor = (payslip: Payslip): number =>
  payslipGrossMinor(payslip) - payslipDeductionsMinor(payslip);

/** Net pay as {@link Money} — the pure `computeNet` of the payslip. */
export const payslipNet = (payslip: Payslip): Money =>
  subtractMoney(payslipGross(payslip), payslipDeductions(payslip));
