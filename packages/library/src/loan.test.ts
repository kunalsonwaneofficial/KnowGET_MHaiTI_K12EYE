import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  isLoanActive,
  isLoanOverdue,
  issueLoan,
  loanDueStatus,
  markLoanLost,
  renewLoan,
  returnLoan,
} from "./loan";

const base = {
  tenantId: "11111111-1111-1111-1111-111111111111" as TenantId,
  organizationId: "22222222-2222-2222-2222-222222222222" as Uuid,
  copyId: "33333333-3333-3333-3333-333333333333" as Uuid,
  titleId: "44444444-4444-4444-4444-444444444444" as Uuid,
  memberId: "55555555-5555-5555-5555-555555555555" as Uuid,
  issueDate: "2026-01-01",
  loanPeriodDays: 14,
  renewalLimit: 2,
};

describe("issueLoan", () => {
  it("issues an active loan with zero renewals", () => {
    const loan = issueLoan(base);
    expect(loan.status).toBe("active");
    expect(loan.renewalsUsed).toBe(0);
    expect(isLoanActive(loan)).toBe(true);
    expect(loanDueStatus(loan, "2026-01-10").dueDate).toBe("2026-01-15");
  });
});

describe("renewLoan", () => {
  it("extends the due date and blocks past the renewal limit", () => {
    let loan = renewLoan(issueLoan(base));
    expect(loan.renewalsUsed).toBe(1);
    expect(loanDueStatus(loan, "2026-01-20").dueDate).toBe("2026-01-29");
    loan = renewLoan(loan);
    expect(loan.renewalsUsed).toBe(2);
    expect(() => renewLoan(loan)).toThrow(/no renewals remaining/i);
  });

  it("cannot renew a returned loan", () => {
    expect(() => renewLoan(returnLoan(issueLoan(base)))).toThrow();
  });
});

describe("returnLoan / markLoanLost", () => {
  it("returns an active loan and stamps the date", () => {
    const returned = returnLoan(issueLoan(base), "2026-01-12");
    expect(returned.status).toBe("returned");
    expect(returned.returnedDate).toBe("2026-01-12");
    expect(() => returnLoan(returned)).toThrow();
  });

  it("marks an active loan lost", () => {
    expect(markLoanLost(issueLoan(base)).status).toBe("lost");
    expect(() => markLoanLost(returnLoan(issueLoan(base)))).toThrow();
  });
});

describe("isLoanOverdue", () => {
  it("is overdue only while active and past the due date", () => {
    const loan = issueLoan(base); // due 2026-01-15
    expect(isLoanOverdue(loan, "2026-01-10")).toBe(false);
    expect(isLoanOverdue(loan, "2026-01-20")).toBe(true);
    expect(loanDueStatus(loan, "2026-01-20").daysOverdue).toBe(5);
    // a returned loan is never overdue
    expect(isLoanOverdue(returnLoan(loan, "2026-01-12"), "2026-02-01")).toBe(false);
  });
});
