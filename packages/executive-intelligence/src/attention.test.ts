import { describe, expect, it } from "vitest";
import {
  ATTENTION_REASONS,
  ATTENTION_SEVERITIES,
  MIN_KPI_COVERAGE_PER_PILLAR,
  MIN_PILLAR_COVERAGE,
  PERFORMANCE_BANDS,
  SUSTAINED_DECLINE_PERIODS,
  type AttentionReason,
  type AttentionSeverity,
  type HealthPillar,
  type ReadingStanding,
} from "./command-value";
import type {
  AttentionSignal,
  IndexWatch,
  KpiWatch,
  PillarWatch,
  ReadingAdmission,
} from "./command-view";
import {
  BREACH_FLOOR_BAND,
  attentionKeyFor,
  isBreachBand,
  raiseForIndex,
  raiseForKpi,
  raiseForPillar,
  rankAttention,
} from "./attention";

const indexWatch = (overrides: Partial<IndexWatch> = {}): IndexWatch => ({
  value: 80,
  pillarCoverage: 1,
  previousValue: null,
  previousPillarCoverage: 1,
  standing: null,
  previousStanding: null,
  ...overrides,
});

const pillarWatch = (overrides: Partial<PillarWatch> = {}): PillarWatch => ({
  pillar: "financial_health",
  score: 80,
  history: [],
  kpiCoverage: 1,
  ...overrides,
});

const kpiWatch = (overrides: Partial<KpiWatch> = {}): KpiWatch => ({
  kpiKey: "attendance.rate",
  score: 80,
  targetScore: null,
  admission: "admitted",
  ...overrides,
});

const reasonsOf = (signals: readonly AttentionSignal[]): readonly AttentionReason[] =>
  signals.map((entry) => entry.reason);

const only = (signals: readonly AttentionSignal[], reason: AttentionReason): AttentionSignal => {
  const found = signals.filter((entry) => entry.reason === reason);
  expect(found).toHaveLength(1);
  return found[0] as AttentionSignal;
};

const stub = (severity: AttentionSeverity, subject: string): AttentionSignal => ({
  key: attentionKeyFor("band_breach", "pillar", subject),
  reason: "band_breach",
  severity,
  subjectKind: "pillar",
  subject,
  observed: null,
});

describe("isBreachBand", () => {
  it("draws the line at the band an institution is not being asked to act on", () => {
    expect(BREACH_FLOOR_BAND).toBe("healthy");
    expect(isBreachBand("failing")).toBe(true);
    expect(isBreachBand("at_risk")).toBe(true);
    expect(isBreachBand("watch")).toBe(true);
    expect(isBreachBand("healthy")).toBe(false);
    expect(isBreachBand("exemplary")).toBe(false);
  });

  it("has an opinion about every band there is", () => {
    for (const band of PERFORMANCE_BANDS) {
      expect(typeof isBreachBand(band)).toBe("boolean");
    }
  });
});

describe("attentionKeyFor", () => {
  it("identifies a finding by what it is about and why it was raised", () => {
    expect(attentionKeyFor("band_breach", "pillar", "financial_health")).toBe(
      "pillar.financial_health.band_breach",
    );
  });

  it("does not leave an empty segment where a subject-less kind has no subject", () => {
    expect(attentionKeyFor("index_drop", "index", "")).toBe("index.index_drop");
    expect(attentionKeyFor("index_drop", "index", "   ")).toBe("index.index_drop");
  });

  it("reaches the same key from the same finding written differently", () => {
    expect(attentionKeyFor("target_miss", "kpi", " Attendance.Rate ")).toBe(
      attentionKeyFor("target_miss", "kpi", "attendance.rate"),
    );
  });

  it("separates two findings that differ only in what they are about", () => {
    const left = attentionKeyFor("band_breach", "pillar", "financial_health");
    const right = attentionKeyFor("band_breach", "pillar", "learner_wellbeing");
    expect(left).not.toBe(right);
  });

  it("keeps its key while a finding gets worse, so the queue does not grow a second copy", () => {
    const worsening = raiseForPillar(pillarWatch({ score: 40 }));
    const worse = raiseForPillar(pillarWatch({ score: 10 }));
    expect(only(worsening, "band_breach").severity).toBe("advisory");
    expect(only(worse, "band_breach").severity).toBe("urgent");
    expect(only(worse, "band_breach").key).toBe(only(worsening, "band_breach").key);
  });
});

describe("raiseForIndex", () => {
  it("asks for nothing when the index is healthy and has no history to compare against", () => {
    expect(raiseForIndex(indexWatch())).toEqual([]);
  });

  it("raises a coverage gap and nothing else when too few pillars reported", () => {
    const watch = indexWatch({ value: 40, pillarCoverage: MIN_PILLAR_COVERAGE - 0.1 });
    const raised = raiseForIndex(watch);
    expect(reasonsOf(raised)).toEqual(["coverage_gap"]);
    expect(raised[0]?.severity).toBe("urgent");
    expect(raised[0]?.observed).toBe(watch.pillarCoverage);
    expect(raised[0]?.subject).toBe("");
  });

  it("treats an index that could not be computed as a gap rather than as a bad score", () => {
    expect(reasonsOf(raiseForIndex(indexWatch({ value: null })))).toEqual(["coverage_gap"]);
  });

  it("does not compare a period below the floor to one above it", () => {
    const raised = raiseForIndex(
      indexWatch({ value: 60, previousValue: 90, previousPillarCoverage: 0.2 }),
    );
    expect(reasonsOf(raised)).not.toContain("index_drop");
  });

  it("raises a breach on the band the index is standing in", () => {
    expect(only(raiseForIndex(indexWatch({ value: 40 })), "band_breach").severity).toBe("advisory");
    expect(only(raiseForIndex(indexWatch({ value: 10 })), "band_breach").severity).toBe("urgent");
    expect(only(raiseForIndex(indexWatch({ value: 60 })), "band_breach").severity).toBe(
      "informational",
    );
  });

  it("reports the value the breach was raised on", () => {
    expect(only(raiseForIndex(indexWatch({ value: 40 })), "band_breach").observed).toBe(40);
  });

  it("says nothing about a band above the floor", () => {
    expect(reasonsOf(raiseForIndex(indexWatch({ value: 95 })))).not.toContain("band_breach");
  });

  it("raises one signal for a fall, carrying how far the value moved", () => {
    const raised = raiseForIndex(indexWatch({ value: 75, previousValue: 80 }));
    expect(reasonsOf(raised)).toEqual(["index_drop"]);
    expect(only(raised, "index_drop").observed).toBe(-5);
  });

  it("keeps a fall that stayed inside its band quiet", () => {
    expect(
      only(raiseForIndex(indexWatch({ value: 60, previousValue: 65 })), "index_drop").severity,
    ).toBe("informational");
  });

  it("makes a fall that crossed a band louder than standing in it", () => {
    const raised = raiseForIndex(indexWatch({ value: 45, previousValue: 55 }));
    expect(only(raised, "band_breach").severity).toBe("advisory");
    expect(only(raised, "index_drop").severity).toBe("urgent");
  });

  it("says nothing about an index that rose or held", () => {
    expect(raiseForIndex(indexWatch({ value: 80, previousValue: 70 }))).toEqual([]);
    expect(raiseForIndex(indexWatch({ value: 80, previousValue: 80 }))).toEqual([]);
  });

  it("raises the softening of the evidence the index rests on", () => {
    const softened = raiseForIndex(
      indexWatch({ standing: "attested", previousStanding: "measured" }),
    );
    expect(only(softened, "standing_weakened").severity).toBe("advisory");

    const forecast = raiseForIndex(
      indexWatch({ standing: "projected", previousStanding: "measured" }),
    );
    expect(only(forecast, "standing_weakened").severity).toBe("informational");
  });

  it("says nothing about an evidence base that held or strengthened", () => {
    const held = indexWatch({ standing: "attested", previousStanding: "attested" });
    const strengthened = indexWatch({ standing: "measured", previousStanding: "attested" });
    expect(raiseForIndex(held)).toEqual([]);
    expect(raiseForIndex(strengthened)).toEqual([]);
  });

  it("has nothing to compare a standing against when either period lacks one", () => {
    expect(raiseForIndex(indexWatch({ standing: "attested", previousStanding: null }))).toEqual([]);
    expect(raiseForIndex(indexWatch({ standing: null, previousStanding: "measured" }))).toEqual([]);
  });
});

describe("raiseForPillar", () => {
  it("asks for nothing about a healthy pillar with no history", () => {
    expect(raiseForPillar(pillarWatch())).toEqual([]);
  });

  it("raises a coverage gap and nothing else when too few indicators reported", () => {
    const watch = pillarWatch({ score: 20, kpiCoverage: MIN_KPI_COVERAGE_PER_PILLAR - 0.1 });
    const raised = raiseForPillar(watch);
    expect(reasonsOf(raised)).toEqual(["coverage_gap"]);
    expect(raised[0]?.severity).toBe("urgent");
    expect(raised[0]?.observed).toBe(watch.kpiCoverage);
    expect(raised[0]?.subject).toBe("financial_health");
  });

  it("treats a pillar with no score as a gap rather than as a bad score", () => {
    expect(reasonsOf(raiseForPillar(pillarWatch({ score: null })))).toEqual(["coverage_gap"]);
  });

  it("reserves the loudest severity for a pillar that has just arrived in the worst band", () => {
    const arrived = raiseForPillar(pillarWatch({ score: 20, history: [40] }));
    expect(only(arrived, "band_fall").severity).toBe("critical");
  });

  it("is quieter about a pillar that has been failing all along", () => {
    const settled = raiseForPillar(pillarWatch({ score: 18, history: [20] }));
    expect(reasonsOf(settled)).toEqual(["band_breach"]);
    expect(only(settled, "band_breach").severity).toBe("urgent");
  });

  it("prices every arrival at being there, one level louder", () => {
    const arrivals: readonly (readonly [number, number, AttentionSeverity])[] = [
      [40, 20, "critical"],
      [60, 40, "urgent"],
      [80, 60, "advisory"],
      [95, 80, "informational"],
    ];
    for (const [before, after, severity] of arrivals) {
      const raised = raiseForPillar(pillarWatch({ score: after, history: [before] }));
      expect(only(raised, "band_fall").severity).toBe(severity);
    }
  });

  it("reports how many bands a fall crossed", () => {
    expect(
      only(raiseForPillar(pillarWatch({ score: 20, history: [80] })), "band_fall").observed,
    ).toBe(-3);
  });

  it("says nothing about a pillar that climbed or held its band", () => {
    expect(raiseForPillar(pillarWatch({ score: 95, history: [80] }))).toEqual([]);
    expect(raiseForPillar(pillarWatch({ score: 75, history: [80] }))).toEqual([]);
  });

  it("raises a decline that has run long enough, wherever the pillar is standing", () => {
    const sliding = raiseForPillar(pillarWatch({ score: 94, history: [100, 98, 96] }));
    expect(reasonsOf(sliding)).toEqual(["sustained_decline"]);
    expect(sliding[0]?.severity).toBe("urgent");
    expect(sliding[0]?.observed).toBe(SUSTAINED_DECLINE_PERIODS);
  });

  it("does not call a shorter run sustained", () => {
    expect(reasonsOf(raiseForPillar(pillarWatch({ score: 96, history: [100, 98] })))).toEqual([]);
  });

  it("does not let a flat period extend a run", () => {
    expect(reasonsOf(raiseForPillar(pillarWatch({ score: 94, history: [100, 98, 98] })))).toEqual(
      [],
    );
  });

  it("raises everything that is true at once rather than picking one", () => {
    const raised = raiseForPillar(pillarWatch({ score: 20, history: [80, 60, 40] }));
    expect(reasonsOf(raised)).toEqual(["band_breach", "band_fall", "sustained_decline"]);
    expect(only(raised, "band_breach").severity).toBe("urgent");
    expect(only(raised, "band_fall").severity).toBe("critical");
    expect(only(raised, "sustained_decline").severity).toBe("urgent");
  });

  it("names the pillar on every signal it raises", () => {
    const raised = raiseForPillar(
      pillarWatch({ pillar: "learner_wellbeing", score: 20, history: [80, 60, 40] }),
    );
    for (const entry of raised) {
      expect(entry.subject).toBe("learner_wellbeing");
      expect(entry.subjectKind).toBe("pillar");
    }
  });

  it("has an opinion about every pillar it is handed", () => {
    const pillars: readonly HealthPillar[] = ["academic_outcomes", "governance_compliance"];
    for (const pillar of pillars) {
      expect(only(raiseForPillar(pillarWatch({ pillar, score: 10 })), "band_breach").subject).toBe(
        pillar,
      );
    }
  });
});

describe("raiseForKpi", () => {
  it("asks for nothing about an admitted reading with no target to miss", () => {
    expect(raiseForKpi(kpiWatch())).toEqual([]);
  });

  it("sends somebody to collect a fresher figure for a stale reading", () => {
    const raised = raiseForKpi(kpiWatch({ admission: "stale" }));
    expect(reasonsOf(raised)).toEqual(["evidence_stale"]);
    expect(raised[0]?.severity).toBe("advisory");
    expect(raised[0]?.observed).toBeNull();
  });

  it("treats a reading nobody can follow back as a gap in the measurement", () => {
    for (const admission of ["out_of_period", "untraceable"] as const) {
      const raised = raiseForKpi(kpiWatch({ admission }));
      expect(reasonsOf(raised)).toEqual(["coverage_gap"]);
      expect(raised[0]?.severity).toBe("urgent");
    }
  });

  it("says nothing about the performance of a reading the assessment declined to use", () => {
    const admissions: readonly ReadingAdmission[] = ["stale", "out_of_period", "untraceable"];
    for (const admission of admissions) {
      const raised = raiseForKpi(kpiWatch({ admission, score: 10, targetScore: 90 }));
      expect(raised).toHaveLength(1);
      expect(reasonsOf(raised)).not.toContain("target_miss");
    }
  });

  it("raises a missed target with the distance still to travel", () => {
    const raised = raiseForKpi(kpiWatch({ score: 50, targetScore: 80 }));
    expect(reasonsOf(raised)).toEqual(["target_miss"]);
    expect(raised[0]?.observed).toBe(30);
  });

  it("prices a miss by where the reading is standing, not by how far it fell short", () => {
    expect(
      only(raiseForKpi(kpiWatch({ score: 10, targetScore: 80 })), "target_miss").severity,
    ).toBe("urgent");
    expect(
      only(raiseForKpi(kpiWatch({ score: 40, targetScore: 80 })), "target_miss").severity,
    ).toBe("advisory");
    expect(
      only(raiseForKpi(kpiWatch({ score: 95, targetScore: 98 })), "target_miss").severity,
    ).toBe("informational");
  });

  it("does not raise a target that was met exactly or beaten", () => {
    expect(raiseForKpi(kpiWatch({ score: 80, targetScore: 80 }))).toEqual([]);
    expect(raiseForKpi(kpiWatch({ score: 90, targetScore: 80 }))).toEqual([]);
  });

  it("has nothing to compare against when the reading or the target is absent", () => {
    expect(raiseForKpi(kpiWatch({ score: null, targetScore: 80 }))).toEqual([]);
    expect(raiseForKpi(kpiWatch({ score: 50, targetScore: null }))).toEqual([]);
  });

  it("never raises a band signal, however badly the indicator is doing", () => {
    const raised = raiseForKpi(kpiWatch({ score: 1, targetScore: 100 }));
    expect(reasonsOf(raised)).not.toContain("band_breach");
    expect(reasonsOf(raised)).not.toContain("band_fall");
  });

  it("addresses the reading by its normalized key", () => {
    const raised = raiseForKpi(kpiWatch({ kpiKey: "  Attendance.Rate  ", admission: "stale" }));
    expect(raised[0]?.subject).toBe("attendance.rate");
    expect(raised[0]?.subjectKind).toBe("kpi");
  });

  it("has an answer for every admission the traceability engine can return", () => {
    const admissions: readonly ReadingAdmission[] = [
      "admitted",
      "stale",
      "out_of_period",
      "untraceable",
    ];
    for (const admission of admissions) {
      const raised = raiseForKpi(kpiWatch({ admission, score: 10, targetScore: 90 }));
      expect(raised).toHaveLength(1);
    }
  });
});

describe("rankAttention", () => {
  it("puts the loudest first", () => {
    const ranked = rankAttention([
      stub("informational", "a"),
      stub("critical", "b"),
      stub("advisory", "c"),
      stub("urgent", "d"),
    ]);
    expect(ranked.map((entry) => entry.subject)).toEqual(["b", "d", "c", "a"]);
  });

  it("keeps signals raised together together", () => {
    const ranked = rankAttention([
      stub("urgent", "first"),
      stub("urgent", "second"),
      stub("urgent", "third"),
    ]);
    expect(ranked.map((entry) => entry.subject)).toEqual(["first", "second", "third"]);
  });

  it("leaves the queue it was handed alone", () => {
    const queue = [stub("informational", "a"), stub("critical", "b")];
    const ranked = rankAttention(queue);
    expect(queue.map((entry) => entry.subject)).toEqual(["a", "b"]);
    expect(ranked).not.toBe(queue);
  });

  it("has nothing to say about an empty queue", () => {
    expect(rankAttention([])).toEqual([]);
  });
});

describe("the raised vocabulary", () => {
  const battery: readonly AttentionSignal[] = [
    ...raiseForIndex(indexWatch({ value: 40, pillarCoverage: 0.2 })),
    ...raiseForIndex(indexWatch({ value: 40, previousValue: 55 })),
    ...raiseForIndex(indexWatch({ standing: "attested", previousStanding: "measured" })),
    ...raiseForPillar(pillarWatch({ score: 20, history: [80, 60, 40] })),
    ...raiseForKpi(kpiWatch({ score: 10, targetScore: 90 })),
    ...raiseForKpi(kpiWatch({ admission: "stale" })),
  ];

  it("can raise every reason the platform declares, so none is dead vocabulary", () => {
    expect(new Set(reasonsOf(battery))).toEqual(new Set(ATTENTION_REASONS));
  });

  it("speaks only in severities the platform declares", () => {
    const declared = new Set<string>(ATTENTION_SEVERITIES);
    for (const entry of battery) {
      expect(declared.has(entry.severity)).toBe(true);
    }
  });

  it("carries no wording of any kind", () => {
    for (const entry of battery) {
      expect(Object.keys(entry).sort()).toEqual([
        "key",
        "observed",
        "reason",
        "severity",
        "subject",
        "subjectKind",
      ]);
    }
  });

  it("keys every signal by its own subject and reason", () => {
    for (const entry of battery) {
      expect(entry.key).toBe(attentionKeyFor(entry.reason, entry.subjectKind, entry.subject));
    }
  });

  it("does not reuse a standing's vocabulary for a severity", () => {
    const standings: readonly ReadingStanding[] = ["measured", "projected", "attested"];
    for (const standing of standings) {
      expect(ATTENTION_SEVERITIES).not.toContain(standing as unknown as AttentionSeverity);
    }
  });
});
