import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  DuplicateOriginatingSignalError,
  EmptyInitiativeKeyError,
  EmptyWithdrawalReasonError,
  GovernanceGateNotConvenedError,
  GovernanceGatePendingError,
  GovernanceGateRefusedError,
  InitiativeAlreadyInStatusError,
  InitiativeNotDraftError,
  InitiativeSettledError,
  InitiativeSummaryLengthError,
  InitiativeTextFrozenError,
  InvalidInitiativeKeyError,
  InvalidInitiativeProgressionError,
  InvalidPilotPeriodError,
  PilotTooShortError,
} from "./errors";
import {
  CHANGE_CLASSES,
  INITIATIVE_STATUSES,
  MAX_SUMMARY_LENGTH,
  MIN_PILOT_PERIODS,
  MIN_SUMMARY_LENGTH,
  REQUIRED_DECIDERS,
} from "./evolution-value";
import { MIN_DECIDERS_FOR_REVERSION } from "./governance";
import {
  type ImprovementInitiative,
  type ProposeInitiativeParams,
  adoptInitiative,
  approveInitiative,
  initiativePilotPeriods,
  initiativeRequiredDeciders,
  isInitiativeAdopted,
  isInitiativeOpen,
  isInitiativeSettled,
  proposeInitiative,
  reclassifyInitiative,
  rejectInitiative,
  reviseInitiativeSummary,
  startInitiativePilot,
  startInitiativeReview,
  submitInitiative,
  withdrawInitiative,
} from "./improvement-initiative";
import * as initiativeModule from "./improvement-initiative";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const PROPOSER = "person-1" as Uuid;
const ACTOR = "person-9" as Uuid;
const SIGNAL_A = "signal-1" as Uuid;
const SIGNAL_B = "signal-2" as Uuid;

const SUMMARY = "Move year nine marking onto a two-week turnaround from the start of next term.";

/** The period the fixtures start their pilots in. Adoption needs at least one whole period after it. */
const PILOT_START = 4;

const proposal = (overrides: Partial<ProposeInitiativeParams> = {}): ProposeInitiativeParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  initiativeKey: "academic.marking-turnaround",
  changeClass: "process",
  summary: SUMMARY,
  originatingSignalIds: [SIGNAL_A],
  proposedBy: PROPOSER,
  ...overrides,
});

const draft = (overrides: Partial<ProposeInitiativeParams> = {}): ImprovementInitiative =>
  proposeInitiative(proposal(overrides));

const submitted = (overrides: Partial<ProposeInitiativeParams> = {}): ImprovementInitiative =>
  submitInitiative(draft(overrides));

const underReview = (overrides: Partial<ProposeInitiativeParams> = {}): ImprovementInitiative =>
  startInitiativeReview(submitted(overrides));

const approved = (overrides: Partial<ProposeInitiativeParams> = {}): ImprovementInitiative =>
  approveInitiative(underReview(overrides), "satisfied");

const piloting = (overrides: Partial<ProposeInitiativeParams> = {}): ImprovementInitiative =>
  startInitiativePilot(approved(overrides), PILOT_START);

const adopted = (overrides: Partial<ProposeInitiativeParams> = {}): ImprovementInitiative =>
  adoptInitiative(piloting(overrides), "satisfied", PILOT_START + 1, ACTOR);

describe("proposeInitiative", () => {
  it("normalizes the key so one change is quoted the same way everywhere", () => {
    expect(draft({ initiativeKey: "  Academic.Marking-Turnaround  " }).initiativeKey).toBe(
      "academic.marking-turnaround",
    );
  });

  it("refuses a key that is nothing but space", () => {
    expect(() => draft({ initiativeKey: "   " })).toThrow(EmptyInitiativeKeyError);
  });

  it("refuses a key the vocabulary would not recognise", () => {
    expect(() => draft({ initiativeKey: "academic..marking" })).toThrow(InvalidInitiativeKeyError);
  });

  it("refuses a proposal too short for anybody to weigh", () => {
    let thrown: InitiativeSummaryLengthError | null = null;
    try {
      draft({ summary: "x".repeat(MIN_SUMMARY_LENGTH - 1) });
    } catch (error) {
      thrown = error as InitiativeSummaryLengthError;
    }
    expect(thrown).toBeInstanceOf(InitiativeSummaryLengthError);
    expect(thrown?.details).toMatchObject({
      length: MIN_SUMMARY_LENGTH - 1,
      minimum: MIN_SUMMARY_LENGTH,
      maximum: MAX_SUMMARY_LENGTH,
    });
  });

  it("refuses a proposal long enough to be a report in disguise", () => {
    expect(() => draft({ summary: "x".repeat(MAX_SUMMARY_LENGTH + 1) })).toThrow(
      InitiativeSummaryLengthError,
    );
  });

  it("accepts a proposal sitting exactly on either bound", () => {
    expect(draft({ summary: "x".repeat(MIN_SUMMARY_LENGTH) }).summary).toHaveLength(
      MIN_SUMMARY_LENGTH,
    );
    expect(draft({ summary: "x".repeat(MAX_SUMMARY_LENGTH) }).summary).toHaveLength(
      MAX_SUMMARY_LENGTH,
    );
  });

  it("measures the proposal after trimming it, not before", () => {
    expect(draft({ summary: `   ${SUMMARY}   ` }).summary).toBe(SUMMARY);
  });

  it("refuses a signal named twice, so the count of problems addressed stays honest", () => {
    let thrown: DuplicateOriginatingSignalError | null = null;
    try {
      draft({ originatingSignalIds: [SIGNAL_A, SIGNAL_B, SIGNAL_A] });
    } catch (error) {
      thrown = error as DuplicateOriginatingSignalError;
    }
    expect(thrown).toBeInstanceOf(DuplicateOriginatingSignalError);
    expect(thrown?.details).toMatchObject({ signalId: SIGNAL_A });
  });

  it("permits a change nobody filed a signal about", () => {
    expect(draft({ originatingSignalIds: [] }).originatingSignalIds).toHaveLength(0);
  });

  it("copies the origins it was handed rather than holding the caller's array", () => {
    const origins: Uuid[] = [SIGNAL_A];
    const initiative = proposeInitiative(proposal({ originatingSignalIds: origins }));
    origins.push(SIGNAL_B);
    expect(initiative.originatingSignalIds).toEqual([SIGNAL_A]);
  });

  it("starts as a draft with no crossing yet stamped", () => {
    const initiative = draft();
    expect(initiative.status).toBe("draft");
    expect(initiative.proposedBy).toBe(PROPOSER);
    expect(initiative.submittedAt).toBeNull();
    expect(initiative.reviewStartedAt).toBeNull();
    expect(initiative.approvedAt).toBeNull();
    expect(initiative.pilotStartedAt).toBeNull();
    expect(initiative.pilotStartedPeriod).toBeNull();
    expect(initiative.settledAt).toBeNull();
    expect(initiative.settledBy).toBeNull();
    expect(initiative.withdrawalReason).toBeNull();
  });
});

describe("the forward path", () => {
  it("carries a proposal from draft to adoption one crossing at a time", () => {
    expect(draft().status).toBe("draft");
    expect(submitted().status).toBe("submitted");
    expect(underReview().status).toBe("under_review");
    expect(approved().status).toBe("approved");
    expect(piloting().status).toBe("piloting");
    expect(adopted().status).toBe("adopted");
  });

  it("stamps each crossing as it happens and leaves the ones ahead of it unset", () => {
    expect(submitted().submittedAt).not.toBeNull();
    expect(submitted().reviewStartedAt).toBeNull();
    expect(underReview().reviewStartedAt).not.toBeNull();
    expect(underReview().approvedAt).toBeNull();
    expect(approved().approvedAt).not.toBeNull();
    expect(approved().pilotStartedAt).toBeNull();
    expect(piloting().pilotStartedAt).not.toBeNull();
    expect(piloting().pilotStartedPeriod).toBe(PILOT_START);
    expect(piloting().settledAt).toBeNull();
    expect(adopted().settledAt).not.toBeNull();
    expect(adopted().settledBy).toBe(ACTOR);
  });

  it("refuses to skip the review nobody has started", () => {
    expect(() => approveInitiative(submitted(), "satisfied")).toThrow(
      InvalidInitiativeProgressionError,
    );
  });

  it("refuses to adopt a change that was never piloted", () => {
    expect(() => adoptInitiative(approved(), "satisfied", PILOT_START + 9, ACTOR)).toThrow(
      InvalidInitiativeProgressionError,
    );
  });

  it("refuses a pilot on a proposal nobody approved", () => {
    expect(() => startInitiativePilot(underReview(), PILOT_START)).toThrow(
      InvalidInitiativeProgressionError,
    );
  });

  it("refuses a step already taken rather than taking it twice", () => {
    expect(() => submitInitiative(submitted())).toThrow(InitiativeAlreadyInStatusError);
    expect(() => startInitiativeReview(underReview())).toThrow(InitiativeAlreadyInStatusError);
  });

  it("writes nothing on top of an ending", () => {
    expect(() => submitInitiative(adopted())).toThrow(InitiativeSettledError);
    expect(() => startInitiativeReview(rejectInitiative(underReview(), ACTOR))).toThrow(
      InitiativeSettledError,
    );
  });
});

describe("governance gates", () => {
  it("refuses approval when no gate was convened at all", () => {
    let thrown: GovernanceGateNotConvenedError | null = null;
    try {
      approveInitiative(underReview(), null);
    } catch (error) {
      thrown = error as GovernanceGateNotConvenedError;
    }
    expect(thrown).toBeInstanceOf(GovernanceGateNotConvenedError);
    expect(thrown?.details).toMatchObject({ gate: "approval" });
  });

  it("refuses approval while the gate is still waiting on somebody", () => {
    expect(() => approveInitiative(underReview(), "pending")).toThrow(GovernanceGatePendingError);
  });

  it("refuses approval the gate turned down", () => {
    expect(() => approveInitiative(underReview(), "refused")).toThrow(GovernanceGateRefusedError);
  });

  it("keeps a refusal apart from a gate that has merely not finished", () => {
    let pending: unknown = null;
    let refused: unknown = null;
    try {
      approveInitiative(underReview(), "pending");
    } catch (error) {
      pending = error;
    }
    try {
      approveInitiative(underReview(), "refused");
    } catch (error) {
      refused = error;
    }
    expect(pending).toBeInstanceOf(GovernanceGatePendingError);
    expect(refused).toBeInstanceOf(GovernanceGateRefusedError);
    expect(pending).not.toBeInstanceOf(GovernanceGateRefusedError);
    expect(refused).not.toBeInstanceOf(GovernanceGatePendingError);
  });

  it("refuses adoption when no pilot-exit gate was convened", () => {
    let thrown: GovernanceGateNotConvenedError | null = null;
    try {
      adoptInitiative(piloting(), null, PILOT_START + 1, ACTOR);
    } catch (error) {
      thrown = error as GovernanceGateNotConvenedError;
    }
    expect(thrown).toBeInstanceOf(GovernanceGateNotConvenedError);
    expect(thrown?.details).toMatchObject({ gate: "pilot_exit" });
  });

  it("refuses adoption on a pilot-exit gate still open or turned down", () => {
    expect(() => adoptInitiative(piloting(), "pending", PILOT_START + 1, ACTOR)).toThrow(
      GovernanceGatePendingError,
    );
    expect(() => adoptInitiative(piloting(), "refused", PILOT_START + 1, ACTOR)).toThrow(
      GovernanceGateRefusedError,
    );
  });

  it("asks for no gate on the crossings that change nothing the institution does", () => {
    expect(submitInitiative(draft()).status).toBe("submitted");
    expect(startInitiativeReview(submitted()).status).toBe("under_review");
    expect(startInitiativePilot(approved(), PILOT_START).status).toBe("piloting");
    expect(rejectInitiative(underReview(), ACTOR).status).toBe("rejected");
    expect(withdrawInitiative(draft(), ACTOR, "Thought better of it.").status).toBe("withdrawn");
  });
});

describe("the pilot rule", () => {
  it("refuses adoption in the period the pilot started in", () => {
    let thrown: PilotTooShortError | null = null;
    try {
      adoptInitiative(piloting(), "satisfied", PILOT_START, ACTOR);
    } catch (error) {
      thrown = error as PilotTooShortError;
    }
    expect(thrown).toBeInstanceOf(PilotTooShortError);
    expect(thrown?.details).toMatchObject({ pilotPeriods: 0, required: MIN_PILOT_PERIODS });
  });

  it("permits adoption once a whole period has been lived through", () => {
    expect(adoptInitiative(piloting(), "satisfied", PILOT_START + 1, ACTOR).status).toBe("adopted");
  });

  it("names the pilot before it names the gate, because that is the next thing to do", () => {
    expect(() => adoptInitiative(piloting(), null, PILOT_START, ACTOR)).toThrow(PilotTooShortError);
  });

  it("reports how long a pilot has run before anybody is refused", () => {
    const initiative = piloting();
    expect(initiativePilotPeriods(initiative, PILOT_START)).toBe(0);
    expect(initiativePilotPeriods(initiative, PILOT_START + 1)).toBe(1);
    expect(initiativePilotPeriods(initiative, PILOT_START + 3)).toBe(3);
  });

  it("counts nothing backwards from the period the pilot began in", () => {
    expect(initiativePilotPeriods(piloting(), PILOT_START - 1)).toBe(0);
  });

  it("counts nothing at all for a proposal that has never piloted", () => {
    expect(initiativePilotPeriods(draft(), 900)).toBe(0);
    expect(initiativePilotPeriods(approved(), 900)).toBe(0);
  });

  it("refuses a pilot start that is not a period index", () => {
    expect(() => startInitiativePilot(approved(), -1)).toThrow(InvalidPilotPeriodError);
    expect(() => startInitiativePilot(approved(), 2.5)).toThrow(InvalidPilotPeriodError);
  });

  it("refuses an adoption period that is not a period index", () => {
    expect(() => adoptInitiative(piloting(), "satisfied", 2.5, ACTOR)).toThrow(
      InvalidPilotPeriodError,
    );
  });
});

describe("the two freezes", () => {
  it("lets the proposal be rewritten while people are still reading it", () => {
    const revised = `${SUMMARY} Marking is to be returned before the next lesson.`;
    expect(reviseInitiativeSummary(draft(), revised).summary).toBe(revised);
    expect(reviseInitiativeSummary(submitted(), revised).summary).toBe(revised);
    expect(reviseInitiativeSummary(underReview(), revised).summary).toBe(revised);
  });

  it("freezes the proposal at approval, because that is the text the deciders read", () => {
    let thrown: InitiativeTextFrozenError | null = null;
    try {
      reviseInitiativeSummary(approved(), `${SUMMARY} And something else entirely.`);
    } catch (error) {
      thrown = error as InitiativeTextFrozenError;
    }
    expect(thrown).toBeInstanceOf(InitiativeTextFrozenError);
    expect(thrown?.details).toMatchObject({ status: "approved" });
  });

  it("keeps the proposal frozen through the pilot", () => {
    expect(() => reviseInitiativeSummary(piloting(), `${SUMMARY} Rewritten.`)).toThrow(
      InitiativeTextFrozenError,
    );
  });

  it("calls a settled initiative settled rather than frozen", () => {
    expect(() => reviseInitiativeSummary(adopted(), `${SUMMARY} Rewritten.`)).toThrow(
      InitiativeSettledError,
    );
  });

  it("bounds a rewritten proposal as tightly as the first one", () => {
    expect(() => reviseInitiativeSummary(draft(), "too short")).toThrow(
      InitiativeSummaryLengthError,
    );
  });

  it("lets a draft's class still be argued about", () => {
    expect(reclassifyInitiative(draft(), "structural").changeClass).toBe("structural");
  });

  it("fixes the class the moment the proposal is put forward", () => {
    let thrown: InitiativeNotDraftError | null = null;
    try {
      reclassifyInitiative(submitted(), "clarification");
    } catch (error) {
      thrown = error as InitiativeNotDraftError;
    }
    expect(thrown).toBeInstanceOf(InitiativeNotDraftError);
    expect(thrown?.details).toMatchObject({ status: "submitted" });
    expect(() => reclassifyInitiative(underReview(), "clarification")).toThrow(
      InitiativeNotDraftError,
    );
  });

  it("calls a settled initiative settled rather than fixed", () => {
    expect(() => reclassifyInitiative(adopted(), "policy")).toThrow(InitiativeSettledError);
  });
});

describe("endings", () => {
  it("records a rejection with whoever closed the file", () => {
    const rejected = rejectInitiative(underReview(), ACTOR);
    expect(rejected.status).toBe("rejected");
    expect(rejected.settledBy).toBe(ACTOR);
    expect(rejected.settledAt).not.toBeNull();
    expect(rejected.withdrawalReason).toBeNull();
  });

  it("offers no rejection before anybody has looked at it", () => {
    expect(() => rejectInitiative(draft(), ACTOR)).toThrow(InvalidInitiativeProgressionError);
    expect(() => rejectInitiative(submitted(), ACTOR)).toThrow(InvalidInitiativeProgressionError);
  });

  it("withdraws from every state before an ending, including mid-pilot", () => {
    const open = [draft(), submitted(), underReview(), approved(), piloting()];
    for (const initiative of open) {
      const withdrawn = withdrawInitiative(
        initiative,
        ACTOR,
        "Superseded by the timetable review.",
      );
      expect(withdrawn.status).toBe("withdrawn");
      expect(withdrawn.settledBy).toBe(ACTOR);
    }
  });

  it("keeps the stated reason and trims it", () => {
    expect(withdrawInitiative(draft(), ACTOR, "   Superseded.   ").withdrawalReason).toBe(
      "Superseded.",
    );
  });

  it("refuses a withdrawal nobody gave a reason for", () => {
    expect(() => withdrawInitiative(draft(), ACTOR, "   ")).toThrow(EmptyWithdrawalReasonError);
  });

  it("names the ending before the missing reason on an initiative already settled", () => {
    expect(() => withdrawInitiative(adopted(), ACTOR, "")).toThrow(InitiativeSettledError);
  });

  it("leaves no way back out of an adoption", () => {
    const initiative = adopted();
    expect(() => submitInitiative(initiative)).toThrow(InitiativeSettledError);
    expect(() => startInitiativeReview(initiative)).toThrow(InitiativeSettledError);
    expect(() => approveInitiative(initiative, "satisfied")).toThrow(InitiativeSettledError);
    expect(() => rejectInitiative(initiative, ACTOR)).toThrow(InitiativeSettledError);
    expect(() => startInitiativePilot(initiative, PILOT_START + 4)).toThrow(InitiativeSettledError);
    expect(() => withdrawInitiative(initiative, ACTOR, "Undo it.")).toThrow(InitiativeSettledError);
  });

  it("leaves the withdrawal reason empty on the endings that are not withdrawals", () => {
    expect(adopted().withdrawalReason).toBeNull();
    expect(rejectInitiative(underReview(), ACTOR).withdrawalReason).toBeNull();
  });
});

describe("reading", () => {
  it("holds an initiative open until it is settled, and never both at once", () => {
    for (const initiative of [draft(), submitted(), underReview(), approved(), piloting()]) {
      expect(isInitiativeOpen(initiative)).toBe(true);
      expect(isInitiativeSettled(initiative)).toBe(false);
    }
    for (const initiative of [
      adopted(),
      rejectInitiative(underReview(), ACTOR),
      withdrawInitiative(draft(), ACTOR, "Superseded."),
    ]) {
      expect(isInitiativeOpen(initiative)).toBe(false);
      expect(isInitiativeSettled(initiative)).toBe(true);
    }
  });

  it("counts only an adoption as how the institution now works", () => {
    expect(isInitiativeAdopted(adopted())).toBe(true);
    expect(isInitiativeAdopted(piloting())).toBe(false);
    expect(isInitiativeAdopted(rejectInitiative(underReview(), ACTOR))).toBe(false);
  });

  it("asks the governance engine how many people must agree, class by class", () => {
    for (const changeClass of CHANGE_CLASSES) {
      expect(initiativeRequiredDeciders(draft({ changeClass }), "approval")).toBe(
        REQUIRED_DECIDERS[changeClass],
      );
    }
  });

  it("lifts the smallest change to the reversion floor and leaves the largest alone", () => {
    expect(initiativeRequiredDeciders(draft({ changeClass: "clarification" }), "reversion")).toBe(
      MIN_DECIDERS_FOR_REVERSION,
    );
    expect(initiativeRequiredDeciders(draft({ changeClass: "structural" }), "reversion")).toBe(
      REQUIRED_DECIDERS.structural,
    );
  });
});

describe("deliberate absences", () => {
  it("publishes exactly the surface an initiative has and nothing more", () => {
    expect(Object.keys(initiativeModule).sort()).toEqual([
      "adoptInitiative",
      "approveInitiative",
      "initiativePilotPeriods",
      "initiativeRequiredDeciders",
      "isInitiativeAdopted",
      "isInitiativeOpen",
      "isInitiativeSettled",
      "proposeInitiative",
      "reclassifyInitiative",
      "rejectInitiative",
      "reviseInitiativeSummary",
      "startInitiativePilot",
      "startInitiativeReview",
      "submitInitiative",
      "withdrawInitiative",
    ]);
  });

  it("offers nothing that would enact, deploy or roll out the change it describes", () => {
    const names = Object.keys(initiativeModule).join(" ").toLowerCase();
    for (const forbidden of ["enact", "deploy", "rollout", "publish", "execute", "activate"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("offers no way back out of an adoption: a reversion is a new initiative", () => {
    const names = Object.keys(initiativeModule).join(" ").toLowerCase();
    for (const forbidden of ["revert", "reopen", "restore", "unadopt", "delete"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("mutates nothing it was given", () => {
    const initiative = approved();
    const before = JSON.stringify(initiative);
    startInitiativePilot(initiative, PILOT_START);
    withdrawInitiative(initiative, ACTOR, "Superseded.");
    expect(JSON.stringify(initiative)).toBe(before);
  });

  it("moves the updated stamp on every transition and never the created one", () => {
    const initiative = draft();
    const moved = submitInitiative(initiative);
    expect(moved.createdAt).toBe(initiative.createdAt);
    expect(moved.id).toBe(initiative.id);
    expect(moved.initiativeKey).toBe(initiative.initiativeKey);
  });

  it("holds no status outside the eight the vocabulary declares", () => {
    const statuses = [
      draft().status,
      submitted().status,
      underReview().status,
      approved().status,
      rejectInitiative(underReview(), ACTOR).status,
      piloting().status,
      adopted().status,
      withdrawInitiative(draft(), ACTOR, "Superseded.").status,
    ];
    for (const status of statuses) expect(INITIATIVE_STATUSES).toContain(status);
    expect(new Set(statuses).size).toBe(INITIATIVE_STATUSES.length);
  });
});
