import { describe, expect, it } from "vitest";
import {
  CHANGE_CLASSES,
  DECISION_VERDICTS,
  GATE_OUTCOMES,
  GOVERNANCE_GATES,
  MIN_REQUIRED_DECIDERS,
  REQUIRED_DECIDERS,
  type ChangeClass,
  type DecisionVerdict,
  type GateOutcome,
  type GovernanceGate,
  isAffirmativeVerdict,
} from "./evolution-value";
import type { GateBallot, GateRequest } from "./evolution-view";
import {
  MIN_DECIDERS_FOR_REVERSION,
  evaluateGate,
  isGateSettled,
  requiredDeciders,
} from "./governance";

const ballot = (deciderId: string, verdict: DecisionVerdict = "approved"): GateBallot => ({
  deciderId,
  verdict,
});

const gate = (overrides: Partial<GateRequest> = {}): GateRequest => ({
  gate: "approval",
  changeClass: "clarification",
  proposedBy: "proposer-1",
  ballots: [],
  ...overrides,
});

const approvals = (count: number): GateBallot[] =>
  Array.from({ length: count }, (_, i) => ballot(`decider-${i}`));

const codes = (issues: readonly { readonly code: string }[]): string[] =>
  issues.map((issue) => issue.code);

describe("requiredDeciders", () => {
  it("takes its count from the class of change being made", () => {
    for (const changeClass of CHANGE_CLASSES) {
      expect(requiredDeciders(changeClass, "approval")).toBe(REQUIRED_DECIDERS[changeClass]);
    }
  });

  it("never asks for nobody, whatever the class or the gate", () => {
    for (const changeClass of CHANGE_CLASSES) {
      for (const governanceGate of GOVERNANCE_GATES) {
        expect(requiredDeciders(changeClass, governanceGate)).toBeGreaterThanOrEqual(
          MIN_REQUIRED_DECIDERS,
        );
      }
    }
  });

  it("returns a whole number of people, never a fraction of one", () => {
    for (const changeClass of CHANGE_CLASSES) {
      for (const governanceGate of GOVERNANCE_GATES) {
        expect(Number.isInteger(requiredDeciders(changeClass, governanceGate))).toBe(true);
      }
    }
  });

  it("refuses to let one person undo something the institution is living with", () => {
    expect(requiredDeciders("clarification", "reversion")).toBe(MIN_DECIDERS_FOR_REVERSION);
    expect(MIN_DECIDERS_FOR_REVERSION).toBeGreaterThan(REQUIRED_DECIDERS.clarification);
  });

  it("floors a reversion without ever lowering one", () => {
    for (const changeClass of CHANGE_CLASSES) {
      const base = REQUIRED_DECIDERS[changeClass];
      const reversion = requiredDeciders(changeClass, "reversion");
      expect(reversion).toBeGreaterThanOrEqual(base);
      expect(reversion).toBeGreaterThanOrEqual(MIN_DECIDERS_FOR_REVERSION);
    }
  });

  it("still needs the full structural quorum to reverse a structural change", () => {
    expect(requiredDeciders("structural", "reversion")).toBe(REQUIRED_DECIDERS.structural);
  });

  it("leaves every gate other than reversion on the class's own count", () => {
    for (const governanceGate of GOVERNANCE_GATES) {
      if (governanceGate === "reversion") continue;
      for (const changeClass of CHANGE_CLASSES) {
        expect(requiredDeciders(changeClass, governanceGate)).toBe(REQUIRED_DECIDERS[changeClass]);
      }
    }
  });
});

describe("isGateSettled", () => {
  it("treats a pending gate as still waiting for somebody", () => {
    expect(isGateSettled("pending")).toBe(false);
  });

  it("treats both endings as endings", () => {
    expect(isGateSettled("satisfied")).toBe(true);
    expect(isGateSettled("refused")).toBe(true);
  });

  it("has an answer for every outcome in the vocabulary", () => {
    for (const outcome of GATE_OUTCOMES) {
      expect(isGateSettled(outcome)).toBeTypeOf("boolean");
    }
  });
});

describe("evaluateGate", () => {
  it("opens a clarification once the one person it needs has agreed", () => {
    const verdict = evaluateGate(gate({ ballots: approvals(1) }));
    expect(verdict.outcome).toBe("satisfied");
    expect(verdict.required).toBe(1);
    expect(verdict.affirmed).toBe(1);
    expect(verdict.outstanding).toBe(0);
    expect(verdict.issues).toEqual([]);
  });

  it("keeps a gate pending while it is short of people", () => {
    const verdict = evaluateGate(gate({ changeClass: "structural", ballots: approvals(2) }));
    expect(verdict.outcome).toBe("pending");
    expect(verdict.required).toBe(3);
    expect(verdict.affirmed).toBe(2);
    expect(verdict.outstanding).toBe(1);
  });

  it("opens nothing at all when nobody has voted", () => {
    const verdict = evaluateGate(gate());
    expect(verdict.outcome).toBe("pending");
    expect(verdict.affirmed).toBe(0);
    expect(verdict.outstanding).toBe(verdict.required);
  });

  it("carries the gate it was asked about into its answer", () => {
    for (const governanceGate of GOVERNANCE_GATES) {
      expect(evaluateGate(gate({ gate: governanceGate })).gate).toBe(governanceGate);
    }
  });

  it("lets one refusal settle a gate a majority approved", () => {
    const verdict = evaluateGate(
      gate({
        changeClass: "structural",
        ballots: [...approvals(5), ballot("dissenter", "rejected")],
      }),
    );
    expect(verdict.outcome).toBe("refused");
    expect(verdict.refused).toBe(true);
    expect(verdict.affirmed).toBe(5);
    expect(verdict.outstanding).toBe(0);
  });

  it("refuses on a rejection cast before anybody else has spoken", () => {
    const verdict = evaluateGate(gate({ ballots: [ballot("dissenter", "rejected")] }));
    expect(verdict.outcome).toBe("refused");
  });

  it("will not count the proposer's approval of their own initiative", () => {
    const verdict = evaluateGate(gate({ ballots: [ballot("proposer-1")] }));
    expect(verdict.outcome).toBe("pending");
    expect(verdict.affirmed).toBe(0);
    expect(verdict.issues).toEqual([{ code: "proposer_may_not_decide", ballotIndex: 0 }]);
  });

  it("will not let the proposer refuse their own initiative either", () => {
    const verdict = evaluateGate(
      gate({ ballots: [ballot("proposer-1", "rejected"), ...approvals(1)] }),
    );
    expect(verdict.refused).toBe(false);
    expect(verdict.outcome).toBe("satisfied");
    expect(codes(verdict.issues)).toEqual(["proposer_may_not_decide"]);
  });

  it("recognises the proposer through stray whitespace on either side", () => {
    const verdict = evaluateGate(
      gate({ proposedBy: "  proposer-1  ", ballots: [ballot(" proposer-1 ")] }),
    );
    expect(verdict.affirmed).toBe(0);
    expect(codes(verdict.issues)).toEqual(["proposer_may_not_decide"]);
  });

  it("counts a person once however many times they vote", () => {
    const verdict = evaluateGate(
      gate({
        changeClass: "structural",
        ballots: [ballot("decider-1"), ballot("decider-1"), ballot("decider-1")],
      }),
    );
    expect(verdict.affirmed).toBe(1);
    expect(codes(verdict.issues)).toEqual(["repeat_ballot", "repeat_ballot"]);
  });

  it("lets the first ballot stand, so a gate cannot be re-run until it passes", () => {
    const verdict = evaluateGate(
      gate({ ballots: [ballot("decider-1", "deferred"), ballot("decider-1", "approved")] }),
    );
    expect(verdict.affirmed).toBe(0);
    expect(verdict.deferrals).toBe(1);
    expect(verdict.outcome).toBe("pending");
  });

  it("cannot be refused by a second thought either", () => {
    const verdict = evaluateGate(
      gate({ ballots: [ballot("decider-1", "approved"), ballot("decider-1", "rejected")] }),
    );
    expect(verdict.refused).toBe(false);
    expect(verdict.outcome).toBe("satisfied");
  });

  it("throws away a ballot with nobody behind it", () => {
    const verdict = evaluateGate(gate({ ballots: [ballot("   "), ...approvals(1)] }));
    expect(verdict.affirmed).toBe(1);
    expect(verdict.issues).toEqual([{ code: "unattributed_ballot", ballotIndex: 0 }]);
  });

  it("will not let an unattributed refusal settle a gate", () => {
    const verdict = evaluateGate(gate({ ballots: [ballot("", "rejected"), ...approvals(1)] }));
    expect(verdict.refused).toBe(false);
    expect(verdict.outcome).toBe("satisfied");
  });

  it("cannot satisfy a gate whose proposer was never recorded", () => {
    const verdict = evaluateGate(gate({ proposedBy: "  ", ballots: approvals(3) }));
    expect(verdict.outcome).toBe("pending");
    expect(verdict.affirmed).toBe(3);
    expect(codes(verdict.issues)).toEqual(["unattributed_proposal"]);
  });

  it("blames the gate, not a ballot, when the proposer is missing", () => {
    const verdict = evaluateGate(gate({ proposedBy: "", ballots: approvals(1) }));
    expect(verdict.issues).toEqual([{ code: "unattributed_proposal", ballotIndex: null }]);
  });

  it("reports nought outstanding when the count is met but the safeguard cannot run", () => {
    const verdict = evaluateGate(gate({ proposedBy: "", ballots: approvals(2) }));
    expect(verdict.outstanding).toBe(0);
    expect(verdict.outcome).toBe("pending");
  });

  it("still lets a refusal settle a gate with no recorded proposer", () => {
    const verdict = evaluateGate(
      gate({ proposedBy: "", ballots: [ballot("decider-1", "rejected")] }),
    );
    expect(verdict.outcome).toBe("refused");
  });

  it("counts an approval with conditions as an approval, and says it had conditions", () => {
    const verdict = evaluateGate(
      gate({ ballots: [ballot("decider-1", "approved_with_conditions")] }),
    );
    expect(verdict.outcome).toBe("satisfied");
    expect(verdict.affirmed).toBe(1);
    expect(verdict.conditional).toBe(1);
  });

  it("leaves the conditions themselves on the record and off the verdict", () => {
    const verdict = evaluateGate(
      gate({
        changeClass: "policy",
        ballots: [ballot("decider-1"), ballot("decider-2", "approved_with_conditions")],
      }),
    );
    expect(verdict.affirmed).toBe(2);
    expect(verdict.conditional).toBe(1);
    expect(Object.keys(verdict)).not.toContain("conditions");
  });

  it("lets a deferral leave the gate open without settling it either way", () => {
    const verdict = evaluateGate(gate({ ballots: [ballot("decider-1", "deferred")] }));
    expect(verdict.outcome).toBe("pending");
    expect(verdict.affirmed).toBe(0);
    expect(verdict.refused).toBe(false);
    expect(verdict.deferrals).toBe(1);
    expect(verdict.outstanding).toBe(1);
  });

  it("does not let deferrals accumulate into agreement", () => {
    const verdict = evaluateGate(
      gate({
        ballots: [
          ballot("decider-1", "deferred"),
          ballot("decider-2", "deferred"),
          ballot("decider-3", "deferred"),
        ],
      }),
    );
    expect(verdict.outcome).toBe("pending");
    expect(verdict.deferrals).toBe(3);
  });

  it("needs three different people to agree to a structural change", () => {
    const verdict = evaluateGate(gate({ changeClass: "structural", ballots: approvals(3) }));
    expect(verdict.outcome).toBe("satisfied");
  });

  it("will not let one person supply a structural quorum by voting three times", () => {
    const verdict = evaluateGate(
      gate({
        changeClass: "structural",
        ballots: [ballot("decider-1"), ballot("decider-1"), ballot("decider-1")],
      }),
    );
    expect(verdict.outcome).toBe("pending");
    expect(verdict.outstanding).toBe(2);
  });

  it("needs two people to reverse even the smallest change", () => {
    const one = evaluateGate(
      gate({ gate: "reversion", changeClass: "clarification", ballots: approvals(1) }),
    );
    expect(one.outcome).toBe("pending");
    const two = evaluateGate(
      gate({ gate: "reversion", changeClass: "clarification", ballots: approvals(2) }),
    );
    expect(two.outcome).toBe("satisfied");
  });

  it("zeroes outstanding on every settled gate and only on settled gates", () => {
    for (const changeClass of CHANGE_CLASSES) {
      const short = evaluateGate(gate({ changeClass, ballots: [] }));
      expect(short.outstanding).toBe(short.required);
      const refusedGate = evaluateGate(
        gate({ changeClass, ballots: [ballot("decider-x", "rejected")] }),
      );
      expect(refusedGate.outstanding).toBe(0);
    }
  });

  it("reaches an outcome the vocabulary declares, for every verdict a decider can cast", () => {
    const outcomes: GateOutcome[] = [];
    for (const verdict of DECISION_VERDICTS) {
      const result = evaluateGate(gate({ ballots: [ballot("decider-1", verdict)] }));
      expect(GATE_OUTCOMES).toContain(result.outcome);
      outcomes.push(result.outcome);
    }
    expect(new Set(outcomes).size).toBeGreaterThan(1);
  });

  it("satisfies a single-decider gate on exactly the affirmative verdicts", () => {
    for (const verdict of DECISION_VERDICTS) {
      const result = evaluateGate(gate({ ballots: [ballot("decider-1", verdict)] }));
      expect(result.outcome === "satisfied").toBe(isAffirmativeVerdict(verdict));
    }
  });

  it("never affirms more people than cast countable ballots", () => {
    const ballots: GateBallot[] = [
      ballot("proposer-1"),
      ballot(""),
      ballot("decider-1"),
      ballot("decider-1"),
      ballot("decider-2", "deferred"),
    ];
    const verdict = evaluateGate(gate({ ballots }));
    expect(verdict.affirmed + verdict.deferrals).toBeLessThanOrEqual(ballots.length);
    expect(verdict.affirmed).toBe(1);
    expect(verdict.deferrals).toBe(1);
    expect(verdict.issues).toHaveLength(3);
  });

  it("points every ballot-level issue at the ballot it came from", () => {
    const verdict = evaluateGate(
      gate({ ballots: [ballot("decider-1"), ballot("proposer-1"), ballot("")] }),
    );
    expect(verdict.issues).toEqual([
      { code: "proposer_may_not_decide", ballotIndex: 1 },
      { code: "unattributed_ballot", ballotIndex: 2 },
    ]);
  });

  it("agrees with requiredDeciders on every combination of class and gate", () => {
    for (const changeClass of CHANGE_CLASSES) {
      for (const governanceGate of GOVERNANCE_GATES) {
        const request = gate({ changeClass, gate: governanceGate });
        expect(evaluateGate(request).required).toBe(requiredDeciders(changeClass, governanceGate));
      }
    }
  });

  it("opens every gate exactly when its own count of distinct people is reached", () => {
    for (const changeClass of CHANGE_CLASSES) {
      for (const governanceGate of GOVERNANCE_GATES) {
        const needed = requiredDeciders(changeClass, governanceGate);
        const short = evaluateGate(
          gate({ changeClass, gate: governanceGate, ballots: approvals(needed - 1) }),
        );
        expect(short.outcome).toBe("pending");
        const met = evaluateGate(
          gate({ changeClass, gate: governanceGate, ballots: approvals(needed) }),
        );
        expect(met.outcome).toBe("satisfied");
      }
    }
  });
});

describe("deliberate absences", () => {
  it("offers no argument that would let a gate open on nobody's agreement", () => {
    const classes: readonly ChangeClass[] = CHANGE_CLASSES;
    const gates: readonly GovernanceGate[] = GOVERNANCE_GATES;
    for (const changeClass of classes) {
      for (const governanceGate of gates) {
        expect(evaluateGate(gate({ changeClass, gate: governanceGate })).outcome).toBe("pending");
      }
    }
  });

  it("has no way to say that this particular change is urgent enough to skip the count", () => {
    const request = gate({ ballots: [] });
    expect(Object.keys(request).sort()).toEqual(["ballots", "changeClass", "gate", "proposedBy"]);
  });
});
