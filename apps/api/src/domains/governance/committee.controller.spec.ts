import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import {
  CommitteeService,
  InMemoryCommitteeRepository,
  InMemoryGovernanceBodyRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "@knowget/governance";
import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { CommitteeController } from "./committee.controller";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const ADA = "33333333-3333-3333-3333-333333333333" as Uuid;
const GRACE = "44444444-4444-4444-4444-444444444444" as Uuid;
const principal: Principal = {
  id: "99999999-9999-9999-9999-999999999999" as Uuid,
  tenantId: TENANT,
  roles: ["administrator"],
  permissions: ["*"],
};
const noTenant: Principal = { id: "1" as Uuid, roles: [], permissions: [] };

const anyOrg: OrganizationDirectory = { exists: async () => true };
const anyPerson: PersonDirectory = { exists: async () => true };

function controller(): CommitteeController {
  return new CommitteeController(
    new CommitteeService({
      repository: new InMemoryCommitteeRepository(),
      organizations: anyOrg,
      persons: anyPerson,
      governanceBodies: new InMemoryGovernanceBodyRepository(),
    }),
  );
}

const auditBody = { organizationId: ORG, name: "Audit Committee" };

describe("CommitteeController", () => {
  it("forms a committee, appoints members, changes a role and removes a member", async () => {
    const ctrl = controller();
    const committee = await ctrl.form(principal, auditBody);
    expect(committee.status).toBe("active");
    expect(await ctrl.list(principal)).toHaveLength(1);
    expect(await ctrl.listForOrganization(principal, ORG)).toHaveLength(1);

    const withChair = await ctrl.appoint(principal, committee.id, { personId: ADA, role: "chair" });
    expect(withChair.members).toHaveLength(1);
    const withTwo = await ctrl.appoint(principal, committee.id, {
      personId: GRACE,
      role: "member",
    });
    expect(withTwo.members).toHaveLength(2);

    const promoted = await ctrl.changeRole(principal, committee.id, GRACE, { role: "secretary" });
    expect(promoted.members.find((m) => m.personId === GRACE)?.role).toBe("secretary");

    const removed = await ctrl.removeMember(principal, committee.id, ADA);
    expect(removed.members).toHaveLength(1);
  });

  it("revises terms and dissolves a committee", async () => {
    const ctrl = controller();
    const committee = await ctrl.form(principal, auditBody);
    expect(
      (await ctrl.reviseTerms(principal, committee.id, { termsOfReference: "Quarterly audit" }))
        .termsOfReference,
    ).toBe("Quarterly audit");
    expect((await ctrl.dissolve(principal, committee.id)).status).toBe("dissolved");
  });

  it("rejects an invalid body and requires a tenant", async () => {
    const ctrl = controller();
    await expect(ctrl.form(principal, { organizationId: ORG, name: "" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(ctrl.list(noTenant)).rejects.toBeInstanceOf(ValidationError);
  });
});
