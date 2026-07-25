import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyPeriodCodeError,
  EmptyPeriodLabelError,
  InvalidPeriodRangeError,
  InvalidPeriodTransitionError,
} from "./errors";
import type { PeriodStatus } from "./finance-value";

/**
 * A financial period — a named accounting window (a term, month or academic year) an organization's
 * postings belong to. It runs `open → closed`, and may be reopened while corrections are still
 * needed; closing stamps `closedAt`. The `code` is unique within the tenant. Whether a period is
 * closed is the signal downstream postings consult before writing into it.
 */
export interface FinancialPeriod {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly label: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly status: PeriodStatus;
  readonly closedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface OpenPeriodParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly label: string;
  readonly startDate: string;
  readonly endDate: string;
}

/** Open a new financial period (status `open`). Code and label required; end must not precede start. */
export function openFinancialPeriod(params: OpenPeriodParams): FinancialPeriod {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyPeriodCodeError();
  }
  const label = params.label.trim();
  if (label.length === 0) {
    throw new EmptyPeriodLabelError();
  }
  const startDate = params.startDate.trim();
  const endDate = params.endDate.trim();
  if (startDate.length === 0 || endDate.length === 0 || endDate < startDate) {
    throw new InvalidPeriodRangeError(startDate, endDate);
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code,
    label,
    startDate,
    endDate,
    status: "open",
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (period: FinancialPeriod, patch: Partial<FinancialPeriod>): FinancialPeriod => ({
  ...period,
  ...patch,
  updatedAt: nowIso(),
});

/** Relabel a financial period (its window and code are fixed). */
export function relabelFinancialPeriod(period: FinancialPeriod, label: string): FinancialPeriod {
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    throw new EmptyPeriodLabelError();
  }
  return touch(period, { label: trimmed });
}

/** Close an open period (→ `closed`), stamping the close time. */
export function closeFinancialPeriod(period: FinancialPeriod): FinancialPeriod {
  if (period.status !== "open") {
    throw new InvalidPeriodTransitionError(period.status, "closed");
  }
  return touch(period, { status: "closed", closedAt: nowIso() });
}

/** Reopen a closed period (→ `open`), clearing the close time. */
export function reopenFinancialPeriod(period: FinancialPeriod): FinancialPeriod {
  if (period.status !== "closed") {
    throw new InvalidPeriodTransitionError(period.status, "open");
  }
  return touch(period, { status: "open", closedAt: null });
}

/** Whether the period is currently open (accepts postings). */
export const isPeriodOpen = (period: FinancialPeriod): boolean => period.status === "open";
