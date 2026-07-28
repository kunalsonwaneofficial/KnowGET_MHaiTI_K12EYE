import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { READING_STANDINGS, type EvidenceKind } from "./command-value";
import type { EvidenceCitation, MeasurementScale, ScoreAnchor } from "./command-view";
import {
  KpiNotActiveError,
  KpiReadingAlreadyWithdrawnError,
  NonOrdinalReadingPeriodError,
  UngroundedKpiReadingError,
} from "./errors";
import {
  type DefineKpiParams,
  type KpiDefinition,
  activateKpi,
  defineKpi,
  retargetKpi,
  retireKpi,
} from "./kpi-definition";
import {
  type KpiReading,
  type RecordKpiReadingParams,
  isKpiReadingScoreable,
  isKpiReadingWithdrawn,
  kpiReadingScore,
  recordKpiReading,
  toKpiWatch,
  toTracedReadings,
  withdrawKpiReading,
} from "./kpi-reading";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;

const anchors = (...pairs: readonly (readonly [number, number])[]): readonly ScoreAnchor[] =>
  pairs.map(([value, score]) => ({ value, score }));

const scale: MeasurementScale = {
  unit: "percentage",
  polarity: "higher_is_better",
  anchors: anchors([85, 0], [90, 50], [93, 70], [96, 100]),
};

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

const declared: DefineKpiParams = {
  tenantId: TENANT,
  organizationId: ORG,
  kpiKey: "attendance.rate",
  name: "Attendance rate",
  pillar: "attendance_engagement",
  sourceDomain: "attendance",
  scale,
  targetScore: 80,
};

const kpi = (patch: Partial<DefineKpiParams> = {}): KpiDefinition =>
  activateKpi(defineKpi({ ...declared, ...patch }));

const base: RecordKpiReadingParams = {
  period: 11,
  rawValue: 93,
  citations: [cite("domain_record")],
};

const reading = (
  patch: Partial<RecordKpiReadingParams> = {},
  definition: KpiDefinition = kpi(),
): KpiReading => recordKpiReading(definition, { ...base, ...patch });

/** Why a figure could not be scored, or `null` when it was. Narrows the measurement union in one place. */
const reasonOf = (record: KpiReading): string | null =>
  record.measurement.scoreable ? null : record.measurement.reason;

describe("filing a figure against an indicator", () => {
  it("takes its identity from the definition in hand rather than being told", () => {
    const definition = kpi();
    const record = reading({}, definition);
    expect(record.tenantId).toBe(TENANT);
    expect(record.organizationId).toBe(ORG);
    expect(record.kpiDefinitionId).toBe(definition.id);
    expect(record.kpiKey).toBe("attendance.rate");
    expect(record.pillar).toBe("attendance_engagement");
    expect(record.id).not.toBe(definition.id);
  });

  it("scores the figure itself, so no caller can file a flattering score beside it", () => {
    expect(reading().measurement).toEqual({
      scoreable: true,
      raw: 93,
      score: 70,
      band: "healthy",
      clamp: "none",
    });
  });

  it("starts standing, with nothing said about a withdrawal", () => {
    const record = reading();
    expect(record.withdrawnAt).toBeNull();
    expect(record.withdrawalReason).toBeNull();
    expect(isKpiReadingWithdrawn(record)).toBe(false);
    expect(record.createdAt).toBe(record.updatedAt);
  });

  it("keeps the period as the ordinal it was given, on whatever grid the institution numbers", () => {
    expect(reading({ period: 0 }).period).toBe(0);
    expect(reading({ period: -3 }).period).toBe(-3);
    expect(reading({ period: 204 }).period).toBe(204);
  });

  it("refuses a period nothing could be aged against", () => {
    expect(() => reading({ period: 11.5 })).toThrow(NonOrdinalReadingPeriodError);
    expect(() => reading({ period: Number.NaN })).toThrow(NonOrdinalReadingPeriodError);
    expect(() => reading({ period: Number.POSITIVE_INFINITY })).toThrow(
      NonOrdinalReadingPeriodError,
    );
  });

  it("says which period it refused", () => {
    let thrown: unknown;
    try {
      reading({ period: 11.5 });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(NonOrdinalReadingPeriodError);
    expect((thrown as NonOrdinalReadingPeriodError).details).toEqual({ period: 11.5 });
    expect((thrown as NonOrdinalReadingPeriodError).httpStatus).toBe(422);
  });

  it("refuses a figure against a scale still being argued about", () => {
    const unagreed = defineKpi(declared);
    let thrown: unknown;
    try {
      recordKpiReading(unagreed, base);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(KpiNotActiveError);
    expect((thrown as KpiNotActiveError).details).toEqual({
      kpiKey: "attendance.rate",
      status: "draft",
    });
    expect((thrown as KpiNotActiveError).httpStatus).toBe(409);
  });

  it("refuses a figure from a feed nobody switched off, rather than absorbing it", () => {
    let thrown: unknown;
    try {
      recordKpiReading(retireKpi(kpi()), base);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(KpiNotActiveError);
    expect((thrown as KpiNotActiveError).details).toMatchObject({ status: "retired" });
  });
});

describe("rule — a reading cannot exist without the evidence it stands on", () => {
  it("refuses a figure that cites nothing at all", () => {
    let thrown: unknown;
    try {
      reading({ citations: [] });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UngroundedKpiReadingError);
    expect((thrown as UngroundedKpiReadingError).details).toMatchObject({
      kpiKey: "attendance.rate",
      issues: ["no_evidence"],
    });
    expect((thrown as UngroundedKpiReadingError).httpStatus).toBe(422);
  });

  it("reports every fault in the evidence at once, in the engine's own vocabulary", () => {
    let thrown: unknown;
    try {
      reading({
        citations: [
          cite("domain_record", "  ", "clerk-2", "  "),
          cite("domain_record", "  ", "clerk-2", "  "),
          manual(null),
        ],
      });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as UngroundedKpiReadingError).details).toMatchObject({
      issues: expect.arrayContaining([
        "missing_source_domain",
        "missing_source_ref",
        "attestor_not_required",
        "duplicate_citation",
        "missing_attestor",
      ]),
    });
  });

  it("takes the weakest standing of what it cites, so an author cannot promote their own figure", () => {
    expect(reading().standing).toBe("measured");
    expect(
      reading({ citations: [cite("domain_record"), cite("forecast_run", "run-2")] }).standing,
    ).toBe("projected");
    expect(reading({ citations: [cite("forecast_run", "run-2"), manual()] }).standing).toBe(
      "attested",
    );
  });

  it("reaches every standing the vocabulary declares", () => {
    const reached = new Set(
      [[cite("domain_record")], [cite("forecast_run", "run-2")], [manual()]].map(
        (citations) => reading({ citations }).standing,
      ),
    );
    expect(reached).toEqual(new Set(READING_STANDINGS));
  });

  it("stores the citations canonically, folding the domain and leaving the opaque ref alone", () => {
    const record = reading({
      citations: [cite("domain_record", "  REC-9 ", null, "  Attendance ")],
    });
    expect(record.citations).toEqual([
      { kind: "domain_record", sourceDomain: "attendance", sourceRef: "REC-9", attestedBy: null },
    ]);
  });

  it("trims an attestor and reads a blank one as nobody", () => {
    expect(reading({ citations: [manual("  bursar-3  ")] }).citations[0]?.attestedBy).toBe(
      "bursar-3",
    );
  });

  it("detaches the citations from the array the caller passed", () => {
    const citations: EvidenceCitation[] = [cite("domain_record")];
    const record = reading({ citations });
    citations.push(cite("audit_finding", "audit-2"));
    expect(record.citations).toHaveLength(1);
    expect(record.citations).not.toBe(citations);
  });
});

describe("a figure that could not be scored is recorded, not lost", () => {
  it("keeps a corrupt figure with no score on it to read", () => {
    const record = reading({ rawValue: 140 });
    expect(record.measurement).toEqual({
      scoreable: false,
      raw: 140,
      reason: "inadmissible_value",
    });
    expect(isKpiReadingScoreable(record)).toBe(false);
    expect(record.standing).toBe("measured");
  });

  it("never reports an unusable scale, because activation refused every scale that was one", () => {
    const reasons = [-1, 0, 50, 93, 140, Number.NaN, Number.POSITIVE_INFINITY].map((rawValue) =>
      reasonOf(reading({ rawValue })),
    );
    expect(reasons).toEqual([
      "inadmissible_value",
      null,
      null,
      null,
      "inadmissible_value",
      "inadmissible_value",
      "inadmissible_value",
    ]);
  });

  it("says a figure sat off the end of the scale rather than hiding it in the score", () => {
    expect(reading({ rawValue: 99 }).measurement).toMatchObject({ score: 100, clamp: "above" });
    expect(reading({ rawValue: 40 }).measurement).toMatchObject({ score: 0, clamp: "below" });
  });
});

describe("taking a figure back", () => {
  it("says when and why, and leaves the figure where it is", () => {
    const record = reading();
    const withdrawn = withdrawKpiReading(record, "  register was double-counted  ");
    expect(withdrawn.withdrawnAt).not.toBeNull();
    expect(withdrawn.withdrawalReason).toBe("register was double-counted");
    expect(withdrawn.measurement).toEqual(record.measurement);
    expect(withdrawn.citations).toEqual(record.citations);
    expect(isKpiReadingWithdrawn(withdrawn)).toBe(true);
  });

  it("reads a blank reason as none rather than storing whitespace", () => {
    expect(withdrawKpiReading(reading(), "   ").withdrawalReason).toBeNull();
  });

  it("leaves the reading it was handed standing", () => {
    const record = reading();
    withdrawKpiReading(record, "wrong");
    expect(record.withdrawnAt).toBeNull();
  });

  it("refuses a second withdrawal, which would move the moment an invalidation traced to", () => {
    const withdrawn = withdrawKpiReading(reading(), "wrong");
    let thrown: unknown;
    try {
      withdrawKpiReading(withdrawn, "still wrong");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(KpiReadingAlreadyWithdrawnError);
    expect((thrown as KpiReadingAlreadyWithdrawnError).details).toEqual({ id: withdrawn.id });
    expect((thrown as KpiReadingAlreadyWithdrawnError).httpStatus).toBe(409);
  });
});

describe("reading a reading", () => {
  it("gives the score of a standing figure", () => {
    expect(kpiReadingScore(reading())).toBe(70);
  });

  it("gives no score for a figure the institution took back", () => {
    expect(kpiReadingScore(withdrawKpiReading(reading(), "wrong"))).toBeNull();
  });

  it("gives no score for a figure the scale could not score", () => {
    expect(kpiReadingScore(reading({ rawValue: 140 }))).toBeNull();
  });

  it("never gives a zero for a figure that was never scored, which would report a crisis", () => {
    expect(kpiReadingScore(reading({ rawValue: 140 }))).not.toBe(0);
    expect(kpiReadingScore(reading({ rawValue: 40 }))).toBe(0);
  });

  it("keeps scoreability a coverage fact, separate from whether the figure still stands", () => {
    const withdrawn = withdrawKpiReading(reading(), "wrong");
    expect(isKpiReadingScoreable(withdrawn)).toBe(true);
    expect(kpiReadingScore(withdrawn)).toBeNull();
  });
});

describe("what a reading shows the rest of the contract", () => {
  it("keeps a withdrawn figure out of an assessment's evidence base", () => {
    const standing = reading({ period: 11 });
    const taken = withdrawKpiReading(reading({ period: 12 }), "wrong");
    expect(toTracedReadings([standing, taken])).toEqual([
      { kpiKey: "attendance.rate", period: 11, citations: standing.citations },
    ]);
  });

  it("preserves the order it was handed", () => {
    const periods = toTracedReadings([
      reading({ period: 12 }),
      reading({ period: 10 }),
      reading({ period: 11 }),
    ]).map((entry) => entry.period);
    expect(periods).toEqual([12, 10, 11]);
  });

  it("shows the audit the evidence and the period, and not the number", () => {
    const traced = toTracedReadings([reading()]);
    expect(Object.keys(traced[0] ?? {}).sort()).toEqual(["citations", "kpiKey", "period"]);
  });

  it("takes nothing to trace from an empty set", () => {
    expect(toTracedReadings([])).toEqual([]);
  });

  it("watches a figure against the target its definition currently declares", () => {
    const definition = kpi();
    const record = reading({}, definition);
    expect(toKpiWatch(record, definition, "admitted")).toEqual({
      kpiKey: "attendance.rate",
      score: 70,
      targetScore: 80,
      admission: "admitted",
    });
  });

  it("follows a retarget rather than a copy of the target taken when the figure was filed", () => {
    const definition = kpi();
    const record = reading({}, definition);
    expect(toKpiWatch(record, retargetKpi(definition, 95), "admitted").targetScore).toBe(95);
    expect(toKpiWatch(record, retargetKpi(definition, null), "admitted").targetScore).toBeNull();
  });

  it("passes the admission through rather than holding a second opinion about it", () => {
    const definition = kpi();
    const record = reading({}, definition);
    expect(toKpiWatch(record, definition, "stale").admission).toBe("stale");
    expect(toKpiWatch(record, definition, "untraceable").admission).toBe("untraceable");
  });

  it("shows no score for a figure that was withdrawn or never scored", () => {
    const definition = kpi();
    const withdrawn = withdrawKpiReading(reading({}, definition), "wrong");
    const corrupt = reading({ rawValue: 140 }, definition);
    expect(toKpiWatch(withdrawn, definition, "admitted").score).toBeNull();
    expect(toKpiWatch(corrupt, definition, "admitted").score).toBeNull();
  });
});
