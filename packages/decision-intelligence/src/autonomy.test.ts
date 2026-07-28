import { describe, expect, it } from "vitest";
import {
  autoExecutableRules,
  blockingReasons,
  classifyAction,
  classifyAll,
  classifyRecommendedAction,
  isAutoExecutable,
  isBlocked,
  mayProceed,
  partitionByDisposition,
  requiresHumanApproval,
} from "./autonomy";
import { AUTO_EXECUTION_RISK_CEILING, RISK_LEVELS } from "./decision-value";
import type { ActionView, AutomationRuleView, RecommendationGateView } from "./decision-view";

const action = (patch: Partial<ActionView> = {}): ActionView => ({
  kind: "invoke_capability",
  targetKey: "attendance.notify_guardian",
  riskLevel: "low",
  reversibility: "reversible",
  compensationKey: null,
  ...patch,
});

const rule = (patch: Partial<AutomationRuleView> = {}): AutomationRuleView => ({
  id: "rule-1",
  key: "attendance.chronic_absence_followup",
  status: "active",
  autonomyMode: "auto_execute",
  action: action(),
  ...patch,
});

const gate = (patch: Partial<RecommendationGateView> = {}): RecommendationGateView => ({
  id: "rec-1",
  status: "proposed",
  grounded: true,
  requiresHumanJudgement: false,
  ...patch,
});

describe("the auto-execution risk ceiling", () => {
  it("is low, and low is the lowest risk level there is", () => {
    expect(AUTO_EXECUTION_RISK_CEILING).toBe("low");
    expect(RISK_LEVELS[0]).toBe("low");
  });

  it("lets a low-risk reversible action run unattended", () => {
    const decision = classifyAction(rule());
    expect(decision.disposition).toBe("auto_execute");
    expect(decision.reasons).toEqual([]);
    expect(isAutoExecutable(decision)).toBe(true);
  });

  it.each(["medium", "high", "critical"] as const)("gates a %s-risk action to a human", (risk) => {
    const decision = classifyAction(rule({ action: action({ riskLevel: risk }) }));
    expect(decision.disposition).toBe("requires_approval");
    expect(decision.reasons).toContain("risk_exceeds_auto_execution_ceiling");
    expect(requiresHumanApproval(decision)).toBe(true);
  });

  it("cannot be raised by any argument the engine accepts — only the level matters", () => {
    const modes = ["propose_only", "auto_with_approval", "auto_execute"] as const;
    for (const autonomyMode of modes) {
      const decision = classifyAction(
        rule({ autonomyMode, action: action({ riskLevel: "critical" }) }),
      );
      expect(isAutoExecutable(decision)).toBe(false);
    }
  });
});

describe("the compensation rule", () => {
  it("blocks an irreversible action outright rather than offering it to a human", () => {
    const decision = classifyAction(rule({ action: action({ reversibility: "irreversible" }) }));
    expect(decision.disposition).toBe("blocked");
    expect(decision.reasons).toContain("irreversible_action");
    expect(blockingReasons(decision)).toContain("irreversible_action");
    expect(isBlocked(decision)).toBe(true);
  });

  it("blocks a compensatable action that names nothing to compensate it", () => {
    const decision = classifyAction(
      rule({ action: action({ reversibility: "compensatable", compensationKey: null }) }),
    );
    expect(decision.disposition).toBe("blocked");
    expect(decision.reasons).toContain("compensation_not_declared");
    expect(decision.compensationAvailable).toBe(false);
  });

  it("admits a compensatable action once the way back is declared", () => {
    const decision = classifyAction(
      rule({
        action: action({
          reversibility: "compensatable",
          compensationKey: "attendance.retract_guardian_notice",
        }),
      }),
    );
    expect(decision.disposition).toBe("auto_execute");
    expect(decision.requiresCompensation).toBe(true);
    expect(decision.compensationAvailable).toBe(true);
  });

  it("binds auto_with_approval too — a rule that will act must say how it is undone", () => {
    const decision = classifyAction(
      rule({
        autonomyMode: "auto_with_approval",
        action: action({ reversibility: "irreversible" }),
      }),
    );
    expect(decision.disposition).toBe("blocked");
  });

  it("exempts propose_only, which never carries the action itself", () => {
    const decision = classifyAction(
      rule({ autonomyMode: "propose_only", action: action({ reversibility: "irreversible" }) }),
    );
    expect(decision.disposition).toBe("requires_approval");
    expect(decision.reasons).not.toContain("irreversible_action");
    expect(decision.reasons).toContain("mode_forbids_auto_execution");
  });
});

describe("raising a recommendation is not acting", () => {
  const proposal = action({
    kind: "raise_recommendation",
    targetKey: null,
    riskLevel: "critical",
    reversibility: "reversible",
  });

  it("lets a rule raise a recommendation about a critical action unattended", () => {
    const decision = classifyAction(rule({ action: proposal }));
    expect(decision.disposition).toBe("auto_execute");
    expect(decision.reasons).toEqual([]);
  });

  it("still records the risk of the action being recommended", () => {
    const decision = classifyAction(rule({ action: proposal }));
    expect(decision.riskLevel).toBe("critical");
    expect(decision.targetKey).toBeNull();
  });

  it("does not demand a compensation for something that changes nothing", () => {
    const decision = classifyAction(
      rule({ action: action({ kind: "raise_recommendation", reversibility: "compensatable" }) }),
    );
    expect(decision.reasons).not.toContain("compensation_not_declared");
  });
});

describe("starting a workflow is acting", () => {
  it("is held to the risk ceiling like any other state change", () => {
    const decision = classifyAction(
      rule({
        action: action({
          kind: "start_workflow",
          targetKey: "wellbeing.escalation",
          riskLevel: "high",
        }),
      }),
    );
    expect(decision.reasons).toContain("risk_exceeds_auto_execution_ceiling");
  });

  it("is held to the compensation rule like any other state change", () => {
    const decision = classifyAction(
      rule({ action: action({ kind: "start_workflow", reversibility: "irreversible" }) }),
    );
    expect(decision.disposition).toBe("blocked");
  });
});

describe("rule status", () => {
  it.each(["draft", "paused", "retired"] as const)("blocks a %s rule", (status) => {
    const decision = classifyAction(rule({ status }));
    expect(decision.disposition).toBe("blocked");
    expect(decision.reasons).toContain("rule_not_active");
  });

  it("blocks even when everything else about the rule is impeccable", () => {
    const decision = classifyAction(rule({ status: "paused" }));
    expect(decision.riskLevel).toBe("low");
    expect(decision.compensationAvailable).toBe(true);
    expect(isBlocked(decision)).toBe(true);
  });
});

describe("autonomy mode", () => {
  it("gates propose_only to a human", () => {
    const decision = classifyAction(rule({ autonomyMode: "propose_only" }));
    expect(decision.disposition).toBe("requires_approval");
    expect(decision.reasons).toEqual(["mode_forbids_auto_execution"]);
  });

  it("gates auto_with_approval to a human even at the lowest risk", () => {
    const decision = classifyAction(rule({ autonomyMode: "auto_with_approval" }));
    expect(decision.disposition).toBe("requires_approval");
    expect(decision.reasons).toEqual(["mode_forbids_auto_execution"]);
  });
});

describe("classifying a rule against a recommendation", () => {
  it("passes a grounded, open recommendation through the rule's own verdict", () => {
    const decision = classifyRecommendedAction(rule(), gate());
    expect(decision.disposition).toBe("auto_execute");
    expect(decision.reasons).toEqual([]);
  });

  it("blocks an ungrounded recommendation rather than asking a human to launder it", () => {
    const decision = classifyRecommendedAction(rule(), gate({ grounded: false }));
    expect(decision.disposition).toBe("blocked");
    expect(decision.reasons).toContain("evidence_missing");
  });

  it.each(["accepted", "rejected", "superseded", "expired", "withdrawn"] as const)(
    "blocks acting on a %s recommendation",
    (status) => {
      const decision = classifyRecommendedAction(rule(), gate({ status }));
      expect(decision.disposition).toBe("blocked");
      expect(decision.reasons).toContain("recommendation_not_open");
    },
  );

  it("gates a subject declared to need human judgement, without blocking it", () => {
    const decision = classifyRecommendedAction(rule(), gate({ requiresHumanJudgement: true }));
    expect(decision.disposition).toBe("requires_approval");
    expect(decision.reasons).toEqual(["subject_requires_human_judgement"]);
  });

  it("is never weaker than classifying the bare rule", () => {
    const paused = rule({ status: "paused" });
    expect(classifyRecommendedAction(paused, gate()).reasons).toEqual(
      expect.arrayContaining([...classifyAction(paused).reasons]),
    );
  });

  it("accumulates every reason that applies", () => {
    const decision = classifyRecommendedAction(
      rule({
        status: "paused",
        autonomyMode: "propose_only",
        action: action({ riskLevel: "high" }),
      }),
      gate({ status: "expired", grounded: false, requiresHumanJudgement: true }),
    );
    expect(decision.reasons).toEqual([
      "evidence_missing",
      "mode_forbids_auto_execution",
      "recommendation_not_open",
      "risk_exceeds_auto_execution_ceiling",
      "rule_not_active",
      "subject_requires_human_judgement",
    ]);
  });
});

describe("reason codes are deterministic", () => {
  it("sorts them and never repeats one", () => {
    const decision = classifyAction(
      rule({
        status: "draft",
        autonomyMode: "propose_only",
        action: action({ riskLevel: "critical" }),
      }),
    );
    expect(decision.reasons).toEqual([...decision.reasons].sort((a, b) => a.localeCompare(b)));
    expect(new Set(decision.reasons).size).toBe(decision.reasons.length);
  });

  it("produces the same verdict for the same rule every time", () => {
    const r = rule({ action: action({ riskLevel: "medium" }) });
    expect(classifyAction(r)).toEqual(classifyAction(r));
  });
});

describe("mayProceed", () => {
  it("lets an auto-executable action run with no approval", () => {
    expect(mayProceed(classifyAction(rule()), false)).toBe(true);
  });

  it("holds a gated action until a human approves", () => {
    const decision = classifyAction(rule({ action: action({ riskLevel: "high" }) }));
    expect(mayProceed(decision, false)).toBe(false);
    expect(mayProceed(decision, true)).toBe(true);
  });

  it("refuses a blocked action even with an approval — an approval is not a repair", () => {
    const decision = classifyAction(rule({ action: action({ reversibility: "irreversible" }) }));
    expect(mayProceed(decision, true)).toBe(false);
  });

  it("refuses an ungrounded recommendation even with an approval", () => {
    const decision = classifyRecommendedAction(rule(), gate({ grounded: false }));
    expect(mayProceed(decision, true)).toBe(false);
  });
});

describe("classifying a set of rules", () => {
  const rules = [
    rule({ id: "a" }),
    rule({ id: "b", action: action({ riskLevel: "high" }) }),
    rule({ id: "c", action: action({ reversibility: "irreversible" }) }),
    rule({ id: "d", status: "paused" }),
  ];

  it("keeps the order it was given", () => {
    expect(classifyAll(rules).map((d) => d.ruleId)).toEqual(["a", "b", "c", "d"]);
  });

  it("names the unattended surface of the institution", () => {
    expect(autoExecutableRules(rules)).toEqual(["a"]);
  });

  it("splits the rules into the three dispositions for an operator", () => {
    expect(partitionByDisposition(rules)).toEqual({
      auto_execute: ["a"],
      requires_approval: ["b"],
      blocked: ["c", "d"],
    });
  });

  it("returns an empty surface for an empty set", () => {
    expect(autoExecutableRules([])).toEqual([]);
    expect(partitionByDisposition([])).toEqual({
      auto_execute: [],
      requires_approval: [],
      blocked: [],
    });
  });
});
