import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import {
  createGovernanceBody,
  InMemoryGovernanceBodyRepository,
  InMemoryResolutionRepository,
  type OrganizationDirectory,
  type PersonDirectory,
  ResolutionService,
} from "@knowget/governance";
import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { ResolutionController } from "./resolution.controller";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const ADA = "33333333-3333-3333-3333-333333333333" as Uuid;
const principal: Principal = {
  id: "99999999-9999-9999-9999-999999999999" as Uuid,
  tenantId: TENANT,
  roles: ["administrator"],
  permissions: ["*"],
};
const noTenant: Principal = { id: "1" as Uuid, roles: [], permissions: [] };

const anyOrg: OrganizationDirectory = { exists: async () => true };
const anyPerson: PersonDirectory = { exists: async () => true };

async function setup(): Promise<{ ctrl: ResolutionController; bodyId: Uuid }> {
  const bodies = new InMemoryGovernanceBodyRepository();
  const board = createGovernanceBody({
    tenantId: TENANT,
    organizationId: ORG,
    name: "Board of Trustees",
    type: "board_of_trustees",
  });
  await bodies.save(board);
  const ctrl = new ResolutionController(
    new ResolutionService({
      repository: new InMemoryResolutionRepository(),
      organizations: anyOrg,
      persons: anyPerson,
      governanceBodies: bodies,
    }),
  );
  return { ctrl, bodyId: board.id };
}

describe("ResolutionController", () => {
  it("drafts, votes, tallies to approval and implements a resolution", async () => {
    const { ctrl, bodyId } = await setup();
    const resolution = await ctrl.draft(principal, {
      organizationId: ORG,
      governanceBodyId: bodyId,
      title: "Adopt the annual budget",
      proposalText: "Resolved, that the FY budget be adopted.",
      proposedById: ADA,
    });
    expect(resolution.status).toBe("draft");

    expect((await ctrl.openVoting(principal, resolution.id)).status).toBe("voting");
    await ctrl.vote(principal, resolution.id, { voterId: ADA, decision: "for" });

    const tallied = await ctrl.tally(principal, resolution.id, {});
    expect(tallied.status).toBe("approved");

    expect((await ctrl.implement(principal, resolution.id, {})).status).toBe("implemented");
    expect(await ctrl.list(principal)).toHaveLength(1);
    expect(await ctrl.listForGovernanceBody(principal, bodyId)).toHaveLength(1);
  });

  it("rejects an invalid body and requires a tenant", async () => {
    const { ctrl, bodyId } = await setup();
    await expect(
      ctrl.draft(principal, {
        organizationId: ORG,
        governanceBodyId: bodyId,
        title: "",
        proposalText: "x",
        proposedById: ADA,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(ctrl.list(noTenant)).rejects.toBeInstanceOf(ValidationError);
  });
});
