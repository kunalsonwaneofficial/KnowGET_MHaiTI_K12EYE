import { describe, expect, it } from "vitest";
import { computeCollectionUtilization, computeTitleAvailability } from "./availability";
import type { CopyStatusView } from "./library-view";

const copies = (...ss: CopyStatusView["status"][]): CopyStatusView[] =>
  ss.map((status) => ({ status }));

describe("computeTitleAvailability", () => {
  it("counts available/on-loan/lost and excludes withdrawn from the collection", () => {
    const a = computeTitleAvailability(
      copies("available", "available", "on_loan", "lost", "withdrawn"),
    );
    expect(a).toEqual({
      totalCopies: 4, // withdrawn excluded
      availableCopies: 2,
      onLoanCount: 1,
      lostCount: 1,
      isAvailable: true,
      isReservable: false,
    });
  });

  it("is reservable when loanable copies exist but none are free", () => {
    const a = computeTitleAvailability(copies("on_loan", "on_loan"));
    expect(a.availableCopies).toBe(0);
    expect(a.isAvailable).toBe(false);
    expect(a.isReservable).toBe(true);
  });

  it("is neither available nor reservable when every copy is lost or withdrawn", () => {
    const a = computeTitleAvailability(copies("lost", "withdrawn"));
    expect(a.totalCopies).toBe(1);
    expect(a.isAvailable).toBe(false);
    expect(a.isReservable).toBe(false);
  });

  it("is empty for a title with no copies", () => {
    expect(computeTitleAvailability([])).toEqual({
      totalCopies: 0,
      availableCopies: 0,
      onLoanCount: 0,
      lostCount: 0,
      isAvailable: false,
      isReservable: false,
    });
  });
});

describe("computeCollectionUtilization", () => {
  it("rolls titles up with a loan-against-loanable utilization percent", () => {
    const u = computeCollectionUtilization([
      { copyCount: 3, availableCount: 1, onLoanCount: 2 },
      { copyCount: 2, availableCount: 2, onLoanCount: 0 },
    ]);
    expect(u).toEqual({
      titleCount: 2,
      copyCount: 5,
      availableCount: 3,
      onLoanCount: 2,
      utilizationPercent: 40, // 2 on loan / 5 loanable
    });
  });

  it("guards an empty collection against division by zero", () => {
    expect(computeCollectionUtilization([])).toEqual({
      titleCount: 0,
      copyCount: 0,
      availableCount: 0,
      onLoanCount: 0,
      utilizationPercent: 0,
    });
  });
});
