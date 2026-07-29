import { describe, expect, it } from "vitest";
import {
  GATE_OUTCOMES,
  INITIATIVE_STATUSES,
  type InitiativeStatus,
  MIN_PILOT_PERIODS,
  TERMINAL_INITIATIVE_STATUSES,
  isInitiativeStatus,
  isTerminalInitiativeStatus,
} from "./evolution-value";
import type { AdvanceRequest } from "./evolution-view";
import { INITIATIVE_PROGRESSIONS, inspectAdvance, requiredInitiativeGate } from "./lifecycle";

const advance = (overrides: Partial<AdvanceRequest> = {}): AdvanceRequest => ({
  from: "draft",
  to: "submitted",
  gateOutcome: null,
  pilotPeriods: 0,
  ...overrides,
});

const nonTerminal = INITIATIVE_STATUSES.filter((status) => !isTerminalInitiativeStatus(status));

describe("INITIATIVE_PROGRESSIONS", () => {
  it("declares a target list for every status in the vocabulary", () => {
    for (const status of INITIATIVE_STATUSES) {
      expect(Array.isArray(INITIATIVE_PROGRESSIONS[status])).toBe(true);
    }
  });

  it("never reaches a status outside the vocabulary", () => {
    for (const status of INITIATIVE_STATUSES) {
      for (const target of INITIATIVE_PROGRESSIONS[status]) {
        expect(isInitiativeStatus(target)).toBe(true);
      }
    }
  });

  it("gives every terminal status an empty target list and no others", () => {
    for (const status of INITIATIVE_STATUSES) {
      const terminal = INITIATIVE_PROGRESSIONS[status].length === 0;
      expect(terminal).toBe(TERMINAL_INITIATIVE_STATUSES.includes(status));
    }
  });

  it("offers withdrawal from every state an initiative can still be in", () => {
    for (const status of nonTerminal) {
      expect(INITIATIVE_PROGRESSIONS[status]).toContain("withdrawn");
    }
  });

  it("offers no route back into draft, because a reconsidered change is a new proposal", () => {
    const reachable = new Set(INITIATIVE_STATUSES.flatMap((s) => INITIATIVE_PROGRESSIONS[s]));
    expect(reachable.has("draft")).toBe(false);
  });

  it("reaches approved only from under_review and adopted only from piloting", () => {
    const into = (target: InitiativeStatus): InitiativeStatus[] =>
      INITIATIVE_STATUSES.filter((s) => INITIATIVE_PROGRESSIONS[s].includes(target));
    expect(into("approved")).toEqual(["under_review"]);
    expect(into("adopted")).toEqual(["piloting"]);
  });

  it("is frozen at both levels, so the gates cannot be removed at runtime", () => {
    expect(Object.isFrozen(INITIATIVE_PROGRESSIONS)).toBe(true);
    for (const status of INITIATIVE_STATUSES) {
      expect(Object.isFrozen(INITIATIVE_PROGRESSIONS[status])).toBe(true);
    }
    expect(() => (INITIATIVE_PROGRESSIONS.draft as InitiativeStatus[]).push("adopted")).toThrow(
      TypeError,
    );
  });
});

describe("requiredInitiativeGate", () => {
  it("puts the approval gate in front of approved", () => {
    expect(requiredInitiativeGate("under_review", "approved")).toBe("approval");
  });

  it("puts the pilot-exit gate in front of adopted", () => {
    expect(requiredInitiativeGate("piloting", "adopted")).toBe("pilot_exit");
  });

  it("gates exactly two moves out of the whole cross-product", () => {
    const gated: string[] = [];
    for (const from of INITIATIVE_STATUSES) {
      for (const to of INITIATIVE_STATUSES) {
        const gate = requiredInitiativeGate(from, to);
        if (gate !== null) gated.push(`${from}->${to}:${gate}`);
      }
    }
    expect(gated).toEqual(["under_review->approved:approval", "piloting->adopted:pilot_exit"]);
  });

  it("asks nobody's permission to withdraw", () => {
    for (const from of nonTerminal) {
      expect(requiredInitiativeGate(from, "withdrawn")).toBeNull();
    }
  });

  it("does not make rejection a second quorum", () => {
    expect(requiredInitiativeGate("under_review", "rejected")).toBeNull();
  });
});

describe("inspectAdvance", () => {
  it("allows an ordinary ungated step", () => {
    const verdict = inspectAdvance(advance());
    expect(verdict.allowed).toBe(true);
    expect(verdict.gate).toBeNull();
    expect(verdict.refusal).toBeNull();
  });

  it("refuses a move to the status the initiative is already in", () => {
    expect(inspectAdvance(advance({ from: "draft", to: "draft" })).refusal).toBe("same_status");
  });

  it("refuses any move out of a settled initiative", () => {
    for (const from of TERMINAL_INITIATIVE_STATUSES) {
      const verdict = inspectAdvance(advance({ from, to: "submitted" }));
      expect(verdict.allowed).toBe(false);
      expect(verdict.refusal).toBe("terminal_status");
    }
  });

  it("refuses a move that skips the steps in between", () => {
    expect(inspectAdvance(advance({ from: "draft", to: "approved" })).refusal).toBe(
      "unreachable_status",
    );
    expect(inspectAdvance(advance({ from: "draft", to: "adopted" })).refusal).toBe(
      "unreachable_status",
    );
    expect(inspectAdvance(advance({ from: "submitted", to: "piloting" })).refusal).toBe(
      "unreachable_status",
    );
  });

  it("refuses to adopt a change whose pilot has not completed a period", () => {
    const verdict = inspectAdvance(
      advance({
        from: "piloting",
        to: "adopted",
        gateOutcome: "satisfied",
        pilotPeriods: MIN_PILOT_PERIODS - 1,
      }),
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.refusal).toBe("pilot_too_short");
  });

  it("adopts once the pilot has run and the gate is satisfied", () => {
    const verdict = inspectAdvance(
      advance({
        from: "piloting",
        to: "adopted",
        gateOutcome: "satisfied",
        pilotPeriods: MIN_PILOT_PERIODS,
      }),
    );
    expect(verdict.allowed).toBe(true);
    expect(verdict.gate).toBe("pilot_exit");
  });

  it("names the pilot before the gate when both are missing, because the pilot comes first", () => {
    const verdict = inspectAdvance(
      advance({ from: "piloting", to: "adopted", gateOutcome: null, pilotPeriods: 0 }),
    );
    expect(verdict.refusal).toBe("pilot_too_short");
  });

  it("distinguishes a gate nobody convened from one that has not finished", () => {
    const base = { from: "under_review", to: "approved" } as const;
    expect(inspectAdvance(advance({ ...base, gateOutcome: null })).refusal).toBe("gate_missing");
    expect(inspectAdvance(advance({ ...base, gateOutcome: "pending" })).refusal).toBe(
      "gate_pending",
    );
  });

  it("distinguishes a refused gate, which has no remedy on this initiative", () => {
    const verdict = inspectAdvance(
      advance({ from: "under_review", to: "approved", gateOutcome: "refused" }),
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.refusal).toBe("gate_refused");
  });

  it("approves once the approval gate is satisfied", () => {
    const verdict = inspectAdvance(
      advance({ from: "under_review", to: "approved", gateOutcome: "satisfied" }),
    );
    expect(verdict.allowed).toBe(true);
    expect(verdict.gate).toBe("approval");
    expect(verdict.refusal).toBeNull();
  });

  it("reports the gate a refused move was standing on, not just the refusal", () => {
    for (const outcome of GATE_OUTCOMES) {
      const verdict = inspectAdvance(
        advance({ from: "under_review", to: "approved", gateOutcome: outcome }),
      );
      expect(verdict.gate).toBe("approval");
    }
  });

  it("ignores the pilot count on moves that are not adoption", () => {
    const verdict = inspectAdvance(advance({ from: "approved", to: "piloting", pilotPeriods: 0 }));
    expect(verdict.allowed).toBe(true);
  });

  it("ignores a gate outcome on moves that need no gate", () => {
    const verdict = inspectAdvance(
      advance({ from: "draft", to: "submitted", gateOutcome: "refused" }),
    );
    expect(verdict.allowed).toBe(true);
    expect(verdict.gate).toBeNull();
  });

  it("lets a proposer withdraw from anywhere without a gate or a pilot", () => {
    for (const from of nonTerminal) {
      const verdict = inspectAdvance(advance({ from, to: "withdrawn" }));
      expect(verdict.allowed).toBe(true);
      expect(verdict.gate).toBeNull();
    }
  });

  it("records a rejection without asking for a second quorum", () => {
    const verdict = inspectAdvance(advance({ from: "under_review", to: "rejected" }));
    expect(verdict.allowed).toBe(true);
    expect(verdict.gate).toBeNull();
  });

  it("echoes the move it was asked about on every verdict", () => {
    const verdict = inspectAdvance(advance({ from: "submitted", to: "adopted" }));
    expect(verdict.from).toBe("submitted");
    expect(verdict.to).toBe("adopted");
  });

  it("allows nothing the progression map does not, across the whole cross-product", () => {
    for (const from of INITIATIVE_STATUSES) {
      for (const to of INITIATIVE_STATUSES) {
        const verdict = inspectAdvance(
          advance({ from, to, gateOutcome: "satisfied", pilotPeriods: MIN_PILOT_PERIODS }),
        );
        expect(verdict.allowed).toBe(INITIATIVE_PROGRESSIONS[from].includes(to));
      }
    }
  });
});

describe("deliberate absences", () => {
  it("offers no way out of adopted, because undoing a change is a new initiative", () => {
    expect(INITIATIVE_PROGRESSIONS.adopted).toEqual([]);
    for (const to of INITIATIVE_STATUSES) {
      expect(inspectAdvance(advance({ from: "adopted", to })).allowed).toBe(false);
    }
  });

  it("provides no way to reach adopted without a satisfied pilot-exit gate", () => {
    for (const outcome of GATE_OUTCOMES) {
      const verdict = inspectAdvance(
        advance({
          from: "piloting",
          to: "adopted",
          gateOutcome: outcome,
          pilotPeriods: MIN_PILOT_PERIODS,
        }),
      );
      expect(verdict.allowed).toBe(outcome === "satisfied");
    }
  });
});
