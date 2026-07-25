import type {
  AccountStatement,
  ChargeView,
  CreditView,
  FinancialMemberView,
  ReceivablesSummary,
} from "./finance-view";
import { type AccountStanding, isBillableInvoice } from "./finance-value";
import { CurrencyMismatchError } from "./errors";

const standingFor = (outstandingMinor: number, overdueMinor: number): AccountStanding => {
  if (outstandingMinor <= 0) {
    return "settled";
  }
  return overdueMinor > 0 ? "overdue" : "outstanding";
};

/**
 * The pure account-statement engine — reconciles a student's live charges (issued-and-beyond
 * invoices) against their cleared payments into a statement: total billed, total paid, the
 * outstanding balance (floored at zero) and the amount in overdue invoices, plus a descriptive
 * standing. Draft/cancelled invoices are not billed; only **cleared** payments settle (pending,
 * failed and refunded payments do not). Pure, deterministic and exact — all integer minor units in a
 * single currency (mixed currencies are rejected). Built and tested before any aggregate depends on
 * it.
 */
export function computeAccountStatement(
  currency: string,
  charges: readonly ChargeView[],
  credits: readonly CreditView[],
): AccountStatement {
  for (const c of charges) {
    if (c.currency !== currency) {
      throw new CurrencyMismatchError(currency, c.currency);
    }
  }
  for (const c of credits) {
    if (c.currency !== currency) {
      throw new CurrencyMismatchError(currency, c.currency);
    }
  }

  const billable = charges.filter((c) => isBillableInvoice(c.status));
  const totalBilledMinor = billable.reduce((sum, c) => sum + c.amountMinor, 0);
  const totalPaidMinor = credits
    .filter((c) => c.status === "cleared")
    .reduce((sum, c) => sum + c.amountMinor, 0);
  const outstandingMinor = Math.max(0, totalBilledMinor - totalPaidMinor);
  const overdueMinor = charges
    .filter((c) => c.status === "overdue")
    .reduce((sum, c) => sum + c.amountMinor, 0);

  return {
    currency,
    totalBilledMinor,
    totalPaidMinor,
    outstandingMinor,
    overdueMinor,
    chargeCount: billable.length,
    standing: standingFor(outstandingMinor, overdueMinor),
  };
}

const emptyStandingDistribution = (): Record<AccountStanding, number> => ({
  settled: 0,
  outstanding: 0,
  overdue: 0,
});

/**
 * The pure receivables-rollup engine — summarizes a set of student accounts into a leadership
 * picture: account count, total outstanding and overdue, the standing distribution and the count in
 * arrears (overdue). Pure and deterministic; single currency (mixed currencies are rejected).
 */
export function summarizeReceivables(
  currency: string,
  members: readonly FinancialMemberView[],
): ReceivablesSummary {
  const standingDistribution = emptyStandingDistribution();
  let totalOutstandingMinor = 0;
  let totalOverdueMinor = 0;
  let inArrearsCount = 0;
  for (const member of members) {
    if (member.currency !== currency) {
      throw new CurrencyMismatchError(currency, member.currency);
    }
    standingDistribution[member.standing] += 1;
    totalOutstandingMinor += member.outstandingMinor;
    totalOverdueMinor += member.overdueMinor;
    if (member.standing === "overdue") {
      inArrearsCount += 1;
    }
  }
  return {
    currency,
    accountCount: members.length,
    totalOutstandingMinor,
    totalOverdueMinor,
    standingDistribution,
    inArrearsCount,
  };
}
