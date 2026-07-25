import { describe, expect, it } from "vitest";
import {
  CurrencyMismatchError,
  InvalidAllocationError,
  InvalidCurrencyError,
  InvalidMoneyError,
} from "./errors";
import {
  addMoney,
  allocateMoney,
  compareMoney,
  isCurrencyCode,
  money,
  multiplyMoney,
  percentageOf,
  subtractMoney,
  sumMoney,
  zeroMoney,
} from "./money";

describe("money construction", () => {
  it("requires integer minor units and a valid currency", () => {
    expect(money(12500, "INR")).toEqual({ amountMinor: 12500, currency: "INR" });
    expect(zeroMoney("USD")).toEqual({ amountMinor: 0, currency: "USD" });
    expect(() => money(12.5, "INR")).toThrow(InvalidMoneyError);
    expect(() => money(100, "inr")).toThrow(InvalidCurrencyError);
    expect(() => money(100, "RUPEE")).toThrow(InvalidCurrencyError);
    expect(isCurrencyCode("EUR")).toBe(true);
    expect(isCurrencyCode("E1R")).toBe(false);
  });
});

describe("money arithmetic", () => {
  it("adds and subtracts same-currency amounts, rejecting mismatches", () => {
    expect(addMoney(money(100, "INR"), money(250, "INR")).amountMinor).toBe(350);
    expect(subtractMoney(money(250, "INR"), money(100, "INR")).amountMinor).toBe(150);
    expect(() => addMoney(money(100, "INR"), money(100, "USD"))).toThrow(CurrencyMismatchError);
    expect(
      sumMoney([money(100, "INR"), money(200, "INR"), money(50, "INR")], "INR").amountMinor,
    ).toBe(350);
    expect(sumMoney([], "INR").amountMinor).toBe(0);
  });

  it("multiplies and takes percentages with half-away-from-zero rounding", () => {
    expect(multiplyMoney(money(100, "INR"), 0.5).amountMinor).toBe(50);
    expect(multiplyMoney(money(101, "INR"), 0.5).amountMinor).toBe(51); // 50.5 → 51
    expect(multiplyMoney(money(103, "INR"), 0.5).amountMinor).toBe(52); // 51.5 → 52
    expect(percentageOf(money(10000, "INR"), 15).amountMinor).toBe(1500);
    expect(percentageOf(money(999, "INR"), 10).amountMinor).toBe(100); // 99.9 → 100
  });

  it("rejects a non-finite multiply/percentage factor rather than yielding NaN/Infinity", () => {
    expect(() => multiplyMoney(money(100, "INR"), Number.NaN)).toThrow(InvalidMoneyError);
    expect(() => multiplyMoney(money(100, "INR"), Number.POSITIVE_INFINITY)).toThrow(
      InvalidMoneyError,
    );
    expect(() => percentageOf(money(100, "INR"), Number.NaN)).toThrow(InvalidMoneyError);
  });

  it("compares amounts", () => {
    expect(compareMoney(money(100, "INR"), money(200, "INR"))).toBe(-1);
    expect(compareMoney(money(200, "INR"), money(200, "INR"))).toBe(0);
    expect(compareMoney(money(300, "INR"), money(200, "INR"))).toBe(1);
  });
});

describe("allocateMoney (penny-perfect distribution)", () => {
  it("splits so the parts sum exactly to the whole", () => {
    const thirds = allocateMoney(money(100, "INR"), [1, 1, 1]);
    expect(thirds.map((m) => m.amountMinor)).toEqual([34, 33, 33]); // remainder 1 → first
    expect(thirds.reduce((s, m) => s + m.amountMinor, 0)).toBe(100);

    const weighted = allocateMoney(money(1000, "INR"), [1, 2]);
    expect(weighted.map((m) => m.amountMinor)).toEqual([333, 667]); // .67 remainder beats .33
    expect(weighted.reduce((s, m) => s + m.amountMinor, 0)).toBe(1000);

    const even = allocateMoney(money(1000, "INR"), [1, 1, 1, 1]);
    expect(even.map((m) => m.amountMinor)).toEqual([250, 250, 250, 250]);
  });

  it("never creates or loses a minor unit across many splits", () => {
    for (let amount = 0; amount <= 200; amount += 7) {
      const parts = allocateMoney(money(amount, "INR"), [3, 5, 7]);
      expect(parts.reduce((s, m) => s + m.amountMinor, 0)).toBe(amount);
    }
  });

  it("rejects a negative amount, empty or non-positive weights", () => {
    expect(() => allocateMoney(money(-100, "INR"), [1, 1])).toThrow(InvalidAllocationError);
    expect(() => allocateMoney(money(100, "INR"), [])).toThrow(InvalidAllocationError);
    expect(() => allocateMoney(money(100, "INR"), [0, 0])).toThrow(InvalidAllocationError);
  });
});
