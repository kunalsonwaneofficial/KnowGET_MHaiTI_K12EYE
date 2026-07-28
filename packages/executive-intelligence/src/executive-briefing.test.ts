import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { attentionKeyFor } from "./attention";
import {
  type AttentionReason,
  type AttentionSeverity,
  BRIEFING_STATUSES,
  type HealthPillar,
} from "./command-value";
import type {
  AttentionSignal,
  AttentionSubjectKind,
  EvidenceCitation,
  PillarInput,
  PillarWeight,
  TracedReading,
} from "./command-view";
import {
  BriefingAssessmentMismatchError,
  BriefingNotDraftingError,
  BriefingNotIssuedError,
  EmptyBriefingAudienceScopeError,
  EmptyBriefingKeyError,
  EmptyBriefingTitleError,
  UncitableAssessmentError,
} from "./errors";
import {
  type DraftBriefingParams,
  type ExecutiveBriefing,
  briefingHeadline,
  briefingVisibleTo,
  draftBriefing,
  isBriefingIssuable,
  isBriefingIssued,
  isBriefingWithdrawn,
  issueBriefing,
  reviseBriefing,
  setBriefingFindings,
  withdrawBriefing,
} from "./executive-briefing";
import {
  type HealthIndexAssessment,
  assessHealthIndex,
  finalizeAssessment,
  invalidateAssessment,
} from "./health-index-assessment";
import { defineHealthIndex, publishHealthIndex } from "./health-index-definition";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;

const WEIGHTS: readonly PillarWeight[] = [
  { pillar: "academic_outcomes", weight: 0.25 },
  { pillar: "teaching_quality", weight: 0.2 },
  { pillar: "attendance_engagement", weight: 0.2 },
  { pillar: "financial_health", weight: 0.15 },
  { pillar: "learner_wellbeing", weight: 0.1 },
  { pillar: "workforce_capacity", weight: 0.1 },
];

const reported = (pillar: HealthPillar, score: number): PillarInput => ({
  pillar,
  score,
  kpisRead: 4,
  kpisDeclared: 5,
});

const FULL: readonly PillarInput[] = [
  reported("academic_outcomes", 80),
  reported("teaching_quality", 70),
  reported("attendance_engagement", 90),
  reported("financial_health", 60),
  reported("learner_wellbeing", 50),
  reported("workforce_capacity", 40),
];

const cite = (ref: string): EvidenceCitation => ({
  kind: "domain_record",
  sourceDomain: "attendance",
  sourceRef: ref,
  attestedBy: null,
});

const traced = (kpiKey: string, period: number): TracedReading => ({
  kpiKey,
  period,
  citations: [cite(kpiKey)],
});

const GROUNDED: readonly TracedReading[] = [
  traced("attendance.rate", 7),
  traced("finance.days", 6),
];

/** A figure nobody stands behind yet: computed, never finalized. */
const provisional = (): HealthIndexAssessment =>
  assessHealthIndex(
    publishHealthIndex(
      defineHealthIndex({
        tenantId: TENANT,
        organizationId: ORG,
        indexKey: "institutional.health",
        name: "Institutional health",
        grain: "term",
        weights: WEIGHTS,
      }),
    ),
    { period: 7, inputs: FULL, readings: GROUNDED },
  );

/** A figure the institution stands behind. The only kind a briefing may cite. */
const final = (): HealthIndexAssessment => finalizeAssessment(provisional());

const finding = (
  reason: AttentionReason,
  severity: AttentionSeverity,
  subjectKind: AttentionSubjectKind,
  subject: string,
  observed: number | null,
): AttentionSignal => ({
  key: attentionKeyFor(reason, subjectKind, subject),
  reason,
  severity,
  subjectKind,
  subject,
  observed,
});

const BREACH = finding("band_breach", "critical", "pillar", "financial_health", 2);
const COVERAGE = finding("coverage_gap", "urgent", "index", "", 0.5);
const DECLINE = finding("sustained_decline", "advisory", "pillar", "teaching_quality", 3);
const MISS = finding("target_miss", "informational", "kpi", "attendance.rate", 4.5);

/** Handed in quietest-first, so anything that stores them in the given order is visible. */
const FINDINGS: readonly AttentionSignal[] = [MISS, DECLINE, COVERAGE, BREACH];

const base: DraftBriefingParams = {
  briefingKey: "board.termly",
  title: "Termly institutional health",
  audienceScope: "command:brief",
  findings: FINDINGS,
};

const draft = (
  assessment: HealthIndexAssessment,
  patch: Partial<DraftBriefingParams> = {},
): ExecutiveBriefing => draftBriefing(assessment, { ...base, ...patch });

/** Whether issuing would in fact go through, so the read-side predicate can be held against it. */
const issues = (briefing: ExecutiveBriefing, assessment: HealthIndexAssessment): boolean => {
  try {
    issueBriefing(briefing, assessment);
    return true;
  } catch {
    return false;
  }
};

describe("drafting a briefing", () => {
  it("takes tenancy, series and period from the assessment rather than from a parameter", () => {
    const assessment = final();
    const briefing = draft(assessment);

    expect(briefing.tenantId).toBe(TENANT);
    expect(briefing.organizationId).toBe(ORG);
    expect(briefing.assessmentId).toBe(assessment.id);
    expect(briefing.indexKey).toBe(assessment.indexKey);
    expect(briefing.period).toBe(assessment.period);
  });

  it("starts as a draft with nothing stamped on it", () => {
    const briefing = draft(final());

    expect(briefing.status).toBe("drafting");
    expect(briefing.issuedAt).toBeNull();
    expect(briefing.withdrawnAt).toBeNull();
    expect(briefing.withdrawalReason).toBeNull();
  });

  it("normalizes the key and the audience scope, and trims the title", () => {
    const briefing = draft(final(), {
      briefingKey: "  Board.Termly  ",
      title: "  Termly institutional health  ",
      audienceScope: "  Command:Brief  ",
    });

    expect(briefing.briefingKey).toBe("board.termly");
    expect(briefing.audienceScope).toBe("command:brief");
    expect(briefing.title).toBe("Termly institutional health");
  });

  it("keeps a narrative the author wrote and stores a blank one as absent", () => {
    expect(draft(final(), { narrative: "  Three pillars moved.  " }).narrative).toBe(
      "Three pillars moved.",
    );
    expect(draft(final(), { narrative: "   " }).narrative).toBeNull();
    expect(draft(final(), { narrative: null }).narrative).toBeNull();
    expect(draft(final()).narrative).toBeNull();
  });

  it("pins the figure itself — value, band, coverage and fingerprint", () => {
    const assessment = final();
    const briefing = draft(assessment);

    expect(briefing.cited).toEqual({
      value: assessment.value,
      band: assessment.band,
      pillarCoverage: assessment.pillarCoverage,
      fingerprint: assessment.fingerprint,
    });
  });

  it("stores the findings ranked, however the caller ordered them", () => {
    const briefing = draft(final());

    expect(briefing.findings.map((entry) => entry.severity)).toEqual([
      "critical",
      "urgent",
      "advisory",
      "informational",
    ]);
    expect(briefing.findings.map((entry) => entry.key)).toEqual([
      BREACH.key,
      COVERAGE.key,
      DECLINE.key,
      MISS.key,
    ]);
  });

  it("copies each finding field by field, so nothing the caller attached is circulated", () => {
    const smuggled = {
      ...BREACH,
      headline: "Financial health has fallen two bands",
    } as AttentionSignal;
    const briefing = draft(final(), { findings: [smuggled] });

    expect(briefing.findings[0]).toEqual({
      key: BREACH.key,
      reason: "band_breach",
      severity: "critical",
      subjectKind: "pillar",
      subject: "financial_health",
      observed: 2,
    });
  });

  it("detaches the findings from the caller's array", () => {
    const mutable: AttentionSignal[] = [BREACH, DECLINE];
    const briefing = draft(final(), { findings: mutable });

    mutable.length = 0;

    expect(briefing.findings).toHaveLength(2);
  });

  it("accepts a briefing that points at nothing", () => {
    expect(draft(final(), { findings: [] }).findings).toEqual([]);
  });

  it("refuses to cite a provisional assessment", () => {
    const assessment = provisional();
    let thrown: unknown;
    try {
      draft(assessment);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UncitableAssessmentError);
    expect((thrown as UncitableAssessmentError).details).toEqual({
      assessmentId: assessment.id,
      status: "provisional",
    });
    expect((thrown as UncitableAssessmentError).httpStatus).toBe(409);
  });

  it("refuses to cite an assessment that has been withdrawn", () => {
    const assessment = invalidateAssessment(final(), "Feed was double-counting");
    let thrown: unknown;
    try {
      draft(assessment);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UncitableAssessmentError);
    expect((thrown as UncitableAssessmentError).details).toMatchObject({ status: "invalidated" });
  });

  it("refuses a key that normalizes to nothing", () => {
    let thrown: unknown;
    try {
      draft(final(), { briefingKey: "   " });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EmptyBriefingKeyError);
    expect((thrown as EmptyBriefingKeyError).httpStatus).toBe(422);
  });

  it("refuses an untitled briefing", () => {
    let thrown: unknown;
    try {
      draft(final(), { title: "  " });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EmptyBriefingTitleError);
    expect((thrown as EmptyBriefingTitleError).httpStatus).toBe(422);
  });

  it("refuses a blank audience, rather than defaulting the widest reading of the most sensitive record", () => {
    let thrown: unknown;
    try {
      draft(final(), { audienceScope: "   " });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EmptyBriefingAudienceScopeError);
    expect((thrown as EmptyBriefingAudienceScopeError).httpStatus).toBe(422);
  });
});

describe("writing a briefing before it goes out", () => {
  it("changes the title and keeps the record's own age", () => {
    const briefing = draft(final());
    const revised = reviseBriefing(briefing, { title: "  Termly health — revised  " });

    expect(revised.title).toBe("Termly health — revised");
    expect(revised.createdAt).toBe(briefing.createdAt);
    expect(revised.id).toBe(briefing.id);
  });

  it("leaves the narrative alone when it is omitted and clears it when it is null", () => {
    const briefing = draft(final(), { narrative: "Three pillars moved." });

    expect(reviseBriefing(briefing, { title: "Same" }).narrative).toBe("Three pillars moved.");
    expect(reviseBriefing(briefing, { title: "Same", narrative: null }).narrative).toBeNull();
  });

  it("refuses to revise the title away", () => {
    let thrown: unknown;
    try {
      reviseBriefing(draft(final()), { title: "   " });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EmptyBriefingTitleError);
  });

  it("re-ranks a replaced finding set rather than storing the caller's order", () => {
    const briefing = setBriefingFindings(draft(final()), [MISS, BREACH]);

    expect(briefing.findings.map((entry) => entry.key)).toEqual([BREACH.key, MISS.key]);
  });

  it("refuses every edit once the briefing has been issued", () => {
    const assessment = final();
    const issued = issueBriefing(draft(assessment), assessment);

    for (const edit of [
      () => reviseBriefing(issued, { title: "Second thoughts" }),
      () => setBriefingFindings(issued, [BREACH]),
    ]) {
      let thrown: unknown;
      try {
        edit();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(BriefingNotDraftingError);
      expect((thrown as BriefingNotDraftingError).details).toEqual({
        id: issued.id,
        status: "issued",
      });
      expect((thrown as BriefingNotDraftingError).httpStatus).toBe(409);
    }
  });

  it("refuses every edit once the briefing has been withdrawn", () => {
    const assessment = final();
    const withdrawn = withdrawBriefing(issueBriefing(draft(assessment), assessment));

    let thrown: unknown;
    try {
      reviseBriefing(withdrawn, { title: "Second thoughts" });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BriefingNotDraftingError);
    expect((thrown as BriefingNotDraftingError).details).toMatchObject({ status: "withdrawn" });
  });
});

describe("issuing a briefing", () => {
  it("stamps the issue and changes nothing about what the document says", () => {
    const assessment = final();
    const drafted = draft(assessment);
    const issued = issueBriefing(drafted, assessment);

    expect(issued.status).toBe("issued");
    expect(issued.issuedAt).not.toBeNull();
    expect(issued.cited).toEqual(drafted.cited);
    expect(issued.findings).toEqual(drafted.findings);
    expect(issued.createdAt).toBe(drafted.createdAt);
  });

  it("refuses an assessment that is not the one the briefing quotes", () => {
    const assessment = final();
    const other = final();
    const drafted = draft(assessment);

    let thrown: unknown;
    try {
      issueBriefing(drafted, other);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BriefingAssessmentMismatchError);
    expect((thrown as BriefingAssessmentMismatchError).details).toEqual({
      id: drafted.id,
      expected: assessment.id,
      received: other.id,
    });
    expect((thrown as BriefingAssessmentMismatchError).httpStatus).toBe(409);
  });

  it("refuses when the figure was withdrawn between drafting and circulation", () => {
    const assessment = final();
    const drafted = draft(assessment);
    const withdrawn = invalidateAssessment(assessment, "A reading was retracted");

    let thrown: unknown;
    try {
      issueBriefing(drafted, withdrawn);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UncitableAssessmentError);
    expect((thrown as UncitableAssessmentError).details).toEqual({
      assessmentId: assessment.id,
      status: "invalidated",
    });
  });

  it("refuses to issue the same briefing twice", () => {
    const assessment = final();
    const issued = issueBriefing(draft(assessment), assessment);

    let thrown: unknown;
    try {
      issueBriefing(issued, assessment);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BriefingNotDraftingError);
  });

  it("carries the figure rather than a pointer that would resolve to the withdrawn one", () => {
    const assessment = final();
    const issued = issueBriefing(draft(assessment), assessment);

    expect(invalidateAssessment(assessment).status).toBe("invalidated");
    expect(issued.cited).toEqual({
      value: assessment.value,
      band: assessment.band,
      pillarCoverage: assessment.pillarCoverage,
      fingerprint: assessment.fingerprint,
    });
  });
});

describe("retracting a briefing", () => {
  it("withdraws an issued briefing and records why", () => {
    const assessment = final();
    const withdrawn = withdrawBriefing(
      issueBriefing(draft(assessment), assessment),
      "  Cited a retracted reading  ",
    );

    expect(withdrawn.status).toBe("withdrawn");
    expect(withdrawn.withdrawnAt).not.toBeNull();
    expect(withdrawn.withdrawalReason).toBe("Cited a retracted reading");
  });

  it("accepts a withdrawal with no reason given", () => {
    const assessment = final();
    const withdrawn = withdrawBriefing(issueBriefing(draft(assessment), assessment), "   ");

    expect(withdrawn.withdrawalReason).toBeNull();
  });

  it("refuses to retract a draft nobody has seen", () => {
    const drafted = draft(final());
    let thrown: unknown;
    try {
      withdrawBriefing(drafted);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BriefingNotIssuedError);
    expect((thrown as BriefingNotIssuedError).details).toEqual({
      id: drafted.id,
      status: "drafting",
    });
    expect((thrown as BriefingNotIssuedError).httpStatus).toBe(409);
  });

  it("refuses to retract the same briefing twice", () => {
    const assessment = final();
    const withdrawn = withdrawBriefing(issueBriefing(draft(assessment), assessment));

    let thrown: unknown;
    try {
      withdrawBriefing(withdrawn);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BriefingNotIssuedError);
    expect((thrown as BriefingNotIssuedError).details).toMatchObject({ status: "withdrawn" });
  });

  it("reaches every briefing status the vocabulary declares", () => {
    const assessment = final();
    const drafted = draft(assessment);
    const issued = issueBriefing(drafted, assessment);
    const withdrawn = withdrawBriefing(issued);

    expect(new Set([drafted.status, issued.status, withdrawn.status])).toEqual(
      new Set(BRIEFING_STATUSES),
    );
  });
});

describe("what a briefing shows the rest of the contract", () => {
  it("says whether it has gone out and whether it still stands", () => {
    const assessment = final();
    const drafted = draft(assessment);
    const issued = issueBriefing(drafted, assessment);
    const withdrawn = withdrawBriefing(issued);

    expect([isBriefingIssued(drafted), isBriefingWithdrawn(drafted)]).toEqual([false, false]);
    expect([isBriefingIssued(issued), isBriefingWithdrawn(issued)]).toEqual([true, false]);
    expect([isBriefingIssued(withdrawn), isBriefingWithdrawn(withdrawn)]).toEqual([false, true]);
  });

  it("predicts issuing exactly, so a review screen offers only what would work", () => {
    const assessment = final();
    const drafted = draft(assessment);
    const issued = issueBriefing(drafted, assessment);
    const other = final();
    const stale = invalidateAssessment(assessment);

    for (const [briefing, against] of [
      [drafted, assessment],
      [drafted, other],
      [drafted, stale],
      [issued, assessment],
    ] as const) {
      expect(isBriefingIssuable(briefing, against)).toBe(issues(briefing, against));
    }
  });

  it("shows a briefing whole to a reader who holds its scope and not at all to one who does not", () => {
    const briefing = draft(final(), { audienceScope: "command:brief" });

    expect(briefingVisibleTo(briefing, ["command:brief", "finance:read"])).toBe(true);
    expect(briefingVisibleTo(briefing, ["  Command:Brief  "])).toBe(true);
    expect(briefingVisibleTo(briefing, ["command:read", "finance:read"])).toBe(false);
    expect(briefingVisibleTo(briefing, [])).toBe(false);
  });

  it("reads its headline off position zero rather than re-ranking what it froze", () => {
    expect(briefingHeadline(draft(final()))).toEqual(BREACH);
    expect(briefingHeadline(draft(final(), { findings: [] }))).toBeNull();
  });
});
