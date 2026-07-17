import { describe, expect, it } from "vitest";
import { getPlatformTagline, toSectionId } from "./site";

describe("site", () => {
  it("exposes a non-empty tagline", () => {
    expect(getPlatformTagline().length).toBeGreaterThan(0);
  });

  it("derives section ids via the shared slugify utility", () => {
    expect(toSectionId("Academic Excellence")).toBe("academic-excellence");
  });
});
