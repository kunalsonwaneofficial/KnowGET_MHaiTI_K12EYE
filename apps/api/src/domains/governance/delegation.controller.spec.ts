import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import {
  DelegationService,
  InMemoryDelegationRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "@knowget/governance";
import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { DelegationController } from "./delegation.controller";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PRINCIPAL_PERSON = "33333333-3333-3333-3333-333333333333" as Uuid;
const DELEGATE = "44444444-4444-4444-4444-444444444444" as Uuid;
const principal: Principal = {
  id: "99999999-9999-9999-9999-999999999999" as Uuid,
  tenantId: TENANT,
  roles: ["administrator"],
  permissions: ["*"],
};
const noTenant: Principal = { id: "1" as Uuid, roles: [], permissions: [] };

const anyOrg: OrganizationDirectory = { exists: async () => true };
const anyPerson: PersonDirectory = { exists: async () => true };

function controller(): DelegationController {
  return new DelegationController(
    new DelegationService({
      repository: new InMemoryDelegationRepository(),
      organizations: anyOrg,
      persons: anyPerson,
    }),
  );
}

const grant = {
  organizationId: ORG,
  delegatorId: PRINCIPAL_PERSON,
  delegateId: DELEGATE,
  scope: "financial",
  effectiveFrom: "2020-01-01",
  monetaryLimit: 50000,
};

describe("DelegationController", () => {
  it("grants a delegation, lists it in the approval matrix and revokes it", async () => {
    const ctrl = controller();
    const delegation = await ctrl.grant(principal, grant);
    expect(delegation.status).toBe("active");
    expect(delegation.scope).toBe("financial");

    expect(await ctrl.list(principal)).toHaveLength(1);
    expect(await ctrl.listForDelegate(principal, DELEGATE)).toHaveLength(1);
    expect(await ctrl.approvalMatrix(principal, ORG)).toHaveLength(1);
    expect((await ctrl.getById(principal, delegation.id)).delegateId).toBe(DELEGATE);

    const revoked = await ctrl.revoke(principal, delegation.id, { reason: "role change" });
    expect(revoked.status).toBe("revoked");
    expect(await ctrl.approvalMatrix(principal, ORG)).toHaveLength(0);
  });

  it("rejects an invalid body and requires a tenant", async () => {
    const ctrl = controller();
    await expect(ctrl.grant(principal, { ...grant, scope: "nope" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      ctrl.grant(principal, { ...grant, effectiveFrom: "not-a-date" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(ctrl.list(noTenant)).rejects.toBeInstanceOf(ValidationError);
  });
});
