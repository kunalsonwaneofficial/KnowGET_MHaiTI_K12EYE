import type { TenantId, Uuid } from "@knowget/types";
import { validateDefinition } from "@knowget/workflow";
import { describe, expect, it } from "vitest";
import { SelfApprovalError } from "./errors";
import {
  approveApproval,
  availableApprovalEvents,
  governanceApprovalWorkflow,
  openApproval,
  rejectApproval,
  requestApprovalChanges,
  submitApproval,
} from "./governance-approval";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const ALICE = "33333333-3333-3333-3333-333333333333" as Uuid;
const BOB = "44444444-4444-4444-4444-444444444444" as Uuid;

const open = (kind: "policy" | "committee" | "resolution" | "delegation" = "policy") =>
  openApproval({
    tenantId: TENANT,
    organizationId: ORG,
    kind,
    subjectId: ORG,
    submittedById: ALICE,
  });

describe("governanceApprovalWorkflow", () => {
  it("is an internally consistent workflow definition", () => {
    expect(() => validateDefinition(governanceApprovalWorkflow)).not.toThrow();
    expect(governanceApprovalWorkflow.initial).toBe("draft");
  });

  it("is reusable across every governance subject kind", () => {
    for (const kind of ["policy", "committee", "resolution", "delegation"] as const) {
      const approval = open(kind);
      expect(approval.kind).toBe(kind);
      expect(approval.state).toBe("draft");
      expect(approval.status).toBe("running");
    }
  });
});

describe("governance approval lifecycle", () => {
  it("routes draft → in_review → approved and records history", () => {
    const submitted = submitApproval(open());
    expect(submitted.state).toBe("in_review");
    expect(availableApprovalEvents(submitted)).toEqual(
      expect.arrayContaining(["approve", "reject", "request_changes"]),
    );

    const approved = approveApproval(submitted, { decidedById: BOB, note: "Looks good" });
    expect(approved.state).toBe("approved");
    expect(approved.status).toBe("completed");
    expect(approved.decidedById).toBe(BOB);
    expect(approved.note).toBe("Looks good");
    expect(approved.history.map((h) => h.event)).toEqual(["submit", "approve"]);
  });

  it("enforces segregation of duties on approval", () => {
    const submitted = submitApproval(open());
    expect(() => approveApproval(submitted, { decidedById: ALICE })).toThrow(SelfApprovalError);
  });

  it("rejects a subject under review", () => {
    const rejected = rejectApproval(submitApproval(open()), { decidedById: BOB, note: "No" });
    expect(rejected.state).toBe("rejected");
    expect(rejected.status).toBe("completed");
  });

  it("returns a subject to draft on request_changes", () => {
    const returned = requestApprovalChanges(submitApproval(open()), "Please revise section 3");
    expect(returned.state).toBe("draft");
    expect(returned.status).toBe("running");
    expect(availableApprovalEvents(returned)).toEqual(["submit"]);
  });
});
