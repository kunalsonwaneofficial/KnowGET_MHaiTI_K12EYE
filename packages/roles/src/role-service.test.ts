import type { DomainEvent, TenantId } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import { CannotModifySystemRoleError, DuplicateRoleError, RoleNotFoundError } from "./errors";
import { InMemoryRoleRepository } from "./ports";
import { RoleService } from "./role-service";

const TENANT_A = "11111111-1111-1111-1111-111111111111" as TenantId;
const TENANT_B = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as TenantId;

function build(): { service: RoleService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const service = new RoleService({
    repository: new InMemoryRoleRepository(),
    events: { publish: async (event: DomainEvent) => void events.push(event) },
  });
  return { service, events };
}

describe("RoleService — definition & catalogue", () => {
  let service: RoleService;
  let events: DomainEvent[];
  beforeEach(() => {
    ({ service, events } = build());
  });

  it("defines a role and rejects a duplicate name in the tenant", async () => {
    const role = await service.define({
      tenantId: TENANT_A,
      name: "teacher",
      permissions: ["student.read"],
    });
    expect(role.permissions).toEqual(["student.read"]);
    expect(events.map((e) => e.type)).toContain("role.defined");
    await expect(service.define({ tenantId: TENANT_A, name: "teacher" })).rejects.toBeInstanceOf(
      DuplicateRoleError,
    );
    // Same name is free in another tenant.
    await expect(service.define({ tenantId: TENANT_B, name: "teacher" })).resolves.toBeDefined();
  });

  it("looks a role up by name and reports not-found across tenants", async () => {
    const role = await service.define({ tenantId: TENANT_A, name: "principal" });
    expect((await service.getByName(TENANT_A, "principal")).id).toBe(role.id);
    await expect(service.getById(TENANT_B, role.id)).rejects.toBeInstanceOf(RoleNotFoundError);
    await expect(service.getByName(TENANT_A, "nobody")).rejects.toBeInstanceOf(RoleNotFoundError);
  });
});

describe("RoleService — permissions, lifecycle & resolution", () => {
  let service: RoleService;
  beforeEach(() => {
    ({ service } = build());
  });

  it("grants and revokes permissions", async () => {
    const role = await service.define({ tenantId: TENANT_A, name: "teacher", permissions: ["a"] });
    expect((await service.grantPermissions(TENANT_A, role.id, ["b"])).permissions).toEqual([
      "a",
      "b",
    ]);
    expect((await service.revokePermissions(TENANT_A, role.id, ["a"])).permissions).toEqual(["b"]);
    expect((await service.setPermissions(TENANT_A, role.id, ["z"])).permissions).toEqual(["z"]);
  });

  it("protects system roles from rename, archive and delete", async () => {
    const admin = await service.define({
      tenantId: TENANT_A,
      name: "administrator",
      permissions: ["*"],
      isSystem: true,
    });
    await expect(service.rename(TENANT_A, admin.id, "root")).rejects.toBeInstanceOf(
      CannotModifySystemRoleError,
    );
    await expect(service.archive(TENANT_A, admin.id)).rejects.toBeInstanceOf(
      CannotModifySystemRoleError,
    );
    await expect(service.remove(TENANT_A, admin.id)).rejects.toBeInstanceOf(
      CannotModifySystemRoleError,
    );
    // Permission edits are still allowed on system roles.
    expect(
      (await service.setPermissions(TENANT_A, admin.id, ["*", "audit.read"])).permissions,
    ).toEqual(["*", "audit.read"]);
  });

  it("reports role existence only for active roles", async () => {
    const role = await service.define({ tenantId: TENANT_A, name: "teacher" });
    expect(await service.roleExists(TENANT_A, "teacher")).toBe(true);
    expect(await service.roleExists(TENANT_A, "unknown")).toBe(false);
    await service.archive(TENANT_A, role.id);
    expect(await service.roleExists(TENANT_A, "teacher")).toBe(false);
  });

  it("resolves the union of permissions for the named active roles", async () => {
    await service.define({
      tenantId: TENANT_A,
      name: "teacher",
      permissions: ["student.read", "attendance.write"],
    });
    const coordinator = await service.define({
      tenantId: TENANT_A,
      name: "coordinator",
      permissions: ["attendance.write", "timetable.write"],
    });
    expect(
      (await service.permissionsForRoleNames(TENANT_A, ["teacher", "coordinator"])).sort(),
    ).toEqual(["attendance.write", "student.read", "timetable.write"]);

    // Archived roles and unknown names contribute nothing.
    await service.archive(TENANT_A, coordinator.id);
    expect(
      (await service.permissionsForRoleNames(TENANT_A, ["teacher", "coordinator", "x"])).sort(),
    ).toEqual(["attendance.write", "student.read"]);
    expect(await service.permissionsForRoleNames(TENANT_A, [])).toEqual([]);
  });
});
