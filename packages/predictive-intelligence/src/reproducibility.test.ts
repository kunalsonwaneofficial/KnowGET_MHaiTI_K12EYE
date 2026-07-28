import { describe, expect, it } from "vitest";

import type { ProjectionPoint, ReproducibilityInputs } from "./forecast-view";
import {
  DIGEST_ALGORITHM,
  VALUE_TOLERANCE,
  canonicalize,
  diffInputs,
  maxValueDelta,
  reproduce,
  reproducibilityKeyOf,
  sameInputs,
} from "./reproducibility";

const inputs = (overrides: Partial<ReproducibilityInputs> = {}): ReproducibilityInputs => ({
  seriesKey: "fees.collection_rate",
  seriesVersion: 4,
  modelKey: "fees.collection_rate.trend",
  modelVersion: 2,
  method: "linear_trend",
  parameters: { windowSize: 3, alpha: 0.3 },
  horizon: 6,
  confidenceLevels: [80, 95],
  assumptionKeys: ["fees_hold", "intake_flat"],
  ...overrides,
});

const point = (period: number, value: number): ProjectionPoint => ({
  period,
  horizon: period - 11,
  value,
});

describe("canonicalize", () => {
  it("renders every input the arithmetic reads", () => {
    const canonical = canonicalize(inputs());

    for (const fragment of [
      "series=fees.collection_rate",
      "seriesVersion=4",
      "model=fees.collection_rate.trend",
      "modelVersion=2",
      "method=linear_trend",
      "windowSize=3",
      "horizon=6",
      "levels=80,95",
      "assumptions=fees_hold,intake_flat",
    ]) {
      expect(canonical).toContain(fragment);
    }
  });

  it("is stable across the order the levels and assumptions arrive in", () => {
    const one = canonicalize(inputs({ confidenceLevels: [95, 80], assumptionKeys: ["b", "a"] }));
    const other = canonicalize(inputs({ confidenceLevels: [80, 95], assumptionKeys: ["a", "b"] }));

    expect(one).toBe(other);
  });

  it("renders alpha at fixed precision, so a difference below it is not a different run", () => {
    expect(canonicalize(inputs({ parameters: { alpha: 0.3 } }))).toBe(
      canonicalize(inputs({ parameters: { alpha: 0.3 + 1e-9 } })),
    );
  });

  it("still separates two alphas that differ at the precision it renders", () => {
    expect(canonicalize(inputs({ parameters: { alpha: 0.3 } }))).not.toBe(
      canonicalize(inputs({ parameters: { alpha: 0.30001 } })),
    );
  });

  it("distinguishes an unset parameter from a set one", () => {
    const unset = canonicalize(inputs({ parameters: {} }));
    const set = canonicalize(inputs({ parameters: { windowSize: 3, alpha: 0.3 } }));

    expect(unset).toContain("windowSize=-");
    expect(unset).toContain("alpha=-");
    expect(unset).not.toBe(set);
  });

  it("separates fields unambiguously", () => {
    expect(canonicalize(inputs()).split("|").length).toBe(10);
  });
});

describe("reproducibilityKeyOf", () => {
  it("keeps the canonical string beside the digest", () => {
    const key = reproducibilityKeyOf(inputs());

    expect(key.canonical).toBe(canonicalize(inputs()));
    expect(key.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gives the same digest for the same inputs, every time", () => {
    expect(reproducibilityKeyOf(inputs()).digest).toBe(reproducibilityKeyOf(inputs()).digest);
  });

  it("moves the digest when any input the arithmetic reads moves", () => {
    const base = reproducibilityKeyOf(inputs()).digest;

    for (const changed of [
      inputs({ seriesVersion: 5 }),
      inputs({ modelVersion: 3 }),
      inputs({ method: "drift" }),
      inputs({ parameters: { windowSize: 4, alpha: 0.3 } }),
      inputs({ horizon: 7 }),
      inputs({ confidenceLevels: [80] }),
      inputs({ assumptionKeys: ["fees_hold"] }),
    ]) {
      expect(reproducibilityKeyOf(changed).digest).not.toBe(base);
    }
  });

  it("names the algorithm it used", () => {
    expect(DIGEST_ALGORITHM).toBe("sha256");
  });
});

describe("sameInputs", () => {
  it("is true for two records the arithmetic cannot tell apart", () => {
    expect(sameInputs(inputs(), inputs({ assumptionKeys: ["intake_flat", "fees_hold"] }))).toBe(
      true,
    );
  });

  it("is false as soon as anything read moves", () => {
    expect(sameInputs(inputs(), inputs({ horizon: 7 }))).toBe(false);
  });
});

describe("diffInputs", () => {
  it("finds nothing between a record and itself", () => {
    expect(diffInputs(inputs(), inputs())).toEqual([]);
  });

  it("names a late correction to the series", () => {
    expect(diffInputs(inputs(), inputs({ seriesVersion: 5 }))).toEqual(["series_version_changed"]);
  });

  it("names a retuned model", () => {
    expect(diffInputs(inputs(), inputs({ modelVersion: 3 }))).toEqual(["model_version_changed"]);
  });

  it("names each moved field separately", () => {
    const drift = diffInputs(
      inputs(),
      inputs({
        method: "drift",
        parameters: { windowSize: 5, alpha: 0.3 },
        horizon: 8,
        confidenceLevels: [50],
        assumptionKeys: [],
      }),
    );

    expect(drift).toEqual([
      "method_changed",
      "parameters_changed",
      "horizon_changed",
      "confidence_levels_changed",
      "assumptions_changed",
    ]);
  });

  it("does not call a reordered set a change", () => {
    expect(diffInputs(inputs(), inputs({ assumptionKeys: ["intake_flat", "fees_hold"] }))).toEqual(
      [],
    );
  });

  it("notices a parameter that was unset becoming set", () => {
    expect(diffInputs(inputs({ parameters: {} }), inputs())).toEqual(["parameters_changed"]);
  });
});

describe("maxValueDelta", () => {
  it("is zero for two identical series", () => {
    expect(maxValueDelta([point(12, 10), point(13, 20)], [point(12, 10), point(13, 20)])).toBe(0);
  });

  it("reports the largest gap, not the last one", () => {
    expect(maxValueDelta([point(12, 10), point(13, 20)], [point(12, 17), point(13, 21)])).toBe(7);
  });

  it("matches on period rather than position", () => {
    const recorded = [point(12, 10), point(13, 20)];
    const shuffled = [point(13, 20), point(12, 10)];

    expect(maxValueDelta(recorded, shuffled)).toBe(0);
  });

  it("ignores a period the other side never had", () => {
    expect(maxValueDelta([point(12, 10), point(13, 999)], [point(12, 10)])).toBe(0);
  });

  it("is zero when there is nothing to compare", () => {
    expect(maxValueDelta([], [])).toBe(0);
  });
});

describe("reproduce", () => {
  it("confirms a run that still reproduces", () => {
    const result = reproduce(inputs(), [point(12, 10)], inputs(), [point(12, 10)]);

    expect(result.reproducible).toBe(true);
    expect(result.drift).toEqual([]);
    expect(result.maxValueDelta).toBe(0);
    expect(result.recordedDigest).toBe(result.recomputedDigest);
  });

  it("explains itself when the series was corrected underneath the run", () => {
    const result = reproduce(inputs(), [point(12, 10)], inputs({ seriesVersion: 5 }), [
      point(12, 14),
    ]);

    expect(result.reproducible).toBe(false);
    expect(result.drift).toEqual(["series_version_changed", "values_changed"]);
    expect(result.maxValueDelta).toBe(4);
  });

  it("raises the alarm when identical inputs produce different numbers", () => {
    const result = reproduce(inputs(), [point(12, 10)], inputs(), [point(12, 11)]);

    expect(result.reproducible).toBe(false);
    expect(result.drift).toEqual(["values_changed"]);
    expect(result.recordedDigest).toBe(result.recomputedDigest);
  });

  it("fails a run whose inputs moved even where the numbers happen to match", () => {
    const result = reproduce(inputs(), [point(12, 10)], inputs({ modelVersion: 9 }), [
      point(12, 10),
    ]);

    expect(result.reproducible).toBe(false);
    expect(result.drift).toEqual(["model_version_changed"]);
    expect(result.maxValueDelta).toBe(0);
  });

  it("does not cry wolf over a last-digit difference", () => {
    const result = reproduce(inputs(), [point(12, 10)], inputs(), [
      point(12, 10 + VALUE_TOLERANCE),
    ]);

    expect(result.reproducible).toBe(true);
    expect(result.drift).toEqual([]);
  });

  it("does call a difference above the tolerance real", () => {
    const result = reproduce(inputs(), [point(12, 10)], inputs(), [
      point(12, 10 + VALUE_TOLERANCE * 100),
    ]);

    expect(result.reproducible).toBe(false);
    expect(result.drift).toEqual(["values_changed"]);
  });

  it("carries both digests so a mismatch is a diff rather than a mystery", () => {
    const result = reproduce(inputs(), [], inputs({ horizon: 9 }), []);

    expect(result.recordedDigest).not.toBe(result.recomputedDigest);
    expect(reproducibilityKeyOf(inputs()).digest).toBe(result.recordedDigest);
  });
});
