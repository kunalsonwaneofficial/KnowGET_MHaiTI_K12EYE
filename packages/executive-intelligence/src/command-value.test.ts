import { describe, expect, it } from "vitest";
import {
  ATTENTION_REASONS,
  ATTENTION_SEVERITIES,
  ATTENTION_STATUSES,
  ASSESSMENT_STATUSES,
  BAND_FLOORS,
  BRIEFING_STATUSES,
  CLOSED_ATTENTION_STATUSES,
  DASHBOARD_STATUSES,
  EVIDENCE_KINDS,
  EVIDENCE_REQUIRING_ATTESTOR,
  EVIDENCE_STANDING,
  HEALTH_PILLARS,
  INDEX_PRECISION,
  INDEX_STATUSES,
  KPI_STATUSES,
  MAX_NORMALIZED_SCORE,
  MAX_PANELS_PER_DASHBOARD,
  MAX_PILLAR_WEIGHT,
  MAX_READING_AGE_PERIODS,
  MEASURE_UNITS,
  METRIC_POLARITIES,
  MIN_KPI_COVERAGE_PER_PILLAR,
  MIN_NORMALIZED_SCORE,
  MIN_PILLAR_COVERAGE,
  MIN_PILLAR_WEIGHT,
  PANEL_BINDINGS,
  PANEL_VISIBILITY_OUTCOMES,
  PERFORMANCE_BANDS,
  PERIOD_GRAINS,
  PILLAR_COUNT,
  POLARITIES_REQUIRING_TARGET,
  READING_STANDINGS,
  SUSTAINED_DECLINE_PERIODS,
  WEIGHT_PRECISION,
  WEIGHT_TOTAL,
  bandRank,
  coverageRatio,
  isAttentionOpen,
  isFiniteMeasure,
  isHealthPillar,
  isKpiCoverageSufficient,
  isMeasureAdmissible,
  isNormalizedScore,
  isPillarCoverageSufficient,
  isReadingCurrent,
  isWeightAdmissible,
  isWeightSetBalanced,
  isWorseBand,
  normalizeAttentionKey,
  normalizeBriefingKey,
  normalizeDashboardKey,
  normalizeIndexKey,
  normalizeKpiKey,
  normalizePanelKey,
  normalizeScope,
  normalizeSourceDomain,
  roundIndexValue,
  roundWeight,
  scopeGrants,
  severityRank,
  standingRank,
  weakestStanding,
} from "./command-value";

describe("key normalization", () => {
  const normalizers = [
    ["kpi", normalizeKpiKey],
    ["index", normalizeIndexKey],
    ["dashboard", normalizeDashboardKey],
    ["panel", normalizePanelKey],
    ["briefing", normalizeBriefingKey],
    ["attention", normalizeAttentionKey],
    ["source domain", normalizeSourceDomain],
    ["scope", normalizeScope],
  ] as const;

  it.each(normalizers)("trims and lower-cases a %s key", (_label, normalize) => {
    expect(normalize("  Attendance.Chronic_Absence_Rate  ")).toBe(
      "attendance.chronic_absence_rate",
    );
  });

  it.each(normalizers)("is idempotent for a %s key", (_label, normalize) => {
    const once = normalize(" Financial.Collection_Rate ");
    expect(normalize(once)).toBe(once);
  });

  it("leaves an already-canonical key untouched", () => {
    expect(normalizeKpiKey("workforce.retention")).toBe("workforce.retention");
  });

  it("does not collapse interior whitespace, so a key with a space stays distinct", () => {
    expect(normalizeKpiKey(" chronic absence ")).toBe("chronic absence");
  });

  it("normalizes an empty-ish key to the empty string rather than inventing one", () => {
    expect(normalizeKpiKey("   ")).toBe("");
  });
});

describe("numeric discipline", () => {
  it("fixes the derived-value precision at six places", () => {
    expect(INDEX_PRECISION).toBe(6);
  });

  it("fixes the declared-weight precision at four places, coarser than derived values", () => {
    expect(WEIGHT_PRECISION).toBe(4);
    expect(WEIGHT_PRECISION).toBeLessThan(INDEX_PRECISION);
  });

  it("rounds a derived value to the fixed place", () => {
    expect(roundIndexValue(1 / 3)).toBe(0.333333);
    expect(roundIndexValue(2 / 3)).toBe(0.666667);
  });

  it("resolves the halfway case away from zero, symmetrically", () => {
    expect(roundIndexValue(0.0000005)).toBe(0.000001);
    expect(roundIndexValue(-0.0000005)).toBe(-0.000001);
  });

  it("normalizes negative zero, so a delta of nothing digests identically either way", () => {
    expect(Object.is(roundIndexValue(-0), 0)).toBe(true);
    expect(Object.is(roundIndexValue(-0.0000000001), 0)).toBe(true);
  });

  it("passes non-finite values through rather than coercing them to a number", () => {
    expect(roundIndexValue(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(roundIndexValue(Number.NaN))).toBe(true);
  });

  it("rounds a weight to four places", () => {
    expect(roundWeight(1 / 6)).toBe(0.1667);
    expect(roundWeight(0.12345)).toBe(0.1235);
  });

  it("is stable under repeated rounding", () => {
    const once = roundIndexValue(Math.PI);
    expect(roundIndexValue(once)).toBe(once);
    const weight = roundWeight(1 / 7);
    expect(roundWeight(weight)).toBe(weight);
  });

  it("admits only finite numbers as measures", () => {
    expect(isFiniteMeasure(0)).toBe(true);
    expect(isFiniteMeasure(-12.5)).toBe(true);
    expect(isFiniteMeasure(Number.NaN)).toBe(false);
    expect(isFiniteMeasure(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFiniteMeasure(Number.NEGATIVE_INFINITY)).toBe(false);
  });
});

describe("health pillars", () => {
  it("declares exactly ten pillars", () => {
    expect(HEALTH_PILLARS).toHaveLength(10);
    expect(PILLAR_COUNT).toBe(10);
  });

  it("names every pillar uniquely", () => {
    expect(new Set(HEALTH_PILLARS).size).toBe(HEALTH_PILLARS.length);
  });

  it("covers the institution rather than one part of it", () => {
    expect(HEALTH_PILLARS).toContain("academic_outcomes");
    expect(HEALTH_PILLARS).toContain("learner_wellbeing");
    expect(HEALTH_PILLARS).toContain("financial_health");
    expect(HEALTH_PILLARS).toContain("governance_compliance");
  });

  it("narrows a string that names a pillar", () => {
    expect(isHealthPillar("financial_health")).toBe(true);
    expect(isHealthPillar("learner_wellbeing")).toBe(true);
  });

  it("rejects a string that does not, including near-misses and casing", () => {
    expect(isHealthPillar("finance")).toBe(false);
    expect(isHealthPillar("Financial_Health")).toBe(false);
    expect(isHealthPillar("")).toBe(false);
  });

  it("recognizes every declared pillar", () => {
    for (const pillar of HEALTH_PILLARS) {
      expect(isHealthPillar(pillar)).toBe(true);
    }
  });
});

describe("measure units", () => {
  it("declares each unit once", () => {
    expect(new Set(MEASURE_UNITS).size).toBe(MEASURE_UNITS.length);
  });

  it("requires a count to be a non-negative integer", () => {
    expect(isMeasureAdmissible("count", 0)).toBe(true);
    expect(isMeasureAdmissible("count", 412)).toBe(true);
    expect(isMeasureAdmissible("count", 4.5)).toBe(false);
    expect(isMeasureAdmissible("count", -1)).toBe(false);
  });

  it("bounds a percentage at nought and a hundred", () => {
    expect(isMeasureAdmissible("percentage", 0)).toBe(true);
    expect(isMeasureAdmissible("percentage", 94.2)).toBe(true);
    expect(isMeasureAdmissible("percentage", 100)).toBe(true);
    expect(isMeasureAdmissible("percentage", 100.1)).toBe(false);
    expect(isMeasureAdmissible("percentage", -0.1)).toBe(false);
  });

  it("leaves a ratio unbounded above, because applications per seat exceed one", () => {
    expect(isMeasureAdmissible("ratio", 3.4)).toBe(true);
    expect(isMeasureAdmissible("ratio", 0)).toBe(true);
    expect(isMeasureAdmissible("ratio", -0.01)).toBe(false);
  });

  it("admits a signed integer for currency in minor units, so a negative balance is storable", () => {
    expect(isMeasureAdmissible("currency_minor", -250_00)).toBe(true);
    expect(isMeasureAdmissible("currency_minor", 0)).toBe(true);
    expect(isMeasureAdmissible("currency_minor", 12.5)).toBe(false);
  });

  it("bounds a score to the normalized scale", () => {
    expect(isMeasureAdmissible("score", MIN_NORMALIZED_SCORE)).toBe(true);
    expect(isMeasureAdmissible("score", MAX_NORMALIZED_SCORE)).toBe(true);
    expect(isMeasureAdmissible("score", 101)).toBe(false);
  });

  it("requires days and rates to be non-negative", () => {
    expect(isMeasureAdmissible("days", 0)).toBe(true);
    expect(isMeasureAdmissible("days", 17.5)).toBe(true);
    expect(isMeasureAdmissible("days", -1)).toBe(false);
    expect(isMeasureAdmissible("rate_per_thousand", 6.2)).toBe(true);
    expect(isMeasureAdmissible("rate_per_thousand", -6.2)).toBe(false);
  });

  it("rejects a non-finite value in every unit", () => {
    for (const unit of MEASURE_UNITS) {
      expect(isMeasureAdmissible(unit, Number.NaN)).toBe(false);
      expect(isMeasureAdmissible(unit, Number.POSITIVE_INFINITY)).toBe(false);
    }
  });
});

describe("metric polarity", () => {
  it("has no neutral direction, because an unscoreable number is not a KPI", () => {
    expect(METRIC_POLARITIES).not.toContain("neutral");
  });

  it("declares the two one-sided directions and the two-sided one", () => {
    expect(METRIC_POLARITIES).toEqual(["higher_is_better", "lower_is_better", "on_target"]);
  });

  it("requires a target only for the two-sided direction", () => {
    expect(POLARITIES_REQUIRING_TARGET).toEqual(["on_target"]);
    expect(POLARITIES_REQUIRING_TARGET).not.toContain("higher_is_better");
  });
});

describe("performance bands", () => {
  it("orders the bands worst first", () => {
    expect(PERFORMANCE_BANDS[0]).toBe("failing");
    expect(PERFORMANCE_BANDS[PERFORMANCE_BANDS.length - 1]).toBe("exemplary");
  });

  it("gives every band a floor", () => {
    for (const band of PERFORMANCE_BANDS) {
      expect(typeof BAND_FLOORS[band]).toBe("number");
    }
  });

  it("raises the floors monotonically in band order", () => {
    const floors = PERFORMANCE_BANDS.map((band) => BAND_FLOORS[band]);
    for (let i = 1; i < floors.length; i += 1) {
      expect(floors[i]).toBeGreaterThan(floors[i - 1] as number);
    }
  });

  it("starts the worst band at the bottom of the normalized scale", () => {
    expect(BAND_FLOORS.failing).toBe(MIN_NORMALIZED_SCORE);
  });

  it("keeps every floor on the normalized scale", () => {
    for (const band of PERFORMANCE_BANDS) {
      expect(isNormalizedScore(BAND_FLOORS[band])).toBe(true);
    }
  });

  it("freezes the floors, so no caller can move a band under everyone else", () => {
    expect(Object.isFrozen(BAND_FLOORS)).toBe(true);
  });

  it("ranks a band by its position, worst at zero", () => {
    expect(bandRank("failing")).toBe(0);
    expect(bandRank("exemplary")).toBe(PERFORMANCE_BANDS.length - 1);
  });

  it("compares bands by rank", () => {
    expect(isWorseBand("at_risk", "healthy")).toBe(true);
    expect(isWorseBand("healthy", "at_risk")).toBe(false);
    expect(isWorseBand("watch", "watch")).toBe(false);
  });

  it("recognizes the ends of the normalized scale and nothing outside it", () => {
    expect(isNormalizedScore(0)).toBe(true);
    expect(isNormalizedScore(100)).toBe(true);
    expect(isNormalizedScore(-0.001)).toBe(false);
    expect(isNormalizedScore(100.001)).toBe(false);
    expect(isNormalizedScore(Number.NaN)).toBe(false);
  });
});

describe("the reporting period grid", () => {
  it("keeps term and quarter distinct, because academic and financial grids differ", () => {
    expect(PERIOD_GRAINS).toContain("term");
    expect(PERIOD_GRAINS).toContain("quarter");
  });

  it("declares each grain once", () => {
    expect(new Set(PERIOD_GRAINS).size).toBe(PERIOD_GRAINS.length);
  });

  it("counts a reading in the assessment's own period as current", () => {
    expect(isReadingCurrent(12, 12)).toBe(true);
  });

  it("counts a reading at the age limit as current and one beyond it as stale", () => {
    expect(isReadingCurrent(12 - MAX_READING_AGE_PERIODS, 12)).toBe(true);
    expect(isReadingCurrent(12 - MAX_READING_AGE_PERIODS - 1, 12)).toBe(false);
  });

  it("refuses a reading from the future", () => {
    expect(isReadingCurrent(13, 12)).toBe(false);
  });

  it("refuses a non-integer period ordinal on either side", () => {
    expect(isReadingCurrent(11.5, 12)).toBe(false);
    expect(isReadingCurrent(11, 12.5)).toBe(false);
    expect(isReadingCurrent(Number.NaN, 12)).toBe(false);
  });
});

describe("evidence", () => {
  it("declares each kind once", () => {
    expect(new Set(EVIDENCE_KINDS).size).toBe(EVIDENCE_KINDS.length);
  });

  it("has no member for a number of unknown origin", () => {
    expect(EVIDENCE_KINDS).not.toContain("unknown");
    expect(EVIDENCE_KINDS).not.toContain("carried_forward");
    expect(EVIDENCE_KINDS).not.toContain("computed");
  });

  it("gives every kind a standing", () => {
    for (const kind of EVIDENCE_KINDS) {
      expect(READING_STANDINGS).toContain(EVIDENCE_STANDING[kind]);
    }
  });

  it("freezes the standing map", () => {
    expect(Object.isFrozen(EVIDENCE_STANDING)).toBe(true);
  });

  it("treats a forecast run as projected and a manual return as attested", () => {
    expect(EVIDENCE_STANDING.forecast_run).toBe("projected");
    expect(EVIDENCE_STANDING.manual_return).toBe("attested");
  });

  it("treats every record-backed kind as measured", () => {
    expect(EVIDENCE_STANDING.domain_record).toBe("measured");
    expect(EVIDENCE_STANDING.assessment_result).toBe("measured");
    expect(EVIDENCE_STANDING.audit_finding).toBe("measured");
    expect(EVIDENCE_STANDING.decision_record).toBe("measured");
    expect(EVIDENCE_STANDING.knowledge_assertion).toBe("measured");
  });

  it("requires an attestor only where the record carries no authorship of its own", () => {
    expect(EVIDENCE_REQUIRING_ATTESTOR).toEqual(["manual_return"]);
    for (const kind of EVIDENCE_REQUIRING_ATTESTOR) {
      expect(EVIDENCE_KINDS).toContain(kind);
    }
  });

  it("orders standing strongest first", () => {
    expect(standingRank("measured")).toBe(0);
    expect(standingRank("projected")).toBe(1);
    expect(standingRank("attested")).toBe(2);
  });

  it("takes the weakest standing across a set of evidence", () => {
    expect(weakestStanding(["domain_record", "assessment_result"])).toBe("measured");
    expect(weakestStanding(["domain_record", "forecast_run"])).toBe("projected");
    expect(weakestStanding(["domain_record", "forecast_run", "manual_return"])).toBe("attested");
  });

  it("does not let strong evidence launder weak evidence, in either citation order", () => {
    expect(weakestStanding(["manual_return", "domain_record"])).toBe("attested");
    expect(weakestStanding(["domain_record", "manual_return"])).toBe("attested");
  });

  it("returns null for no evidence rather than defaulting to measured", () => {
    expect(weakestStanding([])).toBeNull();
  });

  it("returns the kind's own standing for a single citation", () => {
    for (const kind of EVIDENCE_KINDS) {
      expect(weakestStanding([kind])).toBe(EVIDENCE_STANDING[kind]);
    }
  });
});

describe("coverage and weighting", () => {
  it("sets the pillar coverage floor above half the institution", () => {
    expect(MIN_PILLAR_COVERAGE).toBe(0.6);
    expect(MIN_PILLAR_COVERAGE).toBeGreaterThan(0.5);
  });

  it("sets a companion floor on KPI coverage within a pillar", () => {
    expect(MIN_KPI_COVERAGE_PER_PILLAR).toBe(0.5);
  });

  it("requires a full weight set to total one", () => {
    expect(WEIGHT_TOTAL).toBe(1);
  });

  it("keeps no single pillar at or above half the index", () => {
    expect(MAX_PILLAR_WEIGHT).toBe(0.5);
    expect(MAX_PILLAR_WEIGHT).toBeLessThan(WEIGHT_TOTAL);
  });

  it("bounds a declared weight below by a share that can actually move the number", () => {
    expect(MIN_PILLAR_WEIGHT).toBe(0.01);
    expect(MIN_PILLAR_WEIGHT).toBeLessThan(MAX_PILLAR_WEIGHT);
  });

  it("admits a weight inside the band and refuses one outside it", () => {
    expect(isWeightAdmissible(0.25)).toBe(true);
    expect(isWeightAdmissible(MIN_PILLAR_WEIGHT)).toBe(true);
    expect(isWeightAdmissible(MAX_PILLAR_WEIGHT)).toBe(true);
    expect(isWeightAdmissible(0.0009)).toBe(false);
    expect(isWeightAdmissible(0.6)).toBe(false);
    expect(isWeightAdmissible(0)).toBe(false);
    expect(isWeightAdmissible(Number.NaN)).toBe(false);
  });

  it("balances a ten-way even split", () => {
    expect(isWeightSetBalanced(Array.from({ length: 10 }, () => 0.1))).toBe(true);
  });

  it("balances a hand-written uneven split that totals one at four places", () => {
    expect(isWeightSetBalanced([0.3, 0.2, 0.2, 0.15, 0.15])).toBe(true);
  });

  it("balances a six-way split whose members do not divide evenly", () => {
    expect(isWeightSetBalanced([0.1667, 0.1667, 0.1667, 0.1667, 0.1666, 0.1666])).toBe(true);
  });

  it("refuses a set that does not total one", () => {
    expect(isWeightSetBalanced([0.5, 0.4])).toBe(false);
    expect(isWeightSetBalanced([0.6, 0.5])).toBe(false);
  });

  it("refuses an empty set, because no weights is not a balanced set", () => {
    expect(isWeightSetBalanced([])).toBe(false);
  });

  it("refuses a set containing a non-finite weight", () => {
    expect(isWeightSetBalanced([0.5, Number.NaN, 0.5])).toBe(false);
    expect(isWeightSetBalanced([0.5, Number.POSITIVE_INFINITY])).toBe(false);
  });

  it("computes coverage as a ratio", () => {
    expect(coverageRatio(6, 10)).toBe(0.6);
    expect(coverageRatio(10, 10)).toBe(1);
    expect(coverageRatio(1, 3)).toBe(0.333333);
  });

  it("caps coverage at one, so a stray extra reading cannot report over-coverage", () => {
    expect(coverageRatio(12, 10)).toBe(1);
  });

  it("reports no coverage when nothing was present or nothing was expected", () => {
    expect(coverageRatio(0, 10)).toBe(0);
    expect(coverageRatio(6, 0)).toBe(0);
    expect(coverageRatio(-1, 10)).toBe(0);
  });

  it("refuses a fractional count rather than reporting a plausible ratio", () => {
    expect(coverageRatio(6.5, 10)).toBe(0);
    expect(coverageRatio(6, 10.5)).toBe(0);
  });

  it("passes pillar coverage exactly at the floor and fails just below it", () => {
    expect(isPillarCoverageSufficient(MIN_PILLAR_COVERAGE)).toBe(true);
    expect(isPillarCoverageSufficient(coverageRatio(6, 10))).toBe(true);
    expect(isPillarCoverageSufficient(coverageRatio(5, 10))).toBe(false);
    expect(isPillarCoverageSufficient(Number.NaN)).toBe(false);
  });

  it("passes KPI coverage exactly at the floor and fails just below it", () => {
    expect(isKpiCoverageSufficient(MIN_KPI_COVERAGE_PER_PILLAR)).toBe(true);
    expect(isKpiCoverageSufficient(coverageRatio(4, 8))).toBe(true);
    expect(isKpiCoverageSufficient(coverageRatio(3, 8))).toBe(false);
    expect(isKpiCoverageSufficient(Number.NaN)).toBe(false);
  });

  it("would fail a ten-of-ten index resting on one indicator per pillar", () => {
    expect(isPillarCoverageSufficient(coverageRatio(10, 10))).toBe(true);
    expect(isKpiCoverageSufficient(coverageRatio(1, 9))).toBe(false);
  });
});

describe("dashboard composition", () => {
  it("binds panels to data shapes and never to pictures", () => {
    for (const binding of PANEL_BINDINGS) {
      expect(binding).not.toMatch(/chart|graph|colour|color|widget|tile/);
    }
  });

  it("declares each binding once", () => {
    expect(new Set(PANEL_BINDINGS).size).toBe(PANEL_BINDINGS.length);
  });

  it("can bind a panel to coverage, so a dashboard can show what it does not know", () => {
    expect(PANEL_BINDINGS).toContain("coverage_report");
  });

  it("omits an unreachable panel and offers no way to redact one in place", () => {
    expect(PANEL_VISIBILITY_OUTCOMES).toEqual(["omitted"]);
    expect(PANEL_VISIBILITY_OUTCOMES).not.toContain("redacted");
    expect(PANEL_VISIBILITY_OUTCOMES).not.toContain("masked");
  });

  it("grants a panel when the viewer holds its scope", () => {
    expect(scopeGrants(["command:read", "command:brief"], "command:read")).toBe(true);
  });

  it("refuses a panel the viewer's scopes do not reach", () => {
    expect(scopeGrants(["command:read"], "command:operate")).toBe(false);
    expect(scopeGrants([], "command:read")).toBe(false);
  });

  it("compares scopes after normalizing both sides", () => {
    expect(scopeGrants([" Command:Read "], "command:read")).toBe(true);
    expect(scopeGrants(["command:read"], "  COMMAND:READ")).toBe(true);
  });

  it("matches a scope exactly and does not treat a prefix as a grant", () => {
    expect(scopeGrants(["command:read"], "command:read:financial")).toBe(false);
    expect(scopeGrants(["command"], "command:read")).toBe(false);
  });

  it("caps the panels one dashboard may declare", () => {
    expect(MAX_PANELS_PER_DASHBOARD).toBe(40);
    expect(Number.isInteger(MAX_PANELS_PER_DASHBOARD)).toBe(true);
  });
});

describe("attention", () => {
  it("orders severities least first", () => {
    expect(ATTENTION_SEVERITIES[0]).toBe("informational");
    expect(ATTENTION_SEVERITIES[ATTENTION_SEVERITIES.length - 1]).toBe("critical");
  });

  it("ranks a severity by its position", () => {
    expect(severityRank("informational")).toBe(0);
    expect(severityRank("critical")).toBe(ATTENTION_SEVERITIES.length - 1);
    expect(severityRank("urgent")).toBeGreaterThan(severityRank("advisory"));
  });

  it("shares no token with the band vocabulary, in either direction", () => {
    const bands = new Set<string>(PERFORMANCE_BANDS);
    const severities = new Set<string>(ATTENTION_SEVERITIES);
    for (const severity of severities) {
      expect(bands.has(severity)).toBe(false);
    }
    for (const band of bands) {
      expect(severities.has(band)).toBe(false);
    }
  });

  it("can raise an alarm about not knowing, not only about a bad number", () => {
    expect(ATTENTION_REASONS).toContain("coverage_gap");
    expect(ATTENTION_REASONS).toContain("evidence_stale");
    expect(ATTENTION_REASONS).toContain("standing_weakened");
  });

  it("distinguishes a breach from a fall", () => {
    expect(ATTENTION_REASONS).toContain("band_breach");
    expect(ATTENTION_REASONS).toContain("band_fall");
  });

  it("declares each reason once", () => {
    expect(new Set(ATTENTION_REASONS).size).toBe(ATTENTION_REASONS.length);
  });

  it("calls three consecutive falling periods a sustained decline", () => {
    expect(SUSTAINED_DECLINE_PERIODS).toBe(3);
    expect(SUSTAINED_DECLINE_PERIODS).toBeGreaterThan(2);
  });
});

describe("statuses", () => {
  const statusSets = [
    ["kpi", KPI_STATUSES],
    ["index", INDEX_STATUSES],
    ["assessment", ASSESSMENT_STATUSES],
    ["dashboard", DASHBOARD_STATUSES],
    ["briefing", BRIEFING_STATUSES],
    ["attention", ATTENTION_STATUSES],
  ] as const;

  it.each(statusSets)("declares each %s status once", (_label, statuses) => {
    expect(new Set(statuses).size).toBe(statuses.length);
  });

  it("separates a superseded index definition from a retired one", () => {
    expect(INDEX_STATUSES).toContain("superseded");
    expect(INDEX_STATUSES).toContain("retired");
  });

  it("has no editing state for an issued briefing", () => {
    expect(BRIEFING_STATUSES).toEqual(["drafting", "issued", "withdrawn"]);
    expect(BRIEFING_STATUSES).not.toContain("amended");
    expect(BRIEFING_STATUSES).not.toContain("revised");
  });

  it("marks an assessment invalid rather than deleting it", () => {
    expect(ASSESSMENT_STATUSES).toContain("invalidated");
  });

  it("treats resolved and dismissed as closing an attention item", () => {
    expect(CLOSED_ATTENTION_STATUSES).toEqual(["resolved", "dismissed"]);
    expect(isAttentionOpen("open")).toBe(true);
    expect(isAttentionOpen("acknowledged")).toBe(true);
    expect(isAttentionOpen("resolved")).toBe(false);
    expect(isAttentionOpen("dismissed")).toBe(false);
  });

  it("keeps every closing status inside the attention status set", () => {
    for (const status of CLOSED_ATTENTION_STATUSES) {
      expect(ATTENTION_STATUSES).toContain(status);
    }
  });
});
