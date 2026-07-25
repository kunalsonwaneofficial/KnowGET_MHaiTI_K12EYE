import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyPayrollRunLabelError,
  InvalidCurrencyError,
  InvalidPayrollRunTransitionError,
} from "./errors";
import type { PayrollRunStatus } from "./finance-value";
import { isCurrencyCode } from "./money";

/**
 * A payroll run — a compensation batch for an organization (optionally scoped to a financial period),
 * in a single currency. It runs `draft → processed → paid` (or is `cancelled`). Payslips are added
 * while the run is draft and frozen once it is processed; a processed run is paid out, or a
 * draft/processed run is cancelled.
 */
export interface PayrollRun {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly periodId: Uuid | null;
  readonly label: string;
  readonly currency: string;
  readonly status: PayrollRunStatus;
  readonly processedAt: ISODateString | null;
  readonly paidAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreatePayrollRunParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly label: string;
  readonly currency: string;
  readonly periodId?: Uuid | null;
}

/** Create a payroll run in `draft`. Label required; currency must be valid. */
export function createPayrollRun(params: CreatePayrollRunParams): PayrollRun {
  const label = params.label.trim();
  if (label.length === 0) {
    throw new EmptyPayrollRunLabelError();
  }
  if (!isCurrencyCode(params.currency)) {
    throw new InvalidCurrencyError(params.currency);
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    periodId: params.periodId ?? null,
    label,
    currency: params.currency,
    status: "draft",
    processedAt: null,
    paidAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (run: PayrollRun, patch: Partial<PayrollRun>): PayrollRun => ({
  ...run,
  ...patch,
  updatedAt: nowIso(),
});

/** Process a draft run (→ `processed`), freezing its payslips and stamping the process time. */
export function processPayrollRun(run: PayrollRun): PayrollRun {
  if (run.status !== "draft") {
    throw new InvalidPayrollRunTransitionError(run.status, "processed");
  }
  return touch(run, { status: "processed", processedAt: nowIso() });
}

/** Mark a processed run paid (→ `paid`), stamping the pay time. */
export function markPayrollRunPaid(run: PayrollRun): PayrollRun {
  if (run.status !== "processed") {
    throw new InvalidPayrollRunTransitionError(run.status, "paid");
  }
  return touch(run, { status: "paid", paidAt: nowIso() });
}

/** Cancel a draft or processed run (→ `cancelled`); a paid run cannot be cancelled. */
export function cancelPayrollRun(run: PayrollRun): PayrollRun {
  if (run.status !== "draft" && run.status !== "processed") {
    throw new InvalidPayrollRunTransitionError(run.status, "cancelled");
  }
  return touch(run, { status: "cancelled" });
}

/** Whether the run is draft (accepts new payslips). */
export const isPayrollRunEditable = (run: PayrollRun): boolean => run.status === "draft";
