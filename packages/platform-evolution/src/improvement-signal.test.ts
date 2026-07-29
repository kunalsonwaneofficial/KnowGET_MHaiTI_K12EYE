import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  EmptyDeclineReasonError,
  EmptySignalKeyError,
  InvalidSignalKeyError,
  InvalidSignalProgressionError,
  SignalAlreadyInStatusError,
  SignalMergedIntoItselfError,
  SignalSettledError,
  SignalSummaryLengthError,
  UnusableSignalEvidenceError,
} from "./errors";
import {
  MAX_SUMMARY_LENGTH,
  MIN_CORROBORATION_FOR_URGENT,
  MIN_SUMMARY_LENGTH,
  SIGNAL_STATUSES,
} from "./evolution-value";
import type { EvidenceCitation, SignalAccount } from "./evolution-view";
import {
  type ImprovementSignal,
  type RaiseSignalParams,
  acceptSignal,
  corroborateSignal,
  declineSignal,
  isSignalDeclined,
  isSignalOpen,
  isSignalSettled,
  mergeSignal,
  raiseSignal,
  reviseSignalSummary,
  signalPriorityVerdict,
  triageSignal,
} from "./improvement-signal";
import * as signalModule from "./improvement-signal";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const RAISER = "person-1" as Uuid;
const ACTOR = "person-9" as Uuid;

const SUMMARY = "Marking turnaround in year nine has slipped past a fortnight since January.";

const citation = (overrides: Partial<EvidenceCitation> = {}): EvidenceCitation => ({
  kind: "domain_record",
  sourceDomain: "assessment",
  sourceRef: "rec-1",
  attestedBy: null,
  ...overrides,
});

const raising = (overrides: Partial<RaiseSignalParams> = {}): RaiseSignalParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  signalKey: "academic.marking-turnaround",
  source: "stakeholder_feedback",
  summary: SUMMARY,
  citations: [citation()],
  raisedBy: RAISER,
  ...overrides,
});

const raised = (overrides: Partial<RaiseSignalParams> = {}): ImprovementSignal =>
  raiseSignal(raising(overrides));

const triaged = (overrides: Partial<RaiseSignalParams> = {}): ImprovementSignal =>
  triageSignal(raised(overrides), ACTOR);

const account = (raisedBy: string): SignalAccount => ({
  raisedBy,
  source: "stakeholder_feedback",
});

describe("raiseSignal", () => {
  it("raises a signal open, routine and standing on its citations", () => {
    const signal = raised();
    expect(signal.status).toBe("raised");
    expect(signal.priority).toBe("routine");
    expect(signal.corroboration).toBe(1);
    expect(signal.citations).toEqual([citation()]);
    expect(signal.raisedBy).toBe(RAISER);
    expect(signal.triagedAt).toBeNull();
    expect(signal.settledAt).toBeNull();
    expect(signal.mergedIntoSignalId).toBeNull();
    expect(signal.declineReason).toBeNull();
    expect(signal.createdAt).toBe(signal.updatedAt);
  });

  it("normalizes the key rather than storing what was typed", () => {
    expect(raised({ signalKey: "  Academic.Marking-Turnaround  " }).signalKey).toBe(
      "academic.marking-turnaround",
    );
  });

  it("refuses a key that is empty once trimmed", () => {
    expect(() => raised({ signalKey: "   " })).toThrow(EmptySignalKeyError);
  });

  it("refuses a key that is not in the canonical grammar", () => {
    expect(() => raised({ signalKey: "marking turnaround" })).toThrow(InvalidSignalKeyError);
    expect(() => raised({ signalKey: "ab" })).toThrow(InvalidSignalKeyError);
  });

  it("trims the summary and holds it to both bounds", () => {
    expect(raised({ summary: `  ${SUMMARY}  ` }).summary).toBe(SUMMARY);
    expect(() => raised({ summary: "x".repeat(MIN_SUMMARY_LENGTH - 1) })).toThrow(
      SignalSummaryLengthError,
    );
    expect(() => raised({ summary: "x".repeat(MAX_SUMMARY_LENGTH + 1) })).toThrow(
      SignalSummaryLengthError,
    );
  });

  it("accepts a summary sitting exactly on either bound", () => {
    expect(raised({ summary: "x".repeat(MIN_SUMMARY_LENGTH) }).summary).toHaveLength(
      MIN_SUMMARY_LENGTH,
    );
    expect(raised({ summary: "x".repeat(MAX_SUMMARY_LENGTH) }).summary).toHaveLength(
      MAX_SUMMARY_LENGTH,
    );
  });

  it("refuses a signal that stands on nothing", () => {
    expect(() => raised({ citations: [] })).toThrow(UnusableSignalEvidenceError);
  });

  it("reports every evidence problem at once rather than one correction at a time", () => {
    let thrown: UnusableSignalEvidenceError | null = null;
    try {
      raised({
        citations: [
          citation({ sourceDomain: "not a domain" }),
          citation({ sourceRef: "  " }),
          citation({ kind: "attested_return" }),
        ],
      });
    } catch (error) {
      thrown = error as UnusableSignalEvidenceError;
    }
    expect(thrown).toBeInstanceOf(UnusableSignalEvidenceError);
    expect(thrown?.details).toMatchObject({
      signalKey: "academic.marking-turnaround",
      issues: ["invalid_source_domain", "blank_source_ref", "unattested_citation"],
    });
  });

  it("refuses the same record cited twice, so a case cannot be padded", () => {
    expect(() => raised({ citations: [citation(), citation()] })).toThrow(
      UnusableSignalEvidenceError,
    );
  });

  it("copies the citations, so the caller cannot rewrite the justification afterwards", () => {
    const citations = [citation()];
    const signal = raised({ citations });
    citations[0] = citation({ sourceRef: "something-else" });
    expect(signal.citations[0]?.sourceRef).toBe("rec-1");
  });

  it("seeds one account from the raiser, which is what the priority is derived from", () => {
    const signal = raised();
    expect(signal.accounts).toEqual([{ raisedBy: RAISER, source: "stakeholder_feedback" }]);
    expect(signal.unattributed).toBe(0);
  });

  it("counts an anonymous raising as unattributed, corroborating nobody", () => {
    const signal = raised({ raisedBy: null });
    expect(signal.raisedBy).toBeNull();
    expect(signal.corroboration).toBe(0);
    expect(signal.unattributed).toBe(1);
  });

  it("lets a self-evident source carry the signal above routine on its own", () => {
    const signal = raised({ source: "incident" });
    expect(signal.priority).toBe("elevated");
    expect(signal.selfEvident).toBe(true);
    expect(signal.corroboration).toBe(1);
  });
});

describe("reviseSignalSummary", () => {
  it("restates what the problem is, right up to disposal", () => {
    const restated = "Marking turnaround has slipped, and year nine parents are asking about it.";
    expect(reviseSignalSummary(triaged(), restated).summary).toBe(restated);
  });

  it("holds a restatement to the same bounds as the original", () => {
    expect(() => reviseSignalSummary(raised(), "too short")).toThrow(SignalSummaryLengthError);
  });

  it("refuses to rewrite what somebody already decided on", () => {
    const settled = acceptSignal(triaged(), ACTOR);
    expect(() => reviseSignalSummary(settled, SUMMARY)).toThrow(SignalSettledError);
  });
});

describe("corroborateSignal", () => {
  it("counts a second person and leaves the first account in place", () => {
    const signal = corroborateSignal(raised(), account("person-2"));
    expect(signal.accounts).toHaveLength(2);
    expect(signal.corroboration).toBe(2);
    expect(signal.priority).toBe("elevated");
  });

  it("reaches urgent only on enough distinct people", () => {
    let signal = raised();
    for (let i = 2; i <= MIN_CORROBORATION_FOR_URGENT; i += 1) {
      signal = corroborateSignal(signal, account(`person-${i}`));
    }
    expect(signal.corroboration).toBe(MIN_CORROBORATION_FOR_URGENT);
    expect(signal.priority).toBe("urgent");
  });

  it("does not let one determined person raise a signal's standing", () => {
    let signal = raised();
    for (let i = 0; i < 6; i += 1) signal = corroborateSignal(signal, account(RAISER));
    expect(signal.corroboration).toBe(1);
    expect(signal.repeatAccounts).toBe(6);
    expect(signal.priority).toBe("routine");
  });

  it("re-derives rather than incrementing, so anonymous accounts still cannot corroborate", () => {
    const signal = corroborateSignal(corroborateSignal(raised(), account("")), account("  "));
    expect(signal.corroboration).toBe(1);
    expect(signal.unattributed).toBe(2);
    expect(signal.priority).toBe("routine");
  });

  it("keeps corroborating a triaged signal, which is still open", () => {
    expect(corroborateSignal(triaged(), account("person-2")).corroboration).toBe(2);
  });

  it("refuses an account filed after the institution disposed of the signal", () => {
    const declined = declineSignal(triaged(), ACTOR, "Already addressed by the marking policy.");
    expect(() => corroborateSignal(declined, account("person-2"))).toThrow(SignalSettledError);
  });
});

describe("triageSignal", () => {
  it("records that somebody read it, and who", () => {
    const signal = triaged();
    expect(signal.status).toBe("triaged");
    expect(signal.triagedBy).toBe(ACTOR);
    expect(signal.triagedAt).not.toBeNull();
  });

  it("accepts an automated triage with nobody behind it", () => {
    expect(triageSignal(raised(), null).triagedBy).toBeNull();
  });

  it("refuses to triage something already triaged", () => {
    expect(() => triageSignal(triaged(), ACTOR)).toThrow(SignalAlreadyInStatusError);
  });
});

describe("disposal", () => {
  it("accepts a triaged signal and settles it", () => {
    const signal = acceptSignal(triaged(), ACTOR);
    expect(signal.status).toBe("accepted");
    expect(signal.settledBy).toBe(ACTOR);
    expect(signal.settledAt).not.toBeNull();
  });

  it("folds a signal into another one and remembers which", () => {
    const target = "signal-2" as Uuid;
    const signal = mergeSignal(triaged(), target, ACTOR);
    expect(signal.status).toBe("merged");
    expect(signal.mergedIntoSignalId).toBe(target);
  });

  it("refuses to merge a signal into itself", () => {
    const signal = triaged();
    expect(() => mergeSignal(signal, signal.id, ACTOR)).toThrow(SignalMergedIntoItselfError);
  });

  it("declines with a stated reason, trimmed", () => {
    const signal = declineSignal(triaged(), ACTOR, "  Already covered by the marking policy.  ");
    expect(signal.status).toBe("declined");
    expect(signal.declineReason).toBe("Already covered by the marking policy.");
  });

  it("refuses an unexplained decline, which would read as a signal nobody looked at", () => {
    expect(() => declineSignal(triaged(), ACTOR, "   ")).toThrow(EmptyDeclineReasonError);
  });

  it("refuses to dispose of anything nobody triaged", () => {
    expect(() => acceptSignal(raised(), ACTOR)).toThrow(InvalidSignalProgressionError);
    expect(() => mergeSignal(raised(), "signal-2" as Uuid, ACTOR)).toThrow(
      InvalidSignalProgressionError,
    );
    expect(() => declineSignal(raised(), ACTOR, "No.")).toThrow(InvalidSignalProgressionError);
  });

  it("refuses every further move once the signal has settled, however it settled", () => {
    const settled = [
      acceptSignal(triaged(), ACTOR),
      mergeSignal(triaged(), "signal-2" as Uuid, ACTOR),
      declineSignal(triaged(), ACTOR, "Not now."),
    ];
    for (const signal of settled) {
      expect(() => triageSignal(signal, ACTOR)).toThrow(SignalSettledError);
      expect(() => corroborateSignal(signal, account("person-4"))).toThrow(SignalSettledError);
      expect(() => reviseSignalSummary(signal, `${SUMMARY} Still true.`)).toThrow(
        SignalSettledError,
      );
    }
  });

  it("tells a caller they are repeating themselves rather than that the file is shut", () => {
    const accepted = acceptSignal(triaged(), ACTOR);
    expect(() => acceptSignal(accepted, ACTOR)).toThrow(SignalAlreadyInStatusError);
    const declined = declineSignal(triaged(), ACTOR, "Not now.");
    expect(() => declineSignal(declined, ACTOR, "Again.")).toThrow(SignalAlreadyInStatusError);
  });
});

describe("reading", () => {
  it("reads raised and triaged as open, and all three disposals as settled", () => {
    expect(isSignalOpen(raised())).toBe(true);
    expect(isSignalOpen(triaged())).toBe(true);
    expect(isSignalSettled(acceptSignal(triaged(), ACTOR))).toBe(true);
    expect(isSignalSettled(mergeSignal(triaged(), "signal-2" as Uuid, ACTOR))).toBe(true);
    expect(isSignalSettled(declineSignal(triaged(), ACTOR, "No."))).toBe(true);
  });

  it("names the declined signals, which is what a recurrence query is drawn from", () => {
    expect(isSignalDeclined(declineSignal(triaged(), ACTOR, "No."))).toBe(true);
    expect(isSignalDeclined(acceptSignal(triaged(), ACTOR))).toBe(false);
  });

  it("reports the derivation the signal was last sorted by, not a fresh computation", () => {
    const signal = corroborateSignal(raised({ source: "incident" }), account("person-2"));
    expect(signalPriorityVerdict(signal)).toEqual({
      priority: signal.priority,
      corroboration: 2,
      repeatAccounts: 0,
      unattributed: 0,
      selfEvident: signal.selfEvident,
    });
  });
});

describe("deliberate absences", () => {
  it("publishes exactly the surface a signal has and nothing more", () => {
    expect(Object.keys(signalModule).sort()).toEqual([
      "acceptSignal",
      "corroborateSignal",
      "declineSignal",
      "isSignalDeclined",
      "isSignalOpen",
      "isSignalSettled",
      "mergeSignal",
      "raiseSignal",
      "reviseSignalSummary",
      "signalPriorityVerdict",
      "triageSignal",
    ]);
  });

  it("offers no way to reopen a settled signal: recurrence is a new signal", () => {
    const names = Object.keys(signalModule).join(" ").toLowerCase();
    for (const forbidden of ["reopen", "revert", "restore", "reraise", "delete"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("offers no way to set a priority by hand", () => {
    const names = Object.keys(signalModule);
    expect(names).not.toContain("setSignalPriority");
    expect(names).not.toContain("escalateSignal");
  });

  it("mutates nothing it was given", () => {
    const signal = raised();
    const before = JSON.stringify(signal);
    corroborateSignal(signal, account("person-2"));
    triageSignal(signal, ACTOR);
    reviseSignalSummary(signal, `${SUMMARY} And it is getting worse.`);
    expect(JSON.stringify(signal)).toBe(before);
  });

  it("moves the updated stamp on every transition and never the created one", () => {
    const signal = raised();
    const moved = triageSignal(signal, ACTOR);
    expect(moved.createdAt).toBe(signal.createdAt);
    expect(moved.id).toBe(signal.id);
  });

  it("holds no status outside the five the vocabulary declares", () => {
    const statuses = [
      raised().status,
      triaged().status,
      acceptSignal(triaged(), ACTOR).status,
      mergeSignal(triaged(), "signal-2" as Uuid, ACTOR).status,
      declineSignal(triaged(), ACTOR, "No.").status,
    ];
    for (const status of statuses) expect(SIGNAL_STATUSES).toContain(status);
    expect(new Set(statuses).size).toBe(SIGNAL_STATUSES.length);
  });
});
