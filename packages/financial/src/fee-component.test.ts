import { describe, expect, it } from "vitest";
import {
  EmptyComponentKeyError,
  EmptyComponentNameError,
  InvalidMoneyError,
  NegativeAmountError,
} from "./errors";
import { feeComponentMoney, makeFeeComponent } from "./fee-component";

describe("makeFeeComponent", () => {
  it("normalizes a component and requires key, name and a non-negative integer amount", () => {
    expect(
      makeFeeComponent({
        key: " tuition ",
        name: " Tuition ",
        category: " Academic ",
        amountMinor: 500000,
      }),
    ).toEqual({ key: "tuition", name: "Tuition", category: "Academic", amountMinor: 500000 });
    expect(makeFeeComponent({ key: "misc", name: "Misc", amountMinor: 0 }).category).toBeNull();
    expect(() => makeFeeComponent({ key: "", name: "X", amountMinor: 1 })).toThrow(
      EmptyComponentKeyError,
    );
    expect(() => makeFeeComponent({ key: "k", name: " ", amountMinor: 1 })).toThrow(
      EmptyComponentNameError,
    );
    expect(() => makeFeeComponent({ key: "k", name: "X", amountMinor: 1.5 })).toThrow(
      InvalidMoneyError,
    );
    expect(() => makeFeeComponent({ key: "k", name: "X", amountMinor: -1 })).toThrow(
      NegativeAmountError,
    );
  });

  it("exposes its amount as money in the structure currency", () => {
    const value = feeComponentMoney(
      makeFeeComponent({ key: "lab", name: "Lab", amountMinor: 25000 }),
      "INR",
    );
    expect(value).toEqual({ amountMinor: 25000, currency: "INR" });
  });
});
