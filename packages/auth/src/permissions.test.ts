import type { Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { hasAllPermissions, hasAnyRole, hasPermission } from "./permissions";
import type { Principal } from "./principal";

const principal: Principal = {
  id: "00000000-0000-4000-8000-000000000000" as Uuid,
  roles: ["teacher"],
  permissions: ["student.read", "attendance.write"],
};

const admin: Principal = { ...principal, roles: ["admin"], permissions: ["*"] };

describe("permissions", () => {
  it("checks single permissions", () => {
    expect(hasPermission(principal, "student.read")).toBe(true);
    expect(hasPermission(principal, "finance.read")).toBe(false);
  });

  it("honors the wildcard permission", () => {
    expect(hasPermission(admin, "anything.at.all")).toBe(true);
  });

  it("checks all permissions and any role", () => {
    expect(hasAllPermissions(principal, ["student.read", "attendance.write"])).toBe(true);
    expect(hasAllPermissions(principal, ["student.read", "finance.read"])).toBe(false);
    expect(hasAnyRole(principal, ["admin", "teacher"])).toBe(true);
    expect(hasAnyRole(principal, ["parent"])).toBe(false);
  });
});
