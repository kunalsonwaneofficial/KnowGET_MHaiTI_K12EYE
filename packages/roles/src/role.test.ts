import type { TenantId } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { InvalidRoleStatusTransitionError, RoleNameRequiredError } from "./errors";
import { normalizePermissions } from "./permissions";
import {
  archiveRole,
  createRole,
  grantRolePermissions,
  isActiveRole,
  renameRole,
  revokeRolePermissions,
  setRolePermissions,
  unarchiveRole,
} from "./role";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const role = (permissions: readonly string[] = ["student.read"]) =>
  createRole({ tenantId: TENANT, name: "teacher", permissions });

describe("permissions normalization", () => {
  it("trims and de-duplicates, allowing an empty set", () => {
    expect(normalizePermissions([" a ", "a", "b"])).toEqual(["a", "b"]);
    expect(normalizePermissions([])).toEqual([]);
  });
});

describe("role — creation", () => {
  it("creates an active role with normalized permissions", () => {
    const r = role([" student.read ", "student.read", "attendance.write"]);
    expect(r.status).toBe("active");
    expect(r.name).toBe("teacher");
    expect(r.isSystem).toBe(false);
    expect(r.permissions).toEqual(["student.read", "attendance.write"]);
    expect(isActiveRole(r)).toBe(true);
  });

  it("rejects a blank name", () => {
    expect(() => createRole({ tenantId: TENANT, name: "   " })).toThrow(RoleNameRequiredError);
  });
});

describe("role — permissions & lifecycle", () => {
  it("sets, grants and revokes permissions", () => {
    expect(setRolePermissions(role(), ["x", "x", "y"]).permissions).toEqual(["x", "y"]);
    expect(grantRolePermissions(role(["a"]), ["b", "a"]).permissions).toEqual(["a", "b"]);
    expect(revokeRolePermissions(role(["a", "b"]), ["a"]).permissions).toEqual(["b"]);
  });

  it("renames, rejecting a blank name", () => {
    expect(renameRole(role(), "form-tutor").name).toBe("form-tutor");
    expect(() => renameRole(role(), "  ")).toThrow(RoleNameRequiredError);
  });

  it("archives and unarchives, rejecting illegal transitions", () => {
    const archived = archiveRole(role());
    expect(archived.status).toBe("archived");
    expect(isActiveRole(archived)).toBe(false);
    expect(unarchiveRole(archived).status).toBe("active");
    expect(() => archiveRole(archived)).toThrow(InvalidRoleStatusTransitionError);
    expect(() => unarchiveRole(role())).toThrow(InvalidRoleStatusTransitionError);
  });
});
