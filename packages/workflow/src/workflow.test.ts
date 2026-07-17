import { ValidationError } from "@knowget/exceptions";
import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "./definition";
import { IllegalTransitionError, WorkflowEngine } from "./engine";

interface LeaveData {
  readonly days: number;
  approvedBy?: string;
}

const leaveApproval: WorkflowDefinition<LeaveData> = {
  name: "leave-approval",
  initial: "submitted",
  states: [
    { name: "submitted" },
    { name: "approved", final: true },
    { name: "rejected", final: true },
    { name: "escalated" },
  ],
  transitions: [
    // Small requests can be approved directly; large ones must escalate first.
    { from: "submitted", on: "approve", to: "approved", guard: (c) => c.data.days <= 5 },
    { from: "submitted", on: "approve", to: "escalated", guard: (c) => c.data.days > 5 },
    { from: "submitted", on: "reject", to: "rejected" },
    { from: "escalated", on: "approve", to: "approved" },
    { from: "escalated", on: "reject", to: "rejected" },
  ],
};

describe("WorkflowEngine", () => {
  it("starts at the initial state", () => {
    const engine = new WorkflowEngine(leaveApproval);
    const instance = engine.start({ days: 3 });
    expect(instance.state).toBe("submitted");
    expect(instance.status).toBe("running");
  });

  it("selects the transition whose guard passes", () => {
    const engine = new WorkflowEngine(leaveApproval);
    const small = engine.send(engine.start({ days: 3 }), "approve");
    expect(small.state).toBe("approved");
    expect(small.status).toBe("completed");

    const large = engine.send(engine.start({ days: 10 }), "approve");
    expect(large.state).toBe("escalated");
    expect(large.status).toBe("running");
  });

  it("carries event data via patch and records history", () => {
    const engine = new WorkflowEngine(leaveApproval);
    const escalated = engine.send(engine.start({ days: 10 }), "approve");
    const approved = engine.send(escalated, "approve", { approvedBy: "principal" });
    expect(approved.state).toBe("approved");
    expect(approved.data.approvedBy).toBe("principal");
    expect(approved.history).toHaveLength(2);
    expect(approved.history[1]).toMatchObject({
      from: "escalated",
      to: "approved",
      event: "approve",
    });
  });

  it("reports available events and rejects illegal transitions", () => {
    const engine = new WorkflowEngine(leaveApproval);
    const start = engine.start({ days: 3 });
    expect(engine.availableEvents(start).sort()).toEqual(["approve", "reject"]);
    expect(engine.can(start, "cancel")).toBe(false);
    expect(() => engine.send(start, "cancel")).toThrow(IllegalTransitionError);
  });

  it("does not mutate the source instance", () => {
    const engine = new WorkflowEngine(leaveApproval);
    const start = engine.start({ days: 3 });
    engine.send(start, "approve");
    expect(start.state).toBe("submitted");
    expect(start.history).toHaveLength(0);
  });

  it("rejects an invalid definition", () => {
    expect(
      () =>
        new WorkflowEngine({
          name: "bad",
          initial: "nowhere",
          states: [{ name: "start" }],
          transitions: [],
        }),
    ).toThrow(ValidationError);
  });
});
