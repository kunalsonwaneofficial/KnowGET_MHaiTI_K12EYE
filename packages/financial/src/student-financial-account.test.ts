import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import type { AccountStatement } from "./finance-view";
import {
  accountMemberView,
  createStudentFinancialAccount,
  isAccountSettled,
  refreshStudentFinancialAccount,
} from "./student-financial-account";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;

const statement = (over: Partial<AccountStatement> = {}): AccountStatement => ({
  currency: "INR",
  totalBilledMinor: 80000,
  totalPaidMinor: 40000,
  outstandingMinor: 40000,
  overdueMinor: 30000,
  chargeCount: 2,
  standing: "overdue",
  ...over,
});

describe("student financial account", () => {
  it("creates from a statement and refreshes, bumping the version and keeping identity", () => {
    const account = createStudentFinancialAccount({
      tenantId: TENANT,
      organizationId: ORG,
      studentId: STUDENT,
      statement: statement(),
    });
    expect(account.version).toBe(1);
    expect(account.outstandingMinor).toBe(40000);
    expect(account.standing).toBe("overdue");
    expect(account.refreshedAt).not.toBeNull();
    expect(isAccountSettled(account)).toBe(false);

    const refreshed = refreshStudentFinancialAccount(
      account,
      statement({
        totalPaidMinor: 80000,
        outstandingMinor: 0,
        overdueMinor: 0,
        standing: "settled",
      }),
    );
    expect(refreshed.id).toBe(account.id);
    expect(refreshed.version).toBe(2);
    expect(refreshed.outstandingMinor).toBe(0);
    expect(isAccountSettled(refreshed)).toBe(true);
  });

  it("exposes a member view for the receivables rollup", () => {
    const account = createStudentFinancialAccount({
      tenantId: TENANT,
      organizationId: ORG,
      studentId: STUDENT,
      statement: statement(),
    });
    expect(accountMemberView(account)).toEqual({
      currency: "INR",
      outstandingMinor: 40000,
      overdueMinor: 30000,
      standing: "overdue",
    });
  });
});
