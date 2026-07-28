import { bandFor } from "./banding";
import {
  MAX_NORMALIZED_SCORE,
  type HealthPillar,
  coverageRatio,
  isFiniteMeasure,
  isKpiCoverageSufficient,
  isNormalizedScore,
  isPillarCoverageSufficient,
  roundIndexValue,
  roundWeight,
} from "./command-value";
import type {
  IndexVerdict,
  PillarContribution,
  PillarExclusion,
  PillarInput,
  PillarOmission,
  PillarWeight,
} from "./command-view";
import { redistribute, redistributedWeight } from "./weighting";

/**
 * The indexing engine: the Institutional Health Index itself.
 *
 * One number for a whole school, which is a dangerous thing to compute and the reason most of this module is
 * about what the number is *not* allowed to do. A composite's failure mode is not inaccuracy, it is
 * plausibility: it comes out at 71, it looks like a measurement, and nothing about it says that four of its ten
 * pillars were silent this term and the six that reported were the six that always report.
 *
 * Three defences are structural here rather than advisory.
 *
 * A pillar that did not report is *excluded*, never zeroed. This is the single most consequential line in the
 * contract. A school whose wellbeing lead was on leave for a term did not have a wellbeing collapse, and a
 * composite that treats absence as a score of nothing manufactures one — then the following term's recovery
 * reads as a triumph, and both numbers are fiction. Excluded pillars appear as {@link PillarOmission}s with a
 * reason, and their weight is redistributed across the pillars that did report.
 *
 * Coverage is reported, not assumed. {@link IndexVerdict.pillarCoverage} and
 * {@link IndexVerdict.weightRedistributed} travel with the value permanently, so nobody has to reconstruct after
 * the fact how much of the institution the number actually saw. An assessment below the floor still computes —
 * it is useful, and suppressing it would only push people back to spreadsheets — but it is marked insufficient,
 * and the aggregate in this package will not let an insufficient assessment be finalized or cited.
 *
 * The derivation is attached to the result. Every contribution carries the score, the declared weight, the
 * effective weight after renormalization, and the index points it accounts for; the shares sum to the value.
 * That is what "evidence-traceable" means at the top of the pyramid — a governor can be handed the composite and
 * take it apart without asking anyone to re-run anything.
 */

// --- Classification --------------------------------------------------------------

/** A pillar input paired with the declared weight it was matched to. */
interface MatchedPillar {
  readonly input: PillarInput;
  readonly declaredWeight: number;
  readonly kpiCoverage: number;
}

/**
 * Why a matched pillar cannot contribute, or `null` when it can.
 *
 * Coverage is tested before the score is. A pillar that reported two of its nine indicators has a score, and
 * that score may well be strange, but the useful thing to tell an administrator is that it barely reported —
 * complaining about the number a thin sample produced sends them to inspect an aggregation that is working
 * correctly on the little it was given.
 */
const exclusionFor = (matched: MatchedPillar): PillarExclusion | null => {
  if (!isKpiCoverageSufficient(matched.kpiCoverage)) return "kpi_coverage";
  if (!isFiniteMeasure(matched.input.score) || !isNormalizedScore(matched.input.score)) {
    return "unscoreable";
  }
  return null;
};

// --- Assessment ------------------------------------------------------------------

/**
 * Compute an index from a declared weight set and whatever the pillars managed to report.
 *
 * The weight set drives the walk, not the inputs. An assessment is an answer to the question the *definition*
 * asked, so every declared pillar is accounted for — as a contribution or as an omission — and any input for a
 * pillar the definition never mentioned is set aside as `not_weighted` rather than quietly folded in. An index
 * that silently absorbed an extra pillar would stop being comparable to its own previous periods, which is the
 * one property a health index has to keep.
 *
 * Expects a weight set that `validateWeights` accepted. It does not re-validate: a definition is checked when it
 * is authored, and re-litigating that on every assessment would mean a definition edited into an invalid state
 * silently stopped producing numbers instead of failing where somebody could see it.
 */
export const assessIndex = (
  weights: readonly PillarWeight[],
  inputs: readonly PillarInput[],
): IndexVerdict => {
  const byPillar = new Map<HealthPillar, PillarInput>();
  for (const input of inputs) {
    if (!byPillar.has(input.pillar)) byPillar.set(input.pillar, input);
  }

  const contributingPillars: HealthPillar[] = [];
  const matched: MatchedPillar[] = [];
  const omissions: PillarOmission[] = [];

  for (const declared of weights) {
    const input = byPillar.get(declared.pillar);
    if (!input) {
      omissions.push({
        pillar: declared.pillar,
        reason: "kpi_coverage",
        declaredWeight: declared.weight,
        kpiCoverage: 0,
      });
      continue;
    }
    const entry: MatchedPillar = {
      input,
      declaredWeight: declared.weight,
      kpiCoverage: coverageRatio(input.kpisRead, input.kpisDeclared),
    };
    const exclusion = exclusionFor(entry);
    if (exclusion) {
      omissions.push({
        pillar: declared.pillar,
        reason: exclusion,
        declaredWeight: declared.weight,
        kpiCoverage: entry.kpiCoverage,
      });
      continue;
    }
    matched.push(entry);
    contributingPillars.push(declared.pillar);
  }

  const declaredSet = new Set(weights.map((entry) => entry.pillar));
  const noted = new Set<HealthPillar>();
  for (const input of inputs) {
    if (declaredSet.has(input.pillar) || noted.has(input.pillar)) continue;
    noted.add(input.pillar);
    omissions.push({
      pillar: input.pillar,
      reason: "not_weighted",
      declaredWeight: 0,
      kpiCoverage: coverageRatio(input.kpisRead, input.kpisDeclared),
    });
  }

  const pillarCoverage = coverageRatio(contributingPillars.length, weights.length);
  const effective = redistribute(weights, contributingPillars);
  const effectiveByPillar = new Map(effective.map((entry) => [entry.pillar, entry.weight]));
  const effectiveTotal = effective.reduce((sum, entry) => sum + entry.weight, 0);

  if (matched.length === 0 || effectiveTotal <= 0) {
    return {
      value: null,
      band: null,
      pillarCoverage,
      sufficient: false,
      contributions: [],
      omissions,
      weightRedistributed: redistributedWeight(weights, contributingPillars),
    };
  }

  const contributions: PillarContribution[] = matched.map((entry) => {
    const effectiveWeight = effectiveByPillar.get(entry.input.pillar) ?? 0;
    const normalized = effectiveWeight / effectiveTotal;
    return {
      pillar: entry.input.pillar,
      score: roundIndexValue(entry.input.score),
      band: bandFor(entry.input.score),
      declaredWeight: roundWeight(entry.declaredWeight),
      effectiveWeight,
      kpiCoverage: entry.kpiCoverage,
      share: roundIndexValue(normalized * entry.input.score),
      shortfall: roundIndexValue(normalized * (MAX_NORMALIZED_SCORE - entry.input.score)),
    };
  });

  const value = roundIndexValue(
    matched.reduce(
      (sum, entry) => sum + (effectiveByPillar.get(entry.input.pillar) ?? 0) * entry.input.score,
      0,
    ) / effectiveTotal,
  );

  return {
    value,
    band: bandFor(value),
    pillarCoverage,
    sufficient: isPillarCoverageSufficient(pillarCoverage),
    contributions,
    omissions,
    weightRedistributed: redistributedWeight(weights, contributingPillars),
  };
};

// --- Reading an assessment -------------------------------------------------------

/**
 * The contributing pillars ordered by the index points each is costing, worst first.
 *
 * The answer to the only question leadership actually asks of a composite, which is not "how are we" but "where
 * do I start". Ranking on shortfall rather than on score is what makes the answer actionable: a pillar scoring
 * 40 at a weight of two per cent is costing the index barely more than a point, and a pillar scoring 65 at
 * thirty per cent is costing ten. Sending a head teacher after the first one because its score looks worse is
 * how a term of institutional attention gets spent on the wrong thing.
 *
 * Ties break on the declaration order of the weight set, which is stable, so two runs of the same assessment
 * rank identically.
 */
export const rankByDrag = (verdict: IndexVerdict): readonly PillarContribution[] =>
  [...verdict.contributions].sort((left, right) => right.shortfall - left.shortfall);

/**
 * Whether an assessment may be treated as a finding rather than a working number.
 *
 * Coverage alone. Deliberately not a judgement about the value — a low index that cleared its floor is a real
 * result and possibly the most important one the institution will see this year, and a gate that also asked
 * whether the number looked reasonable would be a gate against bad news.
 */
export const isCitable = (verdict: IndexVerdict): boolean =>
  verdict.value !== null && verdict.sufficient;
