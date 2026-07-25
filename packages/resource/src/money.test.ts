import { describe, expect, it } from "vitest";
import { CurrencyMismatchError, InvalidCurrencyError, InvalidMoneyError } from "./errors";
import {
  addMoney,
  compareMoney,
  money,
  multiplyMoney,
  prorataMinor,
  subtractMoney,
  sumMoney,
  zeroMoney,
} from "./money";

describe("money", () => {
  it("constructs validated money and rejects bad input", () => {
    expect(money(12500, "INR")).toEqual({ amountMinor: 12500, currency: "INR" });
    expect(zeroMoney("USD").amountMinor).toBe(0);
    expect(() => money(12.5, "INR")).toThrow(InvalidMoneyError);
    expect(() => money(100, "inr")).toThrow(InvalidCurrencyError);
    expect(() => money(100, "RUPEE")).toThrow(InvalidCurrencyError);
  });

  it("adds, subtracts and multiplies by quantity, rejecting a currency mismatch", () => {
    expect(addMoney(money(100, "INR"), money(250, "INR")).amountMinor).toBe(350);
    expect(subtractMoney(money(250, "INR"), money(100, "INR")).amountMinor).toBe(150);
    expect(multiplyMoney(money(1500, "INR"), 4).amountMinor).toBe(6000);
    expect(sumMoney([money(100, "INR"), money(200, "INR")], "INR").amountMinor).toBe(300);
    expect(sumMoney([], "INR").amountMinor).toBe(0);
    expect(() => addMoney(money(1, "INR"), money(1, "USD"))).toThrow(CurrencyMismatchError);
  });

  it("prorates half-away-from-zero and compares", () => {
    expect(prorataMinor(1000, 1, 3)).toBe(333); // 333.33 → 333
    expect(prorataMinor(1000, 2, 3)).toBe(667); // 666.67 → 667
    expect(prorataMinor(100, 3, 3)).toBe(100); // exact at end of life
    expect(compareMoney(money(100, "INR"), money(200, "INR"))).toBe(-1);
    expect(compareMoney(money(200, "INR"), money(200, "INR"))).toBe(0);
    expect(compareMoney(money(300, "INR"), money(200, "INR"))).toBe(1);
  });
});
