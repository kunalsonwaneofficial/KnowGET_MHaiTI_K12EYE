import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("resolves conflicting tailwind utilities in favor of the last one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("drops falsy values and joins the rest", () => {
    expect(cn("text-sm", false, undefined, "font-medium")).toBe("text-sm font-medium");
  });
});
