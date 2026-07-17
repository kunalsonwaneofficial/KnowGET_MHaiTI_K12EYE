import { describe, expect, it } from "vitest";
import { assertNever, hasOwn, isDefined, isNil, isNonEmptyString } from "./guards";

describe("guards", () => {
  it("isDefined narrows out null and undefined", () => {
    expect(isDefined(0)).toBe(true);
    expect(isDefined("")).toBe(true);
    expect(isDefined(null)).toBe(false);
    expect(isDefined(undefined)).toBe(false);
  });

  it("isNil is the inverse of isDefined", () => {
    expect(isNil(null)).toBe(true);
    expect(isNil(undefined)).toBe(true);
    expect(isNil(0)).toBe(false);
  });

  it("isNonEmptyString rejects blank strings and non-strings", () => {
    expect(isNonEmptyString("hello")).toBe(true);
    expect(isNonEmptyString("   ")).toBe(false);
    expect(isNonEmptyString(42)).toBe(false);
  });

  it("hasOwn detects own properties", () => {
    const obj = { a: 1 };
    expect(hasOwn(obj, "a")).toBe(true);
    expect(hasOwn(obj, "b")).toBe(false);
  });

  it("assertNever always throws", () => {
    expect(() => assertNever("x" as never)).toThrow("Unexpected value: x");
  });
});
