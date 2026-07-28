import { createHash } from "node:crypto";

import type {
  ForecastPoint,
  ProjectionPoint,
  ReproducibilityInputs,
  ReproducibilityKey,
  ReproductionResult,
} from "./forecast-view";
import type { DriftCode } from "./forecast-view";
import { FORECAST_PRECISION, roundValue } from "./forecast-value";

/**
 * The reproducibility engine: the machinery behind the contract's fourth rule.
 *
 * "Reproducible and versioned" is easy to claim and hard to hold, and the way platforms lose it is always the
 * same. A forecast is published. Six months later somebody asks how the number was arrived at. By then the
 * series has been corrected twice, the model has been tuned, the default parameters have moved, and there is no
 * way to tell which of those changed the answer — or whether the answer changed at all. The record said what the
 * forecast *was*, not what it was *computed from*.
 *
 * So a run pins its inputs in a closed, small, canonical form and digests them. Two rules make the digest worth
 * having. It covers **everything the arithmetic reads** — series and model version, method, parameters, horizon,
 * confidence levels, assumption keys — so identical digests must produce identical numbers. And it covers
 * **nothing else**: no timestamp, no actor, no request id, no correlation id. Provenance that does not change
 * the answer belongs on the run record, where it is fully preserved; putting it in the digest would make every
 * honest re-run report drift and train everyone to ignore the alarm.
 *
 * The canonical string is kept beside the digest rather than thrown away. A digest mismatch on its own is a
 * mystery; a digest mismatch next to the two strings that produced it is a diff, and the moment somebody most
 * needs that diff is the moment an auditor is asking why a published figure no longer reproduces.
 *
 * Everything here is pure. `createHash` is deterministic — the same bytes give the same digest on every machine,
 * every version, forever — which is precisely why a hash and not an identifier is the right instrument.
 */

// --- Canonical form --------------------------------------------------------------

/** The digest algorithm. Named as a constant because a run's digest is only comparable to another of the same. */
export const DIGEST_ALGORITHM = "sha256";

/**
 * Field separator inside the canonical string. Chosen because no normalized key, method name or numeric literal
 * can contain it, so the canonical form is unambiguous without escaping and stays readable in a diff.
 */
const FIELD_SEPARATOR = "|";

/** Fixed-precision rendering, so `4`, `4.0` and `4.0000001` never digest to three different runs. */
const renderNumber = (value: number): string =>
  Number.isFinite(value) ? roundValue(value).toFixed(FORECAST_PRECISION) : "nan";

/**
 * The canonical string a digest is computed from: every input the arithmetic reads, in a fixed order, at a fixed
 * precision.
 *
 * Order is declared rather than derived from object iteration, because object key order is a property of how a
 * value was built and would make the digest depend on the shape of the code that constructed it. Parameters are
 * rendered field by field for the same reason — `JSON.stringify` of a parameter bag would silently change the
 * digest of every historical run the first time somebody added an optional field to it.
 */
export const canonicalize = (inputs: ReproducibilityInputs): string =>
  [
    `series=${inputs.seriesKey}`,
    `seriesVersion=${inputs.seriesVersion}`,
    `model=${inputs.modelKey}`,
    `modelVersion=${inputs.modelVersion}`,
    `method=${inputs.method}`,
    `windowSize=${inputs.parameters.windowSize === undefined ? "-" : inputs.parameters.windowSize}`,
    `alpha=${inputs.parameters.alpha === undefined ? "-" : renderNumber(inputs.parameters.alpha)}`,
    `horizon=${inputs.horizon}`,
    `levels=${[...inputs.confidenceLevels].sort((a, b) => a - b).join(",")}`,
    `assumptions=${[...inputs.assumptionKeys].sort().join(",")}`,
  ].join(FIELD_SEPARATOR);

/** The pinned identity of a run: its digest and the canonical string that produced it. */
export const reproducibilityKeyOf = (inputs: ReproducibilityInputs): ReproducibilityKey => {
  const canonical = canonicalize(inputs);
  return {
    digest: createHash(DIGEST_ALGORITHM).update(canonical, "utf8").digest("hex"),
    canonical,
  };
};

/** Whether two input records digest identically — the cheap check, used before comparing numbers. */
export const sameInputs = (a: ReproducibilityInputs, b: ReproducibilityInputs): boolean =>
  canonicalize(a) === canonicalize(b);

// --- Drift -----------------------------------------------------------------------

/**
 * Exactly what moved between two input records, one code per field.
 *
 * Field-level rather than "the digest differs", because the two are answers to different questions. The digest
 * answers "is this the same run"; this answers "what changed", and an institution reconciling a forecast that no
 * longer reproduces needs the second one. `series_version_changed` alone is a late correction to the data;
 * `model_version_changed` alone is somebody having retuned the model; both together with a value difference is a
 * story that explains itself.
 */
export const diffInputs = (
  recorded: ReproducibilityInputs,
  recomputed: ReproducibilityInputs,
): readonly DriftCode[] => {
  const drift: DriftCode[] = [];
  if (recorded.seriesVersion !== recomputed.seriesVersion) drift.push("series_version_changed");
  if (recorded.modelVersion !== recomputed.modelVersion) drift.push("model_version_changed");
  if (recorded.method !== recomputed.method) drift.push("method_changed");

  const sameParameters =
    recorded.parameters.windowSize === recomputed.parameters.windowSize &&
    recorded.parameters.alpha === recomputed.parameters.alpha;
  if (!sameParameters) drift.push("parameters_changed");

  if (recorded.horizon !== recomputed.horizon) drift.push("horizon_changed");

  const recordedLevels = [...recorded.confidenceLevels].sort((a, b) => a - b).join(",");
  const recomputedLevels = [...recomputed.confidenceLevels].sort((a, b) => a - b).join(",");
  if (recordedLevels !== recomputedLevels) drift.push("confidence_levels_changed");

  const recordedKeys = [...recorded.assumptionKeys].sort().join(",");
  const recomputedKeys = [...recomputed.assumptionKeys].sort().join(",");
  if (recordedKeys !== recomputedKeys) drift.push("assumptions_changed");

  return drift;
};

// --- Value comparison ------------------------------------------------------------

/**
 * The largest absolute gap between two point series, compared period by period.
 *
 * Points are matched on `period` rather than on position, because a horizon that changed would otherwise line up
 * period 13 against period 14 and report a difference that is really a mismatch. A period present on one side
 * and absent on the other is not a value difference at all — it is a horizon difference, which `diffInputs`
 * already names — so it contributes nothing here rather than an arbitrarily large gap.
 */
export const maxValueDelta = (
  recorded: readonly (ForecastPoint | ProjectionPoint)[],
  recomputed: readonly (ForecastPoint | ProjectionPoint)[],
): number => {
  const byPeriod = new Map(recomputed.map((point) => [point.period, point.value] as const));
  let largest = 0;
  for (const point of recorded) {
    const other = byPeriod.get(point.period);
    if (other === undefined) continue;
    const delta = Math.abs(point.value - other);
    if (delta > largest) largest = delta;
  }
  return roundValue(largest);
};

/**
 * The smallest difference this package considers real. Anything at or below it is two renderings of the same
 * number at {@link FORECAST_PRECISION}, and calling that a reproduction failure would make the check cry wolf on
 * every floating-point last digit.
 */
export const VALUE_TOLERANCE = 10 ** -FORECAST_PRECISION;

// --- The verdict -----------------------------------------------------------------

/**
 * Recompute a run's identity, compare it with what was recorded, and say whether the run still reproduces.
 *
 * `reproducible` requires both halves: the inputs still digest identically *and* the numbers still match. The
 * two failures mean opposite things and the split is the point of the whole engine. Inputs that moved is an
 * ordinary, explainable event with a name attached — a series correction, a model version. Identical inputs
 * producing different numbers is a platform defect, and `values_changed` arriving with no other code is that
 * alarm firing: nothing the record can see changed, and the answer changed anyway.
 */
export const reproduce = (
  recorded: ReproducibilityInputs,
  recordedPoints: readonly (ForecastPoint | ProjectionPoint)[],
  recomputed: ReproducibilityInputs,
  recomputedPoints: readonly (ForecastPoint | ProjectionPoint)[],
): ReproductionResult => {
  const recordedKey = reproducibilityKeyOf(recorded);
  const recomputedKey = reproducibilityKeyOf(recomputed);
  const drift = [...diffInputs(recorded, recomputed)];

  const delta = maxValueDelta(recordedPoints, recomputedPoints);
  if (delta > VALUE_TOLERANCE) drift.push("values_changed");

  return {
    reproducible: recordedKey.digest === recomputedKey.digest && delta <= VALUE_TOLERANCE,
    recordedDigest: recordedKey.digest,
    recomputedDigest: recomputedKey.digest,
    drift,
    maxValueDelta: delta,
  };
};
