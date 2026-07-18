import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import { CannotModifySystemRoleError, InMemoryRoleRepository, RoleService } from "@knowget/roles";
import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { RolesController } from "./roles.controller";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const principal: Principal = {
  id: "99999999-9999-9999-9999-999999999999" as Uuid,
  tenantId: TENANT,
  roles: ["administrator"],
  permissions: ["*"],
};
const noTenant: Principal = { id: "1" as Uuid, roles: [], permissions: [] };

function controller(): RolesController {
  return new RolesController(new RoleService({ repository: new InMemoryRoleRepository() }));
}

describe("RolesController", () => {
  it("defines a role, lists it and looks it up by name", async () => {
    const ctrl = controller();
    const role = await ctrl.define(principal, {
      name: "teacher",
      permissions: ["student.read"],
    });
    expect(role.permissions).toEqual(["student.read"]);
    expect(await ctrl.list(principal)).toHaveLength(1);
    expect((await ctrl.getByName(principal, "teacher")).id).toBe(role.id);
    expect((await ctrl.getById(principal, role.id)).name).toBe("teacher");
  });

  it("edits permissions and drives the role lifecycle", async () => {
    const ctrl = controller();
    const role = await ctrl.define(principal, { name: "teacher", permissions: ["a"] });
    expect(
      (await ctrl.grantPermissions(principal, role.id, { permissions: ["b"] })).permissions,
    ).toEqual(["a", "b"]);
    expect(
      (await ctrl.revokePermissions(principal, role.id, { permissions: ["a"] })).permissions,
    ).toEqual(["b"]);
    expect(
      (await ctrl.setPermissions(principal, role.id, { permissions: ["z"] })).permissions,
    ).toEqual(["z"]);
    expect((await ctrl.rename(principal, role.id, { name: "form-tutor" })).name).toBe("form-tutor");
    expect((await ctrl.archive(principal, role.id)).status).toBe("archived");
    expect((await ctrl.unarchive(principal, role.id)).status).toBe("active");
  });

  it("protects system roles and rejects invalid input", async () => {
    const ctrl = controller();
    const admin = await ctrl.define(principal, {
      name: "administrator",
      permissions: ["*"],
      isSystem: true,
    });
    await expect(ctrl.remove(principal, admin.id)).rejects.toBeInstanceOf(
      CannotModifySystemRoleError,
    );
    await expect(ctrl.define(principal, { name: "" })).rejects.toBeInstanceOf(ValidationError);
    await expect(ctrl.list(noTenant)).rejects.toBeInstanceOf(ValidationError);
  });
});
