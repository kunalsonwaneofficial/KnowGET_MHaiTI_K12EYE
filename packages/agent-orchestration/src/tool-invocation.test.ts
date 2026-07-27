import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import type { AgentView, ToolView } from "./ai-view";
import { approveRequest, createApprovalRequest, rejectRequest } from "./approval-request";
import { compensationPlan, isFullyReversible } from "./rollback";
import {
  ApprovalSubjectMismatchError,
  InvalidInvocationTransitionError,
  InvocationNotAuthorizedError,
  InvocationNotCompensatableError,
} from "./errors";
import { summarizeAgentOperations } from "./metrics";
import {
  type AuthorizeToolInvocationParams,
  authorizeToolInvocation,
  beginInvocation,
  compensateInvocation,
  didInvocationLand,
  failInvocation,
  isInvocationSettled,
  succeedInvocation,
  toInvocationSummaryView,
  toInvocationView,
  wasHumanGated,
} from "./tool-invocation";

const agent = (patch: Partial<AgentView> = {}): AgentView => ({
  id: "agent-1",
  status: "active",
  autonomyLevel: "bounded",
  grantedCapabilityKeys: ["attendance.read", "guardian.notify", "fees.charge"],
  ...patch,
});

const tool = (key: string, patch: Partial<ToolView> = {}): ToolView => ({
  key,
  status: "active",
  effect: "read",
  riskLevel: "low",
  reversibility: "reversible",
  requiresApproval: false,
  compensationKey: null,
  ...patch,
});

const READ = tool("attendance.read");
const CHARGE = tool("fees.charge", {
  effect: "write",
  riskLevel: "medium",
  reversibility: "compensatable",
  compensationKey: "fees.refund",
});
const NOTIFY = tool("guardian.notify", {
  effect: "write",
  riskLevel: "medium",
  reversibility: "irreversible",
});

const params = (patch: Partial<AuthorizeToolInvocationParams> = {}) =>
  ({
    tenantId: "t1" as TenantId,
    organizationId: "org1" as Uuid,
    agent: agent(),
    tool: READ,
    ...patch,
  }) satisfies AuthorizeToolInvocationParams;

/** An approval that genuinely covers the agent and capability under test. */
const approvalFor = (capabilityKey: string, agentId = "agent-1") =>
  approveRequest(
    createApprovalRequest({
      tenantId: "t1" as TenantId,
      organizationId: "org1" as Uuid,
      subject: "tool_invocation",
      subjectId: "inv-1",
      agentId,
      capabilityKey,
      riskLevel: "medium",
    }),
    { decidedByUserId: "user-9" },
  );

describe("authorizeToolInvocation — the record cannot exist unless the gate opened", () => {
  it("records an allowed invocation with the decision that let it run", () => {
    const invocation = authorizeToolInvocation(params({ planId: "plan-1", stepId: "step-1" }));
    expect(invocation.status).toBe("authorized");
    expect(invocation.authorizationOutcome).toBe("allowed");
    expect(invocation.authorizationReasons).toEqual([]);
    expect(invocation.approvalRequestId).toBeNull();
    expect(invocation.capabilityKey).toBe("attendance.read");
    expect(invocation.agentId).toBe("agent-1");
    expect(invocation.planId).toBe("plan-1");
    expect(invocation.stepId).toBe("step-1");
    expect(invocation.ordinal).toBe(1);
    expect(wasHumanGated(invocation)).toBe(false);
  });

  it("copies what a rollback will need from the catalog entry", () => {
    const invocation = authorizeToolInvocation(
      params({ tool: CHARGE, approval: approvalFor("fees.charge") }),
    );
    expect(invocation.reversibility).toBe("compensatable");
    expect(invocation.compensationKey).toBe("fees.refund");
    expect(invocation.riskLevel).toBe("medium");
  });

  it("refuses outright when the grant is missing — no record comes into existence", () => {
    expect(() =>
      authorizeToolInvocation(params({ agent: agent({ grantedCapabilityKeys: [] }) })),
    ).toThrow(InvocationNotAuthorizedError);
  });

  it("refuses a suspended agent even holding an approval, because approval is not a grant", () => {
    expect(() =>
      authorizeToolInvocation(
        params({
          agent: agent({ status: "suspended" }),
          tool: NOTIFY,
          approval: approvalFor("guardian.notify"),
        }),
      ),
    ).toThrow(InvocationNotAuthorizedError);
  });

  it("refuses a deprecated capability", () => {
    expect(() =>
      authorizeToolInvocation(params({ tool: tool("attendance.read", { status: "deprecated" }) })),
    ).toThrow(InvocationNotAuthorizedError);
  });

  it("carries the refusal's reason codes so the caller learns what would fix it", () => {
    try {
      authorizeToolInvocation(params({ agent: agent({ grantedCapabilityKeys: [] }) }));
      expect.unreachable("expected the invocation to be refused");
    } catch (error) {
      expect(error).toBeInstanceOf(InvocationNotAuthorizedError);
      expect((error as InvocationNotAuthorizedError).details).toEqual({
        agentId: "agent-1",
        capabilityKey: "attendance.read",
        reasons: ["capability_not_granted"],
      });
      expect((error as InvocationNotAuthorizedError).httpStatus).toBe(403);
    }
  });
});

describe("the human gate — an approval is an aggregate, not a string", () => {
  it("blocks an invocation that needs a human when none is offered", () => {
    expect(() => authorizeToolInvocation(params({ tool: NOTIFY }))).toThrow(
      InvocationNotAuthorizedError,
    );
  });

  it("lets it through on a granted approval, and links the two", () => {
    const approval = approvalFor("guardian.notify");
    const invocation = authorizeToolInvocation(params({ tool: NOTIFY, approval }));
    expect(invocation.authorizationOutcome).toBe("requires_approval");
    expect(invocation.approvalRequestId).toBe(approval.id);
    expect(invocation.authorizationReasons).toContain("irreversible_action");
    expect(wasHumanGated(invocation)).toBe(true);
  });

  it("does not accept an approval nobody has decided yet", () => {
    const pending = createApprovalRequest({
      tenantId: "t1" as TenantId,
      organizationId: "org1" as Uuid,
      subject: "tool_invocation",
      subjectId: "inv-1",
      agentId: "agent-1",
      capabilityKey: "guardian.notify",
      riskLevel: "medium",
    });
    expect(() => authorizeToolInvocation(params({ tool: NOTIFY, approval: pending }))).toThrow(
      InvocationNotAuthorizedError,
    );
  });

  it("does not accept a rejected approval", () => {
    const rejected = rejectRequest(
      createApprovalRequest({
        tenantId: "t1" as TenantId,
        organizationId: "org1" as Uuid,
        subject: "tool_invocation",
        subjectId: "inv-1",
        agentId: "agent-1",
        capabilityKey: "guardian.notify",
        riskLevel: "medium",
      }),
      { decidedByUserId: "user-9" },
    );
    expect(() => authorizeToolInvocation(params({ tool: NOTIFY, approval: rejected }))).toThrow(
      InvocationNotAuthorizedError,
    );
  });

  it("refuses an approval raised for another capability", () => {
    expect(() =>
      authorizeToolInvocation(params({ tool: NOTIFY, approval: approvalFor("fees.charge") })),
    ).toThrow(ApprovalSubjectMismatchError);
  });

  it("refuses an approval raised for another agent", () => {
    expect(() =>
      authorizeToolInvocation(
        params({ tool: NOTIFY, approval: approvalFor("guardian.notify", "agent-2") }),
      ),
    ).toThrow(ApprovalSubjectMismatchError);
  });

  it("does not attach an approval that was never needed", () => {
    const invocation = authorizeToolInvocation(
      params({ approval: approvalFor("attendance.read") }),
    );
    expect(invocation.authorizationOutcome).toBe("allowed");
    expect(invocation.approvalRequestId).toBeNull();
  });
});

describe("the invocation lifecycle", () => {
  it("runs authorized → executing → succeeded, stamping both instants", () => {
    const started = beginInvocation(authorizeToolInvocation(params()));
    expect(started.status).toBe("executing");
    expect(started.startedAt).not.toBeNull();
    expect(isInvocationSettled(started)).toBe(false);

    const settled = succeedInvocation(started);
    expect(settled.status).toBe("succeeded");
    expect(settled.settledAt).not.toBeNull();
    expect(isInvocationSettled(settled)).toBe(true);
    expect(didInvocationLand(settled)).toBe(true);
  });

  it("fails with a stable code and no message", () => {
    const failed = failInvocation(
      beginInvocation(authorizeToolInvocation(params())),
      "  upstream_timeout  ",
    );
    expect(failed.status).toBe("failed");
    expect(failed.failureCode).toBe("upstream_timeout");
    expect(didInvocationLand(failed)).toBe(false);
    expect(
      failInvocation(beginInvocation(authorizeToolInvocation(params()))).failureCode,
    ).toBeNull();
  });

  it("refuses to settle something that never started, or to restart something settled", () => {
    const authorized = authorizeToolInvocation(params());
    expect(() => succeedInvocation(authorized)).toThrow(InvalidInvocationTransitionError);
    expect(() => failInvocation(authorized)).toThrow(InvalidInvocationTransitionError);

    const settled = succeedInvocation(beginInvocation(authorized));
    expect(() => beginInvocation(settled)).toThrow(InvalidInvocationTransitionError);
  });
});

describe("compensation — the runtime does not record undo that did not happen", () => {
  const landed = (t: ToolView, approval = approvalFor(t.key)) =>
    succeedInvocation(beginInvocation(authorizeToolInvocation(params({ tool: t, approval }))));

  it("links a compensatable invocation to the invocation that undid it", () => {
    const compensated = compensateInvocation(landed(CHARGE), " inv-undo ");
    expect(compensated.status).toBe("compensated");
    expect(compensated.compensatedByInvocationId).toBe("inv-undo");
    expect(isInvocationSettled(compensated)).toBe(true);
    expect(didInvocationLand(compensated)).toBe(false);
  });

  it("refuses an irreversible invocation", () => {
    expect(() => compensateInvocation(landed(NOTIFY), "inv-undo")).toThrow(
      InvocationNotCompensatableError,
    );
  });

  it("refuses a reversible one — there is nothing to undo", () => {
    expect(() =>
      compensateInvocation(
        succeedInvocation(beginInvocation(authorizeToolInvocation(params()))),
        "inv-undo",
      ),
    ).toThrow(InvocationNotCompensatableError);
  });

  it("refuses an unnamed compensating invocation", () => {
    expect(() => compensateInvocation(landed(CHARGE), "   ")).toThrow(
      InvocationNotCompensatableError,
    );
  });

  it("refuses to compensate something that never landed", () => {
    const executing = beginInvocation(
      authorizeToolInvocation(params({ tool: CHARGE, approval: approvalFor("fees.charge") })),
    );
    expect(() => compensateInvocation(executing, "inv-undo")).toThrow(
      InvalidInvocationTransitionError,
    );
  });
});

describe("bridges to the engines", () => {
  it("hands the rollback engine what it needs to build a compensation plan", () => {
    const read = succeedInvocation(beginInvocation(authorizeToolInvocation(params())));
    const charge = succeedInvocation(
      beginInvocation(
        authorizeToolInvocation(
          params({ tool: CHARGE, approval: approvalFor("fees.charge"), ordinal: 2 }),
        ),
      ),
    );

    const views = [read, charge].map(toInvocationView);
    expect(views[1]).toEqual({
      id: charge.id,
      stepId: null,
      capabilityKey: "fees.charge",
      ordinal: 2,
      status: "succeeded",
      reversibility: "compensatable",
      compensationKey: "fees.refund",
    });

    const plan = compensationPlan(views);
    expect(plan.steps).toEqual([
      {
        invocationId: charge.id,
        capabilityKey: "fees.charge",
        compensationKey: "fees.refund",
        ordinal: 1,
      },
    ]);
    expect(isFullyReversible(views)).toBe(true);
  });

  it("reports an irreversible landing honestly to the rollback engine", () => {
    const notify = succeedInvocation(
      beginInvocation(
        authorizeToolInvocation(params({ tool: NOTIFY, approval: approvalFor("guardian.notify") })),
      ),
    );
    const plan = compensationPlan([toInvocationView(notify)]);
    expect(plan.steps).toEqual([]);
    expect(plan.irreversibleInvocationIds).toEqual([notify.id]);
    expect(plan.fullyReversible).toBe(false);
  });

  it("hands the metrics engine the fact that makes an invocation human-gated", () => {
    const gated = authorizeToolInvocation(
      params({ tool: NOTIFY, approval: approvalFor("guardian.notify") }),
    );
    const ungated = authorizeToolInvocation(params());
    expect(toInvocationSummaryView(gated).approvalRequestId).toBe(gated.approvalRequestId);
    expect(toInvocationSummaryView(ungated).approvalRequestId).toBeNull();

    const summary = summarizeAgentOperations({
      agents: [],
      capabilities: [],
      plans: [],
      invocations: [gated, ungated].map(toInvocationSummaryView),
      approvals: [],
    });
    expect(summary.invocationCount).toBe(2);
    expect(summary.humanGatedRate).toBe(50);
  });
});
