import { describe, expect, it } from "vitest";
import type { AutonomyLevel, Reversibility, RiskLevel, ToolEffect } from "./ai-value";
import type {
  AgentView,
  ApprovalView,
  InvocationSummaryView,
  InvocationView,
  PlanView,
  ToolView,
} from "./ai-view";
import {
  type AgentOperationsInput,
  invocationsByCapability,
  plansByAgent,
  plansByStatus,
  summarizeAgentOperations,
  tally,
} from "./metrics";

const agent = (id: string, status = "active"): AgentView => ({
  id,
  status,
  autonomyLevel: "bounded" as AutonomyLevel,
  grantedCapabilityKeys: [],
});

const capability = (key: string): ToolView => ({
  key,
  status: "active",
  effect: "read" as ToolEffect,
  riskLevel: "low" as RiskLevel,
  reversibility: "reversible" as Reversibility,
  requiresApproval: false,
  compensationKey: null,
});

const plan = (id: string, agentId: string, status: string): PlanView => ({ id, agentId, status });

const invoked = (
  id: string,
  status: string,
  approvalRequestId: string | null = null,
): InvocationSummaryView => ({ id, status, approvalRequestId });

const approval = (id: string, decision: string): ApprovalView => ({ id, decision });

const empty: AgentOperationsInput = {
  agents: [],
  capabilities: [],
  plans: [],
  invocations: [],
  approvals: [],
};

describe("tally", () => {
  it("counts keys, commonest first", () => {
    expect(tally(["b", "a", "b", "c", "b", "a"])).toEqual([
      { key: "b", count: 3 },
      { key: "a", count: 2 },
      { key: "c", count: 1 },
    ]);
  });

  it("breaks ties alphabetically, so a roll-up is stable between runs", () => {
    expect(tally(["z", "m", "a"])).toEqual([
      { key: "a", count: 1 },
      { key: "m", count: 1 },
      { key: "z", count: 1 },
    ]);
  });

  it("returns nothing for nothing", () => {
    expect(tally([])).toEqual([]);
  });
});

describe("roll-ups", () => {
  const plans = [
    plan("p1", "agent-a", "completed"),
    plan("p2", "agent-a", "executing"),
    plan("p3", "agent-b", "completed"),
  ];

  it("rolls plans up by status and by agent", () => {
    expect(plansByStatus(plans)).toEqual([
      { key: "completed", count: 2 },
      { key: "executing", count: 1 },
    ]);
    expect(plansByAgent(plans)).toEqual([
      { key: "agent-a", count: 2 },
      { key: "agent-b", count: 1 },
    ]);
  });

  it("rolls invocations up by capability", () => {
    const invocations: readonly InvocationView[] = [
      {
        id: "i1",
        stepId: "s1",
        capabilityKey: "attendance.read",
        ordinal: 1,
        status: "succeeded",
        reversibility: "reversible",
        compensationKey: null,
      },
      {
        id: "i2",
        stepId: "s2",
        capabilityKey: "attendance.read",
        ordinal: 2,
        status: "succeeded",
        reversibility: "reversible",
        compensationKey: null,
      },
      {
        id: "i3",
        stepId: "s3",
        capabilityKey: "guardian.notify",
        ordinal: 3,
        status: "failed",
        reversibility: "reversible",
        compensationKey: null,
      },
    ];
    expect(invocationsByCapability(invocations)).toEqual([
      { key: "attendance.read", count: 2 },
      { key: "guardian.notify", count: 1 },
    ]);
  });
});

describe("summarizeAgentOperations", () => {
  it("describes a tenant's AI operations in counts and rates", () => {
    const summary = summarizeAgentOperations({
      agents: [agent("a1"), agent("a2"), agent("a3", "suspended"), agent("a4", "draft")],
      capabilities: [capability("attendance.read"), capability("guardian.notify")],
      plans: [
        plan("p1", "a1", "completed"),
        plan("p2", "a1", "executing"),
        plan("p3", "a2", "completed"),
        plan("p4", "a2", "awaiting_approval"),
      ],
      invocations: [
        invoked("i1", "succeeded"),
        invoked("i2", "succeeded", "ar1"),
        invoked("i3", "compensated", "ar2"),
        invoked("i4", "failed"),
      ],
      approvals: [
        approval("ar1", "approved"),
        approval("ar2", "approved"),
        approval("ar3", "rejected"),
        approval("ar4", "pending"),
      ],
    });

    expect(summary).toEqual({
      agentCount: 4,
      activeAgentCount: 2,
      capabilityCount: 2,
      planCount: 4,
      plansByStatus: [
        { key: "completed", count: 2 },
        { key: "awaiting_approval", count: 1 },
        { key: "executing", count: 1 },
      ],
      invocationCount: 4,
      compensatedInvocationCount: 1,
      approvalCount: 4,
      pendingApprovalCount: 1,
      approvalRate: 66.67,
      humanGatedRate: 50,
    });
  });

  it("measures the approval rate over decided requests only", () => {
    const pendingHeavy = summarizeAgentOperations({
      ...empty,
      approvals: [
        approval("ar1", "approved"),
        approval("ar2", "pending"),
        approval("ar3", "pending"),
      ],
    });
    // One decided, one approved — a queue of untouched requests says nothing either way.
    expect(pendingHeavy.approvalRate).toBe(100);
    expect(pendingHeavy.pendingApprovalCount).toBe(2);
  });

  it("counts an expired request as decided and not approved", () => {
    const summary = summarizeAgentOperations({
      ...empty,
      approvals: [approval("ar1", "approved"), approval("ar2", "expired")],
    });
    expect(summary.approvalRate).toBe(50);
    expect(summary.pendingApprovalCount).toBe(0);
  });

  it("measures the human-gated rate over every invocation", () => {
    const summary = summarizeAgentOperations({
      ...empty,
      invocations: [
        invoked("i1", "succeeded", "ar1"),
        invoked("i2", "succeeded"),
        invoked("i3", "failed"),
      ],
    });
    expect(summary.humanGatedRate).toBe(33.33);
  });

  it("reports zeroes rather than dividing by nothing for a tenant with no activity", () => {
    expect(summarizeAgentOperations(empty)).toEqual({
      agentCount: 0,
      activeAgentCount: 0,
      capabilityCount: 0,
      planCount: 0,
      plansByStatus: [],
      invocationCount: 0,
      compensatedInvocationCount: 0,
      approvalCount: 0,
      pendingApprovalCount: 0,
      approvalRate: 0,
      humanGatedRate: 0,
    });
  });
});
