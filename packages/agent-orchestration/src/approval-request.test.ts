import { describe, expect, it } from "vitest";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type CreateApprovalRequestParams,
  approveRequest,
  consumeApproval,
  coversInvocation,
  createApprovalRequest,
  expireRequest,
  isApprovalGranted,
  isApprovalOpen,
  isApprovalSpendable,
  isApprovalSpent,
  isExpiredAt,
  rejectRequest,
  requestApprovalFor,
  toApprovalView,
} from "./approval-request";
import { authorizeInvocation } from "./authorization";
import {
  AnonymousApprovalDecisionError,
  ApprovalAlreadyDecidedError,
  ApprovalAlreadySpentError,
  ApprovalNotGrantedError,
  EmptyApprovalSubjectError,
} from "./errors";

const base: CreateApprovalRequestParams = {
  tenantId: "t1" as TenantId,
  organizationId: "org1" as Uuid,
  subject: "tool_invocation",
  subjectId: "  inv-1 ",
  agentId: " agent-1 ",
  capabilityKey: " guardian.notify ",
  reasons: ["tool_requires_approval"],
  riskLevel: "high",
};

describe("ApprovalRequest — the human gate as a record", () => {
  it("starts pending with nobody yet accountable", () => {
    const request = createApprovalRequest(base);
    expect(request.decision).toBe("pending");
    expect(request.decidedByUserId).toBeNull();
    expect(request.decidedAt).toBeNull();
    expect(request.decisionNote).toBeNull();
    expect(isApprovalOpen(request)).toBe(true);
    expect(isApprovalGranted(request)).toBe(false);
  });

  it("trims what identifies the subject and keeps the grounds it was raised on", () => {
    const request = createApprovalRequest(base);
    expect(request.subjectId).toBe("inv-1");
    expect(request.agentId).toBe("agent-1");
    expect(request.capabilityKey).toBe("guardian.notify");
    expect(request.reasons).toEqual(["tool_requires_approval"]);
    expect(request.riskLevel).toBe("high");
  });

  it("must name what it is about, and who would act", () => {
    expect(() => createApprovalRequest({ ...base, subjectId: "   " })).toThrow(
      EmptyApprovalSubjectError,
    );
    expect(() => createApprovalRequest({ ...base, agentId: " " })).toThrow(
      EmptyApprovalSubjectError,
    );
  });

  it("covers a whole plan with no capability of its own", () => {
    const request = createApprovalRequest({
      ...base,
      subject: "execution_plan",
      subjectId: "plan-1",
      capabilityKey: null,
    });
    expect(request.subject).toBe("execution_plan");
    expect(request.capabilityKey).toBeNull();
  });
});

describe("requestApprovalFor — the grounds come from the engine, not the caller", () => {
  it("carries the decision's agent, capability, reasons and risk onto the record", () => {
    const decision = authorizeInvocation(
      {
        id: "agent-1",
        status: "active",
        autonomyLevel: "supervised",
        grantedCapabilityKeys: ["guardian.notify"],
      },
      {
        key: "guardian.notify",
        status: "active",
        effect: "write",
        riskLevel: "high",
        reversibility: "irreversible",
        requiresApproval: false,
        compensationKey: null,
      },
    );
    expect(decision.outcome).toBe("requires_approval");

    const request = requestApprovalFor(decision, {
      tenantId: "t1" as TenantId,
      organizationId: "org1" as Uuid,
      subject: "tool_invocation",
      subjectId: "inv-1",
    });
    expect(request.agentId).toBe("agent-1");
    expect(request.capabilityKey).toBe("guardian.notify");
    expect(request.reasons).toEqual(decision.reasons);
    expect(request.riskLevel).toBe("high");
    expect(request.decision).toBe("pending");
  });
});

describe("deciding — once, by a named person, and it stands", () => {
  it("records who approved it and what they said", () => {
    const approved = approveRequest(createApprovalRequest(base), {
      decidedByUserId: " user-9 ",
      note: "  Verified with the class teacher.  ",
    });
    expect(approved.decision).toBe("approved");
    expect(approved.decidedByUserId).toBe("user-9");
    expect(approved.decisionNote).toBe("Verified with the class teacher.");
    expect(approved.decidedAt).not.toBeNull();
    expect(isApprovalGranted(approved)).toBe(true);
    expect(isApprovalOpen(approved)).toBe(false);
  });

  it("records a rejection the same way, with no note required", () => {
    const rejected = rejectRequest(createApprovalRequest(base), { decidedByUserId: "user-9" });
    expect(rejected.decision).toBe("rejected");
    expect(rejected.decidedByUserId).toBe("user-9");
    expect(rejected.decisionNote).toBeNull();
    expect(isApprovalGranted(rejected)).toBe(false);
  });

  it("refuses an anonymous decision — that is the whole point of the gate", () => {
    const request = createApprovalRequest(base);
    expect(() => approveRequest(request, { decidedByUserId: "   " })).toThrow(
      AnonymousApprovalDecisionError,
    );
    expect(() => rejectRequest(request, { decidedByUserId: "" })).toThrow(
      AnonymousApprovalDecisionError,
    );
  });

  it("will not let a decided request be decided again, in any direction", () => {
    const approved = approveRequest(createApprovalRequest(base), { decidedByUserId: "user-9" });
    expect(() => approveRequest(approved, { decidedByUserId: "user-9" })).toThrow(
      ApprovalAlreadyDecidedError,
    );
    expect(() => rejectRequest(approved, { decidedByUserId: "user-2" })).toThrow(
      ApprovalAlreadyDecidedError,
    );
    expect(() => expireRequest(approved)).toThrow(ApprovalAlreadyDecidedError);
  });

  it("expires without a person, because silence is not a refusal", () => {
    const expired = expireRequest(createApprovalRequest(base));
    expect(expired.decision).toBe("expired");
    expect(expired.decidedByUserId).toBeNull();
    expect(expired.decidedAt).not.toBeNull();
    expect(isApprovalGranted(expired)).toBe(false);
    expect(isApprovalOpen(expired)).toBe(false);
  });
});

describe("spending the grant — one yes, one act", () => {
  const granted = () => approveRequest(createApprovalRequest(base), { decidedByUserId: "user-9" });

  it("is unspent when granted, and only then authorizes anything", () => {
    const request = granted();
    expect(request.consumedAt).toBeNull();
    expect(request.consumedByInvocationId).toBeNull();
    expect(isApprovalSpent(request)).toBe(false);
    expect(isApprovalSpendable(request)).toBe(true);
  });

  it("records which invocation spent it, and stops being spendable", () => {
    const spent = consumeApproval(granted(), "inv-77");
    expect(spent.consumedAt).not.toBeNull();
    expect(spent.consumedByInvocationId).toBe("inv-77");
    expect(isApprovalSpent(spent)).toBe(true);
    expect(isApprovalSpendable(spent)).toBe(false);
    // Still a granted approval — spending it does not un-decide it. It is now history, not permission.
    expect(isApprovalGranted(spent)).toBe(true);
    expect(spent.decision).toBe("approved");
  });

  it("refuses a second spend, naming the invocation that already took it", () => {
    const spent = consumeApproval(granted(), "inv-77");
    expect(() => consumeApproval(spent, "inv-78")).toThrow(ApprovalAlreadySpentError);
    try {
      consumeApproval(spent, "inv-78");
    } catch (error) {
      expect((error as ApprovalAlreadySpentError).details).toMatchObject({
        consumedByInvocationId: "inv-77",
      });
    }
  });

  it("cannot be spent while pending, once rejected, or after expiry", () => {
    const pending = createApprovalRequest(base);
    expect(() => consumeApproval(pending, "inv-1")).toThrow(ApprovalNotGrantedError);
    expect(() =>
      consumeApproval(rejectRequest(pending, { decidedByUserId: "user-9" }), "inv-1"),
    ).toThrow(ApprovalNotGrantedError);
    expect(() => consumeApproval(expireRequest(pending), "inv-1")).toThrow(ApprovalNotGrantedError);
    expect(isApprovalSpendable(pending)).toBe(false);
  });
});

describe("expiry and scope", () => {
  it("compares its deadline against the instant it is given", () => {
    const request = createApprovalRequest({
      ...base,
      expiresAt: "2026-03-01T10:00:00.000Z" as ISODateString,
    });
    expect(isExpiredAt(request, "2026-03-01T09:59:59.999Z" as ISODateString)).toBe(false);
    expect(isExpiredAt(request, "2026-03-01T10:00:00.000Z" as ISODateString)).toBe(true);
    expect(isExpiredAt(request, "2026-03-02T00:00:00.000Z" as ISODateString)).toBe(true);
  });

  it("never expires when no deadline was set", () => {
    expect(
      isExpiredAt(createApprovalRequest(base), "2099-01-01T00:00:00.000Z" as ISODateString),
    ).toBe(false);
  });

  it("covers exactly one agent and one capability, and nothing else", () => {
    const request = createApprovalRequest(base);
    expect(coversInvocation(request, "agent-1", "guardian.notify")).toBe(true);
    expect(coversInvocation(request, "agent-2", "guardian.notify")).toBe(false);
    expect(coversInvocation(request, "agent-1", "fees.waive")).toBe(false);
  });

  it("does not let a plan approval stand in for an invocation approval", () => {
    const planApproval = createApprovalRequest({
      ...base,
      subject: "execution_plan",
      subjectId: "plan-1",
      capabilityKey: "guardian.notify",
    });
    expect(coversInvocation(planApproval, "agent-1", "guardian.notify")).toBe(false);
  });
});

describe("toApprovalView", () => {
  it("gives the metrics engine exactly what it counts", () => {
    const request = createApprovalRequest(base);
    expect(toApprovalView(request)).toEqual({ id: request.id, decision: "pending" });
    expect(toApprovalView(approveRequest(request, { decidedByUserId: "user-9" })).decision).toBe(
      "approved",
    );
  });
});
