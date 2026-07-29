import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  BlankDecisionConditionError,
  ConditionsNotPermittedError,
  ConditionsRequiredError,
  DecisionRationaleLengthError,
  GateAlreadySettledError,
  ProposerMayNotDecideError,
  RepeatBallotError,
  UnattributedBallotError,
  UnattributedProposalError,
} from "./errors";
import {
  MAX_DECISION_CONDITIONS,
  MAX_RATIONALE_LENGTH,
  MIN_RATIONALE_LENGTH,
  REQUIRED_DECIDERS,
} from "./evolution-value";
import { MIN_DECIDERS_FOR_REVERSION } from "./governance";
import {
  type CastBallotParams,
  type ConvokeGateParams,
  type GovernanceDecision,
  castBallot,
  convokeGate,
  decisionConditions,
  gateStanding,
  isDecisionSatisfied,
  isDecisionSettled,
} from "./governance-decision";
import * as decisionModule from "./governance-decision";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const INITIATIVE = "initiative-1" as Uuid;
const PROPOSER = "person-1" as Uuid;
const CONVENER = "person-2" as Uuid;

const RATIONALE = "The two-week turnaround is achievable at the current marking load.";

const convocation = (overrides: Partial<ConvokeGateParams> = {}): ConvokeGateParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  initiativeId: INITIATIVE,
  gate: "approval",
  changeClass: "policy",
  proposedBy: PROPOSER,
  convokedBy: CONVENER,
  ...overrides,
});

const gate = (overrides: Partial<ConvokeGateParams> = {}): GovernanceDecision =>
  convokeGate(convocation(overrides));

const cast = (
  decision: GovernanceDecision,
  deciderId: string,
  overrides: Partial<CastBallotParams> = {},
): GovernanceDecision =>
  castBallot(decision, {
    deciderId: deciderId as Uuid,
    verdict: "approved",
    rationale: RATIONALE,
    conditions: [],
    ...overrides,
  });

/** A policy change needs two people, so this is the smallest gate the fixtures can actually open. */
const opened = (): GovernanceDecision => cast(cast(gate(), "person-3"), "person-4");

describe("convokeGate", () => {
  it("opens a gate nobody has answered yet", () => {
    const decision = gate();
    expect(decision.outcome).toBe("pending");
    expect(decision.ballots).toEqual([]);
    expect(decision.settledAt).toBeNull();
    expect(decision.refused).toBe(false);
  });

  it("derives the quorum from the change class rather than being told it", () => {
    expect(gate({ changeClass: "policy" }).required).toBe(REQUIRED_DECIDERS.policy);
    expect(gate({ changeClass: "structural" }).required).toBe(REQUIRED_DECIDERS.structural);
  });

  it("never opens a gate that one person's silence would satisfy", () => {
    for (const changeClass of ["clarification", "process", "policy", "structural"] as const) {
      expect(gate({ changeClass }).required).toBeGreaterThanOrEqual(1);
    }
  });

  it("holds a reversion to more than one person however small the change is called", () => {
    const reversion = gate({ gate: "reversion", changeClass: "clarification" });
    expect(reversion.required).toBe(MIN_DECIDERS_FOR_REVERSION);
    expect(reversion.required).toBeGreaterThan(REQUIRED_DECIDERS.clarification);
  });

  it("copies the class and the proposer on, so the quorum it faced needs no join to read", () => {
    const decision = gate({ changeClass: "structural" });
    expect(decision.changeClass).toBe("structural");
    expect(decision.proposedBy).toBe(PROPOSER);
    expect(decision.initiativeId).toBe(INITIATIVE);
  });

  it("reports how many more people are needed before anybody has spoken", () => {
    expect(gate({ changeClass: "structural" }).outstanding).toBe(REQUIRED_DECIDERS.structural);
  });

  it("refuses a gate with no recorded proposer, rather than opening one that can never satisfy", () => {
    expect(() => gate({ proposedBy: "" as Uuid })).toThrow(UnattributedProposalError);
    expect(() => gate({ proposedBy: "   " as Uuid })).toThrow(UnattributedProposalError);
  });

  it("lets an automated step convene a gate, since convening decides nothing", () => {
    expect(gate({ convokedBy: null }).convokedBy).toBeNull();
  });

  it("stamps when it was convened", () => {
    const decision = gate();
    expect(decision.convokedAt).toBe(decision.createdAt);
    expect(decision.updatedAt).toBe(decision.createdAt);
  });
});

describe("casting ballots", () => {
  it("records who spoke, what they said and why", () => {
    const decision = cast(gate(), "person-3");
    const [ballot] = decision.ballots;
    expect(decision.ballots).toHaveLength(1);
    expect(ballot!.deciderId).toBe("person-3");
    expect(ballot!.verdict).toBe("approved");
    expect(ballot!.rationale).toBe(RATIONALE);
    expect(ballot!.castAt).toBe(decision.updatedAt);
  });

  it("counts an approval towards the quorum and says how many are still wanted", () => {
    const decision = cast(gate(), "person-3");
    expect(decision.affirmed).toBe(1);
    expect(decision.outstanding).toBe(1);
    expect(decision.outcome).toBe("pending");
  });

  it("opens the gate once enough distinct people have agreed", () => {
    const decision = opened();
    expect(decision.outcome).toBe("satisfied");
    expect(decision.affirmed).toBe(REQUIRED_DECIDERS.policy);
    expect(decision.outstanding).toBe(0);
  });

  it("keeps the ballots in the order they were cast", () => {
    const decision = cast(cast(gate({ changeClass: "structural" }), "person-3"), "person-4");
    expect(decision.ballots.map((ballot) => ballot.deciderId)).toEqual(["person-3", "person-4"]);
  });

  it("leaves a deferral sitting on the record without settling anything", () => {
    const decision = cast(gate(), "person-3", { verdict: "deferred" });
    expect(decision.deferrals).toBe(1);
    expect(decision.affirmed).toBe(0);
    expect(decision.outcome).toBe("pending");
  });

  it("trims the rationale rather than storing the whitespace somebody pasted", () => {
    const decision = cast(gate(), "person-3", { rationale: `  ${RATIONALE}  ` });
    expect(decision.ballots[0]!.rationale).toBe(RATIONALE);
  });

  it("settles against a refusal however many people approved", () => {
    const decision = cast(
      cast(cast(gate({ changeClass: "structural" }), "person-3"), "person-4"),
      "person-5",
      { verdict: "rejected" },
    );
    expect(decision.affirmed).toBe(2);
    expect(decision.refused).toBe(true);
    expect(decision.outcome).toBe("refused");
    expect(decision.outstanding).toBe(0);
  });
});

describe("the quorum rule", () => {
  it("refuses the proposer's own ballot rather than counting it and discounting it", () => {
    expect(() => cast(gate(), PROPOSER)).toThrow(ProposerMayNotDecideError);
  });

  it("is not defeated by padding the proposer's id", () => {
    expect(() => cast(gate(), ` ${PROPOSER} `)).toThrow(ProposerMayNotDecideError);
  });

  it("refuses a second ballot from somebody already counted", () => {
    expect(() => cast(cast(gate(), "person-3"), "person-3")).toThrow(RepeatBallotError);
  });

  it("refuses the repeat whichever way the person changed their mind", () => {
    const decision = cast(gate(), "person-3");
    expect(() => cast(decision, "person-3", { verdict: "rejected" })).toThrow(RepeatBallotError);
  });

  it("refuses a ballot with nobody behind it, because a quorum counts people", () => {
    expect(() => cast(gate(), "")).toThrow(UnattributedBallotError);
    expect(() => cast(gate(), "   ")).toThrow(UnattributedBallotError);
  });

  it("never lets one person's repeated agreement stand in for a quorum", () => {
    const decision = cast(gate({ changeClass: "structural" }), "person-3");
    expect(() => cast(decision, "person-3")).toThrow(RepeatBallotError);
    expect(decision.affirmed).toBe(1);
    expect(decision.outcome).toBe("pending");
  });
});

describe("rationale", () => {
  it("refuses a reason too short to be one", () => {
    expect(() => cast(gate(), "person-3", { rationale: "ok" })).toThrow(
      DecisionRationaleLengthError,
    );
  });

  it("counts the reason after trimming, so padding does not buy length", () => {
    const padded = `  ${"x".repeat(MIN_RATIONALE_LENGTH - 1)}  `;
    expect(() => cast(gate(), "person-3", { rationale: padded })).toThrow(
      DecisionRationaleLengthError,
    );
  });

  it("refuses a reason nobody will read to the end of", () => {
    const essay = "x".repeat(MAX_RATIONALE_LENGTH + 1);
    expect(() => cast(gate(), "person-3", { rationale: essay })).toThrow(
      DecisionRationaleLengthError,
    );
  });

  it("names the closed gate before the short reason, because the reason no longer matters", () => {
    expect(() => cast(opened(), "person-5", { rationale: "no" })).toThrow(GateAlreadySettledError);
  });
});

describe("conditions", () => {
  it("refuses a conditional approval that states no condition", () => {
    expect(() => cast(gate(), "person-3", { verdict: "approved_with_conditions" })).toThrow(
      ConditionsRequiredError,
    );
  });

  it("refuses conditions on a plain approval", () => {
    expect(() => cast(gate(), "person-3", { conditions: ["Review after one term."] })).toThrow(
      ConditionsNotPermittedError,
    );
  });

  it("refuses conditions on a rejection, where they read as terms nobody agreed", () => {
    expect(() =>
      cast(gate(), "person-3", { verdict: "rejected", conditions: ["Review after one term."] }),
    ).toThrow(ConditionsNotPermittedError);
  });

  it("says the conditions do not belong here before it says one of them is blank", () => {
    expect(() => cast(gate(), "person-3", { verdict: "rejected", conditions: ["  "] })).toThrow(
      ConditionsNotPermittedError,
    );
  });

  it("refuses a blank condition and names which one", () => {
    expect(() =>
      cast(gate(), "person-3", {
        verdict: "approved_with_conditions",
        conditions: ["Review after one term.", "   "],
      }),
    ).toThrow(BlankDecisionConditionError);
  });

  it("refuses a list of obligations too long for anybody to be held to", () => {
    const many = Array.from({ length: MAX_DECISION_CONDITIONS + 1 }, (_, i) => `Condition ${i}.`);
    expect(() =>
      cast(gate(), "person-3", { verdict: "approved_with_conditions", conditions: many }),
    ).toThrow(/at most/);
  });

  it("counts a conditional approval towards the quorum and reports that it was qualified", () => {
    const decision = cast(gate(), "person-3", {
      verdict: "approved_with_conditions",
      conditions: ["  Review after one term.  "],
    });
    expect(decision.affirmed).toBe(1);
    expect(decision.conditional).toBe(1);
    expect(decision.ballots[0]!.conditions).toEqual(["Review after one term."]);
  });

  it("gathers every term the institution agreed to in order to get the change through", () => {
    const decision = cast(
      cast(gate(), "person-3", {
        verdict: "approved_with_conditions",
        conditions: ["Review after one term."],
      }),
      "person-4",
      { verdict: "approved_with_conditions", conditions: ["Publish the marking load."] },
    );
    expect(decisionConditions(decision)).toEqual([
      "Review after one term.",
      "Publish the marking load.",
    ]);
  });

  it("gathers nothing from a gate where nobody attached anything", () => {
    expect(decisionConditions(opened())).toEqual([]);
  });
});

describe("settling", () => {
  it("stamps the moment the gate opened", () => {
    const decision = opened();
    expect(decision.settledAt).toBe(decision.updatedAt);
  });

  it("leaves the stamp empty while the gate is still open", () => {
    expect(cast(gate(), "person-3").settledAt).toBeNull();
  });

  it("refuses a ballot arriving after the gate opened", () => {
    expect(() => cast(opened(), "person-5")).toThrow(GateAlreadySettledError);
  });

  it("refuses a ballot arriving after the gate was refused", () => {
    const refused = cast(gate(), "person-3", { verdict: "rejected" });
    expect(() => cast(refused, "person-4")).toThrow(GateAlreadySettledError);
  });

  it("refuses a late refusal too, since it cannot have contributed to what was decided", () => {
    expect(() => cast(opened(), "person-5", { verdict: "rejected" })).toThrow(
      GateAlreadySettledError,
    );
  });

  it("stops asking for anybody once a single refusal has settled it", () => {
    const refused = cast(gate({ changeClass: "structural" }), "person-3", { verdict: "rejected" });
    expect(refused.outstanding).toBe(0);
    expect(isDecisionSettled(refused)).toBe(true);
    expect(isDecisionSatisfied(refused)).toBe(false);
  });
});

describe("reading", () => {
  it("reports the gate in the engine's own shape, from what was recorded", () => {
    const decision = opened();
    expect(gateStanding(decision)).toEqual({
      gate: "approval",
      outcome: "satisfied",
      required: REQUIRED_DECIDERS.policy,
      affirmed: REQUIRED_DECIDERS.policy,
      outstanding: 0,
      conditional: 0,
      refused: false,
      deferrals: 0,
      issues: [],
    });
  });

  it("never carries a ballot issue, because no ballot that has one can be stored", () => {
    const decision = cast(gate(), "person-3", { verdict: "deferred" });
    expect(() => cast(decision, PROPOSER)).toThrow(ProposerMayNotDecideError);
    expect(() => cast(decision, "person-3")).toThrow(RepeatBallotError);
    expect(gateStanding(decision).issues).toEqual([]);
  });

  it("tells a pending gate from a settled one", () => {
    expect(isDecisionSettled(gate())).toBe(false);
    expect(isDecisionSettled(cast(gate(), "person-3"))).toBe(false);
    expect(isDecisionSettled(opened())).toBe(true);
  });

  it("tells a gate that opened from one that merely finished", () => {
    expect(isDecisionSatisfied(opened())).toBe(true);
    expect(isDecisionSatisfied(cast(gate(), "person-3", { verdict: "rejected" }))).toBe(false);
    expect(isDecisionSatisfied(gate())).toBe(false);
  });
});

describe("deliberate absences", () => {
  it("publishes exactly the surface a gate has and nothing more", () => {
    expect(Object.keys(decisionModule).sort()).toEqual([
      "castBallot",
      "convokeGate",
      "decisionConditions",
      "gateStanding",
      "isDecisionSatisfied",
      "isDecisionSettled",
    ]);
  });

  it("offers no way to reopen, abandon or discard a gate", () => {
    const names = Object.keys(decisionModule).join(" ").toLowerCase();
    for (const forbidden of ["reopen", "abandon", "cancel", "delete", "withdraw", "reset"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("offers no way to set an outcome by hand", () => {
    const names = Object.keys(decisionModule).join(" ").toLowerCase();
    for (const forbidden of ["setoutcome", "satisfygate", "approvegate", "overrid", "force"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("mutates nothing it was given", () => {
    const decision = cast(gate(), "person-3");
    const before = JSON.stringify(decision);
    cast(decision, "person-4");
    expect(() => cast(decision, "person-3")).toThrow(RepeatBallotError);
    expect(JSON.stringify(decision)).toBe(before);
  });
});
