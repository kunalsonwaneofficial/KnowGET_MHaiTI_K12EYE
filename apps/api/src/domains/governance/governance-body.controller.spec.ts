import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import {
  GovernanceBodyService,
  InMemoryGovernanceBodyRepository,
  type OrganizationDirectory,
} from "@knowget/governance";
import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { GovernanceBodyController } from "./governance-body.controller";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const principal: Principal = {
  id: "99999999-9999-9999-9999-999999999999" as Uuid,
  tenantId: TENANT,
  roles: ["administrator"],
  permissions: ["*"],
};
const noTenant: Principal = { id: "1" as Uuid, roles: [], permissions: [] };

const anyOrg: OrganizationDirectory = { exists: async () => true };

function controller(): GovernanceBodyController {
  return new GovernanceBodyController(
    new GovernanceBodyService({
      repository: new InMemoryGovernanceBodyRepository(),
      organizations: anyOrg,
    }),
  );
}

const boardBody = { organizationId: ORG, name: "Board of Trustees", type: "board_of_trustees" };

describe("GovernanceBodyController", () => {
  it("establishes a body, lists and reads it back", async () => {
    const ctrl = controller();
    const body = await ctrl.establish(principal, boardBody);
    expect(body.status).toBe("active");
    expect(body.name).toBe("Board of Trustees");
    expect((await ctrl.getById(principal, body.id)).organizationId).toBe(ORG);
    expect(await ctrl.list(principal)).toHaveLength(1);
    expect(await ctrl.listForOrganization(principal, ORG)).toHaveLength(1);
    expect(await ctrl.children(principal, body.id)).toHaveLength(0);
  });

  it("renames, revises terms and dissolves a body", async () => {
    const ctrl = controller();
    const body = await ctrl.establish(principal, boardBody);
    expect((await ctrl.rename(principal, body.id, { name: "Governing Board" })).name).toBe(
      "Governing Board",
    );
    expect(
      (await ctrl.reviseTerms(principal, body.id, { termsOfReference: "Fiduciary oversight" }))
        .termsOfReference,
    ).toBe("Fiduciary oversight");
    expect((await ctrl.dissolve(principal, body.id, {})).status).toBe("dissolved");
  });

  it("rejects an invalid body and requires a tenant", async () => {
    const ctrl = controller();
    await expect(
      ctrl.establish(principal, { organizationId: ORG, name: "", type: "board_of_trustees" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      ctrl.establish(principal, { organizationId: ORG, name: "X", type: "not-a-type" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(ctrl.list(noTenant)).rejects.toBeInstanceOf(ValidationError);
  });
});
