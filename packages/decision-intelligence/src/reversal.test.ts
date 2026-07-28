import { describe, expect, it } from "vitest";
import {
  compensationStateFor,
  irreversibleCompletedStageKeys,
  isCompensationOutstanding,
  isFullyReversible,
  planReversal,
  requiresCompensation,
  reversalCapabilityKeys,
  reversalStepFor,
} from "./reversal";
import type { ExecutionOutcome } from "./decision-value";
import type { ActionView, StageRunView, WorkflowStageView } from "./decision-view";

type StageDef = Partial<WorkflowStageView> & { key: string };

const stage = (patch: StageDef): WorkflowStageView => ({
  ordinal: 1,
  kind: "automated_action",
  capabilityKey: "fees.charge",
  riskLevel: "low",
  reversibility: "reversible",
  compensationKey: null,
  dependsOn: [],
  slaHours: null,
  optional: false,
  ...patch,
});

/** An acting stage that can genuinely be put back: it invoked something and declares the way back. */
const compensatable = (patch: StageDef): StageDef => ({
  reversibility: "compensatable",
  compensationKey: "fees.reverse_charge",
  ...patch,
});

const flow = (...defs: readonly StageDef[]): readonly WorkflowStageView[] =>
  defs.map((def, index) => stage({ ordinal: index + 1, ...def }));

const run = (patch: Partial<StageRunView> & { stageKey: string }): StageRunView => ({
  ordinal: 1,
  status: "completed",
  startedAt: null,
  settledAt: null,
  ...patch,
});

const action = (patch: Partial<ActionView> = {}): ActionView => ({
  kind: "invoke_capability",
  targetKey: "fees.charge",
  riskLevel: "low",
  reversibility: "reversible",
  compensationKey: null,
  ...patch,
});

describe("an instance that has done nothing", () => {
  it("needs nothing undone, and says so rather than reporting a failure", () => {
    const plan = planReversal(flow({ key: "charge" }), []);
    expect(plan.steps).toEqual([]);
    expect(plan.irreversibleStageKeys).toEqual([]);
    expect(plan.fullyReversible).toBe(true);
  });

  it("reports no share, because there is no share of nothing", () => {
    expect(planReversal([], []).reversibleShare).toBe(0);
  });
});

describe("which stages a reversal reaches", () => {
  it("undoes a completed compensatable stage", () => {
    const plan = planReversal(flow(compensatable({ key: "charge" })), [
      run({ stageKey: "charge" }),
    ]);
    expect(plan.steps).toEqual([
      {
        stageKey: "charge",
        capabilityKey: "fees.charge",
        compensationKey: "fees.reverse_charge",
        ordinal: 1,
      },
    ]);
    expect(plan.fullyReversible).toBe(true);
  });

  it("leaves a reversible stage out — there is nothing to invoke, and nothing lost", () => {
    const plan = planReversal(flow({ key: "flag" }), [run({ stageKey: "flag" })]);
    expect(plan.steps).toEqual([]);
    expect(plan.fullyReversible).toBe(true);
    expect(plan.reversibleShare).toBe(100);
  });

  it("ignores a stage that never began", () => {
    const plan = planReversal(flow(compensatable({ key: "charge" })), [
      run({ stageKey: "charge", status: "pending" }),
    ]);
    expect(plan.steps).toEqual([]);
  });

  it("ignores a stage that was skipped, which did nothing to undo", () => {
    const plan = planReversal(flow(compensatable({ key: "charge" })), [
      run({ stageKey: "charge", status: "skipped" }),
    ]);
    expect(plan.steps).toEqual([]);
  });

  it("ignores a stage still running", () => {
    const plan = planReversal(flow(compensatable({ key: "charge" })), [
      run({ stageKey: "charge", status: "active" }),
    ]);
    expect(plan.steps).toEqual([]);
  });

  it("ignores a run whose stage is not in the definition it was given", () => {
    const plan = planReversal(flow(compensatable({ key: "charge" })), [run({ stageKey: "ghost" })]);
    expect(plan.steps).toEqual([]);
    expect(plan.irreversibleStageKeys).toEqual([]);
  });
});

describe("what a reversal cannot reach", () => {
  it("names an irreversible stage instead of quietly dropping it", () => {
    const plan = planReversal(flow({ key: "expel", reversibility: "irreversible" }), [
      run({ stageKey: "expel" }),
    ]);
    expect(plan.steps).toEqual([]);
    expect(plan.irreversibleStageKeys).toEqual(["expel"]);
    expect(plan.fullyReversible).toBe(false);
  });

  it("treats a compensatable stage with nothing declared as beyond reach, not as work to figure out later", () => {
    const plan = planReversal(
      flow({ key: "charge", reversibility: "compensatable", compensationKey: null }),
      [run({ stageKey: "charge" })],
    );
    expect(plan.irreversibleStageKeys).toEqual(["charge"]);
    expect(plan.fullyReversible).toBe(false);
  });

  it("cannot undo what a person did, however carefully the undo was declared", () => {
    const plan = planReversal(
      flow(compensatable({ key: "certify", kind: "human_task", capabilityKey: null })),
      [run({ stageKey: "certify" })],
    );
    expect(plan.steps).toEqual([]);
    expect(plan.irreversibleStageKeys).toEqual(["certify"]);
  });

  it("reports the reachable share when the reversal is partial", () => {
    const plan = planReversal(
      flow(
        compensatable({ key: "charge" }),
        { key: "expel", reversibility: "irreversible" },
        compensatable({ key: "notify" }),
      ),
      [run({ stageKey: "charge" }), run({ stageKey: "expel" }), run({ stageKey: "notify" })],
    );
    expect(plan.steps).toHaveLength(2);
    expect(plan.irreversibleStageKeys).toEqual(["expel"]);
    expect(plan.reversibleShare).toBe(66.67);
  });

  it("exposes the unreachable stages on their own for an operator's confirmation prompt", () => {
    expect(
      irreversibleCompletedStageKeys(flow({ key: "expel", reversibility: "irreversible" }), [
        run({ stageKey: "expel" }),
      ]),
    ).toEqual(["expel"]);
  });

  it("answers the operator's question directly", () => {
    const definition = flow({ key: "expel", reversibility: "irreversible" });
    expect(isFullyReversible(definition, [run({ stageKey: "expel" })])).toBe(false);
    expect(isFullyReversible(definition, [])).toBe(true);
  });
});

describe("the order a reversal runs in", () => {
  const definition = flow(
    compensatable({ key: "first", compensationKey: "undo.first" }),
    compensatable({ key: "second", compensationKey: "undo.second" }),
    compensatable({ key: "third", compensationKey: "undo.third" }),
  );

  it("undoes the last thing done first", () => {
    const plan = planReversal(definition, [
      run({ stageKey: "first", ordinal: 1, settledAt: "2026-03-01T09:00:00.000Z" }),
      run({ stageKey: "second", ordinal: 2, settledAt: "2026-03-01T10:00:00.000Z" }),
      run({ stageKey: "third", ordinal: 3, settledAt: "2026-03-01T11:00:00.000Z" }),
    ]);
    expect(plan.steps.map((step) => step.stageKey)).toEqual(["third", "second", "first"]);
  });

  it("follows completion order even when it disagrees with the definition order", () => {
    const plan = planReversal(definition, [
      run({ stageKey: "first", ordinal: 1, settledAt: "2026-03-01T11:00:00.000Z" }),
      run({ stageKey: "second", ordinal: 2, settledAt: "2026-03-01T09:00:00.000Z" }),
      run({ stageKey: "third", ordinal: 3, settledAt: "2026-03-01T10:00:00.000Z" }),
    ]);
    expect(plan.steps.map((step) => step.stageKey)).toEqual(["first", "third", "second"]);
  });

  it("falls back to the stage order when completion times are missing", () => {
    const plan = planReversal(definition, [
      run({ stageKey: "first", ordinal: 1 }),
      run({ stageKey: "second", ordinal: 2 }),
      run({ stageKey: "third", ordinal: 3 }),
    ]);
    expect(plan.steps.map((step) => step.stageKey)).toEqual(["third", "second", "first"]);
  });

  it("numbers the steps by the reversal, not by the flow", () => {
    const plan = planReversal(definition, [
      run({ stageKey: "first", ordinal: 1 }),
      run({ stageKey: "second", ordinal: 2 }),
      run({ stageKey: "third", ordinal: 3 }),
    ]);
    expect(plan.steps.map((step) => step.ordinal)).toEqual([1, 2, 3]);
    expect(plan.steps[0]?.stageKey).toBe("third");
  });

  it("gives the same plan for the same instance every time", () => {
    const runs = [run({ stageKey: "first", ordinal: 1 }), run({ stageKey: "second", ordinal: 2 })];
    expect(planReversal(definition, runs)).toEqual(planReversal(definition, runs));
  });
});

describe("reading a plan", () => {
  const plan = planReversal(
    flow(
      compensatable({ key: "charge", compensationKey: "fees.reverse_charge" }),
      compensatable({ key: "notify", compensationKey: "comms.retract" }),
    ),
    [run({ stageKey: "charge", ordinal: 1 }), run({ stageKey: "notify", ordinal: 2 })],
  );

  it("says whether there is any work in it", () => {
    expect(requiresCompensation(plan)).toBe(true);
    expect(requiresCompensation(planReversal([], []))).toBe(false);
  });

  it("lists the capabilities it will invoke, in the order it invokes them", () => {
    expect(reversalCapabilityKeys(plan)).toEqual(["comms.retract", "fees.reverse_charge"]);
  });

  it("does not list a capability twice when two stages share one", () => {
    const shared = planReversal(
      flow(
        compensatable({ key: "a", compensationKey: "undo.both" }),
        compensatable({ key: "b", compensationKey: "undo.both" }),
      ),
      [run({ stageKey: "a", ordinal: 1 }), run({ stageKey: "b", ordinal: 2 })],
    );
    expect(reversalCapabilityKeys(shared)).toEqual(["undo.both"]);
  });

  it("finds the step for a stage, and admits when there is none", () => {
    expect(reversalStepFor(plan, "charge")?.compensationKey).toBe("fees.reverse_charge");
    expect(reversalStepFor(plan, "expel")).toBeNull();
  });
});

describe("where an automation run stands on putting the world back", () => {
  it("owes nothing when it never started", () => {
    expect(compensationStateFor(action({ reversibility: "compensatable" }), "not_started")).toBe(
      "not_required",
    );
  });

  it("owes nothing when what it did undoes itself", () => {
    expect(compensationStateFor(action(), "succeeded")).toBe("not_required");
  });

  it.each(["succeeded", "failed", "requested"] as const satisfies readonly ExecutionOutcome[])(
    "offers compensation after a %s invocation — the capability was reached either way",
    (outcome) => {
      expect(
        compensationStateFor(
          action({ reversibility: "compensatable", compensationKey: "fees.reverse_charge" }),
          outcome,
        ),
      ).toBe("available");
    },
  );

  it("does not read a failure report as proof that nothing changed", () => {
    expect(
      compensationStateFor(
        action({ reversibility: "compensatable", compensationKey: "fees.reverse_charge" }),
        "failed",
      ),
    ).not.toBe("not_required");
  });

  it("admits an irreversible action cannot be put back", () => {
    expect(compensationStateFor(action({ reversibility: "irreversible" }), "succeeded")).toBe(
      "irreversible",
    );
  });

  it("treats an undeclared compensation as no compensation at all", () => {
    expect(
      compensationStateFor(
        action({ reversibility: "compensatable", compensationKey: null }),
        "succeeded",
      ),
    ).toBe("irreversible");
  });

  it("reports a run that has already been put back", () => {
    expect(compensationStateFor(action({ reversibility: "irreversible" }), "compensated")).toBe(
      "compensated",
    );
  });

  it("names the one state that is still an outstanding obligation", () => {
    expect(isCompensationOutstanding("available")).toBe(true);
    expect(isCompensationOutstanding("compensated")).toBe(false);
    expect(isCompensationOutstanding("not_required")).toBe(false);
    expect(isCompensationOutstanding("irreversible")).toBe(false);
  });
});
