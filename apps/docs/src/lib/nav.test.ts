import { describe, expect, it } from "vitest";
import { docLinks } from "./nav";

describe("docLinks", () => {
  it("creates slugified anchors from titles", () => {
    expect(docLinks(["Architecture Overview"])).toEqual([
      { title: "Architecture Overview", id: "architecture-overview" },
    ]);
  });
});
