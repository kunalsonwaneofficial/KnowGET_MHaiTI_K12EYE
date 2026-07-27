import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  type AutomationRule,
  type CreateAutomationRuleParams,
  type DeclareActionParams,
  activateRule,
  createAutomationRule,
  declareAction,
  declareCondition,
} from "./automation-rule";
import {
  type AutomationRun,
  type FireRuleParams,
  approveRun,
  beginRunExecution,
  compensateRun,
  completeRun,
  failRun,
  fireRule,
  isAutonomousRun,
  isRunAuthorized,
  isRunAwaitingApproval,
  isRunCompensationDue,
  isRunSettled,
  observedFact,
  rejectRun,
  runBlockingReasons,
  runCompensationCapabilityKey,
  toRunSummaryView,
} from "./automation-run";
import type { ActionView, RecommendationGateView } from "./decision-view";
import {
  AnonymousRunApprovalError,
  EmptyRunSubjectError,
  InvalidRunTransitionError,
  RuleNotActiveError,
  RunNotAuthorizedError,
  RunNotCompensatableError,
} from "./errors";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;

const action = (patch: Partial<DeclareActionParams> = {}): ActionView =>
  declareAction({
    kind: "invoke_capability",
    targetKey: "attendance.notify_guardian",
    riskLevel: "low",
    reversibility: "reversible",
    ...patch,
  });

/** An action that changed something and declares how to put it back. */
const compensatable = (): ActionView =>
  action({ reversibility: "compensatable", compensationKey: "attendance.clear_flag" });

const base: CreateAutomationRuleParams = {
  tenantId: TENANT,
  organizationId: ORG,
  key: "attendance.chronic_absence_followup",
  name: "Notify a guardian after a fifth consecutive absence",
  signalKey: "attendance.streak_extended",
  conditions: [
    declareCondition({ key: "absence_streak", operator: "greater_than", values: ["4"] }),
  ],
  action: action(),
  autonomyMode: "auto_execute",
};

const rule = (patch: Partial<CreateAutomationRuleParams> = {}): AutomationRule =>
  activateRule(createAutomationRule({ ...base, ...patch }), { activatedByUserId: "user-1" });

const firing: FireRuleParams = {
  subjectDomain: "attendance",
  subjectId: "student-4471",
  facts: { absence_streak: 5 },
};

const fire = (
  patch: Partial<FireRuleParams> = {},
  rulePatch: Partial<CreateAutomationRuleParams> = {},
): AutomationRun => fireRule(rule(rulePatch), { ...firing, ...patch });

const gate = (patch: Partial<RecommendationGateView> = {}): RecommendationGateView => ({
  id: "rec-1",
  status: "proposed",
  grounded: true,
  requiresHumanJudgement: false,
  ...patch,
});

/** Drive a firing to the point where the runtime has been asked to carry it out. */
const executing = (rulePatch: Partial<CreateAutomationRuleParams> = {}): AutomationRun =>
  beginRunExecution(fire({}, rulePatch), "invocation-1");

describe("firing a rule", () => {
  it("records the rule, the signal and the subject the firing acted on", () => {
    const run = fire();

    expect(run.tenantId).toBe(TENANT);
    expect(run.organizationId).toBe(ORG);
    expect(run.ruleKey).toBe("attendance.chronic_absence_followup");
    expect(run.signalKey).toBe("attendance.streak_extended");
    expect(run.subjectDomain).toBe("attendance");
    expect(run.subjectId).toBe("student-4471");
    expect(run.firedAt).not.toBeNull();
  });

  it("normalizes the subject domain and trims the subject", () => {
    const run = fire({ subjectDomain: "  Attendance  ", subjectId: "  student-4471  " });

    expect(run.subjectDomain).toBe("attendance");
    expect(run.subjectId).toBe("student-4471");
  });

  it("refuses to fire a rule that is not active", () => {
    let thrown: unknown;
    try {
      fireRule(createAutomationRule(base), firing);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RuleNotActiveError);
    expect((thrown as RuleNotActiveError).details).toMatchObject({ status: "draft" });
  });

  it("refuses a firing that names no subject", () => {
    expect(() => fire({ subjectDomain: "   " })).toThrow(EmptyRunSubjectError);
    expect(() => fire({ subjectId: "   " })).toThrow(EmptyRunSubjectError);
  });

  it("keeps only the facts the rule examined", () => {
    const run = fire({ facts: { absence_streak: 5, guardian_phone: "+91-555" } });

    expect(run.observedFacts).toEqual([{ key: "absence_streak", value: "5" }]);
    expect(observedFact(run, "  Absence_Streak  ")).toBe("5");
    expect(observedFact(run, "guardian_phone")).toBeNull();
  });

  it("snapshots the action and the mode, so a later amendment cannot rewrite what this firing did", () => {
    const run = fire();

    expect(run.action).toEqual(action());
    expect(run.autonomyMode).toBe("auto_execute");
  });
});

describe("the status a verdict is born in", () => {
  it("opens unattended when the gate raised nothing", () => {
    const run = fire();

    expect(run.disposition).toBe("auto_execute");
    expect(run.status).toBe("gated");
    expect(run.reasons).toEqual([]);
    expect(isAutonomousRun(run)).toBe(true);
    expect(isRunSettled(run)).toBe(false);
    expect(run.settledAt).toBeNull();
  });

  it("waits for a person when the gate referred the act to one", () => {
    const run = fire({}, { autonomyMode: "auto_with_approval" });

    expect(run.disposition).toBe("requires_approval");
    expect(run.status).toBe("awaiting_approval");
    expect(isRunAwaitingApproval(run)).toBe(true);
    expect(isRunAuthorized(run)).toBe(false);
  });

  it("is born settled and blocked when the gate refused outright", () => {
    const run = fire({ recommendation: gate({ grounded: false }) });

    expect(run.disposition).toBe("blocked");
    expect(run.status).toBe("blocked");
    expect(runBlockingReasons(run)).toEqual(["evidence_missing"]);
    expect(isRunSettled(run)).toBe(true);
    expect(run.settledAt).not.toBeNull();
  });

  it("blocks a firing that acts on an already-answered recommendation", () => {
    const run = fire({ recommendation: gate({ status: "rejected" }) });

    expect(run.status).toBe("blocked");
    expect(runBlockingReasons(run)).toContain("recommendation_not_open");
  });

  it("records the recommendation it acted on, and nothing when it acted on none", () => {
    expect(fire({ recommendation: gate() }).recommendationId).toBe("rec-1");
    expect(fire().recommendationId).toBeNull();
  });

  it("gates on a grounded recommendation about a subject a person must judge", () => {
    const run = fire({ recommendation: gate({ requiresHumanJudgement: true }) });

    expect(run.status).toBe("awaiting_approval");
    expect(run.reasons).toContain("subject_requires_human_judgement");
  });

  it("owes nothing to put back before anything has happened", () => {
    expect(fire({}, { action: compensatable() }).compensationState).toBe("not_required");
    expect(isRunCompensationDue(fire({}, { action: compensatable() }))).toBe(false);
  });
});

describe("the human gate", () => {
  const referred = (): AutomationRun => fire({}, { autonomyMode: "auto_with_approval" });

  it("opens on an approval that names the person who gave it", () => {
    const approved = approveRun(referred(), {
      approvedByUserId: " user-9 ",
      note: " looks right ",
    });

    expect(approved.status).toBe("gated");
    expect(approved.approvedByUserId).toBe("user-9");
    expect(approved.approvalNote).toBe("looks right");
    expect(approved.approvedAt).not.toBeNull();
    expect(isRunAuthorized(approved)).toBe(true);
  });

  it("treats a blank note as no note", () => {
    expect(
      approveRun(referred(), { approvedByUserId: "user-9", note: "   " }).approvalNote,
    ).toBeNull();
  });

  it("refuses an approval with nobody behind it", () => {
    let thrown: unknown;
    try {
      approveRun(referred(), { approvedByUserId: "   " });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AnonymousRunApprovalError);
    expect((thrown as AnonymousRunApprovalError).details).toEqual({ action: "approved" });
  });

  it("settles a rejection as blocked, with the reason and the person who declined", () => {
    const rejected = rejectRun(referred(), {
      rejectedByUserId: "user-9",
      reason: "Guardian already contacted",
    });

    expect(rejected.status).toBe("blocked");
    expect(rejected.rejectedByUserId).toBe("user-9");
    expect(rejected.rejectionReason).toBe("Guardian already contacted");
    expect(rejected.settledAt).not.toBeNull();
    expect(isRunSettled(rejected)).toBe(true);
  });

  it("refuses a rejection with nobody behind it", () => {
    let thrown: unknown;
    try {
      rejectRun(referred(), { rejectedByUserId: "   " });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AnonymousRunApprovalError);
    expect((thrown as AnonymousRunApprovalError).details).toEqual({ action: "rejected" });
  });

  it("has nothing to approve on a firing that never stopped for a person", () => {
    let thrown: unknown;
    try {
      approveRun(fire(), { approvedByUserId: "user-9" });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidRunTransitionError);
    expect((thrown as InvalidRunTransitionError).details).toEqual({ from: "gated", to: "gated" });
  });

  it("cannot be reopened once a person has declined", () => {
    const rejected = rejectRun(referred(), { rejectedByUserId: "user-9" });

    expect(() => approveRun(rejected, { approvedByUserId: "user-2" })).toThrow(
      InvalidRunTransitionError,
    );
  });
});

describe("carrying the action out", () => {
  it("asks the runtime and records what it asked for", () => {
    const run = executing();

    expect(run.status).toBe("executing");
    expect(run.executionRef).toBe("invocation-1");
    expect(run.executionRequestedAt).not.toBeNull();
  });

  it("runs an approved firing, because the person is the authorization", () => {
    const approved = approveRun(fire({}, { autonomyMode: "auto_with_approval" }), {
      approvedByUserId: "user-9",
    });

    expect(beginRunExecution(approved, "invocation-2").status).toBe("executing");
  });

  it("refuses to execute a firing that is still in front of a person", () => {
    const referred = fire({}, { autonomyMode: "auto_with_approval" });

    let thrown: unknown;
    try {
      beginRunExecution(referred, "invocation-3");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidRunTransitionError);
    expect((thrown as InvalidRunTransitionError).details).toEqual({
      from: "awaiting_approval",
      to: "executing",
    });
  });

  it("refuses to execute a firing the gate refused", () => {
    expect(() =>
      beginRunExecution(fire({ recommendation: gate({ grounded: false }) }), "invocation-4"),
    ).toThrow(InvalidRunTransitionError);
  });

  it("refuses a gated firing whose verdict never authorized it", () => {
    // A record that reached execution without the verdict that would allow it — a caller that read the
    // gate and went ahead anyway, which is exactly what this check exists to stop.
    const forged: AutomationRun = { ...fire(), disposition: "blocked" };

    let thrown: unknown;
    try {
      beginRunExecution(forged, "invocation-5");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RunNotAuthorizedError);
    expect((thrown as RunNotAuthorizedError).details).toMatchObject({ disposition: "blocked" });
  });

  it("settles as succeeded when the action was carried out", () => {
    const done = completeRun(executing());

    expect(done.status).toBe("succeeded");
    expect(done.settledAt).not.toBeNull();
    expect(isRunSettled(done)).toBe(true);
  });

  it("takes the reference the action turned out to have, keeping the earlier one otherwise", () => {
    expect(completeRun(executing(), { executionRef: " instance-7 " }).executionRef).toBe(
      "instance-7",
    );
    expect(completeRun(executing()).executionRef).toBe("invocation-1");
  });

  it("settles as failed, with the error that stopped it", () => {
    const failed = failRun(executing(), " capability unreachable ");

    expect(failed.status).toBe("failed");
    expect(failed.executionError).toBe("capability unreachable");
    expect(failed.settledAt).not.toBeNull();
  });

  it("refuses to settle a firing that was never asked for", () => {
    expect(() => completeRun(fire())).toThrow(InvalidRunTransitionError);
    expect(() => failRun(fire(), "nope")).toThrow(InvalidRunTransitionError);
  });

  it("refuses to settle a firing twice", () => {
    const done = completeRun(executing());

    expect(() => failRun(done, "too late")).toThrow(InvalidRunTransitionError);
  });
});

describe("what a firing owes putting back", () => {
  const compensating = { action: compensatable() };

  it("owes nothing for an action that changed nothing recallable", () => {
    expect(completeRun(executing()).compensationState).toBe("not_required");
    expect(isRunCompensationDue(completeRun(executing()))).toBe(false);
  });

  it("owes a rollback from the moment the capability was asked for", () => {
    const run = executing(compensating);

    expect(run.compensationState).toBe("available");
    expect(isRunCompensationDue(run)).toBe(true);
    expect(runCompensationCapabilityKey(run)).toBe("attendance.clear_flag");
  });

  it("still owes a rollback after the action succeeded", () => {
    expect(completeRun(executing(compensating)).compensationState).toBe("available");
  });

  it("still owes a rollback after the action failed, because a failure is not proof nothing changed", () => {
    const failed = failRun(executing(compensating), "timed out");

    expect(failed.status).toBe("failed");
    expect(failed.compensationState).toBe("available");
    expect(isRunCompensationDue(failed)).toBe(true);
  });

  it("names nothing to invoke when nothing is owed", () => {
    expect(runCompensationCapabilityKey(completeRun(executing()))).toBeNull();
  });
});

describe("putting a firing back", () => {
  const compensating = { action: compensatable() };

  it("compensates a failed firing, which is the case the rule exists for", () => {
    const failed = failRun(executing(compensating), "timed out");
    const compensated = compensateRun(failed, " compensation-1 ");

    expect(compensated.status).toBe("compensated");
    expect(compensated.compensationState).toBe("compensated");
    expect(compensated.compensationRef).toBe("compensation-1");
    expect(compensated.compensatedAt).not.toBeNull();
    expect(isRunCompensationDue(compensated)).toBe(false);
  });

  it("keeps the moment the firing originally settled", () => {
    const failed = failRun(executing(compensating), "timed out");

    expect(compensateRun(failed, "compensation-1").settledAt).toBe(failed.settledAt);
  });

  it("compensates a firing that succeeded and is now being undone", () => {
    const done = completeRun(executing(compensating));

    expect(compensateRun(done, "compensation-2").status).toBe("compensated");
  });

  it("refuses a rollback of something that changed nothing recallable", () => {
    const done = completeRun(executing());

    let thrown: unknown;
    try {
      compensateRun(done, "compensation-3");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RunNotCompensatableError);
    expect((thrown as RunNotCompensatableError).details).toMatchObject({
      compensationState: "not_required",
    });
  });

  it("refuses to compensate the same firing twice", () => {
    const once = compensateRun(failRun(executing(compensating), "timed out"), "compensation-1");

    expect(() => compensateRun(once, "compensation-4")).toThrow(RunNotCompensatableError);
  });

  it("refuses to pretend an unrecallable action can be put back", () => {
    // The action is forged irreversible after firing, because activation would never let such a rule run
    // unattended in the first place — this pins that the state it produces is never compensatable.
    const gated = fire();
    const unrecallable: AutomationRun = {
      ...gated,
      action: { ...gated.action, reversibility: "irreversible" },
    };
    const failed = failRun(beginRunExecution(unrecallable, "invocation-6"), "timed out");

    expect(failed.compensationState).toBe("irreversible");
    expect(() => compensateRun(failed, "compensation-5")).toThrow(RunNotCompensatableError);
  });
});

describe("what the metrics engine is shown", () => {
  it("summarizes a firing as its status, its verdict and where it stands on rollback", () => {
    const run = failRun(executing({ action: compensatable() }), "timed out");

    expect(toRunSummaryView(run)).toEqual({
      id: run.id,
      status: "failed",
      disposition: "auto_execute",
      compensationState: "available",
    });
  });
});
