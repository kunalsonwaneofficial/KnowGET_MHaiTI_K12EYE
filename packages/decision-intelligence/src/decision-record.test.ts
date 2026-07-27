import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  type DecisionRecord,
  type RecordDecisionParams,
  authorizesExecution,
  compensateDecision,
  compensationCapabilityKey,
  completeExecution,
  decideOnRecommendation,
  failExecution,
  isAutonomousDecision,
  isCompensationDue,
  isExecutionSettled,
  recordDecision,
  requestExecution,
  toDecisionSummaryView,
} from "./decision-record";
import { type Recommendation, citeEvidence, createRecommendation } from "./recommendation";
import type { ActionView } from "./decision-view";
import {
  AnonymousDecisionError,
  AutonomousDecisionAboveCeilingError,
  AutonomousDecisionHasDeciderError,
  AutonomousDecisionOnHumanSubjectError,
  AutonomousDecisionWithoutEvidenceError,
  DecisionNotCompensatableError,
  ExecutionNotAuthorizedByDecisionError,
  InvalidExecutionTransitionError,
} from "./errors";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;

/** An acting action that declares the way back — the shape an automation is allowed to take unattended. */
const action = (patch: Partial<ActionView> = {}): ActionView => ({
  kind: "invoke_capability",
  targetKey: "attendance.flag_at_risk",
  riskLevel: "low",
  reversibility: "compensatable",
  compensationKey: "attendance.clear_flag",
  ...patch,
});

const base: RecordDecisionParams = {
  tenantId: TENANT,
  organizationId: ORG,
  recommendationId: "rec-1" as Uuid,
  disposition: "approved",
  decidedByUserId: "user-1",
  confidenceAtDecision: 90,
  riskLevelAtDecision: "low",
  impactBandAtDecision: "individual",
  evidenceIds: ["ev-1"],
  action: action(),
};

const decision = (patch: Partial<RecordDecisionParams> = {}): DecisionRecord =>
  recordDecision({ ...base, ...patch });

const autonomous = (patch: Partial<RecordDecisionParams> = {}): DecisionRecord =>
  decision({ disposition: "auto_executed", decidedByUserId: null, ...patch });

const proposal = (patch: Partial<Recommendation> = {}): Recommendation => ({
  ...createRecommendation({
    tenantId: TENANT,
    organizationId: ORG,
    title: "Flag Ravi as at risk of chronic absence",
    subjectDomain: "attendance",
    subjectId: "student-4471",
    impactBand: "cohort",
    riskLevel: "low",
    evidence: [
      citeEvidence({
        source: "knowledge_graph",
        ref: "entity-attendance-4471",
        strength: "moderate",
      }),
    ],
  }),
  ...patch,
});

/** A decision that has asked the runtime to act, and therefore owes a compensation. */
const requested = (patch: Partial<RecordDecisionParams> = {}): DecisionRecord =>
  requestExecution(decision(patch), "inv-1");

describe("recording what was decided", () => {
  it("starts with nothing carried out and nothing owed", () => {
    const record = decision();
    expect(record.executionOutcome).toBe("not_started");
    expect(record.executionRef).toBeNull();
    expect(record.executionRequestedAt).toBeNull();
    expect(record.executionSettledAt).toBeNull();
    expect(record.executionError).toBeNull();
    expect(record.compensationState).toBe("not_required");
    expect(record.compensationRef).toBeNull();
    expect(record.compensatedAt).toBeNull();
  });

  it("always points at the recommendation it answers", () => {
    expect(decision().recommendationId).toBe("rec-1");
  });

  it("keeps the reasons the gate gave, and reports none rather than null when it gave none", () => {
    expect(decision().autonomyReasons).toEqual([]);
    expect(
      decision({ autonomyReasons: ["risk_exceeds_auto_execution_ceiling"] }).autonomyReasons,
    ).toEqual(["risk_exceeds_auto_execution_ceiling"]);
  });

  it("treats a blank note as no note", () => {
    expect(decision({ note: "   " }).decisionNote).toBeNull();
    expect(decision({ note: "  agreed  " }).decisionNote).toBe("agreed");
  });

  it("copies what it was handed, so a later edit to the caller's array cannot rewrite history", () => {
    const evidenceIds = ["ev-1"];
    const record = decision({ evidenceIds });
    evidenceIds.push("ev-2");
    expect(record.evidenceIds).toEqual(["ev-1"]);
  });

  it("authorizes nothing when it authorized no action", () => {
    expect(decision({ action: null }).action).toBeNull();
  });
});

describe("a decision a person took names that person", () => {
  it("refuses an approval with nobody behind it", () => {
    let thrown: unknown;
    try {
      decision({ decidedByUserId: null });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AnonymousDecisionError);
    expect((thrown as AnonymousDecisionError).details).toMatchObject({ disposition: "approved" });
    expect((thrown as AnonymousDecisionError).httpStatus).toBe(422);
  });

  it("refuses a rejection and a deferral on the same terms", () => {
    expect(() => decision({ disposition: "rejected", decidedByUserId: "   " })).toThrow(
      AnonymousDecisionError,
    );
    expect(() => decision({ disposition: "deferred", decidedByUserId: undefined })).toThrow(
      AnonymousDecisionError,
    );
  });

  it("keeps the decider trimmed", () => {
    expect(decision({ decidedByUserId: "  user-7  " }).decidedByUserId).toBe("user-7");
  });
});

describe("rule one — a decision the machine took on its own", () => {
  it("is recorded with nobody behind it, because nobody was", () => {
    const record = autonomous();
    expect(record.decidedByUserId).toBeNull();
    expect(isAutonomousDecision(record)).toBe(true);
  });

  it("refuses to put a person's name to something they never saw", () => {
    let thrown: unknown;
    try {
      autonomous({ decidedByUserId: "user-1" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AutonomousDecisionHasDeciderError);
    expect((thrown as AutonomousDecisionHasDeciderError).details).toMatchObject({
      decidedByUserId: "user-1",
    });
  });

  it("reads a whitespace-only decider as no decider rather than as a name", () => {
    expect(autonomous({ decidedByUserId: "   " }).decidedByUserId).toBeNull();
  });

  it("refuses above the auto-execution ceiling", () => {
    let thrown: unknown;
    try {
      autonomous({ riskLevelAtDecision: "medium" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AutonomousDecisionAboveCeilingError);
    expect((thrown as AutonomousDecisionAboveCeilingError).details).toEqual({
      riskLevel: "medium",
      ceiling: "low",
    });
  });

  it("applies the ceiling to the worse of the recommendation and the action", () => {
    let thrown: unknown;
    try {
      autonomous({ riskLevelAtDecision: "low", action: action({ riskLevel: "high" }) });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as AutonomousDecisionAboveCeilingError).details).toMatchObject({
      riskLevel: "high",
    });
  });

  it("allows a low-risk action on a low-risk recommendation", () => {
    expect(autonomous().disposition).toBe("auto_executed");
  });

  it("refuses on a subject that requires a person, however small the action is", () => {
    let thrown: unknown;
    try {
      autonomous({ requiresHumanJudgement: true });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AutonomousDecisionOnHumanSubjectError);
    expect((thrown as AutonomousDecisionOnHumanSubjectError).details).toMatchObject({
      recommendationId: "rec-1",
    });
  });

  it("leaves a person free to approve exactly what the machine may not", () => {
    expect(
      decision({ riskLevelAtDecision: "critical", requiresHumanJudgement: true }).disposition,
    ).toBe("approved");
  });
});

describe("rule two — a decision the machine took must carry its grounds", () => {
  it("refuses an autonomous decision with an empty evidence chain", () => {
    let thrown: unknown;
    try {
      autonomous({ evidenceIds: [] });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AutonomousDecisionWithoutEvidenceError);
    expect((thrown as AutonomousDecisionWithoutEvidenceError).details).toMatchObject({
      recommendationId: "rec-1",
    });
  });

  it("lets a person decide on grounds they are willing to own", () => {
    expect(decision({ evidenceIds: [] }).evidenceIds).toEqual([]);
  });
});

describe("deciding on a recommendation in hand", () => {
  it("snapshots what the decider was actually looking at", () => {
    const recommendation = proposal();
    const record = decideOnRecommendation(recommendation, {
      disposition: "approved",
      decidedByUserId: "user-1",
      action: action(),
    });
    expect(record.tenantId).toBe(recommendation.tenantId);
    expect(record.organizationId).toBe(recommendation.organizationId);
    expect(record.recommendationId).toBe(recommendation.id);
    expect(record.confidenceAtDecision).toBe(65);
    expect(record.riskLevelAtDecision).toBe("low");
    expect(record.impactBandAtDecision).toBe("cohort");
    expect(record.evidenceIds).toEqual(recommendation.evidence.map((piece) => piece.id));
  });

  it("does not move when the recommendation moves afterwards", () => {
    const recommendation = proposal();
    const record = decideOnRecommendation(recommendation, {
      disposition: "approved",
      decidedByUserId: "user-1",
    });
    const later = proposal({ confidence: 30 });
    expect(record.confidenceAtDecision).toBe(65);
    expect(later.confidence).toBe(30);
  });

  it("carries the recommendation's own human-judgement flag into the guard, unasked", () => {
    expect(() =>
      decideOnRecommendation(proposal({ requiresHumanJudgement: true }), {
        disposition: "auto_executed",
        decidedByUserId: null,
      }),
    ).toThrow(AutonomousDecisionOnHumanSubjectError);
  });

  it("carries the recommendation's own risk into the ceiling, unasked", () => {
    expect(() =>
      decideOnRecommendation(proposal({ riskLevel: "critical" }), {
        disposition: "auto_executed",
        decidedByUserId: null,
      }),
    ).toThrow(AutonomousDecisionAboveCeilingError);
  });
});

describe("what a decision authorizes", () => {
  it("permits an act only when it approved one", () => {
    expect(authorizesExecution(decision())).toBe(true);
    expect(authorizesExecution(autonomous())).toBe(true);
    expect(authorizesExecution(decision({ disposition: "rejected" }))).toBe(false);
    expect(authorizesExecution(decision({ disposition: "deferred" }))).toBe(false);
  });

  it("refuses to carry out what was refused", () => {
    let thrown: unknown;
    try {
      requestExecution(decision({ disposition: "rejected" }), "inv-1");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ExecutionNotAuthorizedByDecisionError);
    expect((thrown as ExecutionNotAuthorizedByDecisionError).details).toMatchObject({
      disposition: "rejected",
    });
  });

  it("refuses to carry out a judgement that named no action", () => {
    expect(() => requestExecution(decision({ action: null }), "inv-1")).toThrow(
      ExecutionNotAuthorizedByDecisionError,
    );
  });
});

describe("carrying a decision out", () => {
  it("records the invocation it was asked of, trimmed", () => {
    const record = requested();
    expect(record.executionOutcome).toBe("requested");
    expect(record.executionRef).toBe("inv-1");
    expect(record.executionRequestedAt).not.toBeNull();
  });

  it("owes a compensation from the moment it asks, not from the moment it succeeds", () => {
    expect(requested().compensationState).toBe("available");
    expect(isCompensationDue(requested())).toBe(true);
  });

  it("settles on success", () => {
    const record = completeExecution(requested());
    expect(record.executionOutcome).toBe("succeeded");
    expect(record.executionSettledAt).not.toBeNull();
    expect(isExecutionSettled(record)).toBe(true);
  });

  it("settles on failure, keeping what went wrong", () => {
    const record = failExecution(requested(), "  capability timed out  ");
    expect(record.executionOutcome).toBe("failed");
    expect(record.executionError).toBe("capability timed out");
    expect(isExecutionSettled(record)).toBe(true);
  });

  it("does not read a failure report as proof that nothing changed", () => {
    expect(failExecution(requested(), "timed out").compensationState).toBe("available");
  });

  it("refuses a transition from somewhere it is not", () => {
    let thrown: unknown;
    try {
      completeExecution(decision());
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(InvalidExecutionTransitionError);
    expect((thrown as InvalidExecutionTransitionError).details).toEqual({
      from: "not_started",
      to: "succeeded",
    });
  });

  it("refuses to ask twice", () => {
    expect(() => requestExecution(requested(), "inv-2")).toThrow(InvalidExecutionTransitionError);
  });

  it("owes nothing for an action that undoes itself", () => {
    const record = requestExecution(
      decision({ action: action({ reversibility: "reversible" }) }),
      "inv-1",
    );
    expect(record.compensationState).toBe("not_required");
    expect(isCompensationDue(record)).toBe(false);
  });

  it("admits when what was done cannot be put back", () => {
    const record = requestExecution(
      decision({ action: action({ reversibility: "irreversible" }) }),
      "inv-1",
    );
    expect(record.compensationState).toBe("irreversible");
    expect(compensationCapabilityKey(record)).toBeNull();
  });
});

describe("rule three — putting the world back", () => {
  it("names the capability that would undo it while the obligation stands", () => {
    expect(compensationCapabilityKey(requested())).toBe("attendance.clear_flag");
  });

  it("records the reversal against the invocation that performed it", () => {
    const record = compensateDecision(completeExecution(requested()), "  inv-undo-1  ");
    expect(record.executionOutcome).toBe("compensated");
    expect(record.compensationState).toBe("compensated");
    expect(record.compensationRef).toBe("inv-undo-1");
    expect(record.compensatedAt).not.toBeNull();
    expect(isCompensationDue(record)).toBe(false);
  });

  it("can put back a failed invocation, because a failure is not proof of no change", () => {
    expect(
      compensateDecision(failExecution(requested(), "timed out"), "inv-undo-1").compensationState,
    ).toBe("compensated");
  });

  it("refuses to claim a reversal that was never owed", () => {
    let thrown: unknown;
    try {
      compensateDecision(decision(), "inv-undo-1");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(DecisionNotCompensatableError);
    expect((thrown as DecisionNotCompensatableError).details).toMatchObject({
      compensationState: "not_required",
    });
    expect((thrown as DecisionNotCompensatableError).httpStatus).toBe(409);
  });

  it("refuses to claim a reversal of something irreversible", () => {
    const record = requestExecution(
      decision({ action: action({ reversibility: "irreversible" }) }),
      "inv-1",
    );
    expect(() => compensateDecision(record, "inv-undo-1")).toThrow(DecisionNotCompensatableError);
  });

  it("refuses to record the same reversal twice", () => {
    const compensated = compensateDecision(requested(), "inv-undo-1");
    expect(() => compensateDecision(compensated, "inv-undo-2")).toThrow(
      DecisionNotCompensatableError,
    );
  });
});

describe("reading a decision", () => {
  it("says whether execution has stopped moving", () => {
    expect(isExecutionSettled(decision())).toBe(false);
    expect(isExecutionSettled(requested())).toBe(false);
    expect(isExecutionSettled(compensateDecision(requested(), "inv-undo-1"))).toBe(true);
  });

  it("gives the metrics engine the disposition and the outcome, not the grounds", () => {
    const record = requested();
    expect(toDecisionSummaryView(record)).toEqual({
      id: record.id,
      disposition: "approved",
      executionOutcome: "requested",
    });
  });
});
