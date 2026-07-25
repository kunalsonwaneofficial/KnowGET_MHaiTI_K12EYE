import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { AccountStanding } from "./finance-value";
import type { AccountStatement, FinancialMemberView } from "./finance-view";

/**
 * A student financial account — the descriptive read model of a student's money position, kept in
 * step with the source invoices and payments by the pure account-statement engine. It is not a
 * transaction: it carries the reconciled totals (billed, paid, outstanding, overdue), the charge
 * count and a standing, and is refreshed (bumping `version`) whenever the underlying charges or
 * credits change. Exactly one account per student, single-currency.
 */
export interface StudentFinancialAccount {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly currency: string;
  readonly totalBilledMinor: number;
  readonly totalPaidMinor: number;
  readonly outstandingMinor: number;
  readonly overdueMinor: number;
  readonly chargeCount: number;
  readonly standing: AccountStanding;
  readonly version: number;
  readonly refreshedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateStudentFinancialAccountParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly statement: AccountStatement;
}

const applyStatement = (
  base: Pick<
    StudentFinancialAccount,
    | "totalBilledMinor"
    | "totalPaidMinor"
    | "outstandingMinor"
    | "overdueMinor"
    | "chargeCount"
    | "standing"
  >,
  statement: AccountStatement,
): typeof base => ({
  ...base,
  totalBilledMinor: statement.totalBilledMinor,
  totalPaidMinor: statement.totalPaidMinor,
  outstandingMinor: statement.outstandingMinor,
  overdueMinor: statement.overdueMinor,
  chargeCount: statement.chargeCount,
  standing: statement.standing,
});

/** Create a student financial account from a first account statement (version 1). */
export function createStudentFinancialAccount(
  params: CreateStudentFinancialAccountParams,
): StudentFinancialAccount {
  const now = nowIso();
  const { statement } = params;
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    currency: statement.currency,
    totalBilledMinor: statement.totalBilledMinor,
    totalPaidMinor: statement.totalPaidMinor,
    outstandingMinor: statement.outstandingMinor,
    overdueMinor: statement.overdueMinor,
    chargeCount: statement.chargeCount,
    standing: statement.standing,
    version: 1,
    refreshedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/** Refresh an account from a freshly computed statement, bumping the version. */
export function refreshStudentFinancialAccount(
  account: StudentFinancialAccount,
  statement: AccountStatement,
): StudentFinancialAccount {
  const now = nowIso();
  return {
    ...account,
    ...applyStatement(account, statement),
    currency: statement.currency,
    version: account.version + 1,
    refreshedAt: now,
    updatedAt: now,
  };
}

/** The rollup member view of the account (for the receivables summary engine). */
export const accountMemberView = (account: StudentFinancialAccount): FinancialMemberView => ({
  currency: account.currency,
  outstandingMinor: account.outstandingMinor,
  overdueMinor: account.overdueMinor,
  standing: account.standing,
});

/** Whether the account is settled (nothing outstanding). */
export const isAccountSettled = (account: StudentFinancialAccount): boolean =>
  account.standing === "settled";
