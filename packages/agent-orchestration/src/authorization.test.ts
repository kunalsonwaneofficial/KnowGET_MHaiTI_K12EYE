import { describe, expect, it } from "vitest";
import type { AutonomyLevel, Reversibility, RiskLevel, ToolEffect } from "./ai-value";
import type { AgentView, ToolView } from "./ai-view";
import {
  authorizeAll,
  authorizeInvocation,
  denyingReasons,
  isAllowedUnattended,
  isExecutable,
  requiresHumanApproval,
  unattendedCapabilities,
} from "./authorization";

const agent = (patch: Partial<AgentView> = {}): AgentView => ({
  id: "agent-1",
  status: "active",
  autonomyLevel: "bounded" as AutonomyLevel,
  grantedCapabilityKeys: ["attendance.read", "fees.reminder.send"],
  ...patch,
});

const tool = (patch: Partial<ToolView> = {}): ToolView => ({
  key: "attendance.read",
  status: "active",
  effect: "read" as ToolEffect,
  riskLevel: "low" as RiskLevel,
  reversibility: "reversible" as Reversibility,
  requiresApproval: false,
  compensationKey: null,
  ...patch,
});

describe("authorizeInvocation — the grant gate (agents invoke capabilities, never databases)", () => {
  it("allows a granted, active, low-risk read for a bounded agent", () => {
    const decision = authorizeInvocation(agent(), tool());
    expect(decision.outcome).toBe("allowed");
    expect(decision.reasons).toEqual([]);
    expect(decision.requiresCompensation).toBe(false);
    expect(isAllowedUnattended(decision)).toBe(true);
  });

  it("denies a capability the agent was never granted", () => {
    const decision = authorizeInvocation(agent(), tool({ key: "payroll.run" }));
    expect(decision.outcome).toBe("denied");
    expect(decision.reasons).toContain("capability_not_granted");
  });

  it("denies when the agent is not active", () => {
    for (const status of ["draft", "suspended", "retired"]) {
      const decision = authorizeInvocation(agent({ status }), tool());
      expect(decision.outcome).toBe("denied");
      expect(decision.reasons).toContain("agent_not_active");
    }
  });

  it("denies when the capability itself is not active", () => {
    const decision = authorizeInvocation(agent(), tool({ status: "deprecated" }));
    expect(decision.outcome).toBe("denied");
    expect(decision.reasons).toContain("tool_not_active");
  });

  it("denies rather than gates when a grant failure coincides with an approval gate", () => {
    // A retired agent asking for an irreversible capability: both a grant failure and a gate. Denied wins —
    // approval is not a grant.
    const decision = authorizeInvocation(
      agent({ status: "retired" }),
      tool({ reversibility: "irreversible" }),
    );
    expect(decision.outcome).toBe("denied");
    expect(decision.reasons).toEqual(["agent_not_active", "irreversible_action"]);
    expect(denyingReasons(decision)).toEqual(["agent_not_active"]);
  });
});

describe("authorizeInvocation — the human gate", () => {
  it("gates an irreversible capability even for an autonomous agent", () => {
    const decision = authorizeInvocation(
      agent({ autonomyLevel: "autonomous" }),
      tool({ reversibility: "irreversible" }),
    );
    expect(decision.outcome).toBe("requires_approval");
    expect(decision.reasons).toContain("irreversible_action");
    expect(decision.requiresCompensation).toBe(true);
  });

  it("gates a critical-risk capability even for an autonomous agent", () => {
    const decision = authorizeInvocation(
      agent({ autonomyLevel: "autonomous" }),
      tool({ riskLevel: "critical" }),
    );
    expect(decision.outcome).toBe("requires_approval");
    expect(decision.reasons).toContain("risk_exceeds_autonomy");
  });

  it("gates a capability that declares it always needs a human", () => {
    const decision = authorizeInvocation(
      agent({ autonomyLevel: "autonomous" }),
      tool({ requiresApproval: true }),
    );
    expect(decision.outcome).toBe("requires_approval");
    expect(decision.reasons).toEqual(["tool_requires_approval"]);
  });

  it("gates everything for an advisory agent — it only ever proposes", () => {
    const decision = authorizeInvocation(agent({ autonomyLevel: "advisory" }), tool());
    expect(decision.outcome).toBe("requires_approval");
    expect(decision.reasons).toEqual(["autonomy_forbids_unattended_execution"]);
    expect(requiresHumanApproval(decision)).toBe(true);
  });

  it("gates a write for a supervised agent but allows its reads", () => {
    const supervised = agent({ autonomyLevel: "supervised" });
    expect(authorizeInvocation(supervised, tool()).outcome).toBe("allowed");

    const write = authorizeInvocation(
      supervised,
      tool({ key: "fees.reminder.send", effect: "write" }),
    );
    expect(write.outcome).toBe("requires_approval");
    expect(write.reasons).toContain("effect_exceeds_autonomy");
  });

  it("gates risk above the agent's ceiling and allows risk at it", () => {
    const bounded = agent({ autonomyLevel: "bounded" });
    expect(authorizeInvocation(bounded, tool({ riskLevel: "medium" })).outcome).toBe("allowed");

    const high = authorizeInvocation(bounded, tool({ riskLevel: "high" }));
    expect(high.outcome).toBe("requires_approval");
    expect(high.reasons).toEqual(["risk_exceeds_autonomy"]);
  });

  it("reports every reason at once, sorted and de-duplicated", () => {
    const decision = authorizeInvocation(
      agent({ autonomyLevel: "supervised" }),
      tool({
        key: "fees.reminder.send",
        effect: "write",
        riskLevel: "critical",
        reversibility: "irreversible",
        requiresApproval: true,
      }),
    );
    expect(decision.reasons).toEqual([
      "effect_exceeds_autonomy",
      "irreversible_action",
      "risk_exceeds_autonomy",
      "tool_requires_approval",
    ]);
    expect(new Set(decision.reasons).size).toBe(decision.reasons.length);
  });
});

describe("isExecutable — enforceable human approval", () => {
  it("runs an allowed decision with or without an approval", () => {
    const decision = authorizeInvocation(agent(), tool());
    expect(isExecutable(decision, false)).toBe(true);
    expect(isExecutable(decision, true)).toBe(true);
  });

  it("runs a gated decision only once a human has approved", () => {
    const decision = authorizeInvocation(agent({ autonomyLevel: "advisory" }), tool());
    expect(isExecutable(decision, false)).toBe(false);
    expect(isExecutable(decision, true)).toBe(true);
  });

  it("never runs a denied decision — an approval is not a grant", () => {
    const decision = authorizeInvocation(agent(), tool({ key: "payroll.run" }));
    expect(isExecutable(decision, false)).toBe(false);
    expect(isExecutable(decision, true)).toBe(false);
  });
});

describe("authorizeAll / unattendedCapabilities", () => {
  const catalog: readonly ToolView[] = [
    tool(),
    tool({ key: "fees.reminder.send", effect: "write", riskLevel: "medium" }),
    tool({ key: "payroll.run", effect: "write", riskLevel: "critical" }),
  ];

  it("decides each capability independently, preserving order", () => {
    const decisions = authorizeAll(agent(), catalog);
    expect(decisions.map((d) => d.capabilityKey)).toEqual([
      "attendance.read",
      "fees.reminder.send",
      "payroll.run",
    ]);
    expect(decisions.map((d) => d.outcome)).toEqual(["allowed", "allowed", "denied"]);
  });

  it("lists only what needs no human at all", () => {
    expect(unattendedCapabilities(agent(), catalog)).toEqual([
      "attendance.read",
      "fees.reminder.send",
    ]);
    expect(unattendedCapabilities(agent({ autonomyLevel: "advisory" }), catalog)).toEqual([]);
  });
});
