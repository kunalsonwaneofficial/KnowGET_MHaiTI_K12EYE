import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  type AutomationCondition,
  type AutomationRule,
  type CreateAutomationRuleParams,
  type DeclareActionParams,
  type DeclareConditionParams,
  activateRule,
  addCondition,
  amendAutomationRule,
  classifyRuleAction,
  conditionsSatisfiedBy,
  createAutomationRule,
  declareAction,
  declareCondition,
  evaluateCondition,
  isRuleActive,
  isRuleEditable,
  matchingRules,
  observeFacts,
  pauseRule,
  removeConditions,
  retireRule,
  ruleAutonomyDisposition,
  ruleBlockingReasons,
  ruleConditionKeys,
  ruleFiresOn,
  ruleMatches,
  toAutomationRuleView,
  unsatisfiedConditionKeys,
} from "./automation-rule";
import type { ActionView } from "./decision-view";
import {
  ActionTargetNotAllowedError,
  ActionTargetRequiredError,
  ActiveRuleImmutableError,
  ConditionArityError,
  EmptyConditionKeyError,
  EmptyRuleKeyError,
  EmptyRuleNameError,
  EmptyRuleSignalKeyError,
  InvalidRuleTransitionError,
  UnsafeAutomationRuleError,
} from "./errors";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;

/** A low-risk reversible invocation — the only shape that is allowed to run entirely unattended. */
const action = (patch: Partial<DeclareActionParams> = {}): ActionView =>
  declareAction({
    kind: "invoke_capability",
    targetKey: "attendance.notify_guardian",
    riskLevel: "low",
    reversibility: "reversible",
    ...patch,
  });

const condition = (patch: Partial<DeclareConditionParams> = {}): AutomationCondition =>
  declareCondition({
    key: "absence_streak",
    operator: "greater_than",
    values: ["4"],
    ...patch,
  });

const base: CreateAutomationRuleParams = {
  tenantId: TENANT,
  organizationId: ORG,
  key: "attendance.chronic_absence_followup",
  name: "Notify a guardian after a fifth consecutive absence",
  signalKey: "attendance.streak_extended",
  action: action(),
  autonomyMode: "auto_execute",
};

const draft = (patch: Partial<CreateAutomationRuleParams> = {}): AutomationRule =>
  createAutomationRule({ ...base, ...patch });

const live = (patch: Partial<CreateAutomationRuleParams> = {}): AutomationRule =>
  activateRule(draft(patch), { activatedByUserId: "user-1" });

describe("declaring a condition", () => {
  it("normalizes the fact it examines the way signals are named", () => {
    expect(condition({ key: "  Absence_Streak  " }).key).toBe("absence_streak");
  });

  it("trims, de-duplicates and drops blank operands", () => {
    const declared = condition({
      operator: "in",
      values: [" grade-9 ", "grade-9", "   ", "grade-10"],
    });

    expect(declared.values).toEqual(["grade-9", "grade-10"]);
  });

  it("refuses a condition that names no fact", () => {
    expect(() => condition({ key: "   " })).toThrow(EmptyConditionKeyError);
  });

  it("takes no operand for an existence check", () => {
    expect(condition({ operator: "exists", values: [] }).values).toEqual([]);
  });

  it("refuses operands on an existence check, which examines presence and nothing else", () => {
    let thrown: unknown;
    try {
      condition({ operator: "exists", values: ["yes"] });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ConditionArityError);
    expect((thrown as ConditionArityError).details).toEqual({
      operator: "exists",
      expected: "no",
      received: 1,
    });
  });

  it.each(["in", "not_in"] as const)("requires at least one operand for %s", (operator) => {
    let thrown: unknown;
    try {
      condition({ operator, values: [] });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ConditionArityError);
    expect((thrown as ConditionArityError).details).toMatchObject({
      operator,
      expected: "at least one",
    });
  });

  it.each(["equals", "not_equals", "greater_than", "less_than"] as const)(
    "requires exactly one operand for %s",
    (operator) => {
      expect(() => condition({ operator, values: [] })).toThrow(ConditionArityError);
      expect(() => condition({ operator, values: ["a", "b"] })).toThrow(ConditionArityError);
      expect(condition({ operator, values: ["a"] }).values).toEqual(["a"]);
    },
  );
});

describe("declaring what a rule would do", () => {
  it("normalizes a capability target the way the runtime catalog names one", () => {
    expect(action({ targetKey: "  Attendance.Notify_Guardian  " }).targetKey).toBe(
      "attendance.notify_guardian",
    );
  });

  it("normalizes a workflow target the way this domain names one", () => {
    const started = action({ kind: "start_workflow", targetKey: "  Absence.Escalation  " });
    expect(started.targetKey).toBe("absence.escalation");
  });

  it.each(["invoke_capability", "start_workflow"] as const)(
    "refuses a %s action that names nothing to act on",
    (kind) => {
      let thrown: unknown;
      try {
        action({ kind, targetKey: "   " });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(ActionTargetRequiredError);
      expect((thrown as ActionTargetRequiredError).details).toEqual({ kind });
    },
  );

  it("refuses a target on raising a recommendation, which acts on nothing", () => {
    let thrown: unknown;
    try {
      action({ kind: "raise_recommendation", targetKey: "attendance.notify_guardian" });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ActionTargetNotAllowedError);
    expect((thrown as ActionTargetNotAllowedError).details).toEqual({
      kind: "raise_recommendation",
    });
  });

  it("raises a recommendation with no target at all", () => {
    expect(action({ kind: "raise_recommendation", targetKey: null }).targetKey).toBeNull();
  });

  it("normalizes the compensating capability, and records its absence as absence", () => {
    expect(action({ compensationKey: "  Attendance.Clear_Flag  " }).compensationKey).toBe(
      "attendance.clear_flag",
    );
    expect(action({ compensationKey: "   " }).compensationKey).toBeNull();
  });

  it("allows a compensatable action with nothing to compensate it, so activation can explain why", () => {
    const declared = action({ reversibility: "compensatable" });
    expect(declared.reversibility).toBe("compensatable");
    expect(declared.compensationKey).toBeNull();
  });
});

describe("drafting a rule", () => {
  it("normalizes the key and the signal, and keeps the name as written", () => {
    const rule = draft({ key: "  Attendance.Followup  ", signalKey: "  Attendance.Streak  " });

    expect(rule.key).toBe("attendance.followup");
    expect(rule.signalKey).toBe("attendance.streak");
    expect(rule.name).toBe(base.name);
  });

  it("is always drafted, never born firing", () => {
    const rule = draft();

    expect(rule.status).toBe("draft");
    expect(isRuleActive(rule)).toBe(false);
    expect(rule.activatedAt).toBeNull();
    expect(rule.activatedByUserId).toBeNull();
  });

  it("refuses a rule with no key, no name or no signal", () => {
    expect(() => draft({ key: "   " })).toThrow(EmptyRuleKeyError);
    expect(() => draft({ name: "   " })).toThrow(EmptyRuleNameError);
    expect(() => draft({ signalKey: "   " })).toThrow(EmptyRuleSignalKeyError);
  });

  it("treats a blank description and a blank author as absent", () => {
    const rule = draft({ description: "   ", createdByUserId: "   " });

    expect(rule.description).toBeNull();
    expect(rule.createdByUserId).toBeNull();
  });
});

describe("changing a rule", () => {
  it("amends a draft", () => {
    const amended = amendAutomationRule(draft(), {
      name: "Notify a guardian sooner",
      autonomyMode: "auto_with_approval",
    });

    expect(amended.name).toBe("Notify a guardian sooner");
    expect(amended.autonomyMode).toBe("auto_with_approval");
  });

  it("refuses to edit a rule while it is firing", () => {
    let thrown: unknown;
    try {
      amendAutomationRule(live(), { name: "Something else" });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ActiveRuleImmutableError);
    expect((thrown as ActiveRuleImmutableError).details).toMatchObject({ status: "active" });
  });

  it("refuses to edit a retired rule, which is history rather than configuration", () => {
    expect(() => amendAutomationRule(retireRule(draft()), { name: "Revived" })).toThrow(
      ActiveRuleImmutableError,
    );
  });

  it("edits a paused rule, which is how an active rule is changed at all", () => {
    const paused = pauseRule(live());

    expect(isRuleEditable(paused)).toBe(true);
    expect(amendAutomationRule(paused, { name: "Notify two guardians" }).name).toBe(
      "Notify two guardians",
    );
  });

  it("adds and removes conditions by the fact they examine", () => {
    const withTwo = addCondition(
      addCondition(draft(), condition()),
      condition({ key: "year_group", operator: "in", values: ["grade-9"] }),
    );

    expect(ruleConditionKeys(withTwo)).toEqual(["absence_streak", "year_group"]);
    expect(ruleConditionKeys(removeConditions(withTwo, "  Year_Group  "))).toEqual([
      "absence_streak",
    ]);
  });

  it("refuses to amend a rule into having no name or no signal", () => {
    expect(() => amendAutomationRule(draft(), { name: "   " })).toThrow(EmptyRuleNameError);
    expect(() => amendAutomationRule(draft(), { signalKey: "   " })).toThrow(
      EmptyRuleSignalKeyError,
    );
  });
});

describe("activation as the gate", () => {
  it("turns on a low-risk reversible rule and records who allowed it to run", () => {
    const rule = activateRule(draft(), { activatedByUserId: " user-7 " });

    expect(rule.status).toBe("active");
    expect(rule.activatedByUserId).toBe("user-7");
    expect(rule.activatedAt).not.toBeNull();
  });

  it("refuses to turn on a rule whose action can never be undone", () => {
    let thrown: unknown;
    try {
      activateRule(draft({ action: action({ reversibility: "irreversible" }) }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnsafeAutomationRuleError);
    expect((thrown as UnsafeAutomationRuleError).details).toMatchObject({
      reasons: ["irreversible_action"],
    });
  });

  it("refuses to turn on a compensatable rule that names nothing to compensate it", () => {
    let thrown: unknown;
    try {
      activateRule(draft({ action: action({ reversibility: "compensatable" }) }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnsafeAutomationRuleError);
    expect((thrown as UnsafeAutomationRuleError).details).toMatchObject({
      reasons: ["compensation_not_declared"],
    });
  });

  it("turns on a compensatable rule once the way back is declared", () => {
    const rule = live({
      action: action({ reversibility: "compensatable", compensationKey: "attendance.clear_flag" }),
    });

    expect(rule.status).toBe("active");
  });

  it("turns on a critical irreversible rule that only raises a recommendation", () => {
    const rule = live({
      action: action({
        kind: "raise_recommendation",
        targetKey: null,
        riskLevel: "critical",
        reversibility: "irreversible",
      }),
    });

    expect(rule.status).toBe("active");
    expect(ruleAutonomyDisposition(rule)).toBe("auto_execute");
  });

  it("turns on a propose-only rule over an irreversible action, because it never carries it out", () => {
    const rule = live({
      autonomyMode: "propose_only",
      action: action({ reversibility: "irreversible" }),
    });

    expect(rule.status).toBe("active");
    expect(ruleAutonomyDisposition(rule)).toBe("requires_approval");
  });

  it("gates a high-risk rule to a human without refusing to turn it on", () => {
    const rule = live({
      action: action({ riskLevel: "high", reversibility: "reversible" }),
    });

    expect(rule.status).toBe("active");
    expect(ruleAutonomyDisposition(rule)).toBe("requires_approval");
  });

  it("refuses to turn on a rule that is already on", () => {
    let thrown: unknown;
    try {
      activateRule(live());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidRuleTransitionError);
    expect((thrown as InvalidRuleTransitionError).details).toEqual({
      from: "active",
      to: "active",
    });
  });

  it("refuses to bring a retired rule back", () => {
    expect(() => activateRule(retireRule(draft()))).toThrow(InvalidRuleTransitionError);
  });
});

describe("pausing and retiring", () => {
  it("pauses an active rule, which stops it firing without discarding it", () => {
    const paused = pauseRule(live());

    expect(paused.status).toBe("paused");
    expect(paused.pausedAt).not.toBeNull();
    expect(isRuleActive(paused)).toBe(false);
  });

  it("puts a paused rule back through the same gate", () => {
    expect(activateRule(pauseRule(live())).status).toBe("active");
  });

  it("refuses to pause a rule that is not firing", () => {
    let thrown: unknown;
    try {
      pauseRule(draft());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidRuleTransitionError);
    expect((thrown as InvalidRuleTransitionError).details).toEqual({
      from: "draft",
      to: "paused",
    });
  });

  it("retires a rule from any state, once", () => {
    expect(retireRule(draft()).status).toBe("retired");
    expect(retireRule(live()).retiredAt).not.toBeNull();
    expect(() => retireRule(retireRule(draft()))).toThrow(InvalidRuleTransitionError);
  });
});

describe("evaluating a condition against the facts", () => {
  const holds = (patch: Partial<DeclareConditionParams>, facts: Record<string, unknown>): boolean =>
    evaluateCondition(condition(patch), facts);

  it("compares equality as text, whatever the emitter's type was", () => {
    expect(holds({ operator: "equals", values: ["5"] }, { absence_streak: 5 })).toBe(true);
    expect(holds({ operator: "equals", values: ["true"] }, { absence_streak: true })).toBe(true);
    expect(holds({ operator: "equals", values: ["5"] }, { absence_streak: "6" })).toBe(false);
  });

  it("compares inequality as text", () => {
    expect(holds({ operator: "not_equals", values: ["5"] }, { absence_streak: 6 })).toBe(true);
    expect(holds({ operator: "not_equals", values: ["5"] }, { absence_streak: 5 })).toBe(false);
  });

  it("compares magnitudes numerically", () => {
    expect(holds({ operator: "greater_than", values: ["4"] }, { absence_streak: 5 })).toBe(true);
    expect(holds({ operator: "greater_than", values: ["4"] }, { absence_streak: 4 })).toBe(false);
    expect(holds({ operator: "less_than", values: ["4"] }, { absence_streak: 3 })).toBe(true);
    expect(holds({ operator: "less_than", values: ["4"] }, { absence_streak: 4 })).toBe(false);
  });

  it("fails a magnitude comparison closed when either side is not a number", () => {
    expect(holds({ operator: "greater_than", values: ["4"] }, { absence_streak: "many" })).toBe(
      false,
    );
    expect(holds({ operator: "less_than", values: ["soon"] }, { absence_streak: 3 })).toBe(false);
  });

  it("tests membership against the declared list", () => {
    const list = { operator: "in", values: ["grade-9", "grade-10"] } as const;

    expect(holds({ key: "year_group", ...list }, { year_group: "grade-9" })).toBe(true);
    expect(holds({ key: "year_group", ...list }, { year_group: "grade-11" })).toBe(false);
    expect(
      holds({ key: "year_group", operator: "not_in", values: ["grade-9"] }, { year_group: "kg" }),
    ).toBe(true);
  });

  it("tests presence, and presence alone, for an existence check", () => {
    const exists = { operator: "exists", values: [] } as const;

    expect(holds(exists, { absence_streak: 0 })).toBe(true);
    expect(holds(exists, { absence_streak: { days: 5 } })).toBe(true);
    expect(holds(exists, { absence_streak: null })).toBe(false);
    expect(holds(exists, {})).toBe(false);
  });

  it.each(["equals", "not_equals", "greater_than", "less_than", "in", "not_in"] as const)(
    "is not satisfied by a fact the signal never carried, including under %s",
    (operator) => {
      expect(holds({ operator, values: ["4"] }, {})).toBe(false);
      expect(holds({ operator, values: ["4"] }, { absence_streak: null })).toBe(false);
    },
  );

  it("does not compare a fact that is not a scalar this grammar can read", () => {
    expect(holds({ operator: "equals", values: ["5"] }, { absence_streak: { days: 5 } })).toBe(
      false,
    );
    expect(holds({ operator: "not_equals", values: ["5"] }, { absence_streak: [5] })).toBe(false);
  });

  it("matches a fact however the emitter spelled its key", () => {
    expect(holds({ operator: "equals", values: ["5"] }, { "  Absence_Streak  ": 5 })).toBe(true);
  });
});

describe("matching a signal to a rule", () => {
  const conditioned = live({
    conditions: [
      condition(),
      condition({ key: "year_group", operator: "in", values: ["grade-9", "grade-10"] }),
    ],
  });

  const facts = { absence_streak: 5, year_group: "grade-9" };

  it("matches when every condition holds", () => {
    expect(conditionsSatisfiedBy(conditioned, facts)).toBe(true);
    expect(ruleMatches(conditioned, "attendance.streak_extended", facts)).toBe(true);
  });

  it("names the conditions that did not hold", () => {
    expect(unsatisfiedConditionKeys(conditioned, { absence_streak: 2 })).toEqual([
      "absence_streak",
      "year_group",
    ]);
    expect(unsatisfiedConditionKeys(conditioned, facts)).toEqual([]);
  });

  it("matches the bare signal when a rule declares no conditions", () => {
    expect(conditionsSatisfiedBy(live(), {})).toBe(true);
  });

  it("listens for its own signal only", () => {
    expect(ruleFiresOn(conditioned, "  Attendance.Streak_Extended  ")).toBe(true);
    expect(ruleFiresOn(conditioned, "fees.instalment_missed")).toBe(false);
  });

  it("listens for nothing at all unless it is active", () => {
    expect(ruleFiresOn(draft(), "attendance.streak_extended")).toBe(false);
    expect(ruleFiresOn(pauseRule(live()), "attendance.streak_extended")).toBe(false);
    expect(ruleFiresOn(retireRule(draft()), "attendance.streak_extended")).toBe(false);
  });

  it("selects the candidate set one signal produces, in the order given", () => {
    const other = live({ key: "attendance.second", signalKey: "attendance.streak_extended" });
    const elsewhere = live({ key: "fees.chase", signalKey: "fees.instalment_missed" });

    const matched = matchingRules(
      [conditioned, draft(), other, elsewhere],
      "attendance.streak_extended",
      facts,
    );

    expect(matched.map((rule) => rule.key)).toEqual([
      "attendance.chronic_absence_followup",
      "attendance.second",
    ]);
  });
});

describe("what a firing records having looked at", () => {
  it("keeps only the facts the rule examines, never the whole signal payload", () => {
    const rule = live({ conditions: [condition()] });

    expect(observeFacts(rule, { absence_streak: 5, guardian_phone: "+91-555" })).toEqual([
      { key: "absence_streak", value: "5" },
    ]);
  });

  it("records an examined fact the signal did not carry as absent", () => {
    expect(observeFacts(live({ conditions: [condition()] }), {})).toEqual([
      { key: "absence_streak", value: null },
    ]);
  });

  it("records one entry per examined fact, however many conditions read it", () => {
    const rule = live({
      conditions: [condition(), condition({ operator: "less_than", values: ["10"] })],
    });

    expect(observeFacts(rule, { absence_streak: 5 })).toEqual([
      { key: "absence_streak", value: "5" },
    ]);
  });
});

describe("what the autonomy gate says about a rule", () => {
  it("presents the rule to the gate as the gate expects to see it", () => {
    const rule = live();

    expect(toAutomationRuleView(rule)).toEqual({
      id: rule.id,
      key: rule.key,
      status: "active",
      autonomyMode: "auto_execute",
      action: rule.action,
    });
  });

  it("reports a draft as blocked, because a draft does not fire", () => {
    const decision = classifyRuleAction(draft());

    expect(decision.disposition).toBe("blocked");
    expect(decision.reasons).toContain("rule_not_active");
  });

  it("reports the objections activation would refuse, without the draft's own status among them", () => {
    expect(ruleBlockingReasons(draft())).toEqual([]);
    expect(
      ruleBlockingReasons(draft({ action: action({ reversibility: "irreversible" }) })),
    ).toEqual(["irreversible_action"]);
  });

  it("reports how far an active rule may go on its own", () => {
    expect(ruleAutonomyDisposition(live())).toBe("auto_execute");
    expect(ruleAutonomyDisposition(live({ autonomyMode: "auto_with_approval" }))).toBe(
      "requires_approval",
    );
  });
});
