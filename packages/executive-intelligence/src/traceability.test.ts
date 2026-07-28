import { describe, expect, it } from "vitest";
import {
  EVIDENCE_KINDS,
  MAX_READING_AGE_PERIODS,
  type EvidenceKind,
  type ReadingStanding,
} from "./command-value";
import type { EvidenceCitation, TracedReading } from "./command-view";
import {
  EVIDENCE_ISSUE_CODES,
  type EvidenceIssueCode,
  auditTrace,
  validateEvidence,
} from "./traceability";

const cite = (
  kind: EvidenceKind,
  sourceRef = "rec-1",
  attestedBy: string | null = null,
  sourceDomain = "attendance",
): EvidenceCitation => ({ kind, sourceDomain, sourceRef, attestedBy });

const manual = (
  attestedBy: string | null = "principal-7",
  sourceRef = "return-1",
): EvidenceCitation => cite("manual_return", sourceRef, attestedBy);

const reading = (
  kpiKey: string,
  period: number,
  citations: readonly EvidenceCitation[],
): TracedReading => ({ kpiKey, period, citations });

const codesOf = (citations: readonly EvidenceCitation[]): readonly string[] =>
  validateEvidence(citations).issues.map((entry) => entry.code);

describe("validateEvidence", () => {
  it("accepts a citation into an operational domain", () => {
    expect(validateEvidence([cite("domain_record")])).toEqual({
      usable: true,
      standing: "measured",
      issues: [],
    });
  });

  it("declares every issue code it can emit, without repetition", () => {
    expect(new Set(EVIDENCE_ISSUE_CODES).size).toBe(EVIDENCE_ISSUE_CODES.length);
  });

  it("refuses a reading that cites nothing and says nothing else about it", () => {
    expect(validateEvidence([])).toEqual({
      usable: false,
      standing: null,
      issues: [{ code: "no_evidence", citationIndex: null }],
    });
  });

  it("names the citation a fault was found at", () => {
    const verdict = validateEvidence([cite("domain_record"), cite("domain_record", "   ")]);
    expect(verdict.issues).toContainEqual({ code: "missing_source_ref", citationIndex: 1 });
  });

  it("refuses a citation with no domain to look in", () => {
    expect(codesOf([cite("domain_record", "rec-1", null, "  ")])).toContain(
      "missing_source_domain",
    );
  });

  it("requires a manual return to name somebody", () => {
    expect(codesOf([manual(null)])).toContain("missing_attestor");
    expect(codesOf([manual("   ")])).toContain("missing_attestor");
    expect(validateEvidence([manual("bursar-3")]).usable).toBe(true);
  });

  it("refuses an attestor on evidence that already carries its own authorship", () => {
    expect(codesOf([cite("domain_record", "rec-1", "clerk-2")])).toContain("attestor_not_required");
  });

  it("requires an attestor only for the kinds that are somebody's word", () => {
    for (const kind of EVIDENCE_KINDS) {
      const withoutName = validateEvidence([cite(kind)]);
      const missing = withoutName.issues.some((entry) => entry.code === "missing_attestor");
      expect(missing).toBe(kind === "manual_return");
    }
  });

  it("refuses a set that cites the same record twice", () => {
    const doubled = [cite("domain_record", "rec-9"), cite("domain_record", "rec-9")];
    expect(validateEvidence(doubled).issues).toContainEqual({
      code: "duplicate_citation",
      citationIndex: 1,
    });
  });

  it("treats the same ref in two domains as two records", () => {
    const spread = [
      cite("domain_record", "rec-9", null, "attendance"),
      cite("domain_record", "rec-9", null, "financial"),
    ];
    expect(validateEvidence(spread).usable).toBe(true);
  });

  it("does not fold the case of an opaque ref, so two refs are not merged into one", () => {
    const mixed = [cite("domain_record", "REC-9"), cite("domain_record", "rec-9")];
    expect(codesOf(mixed)).not.toContain("duplicate_citation");
  });

  it("takes the weakest standing of everything cited", () => {
    expect(validateEvidence([cite("domain_record"), cite("forecast_run", "run-2")]).standing).toBe(
      "projected",
    );
    expect(
      validateEvidence([cite("domain_record"), cite("forecast_run", "run-2"), manual()]).standing,
    ).toBe("attested");
  });

  it("does not report a standing for evidence that did not pass", () => {
    const verdict = validateEvidence([cite("domain_record"), manual(null)]);
    expect(verdict.usable).toBe(false);
    expect(verdict.standing).toBeNull();
  });

  it("reports several faults at once rather than one at a time", () => {
    const messy = [cite("domain_record", "  ", "clerk-2", "  ")];
    const codes = codesOf(messy);
    expect(codes).toContain("missing_source_domain");
    expect(codes).toContain("missing_source_ref");
    expect(codes).toContain("attestor_not_required");
  });

  it("emits only codes it declared", () => {
    const declared = new Set<string>(EVIDENCE_ISSUE_CODES);
    const broken: readonly (readonly EvidenceCitation[])[] = [
      [],
      [cite("domain_record", "  ")],
      [cite("domain_record", "rec-1", "clerk-2", "  ")],
      [manual(null)],
      [cite("audit_finding", "f-1"), cite("audit_finding", "f-1")],
    ];
    for (const set of broken) {
      for (const entry of validateEvidence(set).issues) {
        expect(declared.has(entry.code as EvidenceIssueCode)).toBe(true);
      }
    }
  });
});

describe("auditTrace", () => {
  const measured = (kpiKey: string, period: number): TracedReading =>
    reading(kpiKey, period, [cite("domain_record", `${kpiKey}-${String(period)}`)]);

  it("admits a reading taken in the assessment's own period", () => {
    const verdict = auditTrace([measured("attendance.rate", 12)], 12);
    expect(verdict.admitted).toBe(1);
    expect(verdict.audits[0]?.admission).toBe("admitted");
    expect(verdict.audits[0]?.age).toBe(0);
  });

  it("admits a reading at the oldest age the platform allows", () => {
    const period = 12 - MAX_READING_AGE_PERIODS;
    const verdict = auditTrace([measured("attendance.rate", period)], 12);
    expect(verdict.audits[0]?.admission).toBe("admitted");
    expect(verdict.audits[0]?.age).toBe(MAX_READING_AGE_PERIODS);
  });

  it("calls a reading one period past that floor stale", () => {
    const verdict = auditTrace([measured("attendance.rate", 12 - MAX_READING_AGE_PERIODS - 1)], 12);
    expect(verdict.audits[0]?.admission).toBe("stale");
    expect(verdict.stale).toBe(1);
    expect(verdict.admitted).toBe(0);
  });

  it("separates a reading ahead of the assessment from one behind it", () => {
    const verdict = auditTrace([measured("attendance.rate", 14)], 12);
    expect(verdict.audits[0]?.admission).toBe("out_of_period");
    expect(verdict.audits[0]?.age).toBe(-2);
    expect(verdict.outOfPeriod).toBe(1);
    expect(verdict.stale).toBe(0);
  });

  it("treats a period that is not an ordinal as off the grid rather than as old", () => {
    expect(auditTrace([measured("attendance.rate", 11.5)], 12).audits[0]?.admission).toBe(
      "out_of_period",
    );
    expect(auditTrace([measured("attendance.rate", 11)], 12.5).audits[0]?.admission).toBe(
      "out_of_period",
    );
  });

  it("calls an unsourced reading untraceable rather than stale, however old it is", () => {
    const ancient = reading("attendance.rate", 0, []);
    const verdict = auditTrace([ancient], 40);
    expect(verdict.audits[0]?.admission).toBe("untraceable");
    expect(verdict.untraceable).toBe(1);
    expect(verdict.stale).toBe(0);
  });

  it("reports no standing for a reading whose evidence did not pass", () => {
    const verdict = auditTrace([reading("attendance.rate", 12, [manual(null)])], 12);
    expect(verdict.audits[0]?.standing).toBeNull();
    expect(verdict.standing).toBeNull();
  });

  it("keeps the readings in the order they were given", () => {
    const verdict = auditTrace(
      [measured("b.two", 12), measured("a.one", 12), measured("c.three", 12)],
      12,
    );
    expect(verdict.audits.map((entry) => entry.kpiKey)).toEqual(["b.two", "a.one", "c.three"]);
  });

  it("takes the weakest standing across the admitted readings", () => {
    const verdict = auditTrace(
      [
        measured("attendance.rate", 12),
        reading("finance.forecast", 12, [cite("forecast_run", "run-1", null, "financial")]),
      ],
      12,
    );
    expect(verdict.standing).toBe("projected");
  });

  it("does not let a rejected reading drag the standing down", () => {
    const verdict = auditTrace(
      [measured("attendance.rate", 12), reading("wellbeing.return", 2, [manual()])],
      12,
    );
    expect(verdict.audits[1]?.admission).toBe("stale");
    expect(verdict.standing).toBe("measured");
  });

  it("counts the admitted readings by standing", () => {
    const verdict = auditTrace(
      [
        measured("attendance.rate", 12),
        measured("academic.progress", 12),
        reading("finance.forecast", 12, [cite("forecast_run", "run-1", null, "financial")]),
        reading("wellbeing.return", 12, [manual()]),
        reading("library.usage", 12, []),
      ],
      12,
    );
    const expected: Record<ReadingStanding, number> = {
      measured: 2,
      projected: 1,
      attested: 1,
    };
    expect(verdict.standingCounts).toEqual(expected);
    expect(verdict.admitted).toBe(4);
    expect(verdict.untraceable).toBe(1);
  });

  it("shows an index resting entirely on somebody's word as exactly that", () => {
    const verdict = auditTrace(
      [
        reading("a.one", 12, [manual("head-1", "r-1")]),
        reading("b.two", 12, [manual("head-1", "r-2")]),
      ],
      12,
    );
    expect(verdict.standing).toBe("attested");
    expect(verdict.standingCounts.measured).toBe(0);
    expect(verdict.standingCounts.attested).toBe(2);
  });

  it("reports nothing at all for an assessment with no readings", () => {
    const verdict = auditTrace([], 12);
    expect(verdict).toEqual({
      standing: null,
      audits: [],
      admitted: 0,
      stale: 0,
      outOfPeriod: 0,
      untraceable: 0,
      standingCounts: { measured: 0, projected: 0, attested: 0 },
    });
  });

  it("accounts for every reading exactly once across the four counts", () => {
    const readings: readonly TracedReading[] = [
      measured("a.one", 12),
      measured("b.two", 2),
      measured("c.three", 14),
      reading("d.four", 12, []),
      measured("e.five", 11),
    ];
    const verdict = auditTrace(readings, 12);
    const counted = verdict.admitted + verdict.stale + verdict.outOfPeriod + verdict.untraceable;
    expect(counted).toBe(readings.length);
    expect(verdict.audits).toHaveLength(readings.length);
  });
});
