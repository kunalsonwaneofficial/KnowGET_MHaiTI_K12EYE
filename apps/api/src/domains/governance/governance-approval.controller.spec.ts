import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import {
  GovernanceApprovalService,
  InMemoryGovernanceApprovalRepository,
  type OrganizationDirectory,
  type PersonDirectory,
  SelfApprovalError,
} from "@knowget/governance";
import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { GovernanceApprovalController } from "./governance-approval.controller";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const ALICE = "33333333-3333-3333-3333-333333333333" as Uuid;
const BOB = "44444444-4444-4444-4444-444444444444" as Uuid;
const POLICY = "55555555-5555-5555-5555-555555555555" as Uuid;
const principal: Principal = {
  id: "99999999-9999-9999-9999-999999999999" as Uuid,
  tenantId: TENANT,
  roles: ["administrator"],
  permissions: ["*"],
};
const noTenant: Principal = { id: "1" as Uuid, roles: [], permissions: [] };

const anyOrg: OrganizationDirectory = { exists: async () => true };
const anyPerson: PersonDirectory = { exists: async () => true };

function controller(): GovernanceApprovalController {
  return new GovernanceApprovalController(
    new GovernanceApprovalService({
      repository: new InMemoryGovernanceApprovalRepository(),
      organizations: anyOrg,
      persons: anyPerson,
    }),
  );
}

const open = { organizationId: ORG, kind: "policy", subjectId: POLICY, submittedById: ALICE };

describe("GovernanceApprovalController", () => {
  it("opens, submits and approves a governance approval and queries it", async () => {
    const ctrl = controller();
    const approval = await ctrl.open(principal, open);
    expect(approval.state).toBe("draft");
    expect(approval.kind).toBe("policy");

    await ctrl.submit(principal, approval.id);
    const approved = await ctrl.approve(principal, approval.id, { decidedById: BOB });
    expect(approved.state).toBe("approved");
    expect(approved.status).toBe("completed");

    expect(await ctrl.list(principal)).toHaveLength(1);
    expect(await ctrl.listForSubject(principal, "policy", POLICY)).toHaveLength(1);
    expect(await ctrl.listForOrganization(principal, ORG)).toHaveLength(1);
    expect((await ctrl.getById(principal, approval.id)).state).toBe("approved");
  });

  it("supports request-changes and rejection", async () => {
    const ctrl = controller();
    const approval = await ctrl.open(principal, open);
    await ctrl.submit(principal, approval.id);
    expect((await ctrl.requestChanges(principal, approval.id, { note: "Revise" })).state).toBe(
      "draft",
    );
    await ctrl.submit(principal, approval.id);
    expect((await ctrl.reject(principal, approval.id, { decidedById: BOB })).state).toBe(
      "rejected",
    );
  });

  it("rejects self-approval, an invalid body and a missing tenant", async () => {
    const ctrl = controller();
    const approval = await ctrl.open(principal, open);
    await ctrl.submit(principal, approval.id);
    await expect(
      ctrl.approve(principal, approval.id, { decidedById: ALICE }),
    ).rejects.toBeInstanceOf(SelfApprovalError);
    await expect(
      ctrl.open(principal, {
        organizationId: ORG,
        kind: "nope",
        subjectId: POLICY,
        submittedById: ALICE,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(ctrl.list(noTenant)).rejects.toBeInstanceOf(ValidationError);
  });
});
