import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { ApprovalNotFoundError, SelfApprovalError } from "./errors";
import { GovernanceApprovalService } from "./governance-approval-service";
import {
  InMemoryGovernanceApprovalRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const ALICE = "33333333-3333-3333-3333-333333333333" as Uuid;
const BOB = "44444444-4444-4444-4444-444444444444" as Uuid;
const POLICY = "55555555-5555-5555-5555-555555555555" as Uuid;

const anyOrg: OrganizationDirectory = { exists: async () => true };
const anyPerson: PersonDirectory = { exists: async () => true };

function service(): GovernanceApprovalService {
  return new GovernanceApprovalService({
    repository: new InMemoryGovernanceApprovalRepository(),
    organizations: anyOrg,
    persons: anyPerson,
  });
}

const openInput = {
  tenantId: TENANT,
  organizationId: ORG,
  kind: "policy" as const,
  subjectId: POLICY,
  submittedById: ALICE,
};

describe("GovernanceApprovalService", () => {
  it("opens, submits and approves an approval, then lists it by subject", async () => {
    const svc = service();
    const opened = await svc.open(openInput);
    expect(opened.state).toBe("draft");

    await svc.submit(TENANT, opened.id);
    const approved = await svc.approve(TENANT, opened.id, { decidedById: BOB });
    expect(approved.state).toBe("approved");

    expect(await svc.list(TENANT)).toHaveLength(1);
    expect(await svc.listForSubject(TENANT, "policy", POLICY)).toHaveLength(1);
    expect(await svc.listForOrganization(TENANT, ORG)).toHaveLength(1);
    expect((await svc.getById(TENANT, opened.id)).state).toBe("approved");
  });

  it("supports the request-changes loop and rejection", async () => {
    const svc = service();
    const opened = await svc.open(openInput);
    await svc.submit(TENANT, opened.id);
    const returned = await svc.requestChanges(TENANT, opened.id, "Revise");
    expect(returned.state).toBe("draft");

    await svc.submit(TENANT, opened.id);
    expect((await svc.reject(TENANT, opened.id, { decidedById: BOB })).state).toBe("rejected");
  });

  it("enforces segregation of duties and reports unknown approvals", async () => {
    const svc = service();
    const opened = await svc.open(openInput);
    await svc.submit(TENANT, opened.id);
    await expect(svc.approve(TENANT, opened.id, { decidedById: ALICE })).rejects.toBeInstanceOf(
      SelfApprovalError,
    );
    await expect(svc.getById(TENANT, ORG)).rejects.toBeInstanceOf(ApprovalNotFoundError);
  });
});
