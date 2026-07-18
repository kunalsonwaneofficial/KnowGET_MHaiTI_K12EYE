import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import {
  InMemoryPolicyAcknowledgmentRepository,
  InMemoryPolicyRepository,
  type OrganizationDirectory,
  type PersonDirectory,
  PolicyService,
} from "@knowget/governance";
import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { PolicyController } from "./policy.controller";

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

function controller(): PolicyController {
  return new PolicyController(
    new PolicyService({
      repository: new InMemoryPolicyRepository(),
      acknowledgments: new InMemoryPolicyAcknowledgmentRepository(),
      organizations: anyOrg,
      persons: anyPerson,
    }),
  );
}

const leavePolicy = { organizationId: ORG, category: "hr", title: "Leave Policy", ownerId: ADA };

describe("PolicyController", () => {
  it("authors, publishes and acknowledges a policy", async () => {
    const ctrl = controller();
    const draft = await ctrl.author(principal, leavePolicy);
    expect(draft.status).toBe("draft");
    expect(draft.version).toBe(1);

    await ctrl.editDraft(principal, draft.id, { title: "Leave & Attendance Policy" });
    await ctrl.approve(principal, draft.id, {});
    const published = await ctrl.publish(principal, draft.id, { effectiveOn: "2020-01-01" });
    expect(published.status).toBe("published");
    expect(published.title).toBe("Leave & Attendance Policy");

    expect(await ctrl.list(principal)).toHaveLength(1);
    expect(await ctrl.listApplicable(principal, ORG)).toHaveLength(1);

    const ack = await ctrl.acknowledge(principal, draft.id, { personId: GRACE });
    expect(ack.personId).toBe(GRACE);
    expect(ack.version).toBe(1);
    expect(await ctrl.listAcknowledgments(principal, draft.id)).toHaveLength(1);
  });

  it("amends a published policy into a new draft version and retires a policy", async () => {
    const ctrl = controller();
    const amended = controller();

    const a = await amended.author(principal, leavePolicy);
    await amended.approve(principal, a.id, {});
    await amended.publish(principal, a.id, {});
    const next = await amended.amend(principal, a.id);
    expect(next.version).toBe(2);
    expect(next.status).toBe("draft");

    const r = await ctrl.author(principal, leavePolicy);
    await ctrl.approve(principal, r.id, {});
    await ctrl.publish(principal, r.id, {});
    expect((await ctrl.retire(principal, r.id, {})).status).toBe("retired");
  });

  it("rejects an invalid body and requires a tenant", async () => {
    const ctrl = controller();
    await expect(
      ctrl.author(principal, { organizationId: ORG, category: "nope", title: "X", ownerId: ADA }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      ctrl.author(principal, { organizationId: ORG, category: "hr", title: "", ownerId: ADA }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(ctrl.list(noTenant)).rejects.toBeInstanceOf(ValidationError);
  });
});
