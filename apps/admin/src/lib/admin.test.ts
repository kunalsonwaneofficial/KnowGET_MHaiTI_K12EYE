import { describe, expect, it } from "vitest";
import { adminSections } from "./admin";

describe("adminSections", () => {
  it("builds slugified routes from labels", () => {
    expect(adminSections(["Tenant Operations"])).toEqual([
      { label: "Tenant Operations", href: "/admin/tenant-operations" },
    ]);
  });
});
