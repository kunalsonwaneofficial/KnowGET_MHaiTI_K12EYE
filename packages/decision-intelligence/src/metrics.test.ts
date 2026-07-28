import { describe, expect, it } from "vitest";
import {
  acceptanceRate,
  answeredRecommendationCount,
  autonomyRate,
  executionOutcomeCounts,
  humanGatedRate,
  recommendationStatusCounts,
  runDispositionCounts,
  summarizeDecisionOperations,
} from "./metrics";
import type { DecisionOperationsInput } from "./metrics";
import type {
  DecisionSummaryView,
  InstanceSummaryView,
  RecommendationSummaryView,
  RunSummaryView,
} from "./decision-view";

const recommendation = (
  patch: Partial<RecommendationSummaryView> & { id: string },
): RecommendationSummaryView => ({ status: "proposed", riskLevel: "low", ...patch });

const decision = (patch: Partial<DecisionSummaryView> & { id: string }): DecisionSummaryView => ({
  disposition: "approved",
  executionOutcome: "succeeded",
  ...patch,
});

const instance = (patch: Partial<InstanceSummaryView> & { id: string }): InstanceSummaryView => ({
  status: "running",
  ...patch,
});

const runOf = (patch: Partial<RunSummaryView> & { id: string }): RunSummaryView => ({
  status: "succeeded",
  disposition: "auto_execute",
  compensationState: "not_required",
  ...patch,
});

const input = (patch: Partial<DecisionOperationsInput> = {}): DecisionOperationsInput => ({
  recommendations: [],
  decisions: [],
  instances: [],
  runs: [],
  workflowCount: 0,
  ruleCount: 0,
  ...patch,
});

describe("roll-ups keep their whole vocabulary", () => {
  it("reports every recommendation status, zeros included", () => {
    expect(
      recommendationStatusCounts([
        recommendation({ id: "a" }),
        recommendation({ id: "b", status: "accepted" }),
        recommendation({ id: "c", status: "accepted" }),
      ]),
    ).toEqual([
      { key: "proposed", count: 1 },
      { key: "accepted", count: 2 },
      { key: "rejected", count: 0 },
      { key: "superseded", count: 0 },
      { key: "expired", count: 0 },
      { key: "withdrawn", count: 0 },
    ]);
  });

  it("reports every run disposition, so a chart axis does not move between refreshes", () => {
    expect(runDispositionCounts([runOf({ id: "a", disposition: "blocked" })])).toEqual([
      { key: "auto_execute", count: 0 },
      { key: "requires_approval", count: 0 },
      { key: "blocked", count: 1 },
    ]);
  });

  it("reports every execution outcome", () => {
    expect(
      executionOutcomeCounts([
        decision({ id: "a", executionOutcome: "compensated" }),
        decision({ id: "b", executionOutcome: "failed" }),
      ]),
    ).toEqual([
      { key: "not_started", count: 0 },
      { key: "requested", count: 0 },
      { key: "succeeded", count: 0 },
      { key: "failed", count: 1 },
      { key: "compensated", count: 1 },
    ]);
  });

  it("reports the vocabulary even for a tenant that has done nothing yet", () => {
    expect(recommendationStatusCounts([]).map((entry) => entry.count)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("counts nothing for a value outside the vocabulary rather than inventing a bucket", () => {
    const counts = recommendationStatusCounts([
      { id: "a", status: "half_accepted", riskLevel: "low" },
      recommendation({ id: "b", status: "accepted" }),
    ]);
    expect(counts).toHaveLength(6);
    expect(counts.map((entry) => entry.key)).not.toContain("half_accepted");
    expect(counts.reduce((total, entry) => total + entry.count, 0)).toBe(1);
  });
});

describe("acceptance is measured against what was actually answered", () => {
  it("counts only the recommendations somebody judged", () => {
    expect(
      answeredRecommendationCount([
        recommendation({ id: "a", status: "accepted" }),
        recommendation({ id: "b", status: "rejected" }),
        recommendation({ id: "c", status: "proposed" }),
        recommendation({ id: "d", status: "expired" }),
        recommendation({ id: "e", status: "superseded" }),
        recommendation({ id: "f", status: "withdrawn" }),
      ]),
    ).toBe(2);
  });

  it("divides accepted by answered", () => {
    expect(
      acceptanceRate([
        recommendation({ id: "a", status: "accepted" }),
        recommendation({ id: "b", status: "accepted" }),
        recommendation({ id: "c", status: "rejected" }),
      ]),
    ).toBe(66.67);
  });

  it("does not let an ignored recommendation read as a rejected one", () => {
    const answered = [
      recommendation({ id: "a", status: "accepted" }),
      recommendation({ id: "b", status: "rejected" }),
    ];
    const withIgnored = [
      ...answered,
      recommendation({ id: "c", status: "expired" }),
      recommendation({ id: "d", status: "proposed" }),
    ];
    expect(acceptanceRate(withIgnored)).toBe(acceptanceRate(answered));
    expect(acceptanceRate(answered)).toBe(50);
  });

  it("is zero when nothing has been answered — not an assumed agreement", () => {
    expect(acceptanceRate([recommendation({ id: "a" })])).toBe(0);
    expect(acceptanceRate([])).toBe(0);
  });
});

describe("how much the machine decided on its own", () => {
  it("counts an auto-executed decision and nothing else", () => {
    expect(
      autonomyRate([
        decision({ id: "a", disposition: "auto_executed" }),
        decision({ id: "b", disposition: "approved" }),
        decision({ id: "c", disposition: "rejected" }),
        decision({ id: "d", disposition: "deferred" }),
      ]),
    ).toBe(25);
  });

  it("does not count an approval as autonomy — a person said yes", () => {
    expect(autonomyRate([decision({ id: "a", disposition: "approved" })])).toBe(0);
  });

  it("counts an unrecognised disposition as nothing rather than as autonomy", () => {
    expect(
      autonomyRate([{ id: "a", disposition: "whatever", executionOutcome: "succeeded" }]),
    ).toBe(0);
  });

  it("is zero when nothing has been decided", () => {
    expect(autonomyRate([])).toBe(0);
  });

  it("mirrors autonomy with what the gate sent to a person", () => {
    const runs = [
      runOf({ id: "a", disposition: "auto_execute" }),
      runOf({ id: "b", disposition: "requires_approval" }),
      runOf({ id: "c", disposition: "requires_approval" }),
      runOf({ id: "d", disposition: "blocked" }),
    ];
    expect(humanGatedRate(runs)).toBe(50);
    expect(humanGatedRate([])).toBe(0);
  });

  it("does not count a blocked run as human-gated — nobody was asked", () => {
    expect(humanGatedRate([runOf({ id: "a", disposition: "blocked" })])).toBe(0);
  });
});

describe("the operations summary", () => {
  const summary = summarizeDecisionOperations(
    input({
      recommendations: [
        recommendation({ id: "r1" }),
        recommendation({ id: "r2", status: "accepted" }),
        recommendation({ id: "r3", status: "rejected" }),
      ],
      decisions: [
        decision({ id: "d1", disposition: "auto_executed" }),
        decision({ id: "d2", disposition: "approved" }),
      ],
      instances: [
        instance({ id: "i1" }),
        instance({ id: "i2", status: "completed" }),
        instance({ id: "i3", status: "cancelled" }),
      ],
      runs: [
        runOf({ id: "x1" }),
        runOf({ id: "x2", disposition: "requires_approval", status: "awaiting_approval" }),
        runOf({
          id: "x3",
          disposition: "blocked",
          status: "blocked",
          compensationState: "irreversible",
        }),
        runOf({ id: "x4", status: "compensated", compensationState: "compensated" }),
      ],
      workflowCount: 7,
      ruleCount: 4,
    }),
  );

  it("counts what was recommended and what is still waiting", () => {
    expect(summary.recommendationCount).toBe(3);
    expect(summary.openRecommendationCount).toBe(1);
  });

  it("splits decisions between the machine and the people", () => {
    expect(summary.autonomousDecisionCount).toBe(1);
    expect(summary.humanDecisionCount).toBe(1);
    expect(summary.decisionCount).toBe(2);
  });

  it("counts only the instances still running", () => {
    expect(summary.instanceCount).toBe(3);
    expect(summary.runningInstanceCount).toBe(1);
  });

  it("passes through the counts it is given rather than recomputing them", () => {
    expect(summary.workflowCount).toBe(7);
    expect(summary.ruleCount).toBe(4);
  });

  it("counts the runs the gate refused outright", () => {
    expect(summary.runCount).toBe(4);
    expect(summary.blockedRunCount).toBe(1);
  });

  it("reads compensation from whether the world was put back, not from where execution stopped", () => {
    expect(summary.compensatedRunCount).toBe(1);
  });

  it("reports the three rates that make autonomy observable", () => {
    expect(summary.acceptanceRate).toBe(50);
    expect(summary.autonomyRate).toBe(50);
    expect(summary.humanGatedRate).toBe(25);
  });

  it("carries the roll-ups whole", () => {
    expect(summary.recommendationsByStatus).toHaveLength(6);
    expect(summary.runsByDisposition).toEqual([
      { key: "auto_execute", count: 2 },
      { key: "requires_approval", count: 1 },
      { key: "blocked", count: 1 },
    ]);
  });

  it("describes a tenant that has done nothing without dividing by nothing", () => {
    expect(summarizeDecisionOperations(input())).toEqual({
      recommendationCount: 0,
      openRecommendationCount: 0,
      recommendationsByStatus: [
        { key: "proposed", count: 0 },
        { key: "accepted", count: 0 },
        { key: "rejected", count: 0 },
        { key: "superseded", count: 0 },
        { key: "expired", count: 0 },
        { key: "withdrawn", count: 0 },
      ],
      decisionCount: 0,
      autonomousDecisionCount: 0,
      humanDecisionCount: 0,
      workflowCount: 0,
      instanceCount: 0,
      runningInstanceCount: 0,
      ruleCount: 0,
      runCount: 0,
      runsByDisposition: [
        { key: "auto_execute", count: 0 },
        { key: "requires_approval", count: 0 },
        { key: "blocked", count: 0 },
      ],
      blockedRunCount: 0,
      compensatedRunCount: 0,
      acceptanceRate: 0,
      autonomyRate: 0,
      humanGatedRate: 0,
    });
  });

  it("gives the same summary for the same operations every time", () => {
    const operations = input({ recommendations: [recommendation({ id: "r1" })] });
    expect(summarizeDecisionOperations(operations)).toEqual(
      summarizeDecisionOperations(operations),
    );
  });
});
