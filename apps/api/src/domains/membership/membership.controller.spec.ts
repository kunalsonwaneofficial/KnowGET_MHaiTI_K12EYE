import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import {
  InMemoryMembershipRepository,
  MembershipService,
  type OrganizationDirectory,
  type PersonDirectory,
} from "@knowget/membership";
import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { MembershipController } from "./membership.controller";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ADA = "22222222-2222-2222-2222-222222222222" as Uuid;
const SCHOOL = "33333333-3333-3333-3333-333333333333" as Uuid;
const principal: Principal = {
  id: "99999999-9999-9999-9999-999999999999" as Uuid,
  tenantId: TENANT,
  roles: ["administrator"],
  permissions: ["*"],
};
const noTenant: Principal = { id: "1" as Uuid, roles: [], permissions: [] };

const anyPerson: PersonDirectory = { exists: async () => true };
const anyOrg: OrganizationDirectory = { exists: async () => true };

function controller(): MembershipController {
  return new MembershipController(
    new MembershipService({
      repository: new InMemoryMembershipRepository(),
      persons: anyPerson,
      organizations: anyOrg,
    }),
  );
}

const grantBody = { personId: ADA, organizationId: SCHOOL, roles: ["teacher"] };

describe("MembershipController", () => {
  it("grants a membership and lists it by person and organization", async () => {
    const ctrl = controller();
    const membership = await ctrl.grant(principal, grantBody);
    expect(membership.status).toBe("active");
    expect(membership.roles).toEqual(["teacher"]);
    expect(await ctrl.getById(principal, membership.id)).toMatchObject({ personId: ADA });
    expect(await ctrl.list(principal)).toHaveLength(1);
    expect(await ctrl.listByPerson(principal, ADA)).toHaveLength(1);
    expect(await ctrl.listByOrganization(principal, SCHOOL)).toHaveLength(1);
  });

  it("changes roles and drives the lifecycle", async () => {
    const ctrl = controller();
    const membership = await ctrl.grant(principal, grantBody);
    const updated = await ctrl.changeRoles(principal, membership.id, {
      roles: ["teacher", "coordinator"],
    });
    expect(updated.roles).toEqual(["teacher", "coordinator"]);
    expect((await ctrl.suspend(principal, membership.id)).status).toBe("suspended");
    expect((await ctrl.reinstate(principal, membership.id)).status).toBe("active");
    expect((await ctrl.end(principal, membership.id, { endDate: "2027-03-31" })).status).toBe(
      "ended",
    );
  });

  it("rejects an invalid body and requires a tenant", async () => {
    const ctrl = controller();
    await expect(
      ctrl.grant(principal, { personId: "not-a-uuid", organizationId: SCHOOL, roles: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(ctrl.list(noTenant)).rejects.toBeInstanceOf(ValidationError);
  });
});
