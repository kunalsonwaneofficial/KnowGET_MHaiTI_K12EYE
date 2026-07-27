import { describe, expect, it } from "vitest";
import type { Reversibility } from "./ai-value";
import type { InvocationView } from "./ai-view";
import {
  compensationPlan,
  irreversibleInvocations,
  isFullyReversible,
  reversibleShare,
} from "./rollback";

const invocation = (
  id: string,
  ordinal: number,
  patch: Partial<InvocationView> = {},
): InvocationView => ({
  id,
  stepId: `step-${id}`,
  capabilityKey: "attendance.read",
  ordinal,
  status: "succeeded",
  reversibility: "reversible" as Reversibility,
  compensationKey: null,
  ...patch,
});

const compensatable = (id: string, ordinal: number, key: string): InvocationView =>
  invocation(id, ordinal, {
    capabilityKey: key,
    reversibility: "compensatable",
    compensationKey: `${key}.undo`,
  });

describe("compensationPlan — undoing happens in reverse", () => {
  it("compensates the last thing done first", () => {
    const plan = compensationPlan([
      compensatable("i1", 1, "guardian.notify"),
      compensatable("i2", 2, "fee.invoice.issue"),
      compensatable("i3", 3, "document.share"),
    ]);
    expect(plan.steps).toEqual([
      {
        invocationId: "i3",
        capabilityKey: "document.share",
        compensationKey: "document.share.undo",
        ordinal: 1,
      },
      {
        invocationId: "i2",
        capabilityKey: "fee.invoice.issue",
        compensationKey: "fee.invoice.issue.undo",
        ordinal: 2,
      },
      {
        invocationId: "i1",
        capabilityKey: "guardian.notify",
        compensationKey: "guardian.notify.undo",
        ordinal: 3,
      },
    ]);
    expect(plan.fullyReversible).toBe(true);
    expect(plan.irreversibleInvocationIds).toEqual([]);
  });

  it("leaves reversible invocations alone — there is nothing to undo", () => {
    const plan = compensationPlan([
      invocation("i1", 1),
      compensatable("i2", 2, "guardian.notify"),
      invocation("i3", 3),
    ]);
    expect(plan.steps.map((step) => step.invocationId)).toEqual(["i2"]);
    expect(plan.fullyReversible).toBe(true);
  });

  it("only compensates invocations that actually landed", () => {
    for (const status of ["authorized", "executing", "failed", "compensated"]) {
      const plan = compensationPlan([
        compensatable("i1", 1, "guardian.notify"),
        { ...compensatable("i2", 2, "fee.invoice.issue"), status },
      ]);
      expect(plan.steps.map((step) => step.invocationId)).toEqual(["i1"]);
    }
  });

  it("reports an irreversible invocation rather than pretending to undo it", () => {
    const plan = compensationPlan([
      compensatable("i1", 1, "guardian.notify"),
      invocation("i2", 2, {
        capabilityKey: "enrolment.withdraw",
        reversibility: "irreversible",
      }),
    ]);
    expect(plan.steps.map((step) => step.invocationId)).toEqual(["i1"]);
    expect(plan.irreversibleInvocationIds).toEqual(["i2"]);
    expect(plan.fullyReversible).toBe(false);
  });

  it("treats a compensatable invocation with no compensating capability as irreversible", () => {
    const plan = compensationPlan([
      invocation("i1", 1, { reversibility: "compensatable", compensationKey: null }),
    ]);
    expect(plan.steps).toEqual([]);
    expect(plan.irreversibleInvocationIds).toEqual(["i1"]);
    expect(plan.fullyReversible).toBe(false);
  });

  it("numbers compensating steps from one, skipping the invocations it does not touch", () => {
    const plan = compensationPlan([
      compensatable("i1", 1, "a"),
      invocation("i2", 2),
      compensatable("i3", 3, "c"),
      invocation("i4", 4, { status: "failed" }),
    ]);
    expect(plan.steps.map((step) => [step.invocationId, step.ordinal])).toEqual([
      ["i3", 1],
      ["i1", 2],
    ]);
  });

  it("has nothing to do for an empty execution", () => {
    expect(compensationPlan([])).toEqual({
      steps: [],
      irreversibleInvocationIds: [],
      fullyReversible: true,
    });
  });

  it("does not mutate or reorder the invocations it was given", () => {
    const invocations = [compensatable("i1", 1, "a"), compensatable("i2", 2, "b")];
    compensationPlan(invocations);
    expect(invocations.map((entry) => entry.id)).toEqual(["i1", "i2"]);
  });
});

describe("isFullyReversible / irreversibleInvocations", () => {
  it("agrees with the plan it summarizes", () => {
    const clean = [compensatable("i1", 1, "a"), invocation("i2", 2)];
    expect(isFullyReversible(clean)).toBe(true);
    expect(irreversibleInvocations(clean)).toEqual([]);

    const blocked = [
      ...clean,
      invocation("i3", 3, { reversibility: "irreversible", capabilityKey: "enrolment.withdraw" }),
    ];
    expect(isFullyReversible(blocked)).toBe(false);
    expect(irreversibleInvocations(blocked).map((entry) => entry.id)).toEqual(["i3"]);
  });

  it("ignores an irreversible invocation that never landed", () => {
    const invocations = [
      invocation("i1", 1, { reversibility: "irreversible", status: "failed" }),
      invocation("i2", 2, { reversibility: "irreversible", status: "authorized" }),
    ];
    expect(isFullyReversible(invocations)).toBe(true);
    expect(irreversibleInvocations(invocations)).toEqual([]);
  });
});

describe("reversibleShare", () => {
  it("is the share of landed invocations that can be undone", () => {
    const invocations = [
      compensatable("i1", 1, "a"),
      invocation("i2", 2),
      invocation("i3", 3, { reversibility: "irreversible" }),
    ];
    expect(reversibleShare(invocations)).toBe(66.67);
  });

  it("is 100 when everything can be undone and 0 when nothing can", () => {
    expect(reversibleShare([compensatable("i1", 1, "a"), invocation("i2", 2)])).toBe(100);
    expect(reversibleShare([invocation("i1", 1, { reversibility: "irreversible" })])).toBe(0);
  });

  it("is 100 when nothing landed — there is nothing outstanding to undo", () => {
    expect(reversibleShare([])).toBe(100);
    expect(reversibleShare([invocation("i1", 1, { status: "authorized" })])).toBe(100);
  });
});
