import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import { InMemoryOrganizationRepository, OrganizationService } from "@knowget/organization";
import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { OrganizationController } from "./organization.controller";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const principal: Principal = {
  id: "99999999-9999-9999-9999-999999999999" as Uuid,
  tenantId: TENANT,
  roles: ["administrator"],
  permissions: ["*"],
};
const noTenant: Principal = { id: "1" as Uuid, roles: [], permissions: [] };

function controller(): OrganizationController {
  return new OrganizationController(new OrganizationService(new InMemoryOrganizationRepository()));
}

describe("OrganizationController", () => {
  it("creates, reads and lists organizations for the caller's tenant", async () => {
    const ctrl = controller();
    const created = await ctrl.create(principal, { type: "school", name: "Central", code: "CEN" });
    expect(created.status).toBe("draft");
    expect((await ctrl.getById(principal, created.id)).code).toBe("CEN");
    expect(await ctrl.list(principal)).toHaveLength(1);
  });

  it("builds a hierarchy tree and moves nodes", async () => {
    const ctrl = controller();
    const root = await ctrl.create(principal, { type: "trust", name: "Root", code: "R" });
    const child = await ctrl.create(principal, {
      type: "school",
      name: "Child",
      code: "CH",
      parentId: root.id,
    });
    const tree = await ctrl.tree(principal);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children).toHaveLength(1);
    const moved = await ctrl.move(principal, child.id, { parentId: null });
    expect(moved.parentId).toBeNull();
  });

  it("renames and transitions status", async () => {
    const ctrl = controller();
    const created = await ctrl.create(principal, { type: "school", name: "Old", code: "S" });
    expect((await ctrl.rename(principal, created.id, { name: "New" })).name).toBe("New");
    expect((await ctrl.setStatus(principal, created.id, { status: "active" })).status).toBe(
      "active",
    );
  });

  it("rejects an invalid request body", async () => {
    const ctrl = controller();
    await expect(
      ctrl.create(principal, { type: "invalid", name: "", code: "" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("requires a tenant on the principal", async () => {
    const ctrl = controller();
    await expect(ctrl.list(noTenant)).rejects.toBeInstanceOf(ValidationError);
  });
});
