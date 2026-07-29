import { describe, expect, it } from "vitest";
import {
  ATTESTED_EVIDENCE_KIND,
  EVIDENCE_KINDS,
  MIN_CORROBORATION_FOR_ELEVATED,
  MIN_CORROBORATION_FOR_URGENT,
  SELF_EVIDENT_SOURCES,
  SIGNAL_SOURCES,
  SIGNAL_STATUSES,
  type SignalSource,
  type SignalStatus,
  isSignalStatus,
  isTerminalSignalStatus,
  priorityRank,
} from "./evolution-value";
import type { EvidenceCitation, SignalAccount } from "./evolution-view";
import { SIGNAL_PROGRESSIONS, derivePriority, inspectEvidence, inspectProgression } from "./intake";

const citation = (overrides: Partial<EvidenceCitation> = {}): EvidenceCitation => ({
  kind: "domain_record",
  sourceDomain: "attendance",
  sourceRef: "row-1",
  attestedBy: null,
  ...overrides,
});

const accounts = (...raisers: string[]): SignalAccount[] =>
  raisers.map((raisedBy) => ({ raisedBy, source: "stakeholder_feedback" }));

const codes = (issues: readonly { readonly code: string }[]): string[] =>
  issues.map((issue) => issue.code);

describe("inspectEvidence", () => {
  it("accepts a citation that names a domain, a record and nobody in particular", () => {
    const verdict = inspectEvidence([citation()]);
    expect(verdict.usable).toBe(true);
    expect(verdict.cited).toBe(1);
    expect(verdict.issues).toEqual([]);
  });

  it("refuses an empty set rather than treating no evidence as unobjectionable", () => {
    const verdict = inspectEvidence([]);
    expect(verdict.usable).toBe(false);
    expect(verdict.cited).toBe(0);
    expect(codes(verdict.issues)).toEqual(["no_evidence"]);
  });

  it("blames the whole set, not a citation, when there is nothing to blame", () => {
    expect(inspectEvidence([]).issues[0]?.citationIndex).toBeNull();
  });

  it("rejects a source domain that is not a key this platform could resolve", () => {
    const verdict = inspectEvidence([citation({ sourceDomain: "Not A Domain!" })]);
    expect(verdict.usable).toBe(false);
    expect(codes(verdict.issues)).toContain("invalid_source_domain");
  });

  it("rejects a source domain too short to be a key", () => {
    expect(codes(inspectEvidence([citation({ sourceDomain: "hr" })]).issues)).toContain(
      "invalid_source_domain",
    );
  });

  it("rejects a blank record reference", () => {
    expect(codes(inspectEvidence([citation({ sourceRef: "   " })]).issues)).toContain(
      "blank_source_ref",
    );
  });

  it("leaves the shape of a record reference to the domain that owns it", () => {
    const verdict = inspectEvidence([citation({ sourceRef: "Row/2024:001 (revised)" })]);
    expect(verdict.usable).toBe(true);
  });

  it("requires somebody to stand behind the kind that means somebody stood behind it", () => {
    const verdict = inspectEvidence([citation({ kind: ATTESTED_EVIDENCE_KIND })]);
    expect(verdict.usable).toBe(false);
    expect(codes(verdict.issues)).toContain("unattested_citation");
  });

  it("treats a whitespace attestor as no attestor", () => {
    const verdict = inspectEvidence([citation({ kind: ATTESTED_EVIDENCE_KIND, attestedBy: "  " })]);
    expect(codes(verdict.issues)).toContain("unattested_citation");
  });

  it("accepts the attested kind once somebody is named", () => {
    const verdict = inspectEvidence([
      citation({ kind: ATTESTED_EVIDENCE_KIND, attestedBy: "person-7" }),
    ]);
    expect(verdict.usable).toBe(true);
  });

  it("asks for an attestor on exactly one kind and no others", () => {
    for (const kind of EVIDENCE_KINDS) {
      const verdict = inspectEvidence([citation({ kind })]);
      expect(verdict.usable).toBe(kind !== ATTESTED_EVIDENCE_KIND);
    }
  });

  it("flags the second citation of the same record, not the first", () => {
    const verdict = inspectEvidence([citation(), citation()]);
    expect(verdict.usable).toBe(false);
    expect(verdict.issues).toEqual([{ code: "duplicate_citation", citationIndex: 1 }]);
    expect(verdict.cited).toBe(1);
  });

  it("sees through casing and padding when deciding two citations are the same record", () => {
    const verdict = inspectEvidence([
      citation({ sourceDomain: "attendance" }),
      citation({ sourceDomain: "  ATTENDANCE  " }),
    ]);
    expect(codes(verdict.issues)).toEqual(["duplicate_citation"]);
  });

  it("does not confuse the same reference in two different domains", () => {
    const verdict = inspectEvidence([
      citation({ sourceDomain: "attendance", sourceRef: "row-1" }),
      citation({ sourceDomain: "transport", sourceRef: "row-1" }),
    ]);
    expect(verdict.usable).toBe(true);
    expect(verdict.cited).toBe(2);
  });

  it("reports every issue in one pass rather than the first one it meets", () => {
    const verdict = inspectEvidence([
      citation({ sourceDomain: "!!", sourceRef: "", kind: ATTESTED_EVIDENCE_KIND }),
    ]);
    expect(codes(verdict.issues)).toEqual([
      "invalid_source_domain",
      "blank_source_ref",
      "unattested_citation",
    ]);
  });

  it("counts only the citations that raised no issue of their own", () => {
    const verdict = inspectEvidence([
      citation({ sourceRef: "row-1" }),
      citation({ sourceRef: "   " }),
      citation({ sourceRef: "row-3" }),
    ]);
    expect(verdict.cited).toBe(2);
    expect(verdict.usable).toBe(false);
  });

  it("points every citation-level issue at the citation it came from", () => {
    const verdict = inspectEvidence([citation(), citation({ sourceRef: "" })]);
    expect(verdict.issues).toEqual([{ code: "blank_source_ref", citationIndex: 1 }]);
  });
});

describe("derivePriority", () => {
  it("starts an ordinary signal with one person behind it at routine", () => {
    const verdict = derivePriority("stakeholder_feedback", accounts("person-1"));
    expect(verdict.priority).toBe("routine");
    expect(verdict.corroboration).toBe(1);
    expect(verdict.selfEvident).toBe(false);
  });

  it("raises a signal to elevated once enough distinct people name it", () => {
    const raisers = Array.from({ length: MIN_CORROBORATION_FOR_ELEVATED }, (_, i) => `person-${i}`);
    expect(derivePriority("stakeholder_feedback", accounts(...raisers)).priority).toBe("elevated");
  });

  it("raises a signal to urgent once enough distinct people name it", () => {
    const raisers = Array.from({ length: MIN_CORROBORATION_FOR_URGENT }, (_, i) => `person-${i}`);
    expect(derivePriority("stakeholder_feedback", accounts(...raisers)).priority).toBe("urgent");
  });

  it("counts people, not filings, so persistence buys nothing", () => {
    const verdict = derivePriority(
      "stakeholder_feedback",
      accounts("person-1", "person-1", "person-1", "person-1", "person-1"),
    );
    expect(verdict.corroboration).toBe(1);
    expect(verdict.repeatAccounts).toBe(4);
    expect(verdict.priority).toBe("routine");
  });

  it("reports repeat filings rather than dropping them silently", () => {
    const verdict = derivePriority("stakeholder_feedback", accounts("a", "b", "a", "b"));
    expect(verdict.corroboration).toBe(2);
    expect(verdict.repeatAccounts).toBe(2);
  });

  it("treats the same person with stray whitespace as the same person", () => {
    const verdict = derivePriority("stakeholder_feedback", accounts("person-1", "  person-1  "));
    expect(verdict.corroboration).toBe(1);
    expect(verdict.repeatAccounts).toBe(1);
  });

  it("refuses to let an unattributed account corroborate anything", () => {
    const verdict = derivePriority("stakeholder_feedback", accounts("", "", "", ""));
    expect(verdict.corroboration).toBe(0);
    expect(verdict.unattributed).toBe(4);
    expect(verdict.priority).toBe("routine");
  });

  it("counts unattributed and repeat accounts as different problems", () => {
    const verdict = derivePriority("stakeholder_feedback", accounts("a", "a", "", "  "));
    expect(verdict.corroboration).toBe(1);
    expect(verdict.repeatAccounts).toBe(1);
    expect(verdict.unattributed).toBe(2);
  });

  it("gives a signal nobody filed an account for no corroboration and no priority", () => {
    const verdict = derivePriority("stakeholder_feedback", []);
    expect(verdict.corroboration).toBe(0);
    expect(verdict.repeatAccounts).toBe(0);
    expect(verdict.unattributed).toBe(0);
    expect(verdict.priority).toBe("routine");
  });

  it("lets an incident and an audit finding stand on their own", () => {
    for (const source of SELF_EVIDENT_SOURCES) {
      const verdict = derivePriority(source, accounts("person-1"));
      expect(verdict.priority).toBe("elevated");
      expect(verdict.selfEvident).toBe(true);
    }
  });

  it("elevates a self-evident source even when nobody filed an account at all", () => {
    for (const source of SELF_EVIDENT_SOURCES) {
      expect(derivePriority(source, []).priority).toBe("elevated");
    }
  });

  it("still makes a self-evident source earn urgent the way everything else does", () => {
    for (const source of SELF_EVIDENT_SOURCES) {
      const short = Array.from(
        { length: MIN_CORROBORATION_FOR_URGENT - 1 },
        (_, i) => `person-${i}`,
      );
      expect(derivePriority(source, accounts(...short)).priority).toBe("elevated");
      const enough = Array.from({ length: MIN_CORROBORATION_FOR_URGENT }, (_, i) => `person-${i}`);
      expect(derivePriority(source, accounts(...enough)).priority).toBe("urgent");
    }
  });

  it("never returns a priority below the floor its source sets, for any source", () => {
    for (const source of SIGNAL_SOURCES) {
      const floor = SELF_EVIDENT_SOURCES.includes(source) ? "elevated" : "routine";
      for (let people = 0; people <= MIN_CORROBORATION_FOR_URGENT + 1; people += 1) {
        const raisers = Array.from({ length: people }, (_, i) => `person-${i}`);
        const verdict = derivePriority(source, accounts(...raisers));
        expect(priorityRank(verdict.priority)).toBeGreaterThanOrEqual(priorityRank(floor));
      }
    }
  });

  it("never lowers a signal's priority as more people stand behind it", () => {
    for (const source of SIGNAL_SOURCES) {
      let previous = -1;
      for (let people = 0; people <= MIN_CORROBORATION_FOR_URGENT + 2; people += 1) {
        const raisers = Array.from({ length: people }, (_, i) => `person-${i}`);
        const rank = priorityRank(derivePriority(source, accounts(...raisers)).priority);
        expect(rank).toBeGreaterThanOrEqual(previous);
        previous = rank;
      }
    }
  });

  it("reads the source from the argument, not from the accounts filed against it", () => {
    const mixed: SignalAccount[] = [
      { raisedBy: "person-1", source: "incident" },
      { raisedBy: "person-2", source: "incident" },
    ];
    const verdict = derivePriority("stakeholder_feedback", mixed);
    expect(verdict.selfEvident).toBe(false);
  });
});

describe("SIGNAL_PROGRESSIONS", () => {
  it("says something about every status a signal can be in", () => {
    expect(Object.keys(SIGNAL_PROGRESSIONS).sort()).toEqual([...SIGNAL_STATUSES].sort());
  });

  it("only ever points at statuses that exist", () => {
    for (const status of SIGNAL_STATUSES) {
      for (const target of SIGNAL_PROGRESSIONS[status]) {
        expect(isSignalStatus(target)).toBe(true);
      }
    }
  });

  it("lets a raised signal do exactly one thing: be looked at", () => {
    expect(SIGNAL_PROGRESSIONS.raised).toEqual(["triaged"]);
  });

  it("leaves every terminal status pointing nowhere", () => {
    for (const status of SIGNAL_STATUSES) {
      if (isTerminalSignalStatus(status)) expect(SIGNAL_PROGRESSIONS[status]).toEqual([]);
    }
  });

  it("is frozen at both levels, so no caller can widen a route at runtime", () => {
    expect(Object.isFrozen(SIGNAL_PROGRESSIONS)).toBe(true);
    for (const status of SIGNAL_STATUSES) {
      expect(Object.isFrozen(SIGNAL_PROGRESSIONS[status])).toBe(true);
    }
    expect(() => {
      (SIGNAL_PROGRESSIONS.raised as SignalStatus[]).push("declined");
    }).toThrow(TypeError);
    expect(SIGNAL_PROGRESSIONS.raised).toEqual(["triaged"]);
  });
});

describe("inspectProgression", () => {
  it("allows the one move a raised signal has", () => {
    const verdict = inspectProgression("raised", "triaged");
    expect(verdict.allowed).toBe(true);
    expect(verdict.refusal).toBeNull();
    expect(verdict.from).toBe("raised");
    expect(verdict.to).toBe("triaged");
  });

  it("allows every disposal once a signal has been triaged", () => {
    for (const disposal of ["accepted", "merged", "declined"] as const) {
      expect(inspectProgression("triaged", disposal).allowed).toBe(true);
    }
  });

  it("will not let a signal be declined before anybody has looked at it", () => {
    const verdict = inspectProgression("raised", "declined");
    expect(verdict.allowed).toBe(false);
    expect(verdict.refusal).toBe("unreachable_status");
  });

  it("will not let a signal be accepted before anybody has looked at it either", () => {
    expect(inspectProgression("raised", "accepted").refusal).toBe("unreachable_status");
  });

  it("refuses a move out of any status the signal has already settled into", () => {
    for (const from of SIGNAL_STATUSES) {
      if (!isTerminalSignalStatus(from)) continue;
      for (const to of SIGNAL_STATUSES) {
        if (to === from) continue;
        expect(inspectProgression(from, to).refusal).toBe("terminal_status");
      }
    }
  });

  it("names a no-op as a no-op rather than allowing it", () => {
    for (const status of SIGNAL_STATUSES) {
      const verdict = inspectProgression(status, status);
      expect(verdict.allowed).toBe(false);
      expect(verdict.refusal).toBe("same_status");
    }
  });

  it("agrees with the route map on every pair of statuses", () => {
    for (const from of SIGNAL_STATUSES) {
      for (const to of SIGNAL_STATUSES) {
        const expected = from !== to && SIGNAL_PROGRESSIONS[from].includes(to);
        expect(inspectProgression(from, to).allowed).toBe(expected);
      }
    }
  });

  it("carries the statuses it was asked about into its answer", () => {
    const verdict = inspectProgression("accepted", "raised");
    expect(verdict.from).toBe("accepted");
    expect(verdict.to).toBe("raised");
  });
});

describe("deliberate absences", () => {
  it("offers no way back from a disposal, because reopening is a new signal", () => {
    const reachable = new Set(SIGNAL_STATUSES.flatMap((status) => SIGNAL_PROGRESSIONS[status]));
    expect(reachable.has("raised")).toBe(false);
  });

  it("privileges no source the declared vocabulary does not contain", () => {
    const declared: readonly SignalSource[] = SIGNAL_SOURCES;
    for (const source of SELF_EVIDENT_SOURCES) expect(declared).toContain(source);
  });
});
