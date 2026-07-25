import { describe, expect, it } from "vitest";
import { computeAccountStatement, summarizeReceivables } from "./account-statement";
import { CurrencyMismatchError } from "./errors";
import type { ChargeView, CreditView, FinancialMemberView } from "./finance-view";

describe("computeAccountStatement", () => {
  it("reconciles live charges against cleared payments", () => {
    const charges: ChargeView[] = [
      { amountMinor: 50000, currency: "INR", status: "issued" },
      { amountMinor: 30000, currency: "INR", status: "overdue" },
      { amountMinor: 20000, currency: "INR", status: "draft" }, // not billed
      { amountMinor: 10000, currency: "INR", status: "cancelled" }, // not billed
    ];
    const credits: CreditView[] = [
      { amountMinor: 40000, currency: "INR", status: "cleared" },
      { amountMinor: 15000, currency: "INR", status: "pending" }, // not counted
      { amountMinor: 5000, currency: "INR", status: "refunded" }, // not counted
    ];
    const statement = computeAccountStatement("INR", charges, credits);
    expect(statement.totalBilledMinor).toBe(80000); // 50000 + 30000
    expect(statement.totalPaidMinor).toBe(40000);
    expect(statement.outstandingMinor).toBe(40000);
    expect(statement.overdueMinor).toBe(30000);
    expect(statement.chargeCount).toBe(2);
    expect(statement.standing).toBe("overdue");
  });

  it("is settled when fully paid and outstanding otherwise", () => {
    const settled = computeAccountStatement(
      "INR",
      [{ amountMinor: 10000, currency: "INR", status: "paid" }],
      [{ amountMinor: 10000, currency: "INR", status: "cleared" }],
    );
    expect(settled.outstandingMinor).toBe(0);
    expect(settled.standing).toBe("settled");

    const owing = computeAccountStatement(
      "INR",
      [{ amountMinor: 10000, currency: "INR", status: "issued" }],
      [],
    );
    expect(owing.outstandingMinor).toBe(10000);
    expect(owing.standing).toBe("outstanding");
  });

  it("rejects a mixed-currency account", () => {
    expect(() =>
      computeAccountStatement("INR", [{ amountMinor: 100, currency: "USD", status: "issued" }], []),
    ).toThrow(CurrencyMismatchError);
  });

  it("nets payments off an overdue invoice so overdue never exceeds outstanding", () => {
    const statement = computeAccountStatement(
      "INR",
      [{ amountMinor: 100000, currency: "INR", status: "overdue", amountPaidMinor: 40000 }],
      [{ amountMinor: 40000, currency: "INR", status: "cleared" }],
    );
    expect(statement.outstandingMinor).toBe(60000);
    // The outstanding portion of the overdue invoice (100000 - 40000), not the gross 100000.
    expect(statement.overdueMinor).toBe(60000);
    expect(statement.overdueMinor).toBeLessThanOrEqual(statement.outstandingMinor);
  });
});

describe("summarizeReceivables", () => {
  it("rolls up outstanding, overdue and standing distribution", () => {
    const members: FinancialMemberView[] = [
      { currency: "INR", outstandingMinor: 0, overdueMinor: 0, standing: "settled" },
      { currency: "INR", outstandingMinor: 40000, overdueMinor: 0, standing: "outstanding" },
      { currency: "INR", outstandingMinor: 30000, overdueMinor: 30000, standing: "overdue" },
    ];
    const summary = summarizeReceivables("INR", members);
    expect(summary.accountCount).toBe(3);
    expect(summary.totalOutstandingMinor).toBe(70000);
    expect(summary.totalOverdueMinor).toBe(30000);
    expect(summary.standingDistribution.settled).toBe(1);
    expect(summary.standingDistribution.overdue).toBe(1);
    expect(summary.inArrearsCount).toBe(1);
  });
});
