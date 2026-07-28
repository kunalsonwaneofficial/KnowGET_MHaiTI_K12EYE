import { describe, expect, it } from "vitest";
import type { HealthPillar } from "./command-value";
import type { IndexRun, PillarInput, PillarWeight, RecordedIndex } from "./command-view";
import { assessIndex } from "./indexing";
import { FINGERPRINT_LENGTH, fingerprintRun, reproduce } from "./reproducibility";

const w = (pillar: HealthPillar, weight: number): PillarWeight => ({ pillar, weight });

const input = (pillar: HealthPillar, score: number, read = 8, declared = 8): PillarInput => ({
  pillar,
  score,
  kpisRead: read,
  kpisDeclared: declared,
});

const weights: readonly PillarWeight[] = [
  w("academic_outcomes", 0.3),
  w("learner_wellbeing", 0.15),
  w("attendance_engagement", 0.15),
  w("teaching_quality", 0.15),
  w("financial_health", 0.15),
  w("governance_compliance", 0.1),
];

const inputs: readonly PillarInput[] = [
  input("academic_outcomes", 80),
  input("learner_wellbeing", 70),
  input("attendance_engagement", 90),
  input("teaching_quality", 75),
  input("financial_health", 60),
  input("governance_compliance", 85),
];

const run: IndexRun = { weights, inputs };

/** What the aggregate would have stored for a run: the verdict's own numbers plus the run's fingerprint. */
const record = (source: IndexRun): RecordedIndex => {
  const verdict = assessIndex(source.weights, source.inputs);
  return {
    value: verdict.value,
    band: verdict.band,
    pillarCoverage: verdict.pillarCoverage,
    fingerprint: fingerprintRun(source),
  };
};

describe("fingerprintRun", () => {
  it("is a fixed-width hex token", () => {
    const print = fingerprintRun(run);
    expect(print).toHaveLength(FINGERPRINT_LENGTH);
    expect(print).toMatch(/^[0-9a-f]+$/);
  });

  it("is the same for the same run, twice", () => {
    expect(fingerprintRun(run)).toBe(fingerprintRun({ weights, inputs }));
  });

  it("ignores declaration order, because a reordered definition is the same definition", () => {
    const reordered: IndexRun = {
      weights: [...weights].reverse(),
      inputs: [...inputs].reverse(),
    };
    expect(fingerprintRun(reordered)).toBe(fingerprintRun(run));
    expect(assessIndex(reordered.weights, reordered.inputs).value).toBe(
      assessIndex(weights, inputs).value,
    );
  });

  it("ignores a difference finer than the precision the value is stored at", () => {
    const respelled: IndexRun = {
      weights: [w("academic_outcomes", 0.30000001), ...weights.slice(1)],
      inputs: [input("academic_outcomes", 80.0000001), ...inputs.slice(1)],
    };
    expect(fingerprintRun(respelled)).toBe(fingerprintRun(run));
    expect(assessIndex(respelled.weights, respelled.inputs).value).toBe(
      assessIndex(weights, inputs).value,
    );
  });

  it("changes when a score changes", () => {
    const edited: IndexRun = {
      weights,
      inputs: [input("academic_outcomes", 80.000001), ...inputs.slice(1)],
    };
    expect(fingerprintRun(edited)).not.toBe(fingerprintRun(run));
  });

  it("changes when a weight is re-declared", () => {
    const reweighted: IndexRun = {
      weights: [w("academic_outcomes", 0.35), w("learner_wellbeing", 0.1), ...weights.slice(2)],
      inputs,
    };
    expect(fingerprintRun(reweighted)).not.toBe(fingerprintRun(run));
  });

  it("changes when a pillar's coverage changes but its score does not", () => {
    const narrowed: IndexRun = {
      weights,
      inputs: [input("academic_outcomes", 80, 4, 6), ...inputs.slice(1)],
    };
    expect(fingerprintRun(narrowed)).not.toBe(fingerprintRun(run));
    expect(assessIndex(narrowed.weights, narrowed.inputs).value).toBe(
      assessIndex(weights, inputs).value,
    );
  });

  it("changes when a pillar drops out", () => {
    expect(fingerprintRun({ weights, inputs: inputs.slice(1) })).not.toBe(fingerprintRun(run));
  });

  it("changes when a pillar the definition never asked for appears", () => {
    const extra: IndexRun = { weights, inputs: [...inputs, input("operational_continuity", 50)] };
    expect(fingerprintRun(extra)).not.toBe(fingerprintRun(run));
  });

  it("digests an empty run without failing", () => {
    expect(fingerprintRun({ weights: [], inputs: [] })).toHaveLength(FINGERPRINT_LENGTH);
  });
});

describe("reproduce", () => {
  it("confirms a record re-run against its own pinned inputs", () => {
    const verdict = reproduce(record(run), run);
    expect(verdict.reproduced).toBe(true);
    expect(verdict.inputsMatch).toBe(true);
    expect(verdict.faults).toEqual([]);
    expect(verdict.drift).toBe(0);
  });

  it("returns both fingerprints, so a mismatch is inspectable rather than merely reported", () => {
    const verdict = reproduce(record(run), run);
    expect(verdict.recordedFingerprint).toBe(fingerprintRun(run));
    expect(verdict.recomputedFingerprint).toBe(verdict.recordedFingerprint);
  });

  it("catches a stored value that does not follow from its own inputs", () => {
    const tampered: RecordedIndex = { ...record(run), value: 88 };
    const verdict = reproduce(tampered, run);
    expect(verdict.reproduced).toBe(false);
    expect(verdict.faults).toContain("value_drift");
    expect(verdict.inputsMatch).toBe(true);
  });

  it("reports the band and coverage separately from the value", () => {
    const stored = record(run);
    const wrong: RecordedIndex = { ...stored, value: 20, band: "failing", pillarCoverage: 0.5 };
    const verdict = reproduce(wrong, run);
    expect(verdict.faults).toEqual(["value_drift", "band_drift", "coverage_drift"]);
  });

  it("has no tolerance: a change in the sixth decimal is a drift", () => {
    const stored = record(run);
    const nudged: RecordedIndex = { ...stored, value: (stored.value ?? 0) + 0.000001 };
    expect(reproduce(nudged, run).faults).toContain("value_drift");
  });

  it("reports drift signed, so a reader can see which way the institution moved", () => {
    const stored = record(run);
    const improved: IndexRun = {
      weights,
      inputs: [...inputs.slice(0, 4), input("financial_health", 80), ...inputs.slice(5)],
    };
    const verdict = reproduce(stored, improved);
    expect(verdict.drift).not.toBeNull();
    expect(verdict.drift ?? 0).toBeGreaterThan(0);
    expect(verdict.recomputedValue ?? 0).toBeGreaterThan(verdict.recordedValue ?? 0);
  });

  it("calls a value that matched from different inputs a coincidence, not a reproduction", () => {
    const stored = record(run);
    const widened: IndexRun = {
      weights,
      inputs: inputs.map((entry) => input(entry.pillar, entry.score, 6, 9)),
    };
    const verdict = reproduce(stored, widened);
    expect(verdict.recomputedValue).toBe(verdict.recordedValue);
    expect(verdict.drift).toBe(0);
    expect(verdict.inputsMatch).toBe(false);
    expect(verdict.faults).toEqual(["inputs_changed"]);
    expect(verdict.reproduced).toBe(false);
  });

  it("expects inputs_changed on a drift check and still reports the movement", () => {
    const stored = record(run);
    const later: IndexRun = {
      weights,
      inputs: [input("academic_outcomes", 60), ...inputs.slice(1)],
    };
    const verdict = reproduce(stored, later);
    expect(verdict.inputsMatch).toBe(false);
    expect(verdict.faults).toContain("inputs_changed");
    expect(verdict.faults).toContain("value_drift");
    expect(verdict.drift ?? 0).toBeLessThan(0);
  });

  it("refuses to call an absent value a drift of nothing", () => {
    const silent: IndexRun = { weights, inputs: [] };
    const verdict = reproduce(record(run), silent);
    expect(verdict.recomputedValue).toBeNull();
    expect(verdict.drift).toBeNull();
    expect(verdict.faults).toContain("value_drift");
  });

  it("reproduces a record that had no value to begin with", () => {
    const silent: IndexRun = { weights, inputs: [] };
    const verdict = reproduce(record(silent), silent);
    expect(verdict.recordedValue).toBeNull();
    expect(verdict.reproduced).toBe(true);
    expect(verdict.drift).toBeNull();
  });

  it("recomputes through the real engine rather than a copy of it", () => {
    const stored = record(run);
    expect(stored.value).toBe(assessIndex(weights, inputs).value);
    expect(reproduce(stored, run).recomputedValue).toBe(stored.value);
  });

  it("catches a definition edited after the fact, even when the readings did not move", () => {
    const stored = record(run);
    const reweighted: IndexRun = {
      weights: [w("academic_outcomes", 0.4), w("learner_wellbeing", 0.05), ...weights.slice(2)],
      inputs,
    };
    const verdict = reproduce(stored, reweighted);
    expect(verdict.faults).toContain("inputs_changed");
    expect(verdict.faults).toContain("value_drift");
  });
});
