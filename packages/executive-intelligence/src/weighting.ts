import {
  MIN_PILLAR_COVERAGE,
  MIN_PILLAR_WEIGHT,
  PILLAR_COUNT,
  WEIGHT_TOTAL,
  type HealthPillar,
  isWeightAdmissible,
  isWeightSetBalanced,
  roundWeight,
} from "./command-value";
import type { PillarWeight, WeightIssue, WeightVerdict } from "./command-view";

/**
 * The weighting engine: how an institution's own priorities enter the composite, and what stops them from
 * emptying it.
 *
 * An index's weights are the one place a school gets to say what it thinks matters, and that has to be true or
 * the composite is a platform opinion wearing the institution's name. But an unconstrained weight set is also
 * the easiest way to make a health index say whatever its author needed it to say this term — weigh the two
 * pillars that are going well at nine tenths between them and the number comes out fine. The constraints here
 * exist to keep the first property without buying the second.
 *
 * Three rules do the work, and none of them is about arithmetic. No pillar may be half the index or more, so a
 * composite cannot be a single indicator in disguise. No pillar may be under one per cent, so nothing appears in
 * a composition that cannot move it — a pillar too small to matter still counts toward coverage and still reads,
 * to anyone looking at the definition, as something the institution watches. And a definition must span at least
 * {@link MIN_DECLARED_PILLARS} of the ten, because the coverage floor that governs assessments is worth nothing
 * if an author can satisfy it by declaring three pillars and measuring all three.
 *
 * {@link redistribute} is the other half of the module and it runs at assessment time rather than authoring
 * time. When a pillar fails to report, its weight does not vanish and it is not treated as a zero score: it is
 * spread across the pillars that did report, in proportion to what they were already declared at. Treating a
 * silent pillar as zero would be the single most damaging arithmetic in this contract — a school that could not
 * collect wellbeing data for a term would read as a school with a wellbeing crisis, and the two are not
 * distinguishable afterwards from the number alone.
 */

// --- Authoring -------------------------------------------------------------------

/**
 * The fewest pillars an index definition may span.
 *
 * Derived from {@link MIN_PILLAR_COVERAGE} rather than chosen separately, and deliberately so: the same
 * six-of-ten judgement governs both how much of an institution a definition must reach and how much of that
 * definition must report before an assessment counts. Two constants would let the pair drift apart, and the gap
 * between them would be exactly the loophole — a definition narrow enough to always clear a floor written for a
 * wider one.
 */
export const MIN_DECLARED_PILLARS = Math.ceil(MIN_PILLAR_COVERAGE * PILLAR_COUNT);

/** Stable codes for what can be wrong with a declared weight set. Reported all at once, like scale issues. */
export const WEIGHT_ISSUE_CODES = [
  "no_pillars",
  "too_few_pillars",
  "duplicate_pillar",
  "weight_below_minimum",
  "weight_above_maximum",
  "unbalanced_total",
] as const;
export type WeightIssueCode = (typeof WEIGHT_ISSUE_CODES)[number];

const issue = (code: WeightIssueCode, pillar: HealthPillar | null): WeightIssue => ({
  code,
  pillar,
});

/**
 * Inspect a declared weight set and report everything wrong with it.
 *
 * The two out-of-band cases are separate codes rather than one, because they are opposite mistakes with opposite
 * corrections and an author told only that a weight is "out of range" has to go and look up which end they hit.
 * The balance check runs last and only on weights that were individually admissible, for the same reason the
 * scale validator skips its shape checks on a broken structure: "these do not total one" is unhelpful advice
 * about a set containing a weight of 4.
 */
export const validateWeights = (weights: readonly PillarWeight[]): WeightVerdict => {
  const issues: WeightIssue[] = [];

  if (weights.length === 0) {
    return { usable: false, issues: [issue("no_pillars", null)] };
  }
  if (weights.length < MIN_DECLARED_PILLARS) {
    issues.push(issue("too_few_pillars", null));
  }

  const seen = new Set<HealthPillar>();
  for (const entry of weights) {
    if (seen.has(entry.pillar)) issues.push(issue("duplicate_pillar", entry.pillar));
    seen.add(entry.pillar);
    if (!isWeightAdmissible(entry.weight)) {
      const below = !Number.isFinite(entry.weight) || roundWeight(entry.weight) < MIN_PILLAR_WEIGHT;
      issues.push(issue(below ? "weight_below_minimum" : "weight_above_maximum", entry.pillar));
    }
  }

  const admissible = weights.every((entry) => isWeightAdmissible(entry.weight));
  if (admissible && !isWeightSetBalanced(weights.map((entry) => entry.weight))) {
    issues.push(issue("unbalanced_total", null));
  }

  return { usable: issues.length === 0, issues };
};

// --- Assessment ------------------------------------------------------------------

/**
 * Renormalize a weight set over the pillars that actually contributed.
 *
 * Proportional: a pillar keeps its share of what remains, so an institution's declared priorities survive a
 * pillar dropping out instead of being flattened into an equal split. Weights come back rounded to
 * {@link roundWeight}'s precision, which means the returned set is exactly what an auditor will be shown and
 * exactly what the index was computed from — a renormalization that reported one set of weights and used another
 * would be undetectable and would make the index irreproducible from its own record.
 *
 * Returns an empty set when nothing survives. Callers must handle that rather than receiving a set of zeros,
 * because a zero weight is a statement about a pillar and there is no pillar here to make it about.
 */
export const redistribute = (
  weights: readonly PillarWeight[],
  contributing: readonly HealthPillar[],
): readonly PillarWeight[] => {
  const kept = new Set(contributing);
  const survivors = weights.filter((entry) => kept.has(entry.pillar));
  const total = survivors.reduce((sum, entry) => sum + entry.weight, 0);
  if (survivors.length === 0 || total <= 0) return [];

  return survivors.map((entry) => ({
    pillar: entry.pillar,
    weight: roundWeight(entry.weight / total),
  }));
};

/**
 * How much declared weight was displaced by pillars dropping out: the share of the index that had to be carried
 * by the pillars that did report.
 *
 * Reported on every assessment because it is the honest measure of how much the composite moved away from the
 * thing the institution defined. An index missing a tenth of its weight is broadly the index that was declared;
 * one missing a third is a different measurement with the same name, and a reader comparing it to last term
 * deserves to be told which they are holding.
 */
export const redistributedWeight = (
  weights: readonly PillarWeight[],
  contributing: readonly HealthPillar[],
): number => {
  const kept = new Set(contributing);
  const displaced = weights
    .filter((entry) => !kept.has(entry.pillar))
    .reduce((sum, entry) => sum + entry.weight, 0);
  return roundWeight(Math.min(WEIGHT_TOTAL, Math.max(0, displaced)));
};
