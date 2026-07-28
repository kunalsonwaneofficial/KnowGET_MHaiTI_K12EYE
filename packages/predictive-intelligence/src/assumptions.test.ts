import { describe, expect, it } from "vitest";

import type { AssumptionView } from "./forecast-view";
import {
  assumptionKeysOf,
  inspectAssumptions,
  requiresHolder,
  requiresReference,
} from "./assumptions";

const assumption = (overrides: Partial<AssumptionView> = {}): AssumptionView => ({
  assumptionKey: "fees_policy_holds",
  kind: "policy",
  basis: "declared_policy",
  holderId: null,
  reference: "policy:fee-structure-2026",
  expectedValue: null,
  ...overrides,
});

const grounded = (key: string): AssumptionView =>
  assumption({
    assumptionKey: key,
    kind: "continuity",
    basis: "observed_history",
    reference: null,
  });

const codesOf = (
  assumptions: readonly AssumptionView[],
  method: "naive" | "seasonal_naive",
): string[] => inspectAssumptions(assumptions, method).issues.map((issue) => issue.code);

describe("requiresHolder", () => {
  it("holds expert judgement to a named person", () => {
    expect(requiresHolder("expert_judgement")).toBe(true);
  });

  it("does not ask a person to stand behind observed history", () => {
    expect(requiresHolder("observed_history")).toBe(false);
    expect(requiresHolder("declared_policy")).toBe(false);
    expect(requiresHolder("upstream_forecast")).toBe(false);
  });
});

describe("requiresReference", () => {
  it("holds a policy and an upstream forecast to the record they lean on", () => {
    expect(requiresReference("declared_policy")).toBe(true);
    expect(requiresReference("upstream_forecast")).toBe(true);
  });

  it("asks for no reference where the grounds are the series itself or a person", () => {
    expect(requiresReference("observed_history")).toBe(false);
    expect(requiresReference("expert_judgement")).toBe(false);
  });
});

describe("assumptionKeysOf", () => {
  it("normalizes, de-duplicates and sorts", () => {
    const keys = assumptionKeysOf([
      grounded("Intake_Flat"),
      grounded("fees_hold"),
      grounded("INTAKE_FLAT"),
    ]);

    expect(keys).toEqual(["fees_hold", "intake_flat"]);
  });

  it("returns nothing for an empty set", () => {
    expect(assumptionKeysOf([])).toEqual([]);
  });

  it("gives the same answer whatever order the set arrives in", () => {
    const one = assumptionKeysOf([grounded("b"), grounded("a"), grounded("c")]);
    const other = assumptionKeysOf([grounded("c"), grounded("b"), grounded("a")]);

    expect(one).toEqual(other);
  });
});

describe("inspectAssumptions", () => {
  it("accepts a set that names its grounds", () => {
    const inspection = inspectAssumptions([assumption()], "linear_trend");

    expect(inspection.count).toBe(1);
    expect(inspection.complete).toBe(true);
    expect(inspection.issues).toEqual([]);
  });

  it("refuses a forecast that declares nothing at all", () => {
    const inspection = inspectAssumptions([], "naive");

    expect(inspection.complete).toBe(false);
    expect(inspection.issues).toEqual([{ code: "no_assumptions", assumptionKey: null }]);
  });

  it("names an expert judgement nobody signed", () => {
    const inspection = inspectAssumptions(
      [assumption({ basis: "expert_judgement", holderId: null, reference: null })],
      "naive",
    );

    expect(inspection.complete).toBe(false);
    expect(inspection.issues).toEqual([
      { code: "missing_holder", assumptionKey: "fees_policy_holds" },
    ]);
  });

  it("accepts an expert judgement that names its holder", () => {
    const inspection = inspectAssumptions(
      [assumption({ basis: "expert_judgement", holderId: "staff-7", reference: null })],
      "naive",
    );

    expect(inspection.complete).toBe(true);
  });

  it("treats a blank holder as no holder at all", () => {
    const inspection = inspectAssumptions(
      [assumption({ basis: "expert_judgement", holderId: "   ", reference: null })],
      "naive",
    );

    expect(inspection.issues.map((issue) => issue.code)).toEqual(["missing_holder"]);
  });

  it("names a policy assumption that cites no policy", () => {
    const inspection = inspectAssumptions([assumption({ reference: null })], "naive");

    expect(inspection.complete).toBe(false);
    expect(inspection.issues).toEqual([
      { code: "missing_reference", assumptionKey: "fees_policy_holds" },
    ]);
  });

  it("names an upstream forecast that cites no run", () => {
    const inspection = inspectAssumptions(
      [assumption({ basis: "upstream_forecast", reference: null })],
      "naive",
    );

    expect(inspection.issues.map((issue) => issue.code)).toEqual(["missing_reference"]);
  });

  it("reports a key claimed twice, once", () => {
    const inspection = inspectAssumptions(
      [grounded("intake_flat"), grounded("INTAKE_FLAT"), grounded("intake_flat")],
      "naive",
    );

    expect(inspection.complete).toBe(false);
    expect(inspection.issues).toEqual([
      { code: "duplicate_assumption_key", assumptionKey: "intake_flat" },
    ]);
  });

  it("catches a seasonal method leaning on a season nobody declared", () => {
    const inspection = inspectAssumptions([grounded("intake_flat")], "seasonal_naive");

    expect(inspection.complete).toBe(false);
    expect(inspection.issues).toEqual([{ code: "unstated_assumption", assumptionKey: null }]);
  });

  it("is satisfied once the season is declared", () => {
    const inspection = inspectAssumptions(
      [grounded("intake_flat"), assumption({ assumptionKey: "term_pattern", kind: "seasonality" })],
      "seasonal_naive",
    );

    expect(inspection.complete).toBe(true);
    expect(inspection.issues).toEqual([]);
  });

  it("catches a declared cycle under a method that is not itself seasonal", () => {
    const withCycle = inspectAssumptions([grounded("intake_flat")], "linear_trend", 12);
    const withoutCycle = inspectAssumptions([grounded("intake_flat")], "linear_trend", null);

    expect(withCycle.issues.map((issue) => issue.code)).toEqual(["unstated_assumption"]);
    expect(withoutCycle.issues).toEqual([]);
  });

  it("reports two figures of the same kind that disagree, naming both", () => {
    const inspection = inspectAssumptions(
      [
        assumption({ assumptionKey: "hall_capacity", kind: "capacity", expectedValue: 400 }),
        assumption({ assumptionKey: "block_capacity", kind: "capacity", expectedValue: 500 }),
      ],
      "naive",
    );

    expect(inspection.issues).toEqual([
      { code: "contradictory_assumptions", assumptionKey: "block_capacity" },
      { code: "contradictory_assumptions", assumptionKey: "hall_capacity" },
    ]);
  });

  it("does not block a run on a contradiction it can only suspect", () => {
    const inspection = inspectAssumptions(
      [
        assumption({ assumptionKey: "grant_a", kind: "exogenous", expectedValue: 10 }),
        assumption({ assumptionKey: "grant_b", kind: "exogenous", expectedValue: 20 }),
      ],
      "naive",
    );

    expect(inspection.complete).toBe(true);
    expect(inspection.issues.length).toBe(2);
  });

  it("sees no contradiction between two kinds quoting different figures", () => {
    const inspection = inspectAssumptions(
      [
        assumption({ assumptionKey: "hall_capacity", kind: "capacity", expectedValue: 400 }),
        assumption({ assumptionKey: "fee_rise", kind: "policy", expectedValue: 500 }),
      ],
      "naive",
    );

    expect(inspection.issues).toEqual([]);
  });

  it("sees no contradiction where the same kind agrees", () => {
    const inspection = inspectAssumptions(
      [
        assumption({ assumptionKey: "hall_capacity", kind: "capacity", expectedValue: 400 }),
        assumption({ assumptionKey: "block_capacity", kind: "capacity", expectedValue: 400 }),
      ],
      "naive",
    );

    expect(inspection.issues).toEqual([]);
  });

  it("ignores assumptions that make no quantitative claim", () => {
    const inspection = inspectAssumptions(
      [
        assumption({ assumptionKey: "a", kind: "capacity", expectedValue: null }),
        assumption({ assumptionKey: "b", kind: "capacity", expectedValue: 400 }),
      ],
      "naive",
    );

    expect(inspection.issues).toEqual([]);
  });

  it("reports every fault in one pass rather than stopping at the first", () => {
    const codes = codesOf(
      [
        assumption({ assumptionKey: "policy_a", reference: null }),
        assumption({ assumptionKey: "policy_a", reference: null }),
        assumption({ assumptionKey: "judged", basis: "expert_judgement", holderId: null }),
      ],
      "seasonal_naive",
    );

    expect(codes).toEqual([
      "duplicate_assumption_key",
      "missing_holder",
      "missing_reference",
      "missing_reference",
      "unstated_assumption",
    ]);
  });

  it("orders issues deterministically whatever order the set arrives in", () => {
    const set = [
      assumption({ assumptionKey: "zeta", reference: null }),
      assumption({ assumptionKey: "alpha", reference: null }),
    ];
    const forward = inspectAssumptions(set, "naive").issues;
    const backward = inspectAssumptions([...set].reverse(), "naive").issues;

    expect(forward).toEqual(backward);
    expect(forward.map((issue) => issue.assumptionKey)).toEqual(["alpha", "zeta"]);
  });

  it("puts a set-level issue ahead of a keyed one under the same code", () => {
    const issues = inspectAssumptions([], "seasonal_naive").issues;

    expect(issues.map((issue) => issue.code)).toEqual(["no_assumptions", "unstated_assumption"]);
  });

  it("counts what was declared, not what survived inspection", () => {
    const inspection = inspectAssumptions([grounded("a"), grounded("a"), grounded("b")], "naive");

    expect(inspection.count).toBe(3);
  });
});
