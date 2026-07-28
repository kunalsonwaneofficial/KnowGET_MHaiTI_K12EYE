import type { ForecastPoint, LeverView, SimulationOutcome, SimulationPoint } from "./forecast-view";
import type { LeverKind, UncertaintyGrade } from "./forecast-value";
import {
  isFiniteValue,
  isLeverFactorAdmissible,
  normalizeAssumptionKey,
  normalizeLeverKey,
  normalizeScenarioKey,
  roundValue,
} from "./forecast-value";

/**
 * The simulation engine: what-if analysis that stays answerable to the forecast it moves.
 *
 * A scenario here is not a second forecast. It is one pinned baseline projection plus a set of declared,
 * deterministic movements applied from a stated horizon onward, and keeping those two things distinct is the
 * entire point. The alternative — re-forecasting under changed inputs — produces a number that looks like a
 * forecast, carries a forecast's authority, and hides the fact that a person chose the movement. Here the
 * baseline travels on every single point, so a scenario value can never be read without the figure it departed
 * from, and the levers that moved it are named on the period they moved.
 *
 * Three properties make a simulation reproducible in the same sense a forecast is. Lever application order is
 * **fixed and declared** rather than taken from the order an array happened to arrive in, because additive and
 * multiplicative movements do not commute and a scenario whose answer depended on array order would not be a
 * scenario at all. A lever that could not be applied is **reported, never thrown** — a scenario configured with
 * an impossible magnitude should come back saying which lever was impossible, since the person reading it is the
 * one who can fix it. And uncertainty is **inherited, never improved**: the grade comes from the baseline and
 * there is no other input from which a better one could be constructed.
 *
 * That last rule is the one that earns its place. A clean-looking what-if built on a forecast graded `unusable`,
 * presented to a board as though choosing the levers had settled the underlying question, is the specific
 * failure this engine exists to make impossible.
 */

// --- Lever admissibility ---------------------------------------------------------

/**
 * Whether a lever can be applied at all, independent of any particular baseline.
 *
 * Multiplicative and growth factors are held to {@link isLeverFactorAdmissible} — positive, finite, and within
 * the band beyond which the lever rather than the projection is supplying the answer. Additive and override
 * magnitudes need only be finite: there is no scale at which "add this much" or "assume exactly this" stops
 * being a coherent instruction, and inventing a ceiling for them would be this engine deciding what an
 * institution is allowed to plan for.
 */
export const isLeverAdmissible = (lever: LeverView): boolean => {
  if (!isFiniteValue(lever.magnitude)) return false;
  if (!Number.isInteger(lever.fromHorizon) || lever.fromHorizon < 1) return false;
  if (lever.kind === "multiplicative" || lever.kind === "growth_rate") {
    return isLeverFactorAdmissible(lever.magnitude);
  }
  return true;
};

/**
 * The order levers are applied in within a single period.
 *
 * `override` first, because it replaces the model's number and everything after it is a movement *on the
 * assumed figure* — "assume the grant is exactly this, then apply the inflation lever" is a scenario an
 * institution actually wants, and an override that silently voided the other levers would answer a different
 * question than the one configured. Then the proportional movements, then the flat one, so that an additive
 * lever means what it says in the units of the metric rather than being scaled by whatever followed it.
 */
const KIND_ORDER: Readonly<Record<LeverKind, number>> = {
  override: 0,
  growth_rate: 1,
  multiplicative: 2,
  additive: 3,
};

/**
 * Levers in application order: by kind, then by normalized key.
 *
 * The tiebreak on key is what makes a simulation reproducible rather than merely deterministic-on-this-run. Two
 * additive levers commute so their order cannot change the answer, but two overrides on one period do not, and
 * resolving that by key means the same scenario gives the same number whichever order a repository returned its
 * levers in.
 */
export const orderLevers = (levers: readonly LeverView[]): readonly LeverView[] =>
  [...levers].sort((a, b) => {
    const byKind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (byKind !== 0) return byKind;
    const keyA = normalizeLeverKey(a.leverKey);
    const keyB = normalizeLeverKey(b.leverKey);
    if (keyA === keyB) return 0;
    return keyA < keyB ? -1 : 1;
  });

// --- Applying a lever ------------------------------------------------------------

/**
 * The value after one lever has acted on it, at one horizon.
 *
 * `growth_rate` compounds from the horizon the lever starts at, inclusive: a lever that grows 4% from horizon 2
 * has grown once *at* horizon 2, not first at horizon 3. The exclusive reading is defensible in the abstract and
 * a trap in practice — a lever that changes nothing in the period it is configured to start is a lever that
 * starts a period later, and nobody configuring one means that.
 */
export const applyLever = (value: number, lever: LeverView, horizon: number): number => {
  switch (lever.kind) {
    case "additive":
      return value + lever.magnitude;
    case "multiplicative":
      return value * lever.magnitude;
    case "override":
      return lever.magnitude;
    case "growth_rate":
      return value * lever.magnitude ** (horizon - lever.fromHorizon + 1);
  }
};

// --- The simulation --------------------------------------------------------------

/**
 * Simulate one scenario against one pinned baseline forecast.
 *
 * Every baseline point produces a simulation point, including the periods no lever reached — a scenario is a
 * statement about the whole projection, and omitting the untouched periods would leave a reader to work out
 * whether a missing period was unmoved or unforecast.
 *
 * `unappliedLeverKeys` names every lever that touched nothing: an inadmissible magnitude, a `fromHorizon` past
 * the end of the projection, or a projection with no points in it at all. It is a finding rather than a failure
 * because the fix belongs to whoever configured the scenario, and a thrown error would deny them the rest of the
 * answer while they worked out which lever was at fault.
 */
export const simulate = (
  scenarioKey: string,
  baseline: readonly ForecastPoint[],
  levers: readonly LeverView[],
  baselineUncertainty: UncertaintyGrade,
): SimulationOutcome => {
  const ordered = orderLevers(levers.filter(isLeverAdmissible));
  const inadmissible = levers
    .filter((lever) => !isLeverAdmissible(lever))
    .map((lever) => normalizeLeverKey(lever.leverKey));

  const applied = new Set<string>();
  let overridden = false;
  let totalBaseline = 0;
  let totalScenario = 0;
  let peakDelta = 0;

  const points: SimulationPoint[] = [];
  for (const point of baseline) {
    const appliedHere: string[] = [];
    let scenarioValue = point.value;

    for (const lever of ordered) {
      if (point.horizon < lever.fromHorizon) continue;
      const key = normalizeLeverKey(lever.leverKey);
      scenarioValue = applyLever(scenarioValue, lever, point.horizon);
      appliedHere.push(key);
      applied.add(key);
      if (lever.kind === "override") overridden = true;
    }

    const rounded = roundValue(scenarioValue);
    const delta = roundValue(rounded - point.value);

    totalBaseline += point.value;
    totalScenario += rounded;
    if (Math.abs(delta) > Math.abs(peakDelta)) peakDelta = delta;

    points.push({
      period: point.period,
      horizon: point.horizon,
      label: point.label,
      baselineValue: point.value,
      scenarioValue: rounded,
      delta,
      relativeDelta: point.value === 0 ? null : roundValue(delta / point.value),
      appliedLeverKeys: appliedHere,
    });
  }

  const unreached = ordered
    .map((lever) => normalizeLeverKey(lever.leverKey))
    .filter((key) => !applied.has(key));

  return {
    scenarioKey: normalizeScenarioKey(scenarioKey),
    points,
    totalBaseline: roundValue(totalBaseline),
    totalScenario: roundValue(totalScenario),
    totalDelta: roundValue(totalScenario - totalBaseline),
    peakDelta,
    inheritedUncertainty: baselineUncertainty,
    overridden,
    unappliedLeverKeys: [...new Set([...inadmissible, ...unreached])].sort(),
  };
};

/**
 * The keys of levers bound to an assumption, paired with that assumption.
 *
 * A scenario whose levers name the assumptions they vary is traceable to the beliefs it is testing; one whose
 * levers name nothing is a set of numbers somebody typed. Levers with no assumption are omitted rather than
 * paired with a placeholder, because a lever may legitimately explore something nobody assumed and inventing an
 * assumption key for it would put a belief on the record that was never declared.
 */
export const leverAssumptionPairs = (
  levers: readonly LeverView[],
): readonly { readonly leverKey: string; readonly assumptionKey: string }[] =>
  orderLevers(levers)
    .filter(
      (lever): lever is LeverView & { assumptionKey: string } =>
        lever.assumptionKey !== null && lever.assumptionKey.trim().length > 0,
    )
    .map((lever) => ({
      leverKey: normalizeLeverKey(lever.leverKey),
      assumptionKey: normalizeAssumptionKey(lever.assumptionKey),
    }));
