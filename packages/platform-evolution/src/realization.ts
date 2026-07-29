import {
  type RealizationVerdict,
  VARIANCE_BANDS,
  VARIANCE_FLOORS,
  type VarianceBand,
  isFiniteMeasure,
  roundMaturity,
} from "./evolution-value";
import type { BenefitClaim, BenefitOutcome, RealizationRecommendation } from "./evolution-view";

/**
 * The realization engine: whether a change the institution adopted actually delivered what it was adopted for.
 *
 * This is the rung improvement programmes almost never reach. A signal gets raised, an initiative gets approved,
 * a pilot runs, the change is adopted — and then attention moves, because the decision is the part that felt
 * like the work. Twelve months later nobody can say whether it helped, and the institution's next decision is
 * made with exactly the evidence base it had before, plus a strong collective sense that the last thing went
 * fine. That sense is not a lie. It is what happens when nothing was ever measured against what was promised.
 *
 * Realization is measured as movement rather than level, which is the single decision that makes these numbers
 * mean anything. An initiative that promised to lift a measure from 60 to 80 and left it at 76 realized eighty
 * per cent of what it promised; an initiative that promised to lift the same measure from 74 to 80 and left it
 * at 76 realized a third. Reported as levels both sit at 95% of target and look like the same success, and an
 * institution comparing them would learn to promise the smallest improvement it could defend.
 *
 * Nothing here reverts, adjusts or reopens anything. {@link recommendVerdict} produces a recommendation, and a
 * recommendation to revert becomes an initiative under the reversion gate with its own deciders — because
 * undoing a change the institution agreed to is a change the institution has to agree to. An engine that could
 * reverse an adoption on arithmetic would be the one place in this contract where something happened to the
 * institution without anybody deciding it should.
 */

// --- Bands -----------------------------------------------------------------------

/**
 * How severe a variance band is. `exceeded` is `0` and severity ascends.
 *
 * Exposed for the reason {@link file://./lineage.ts}'s stage rank is: callers legitimately need to order
 * outcomes — worst benefit first in a review pack, or whether this term's variances are worse than last term's —
 * and the alternative to publishing the order is every caller hard-coding a copy of it that stops agreeing with
 * this one the first time a band is added.
 */
export const varianceBandRank = (band: VarianceBand): number => VARIANCE_BANDS.indexOf(band);

/**
 * The band a realization ratio falls in.
 *
 * Deliberately not exported. The only ratio worth banding is one this engine computed from a baseline, a target
 * and an observation it can show, and a public banding function would invite callers to arrive with a ratio from
 * somewhere else — at which point the band would be a fact about a number nobody can check, which is precisely
 * the shape of benefit reporting this engine exists to replace.
 */
const bandForRatio = (ratio: number): VarianceBand => {
  if (ratio >= VARIANCE_FLOORS.exceeded) return "exceeded";
  if (ratio >= VARIANCE_FLOORS.met) return "met";
  if (ratio >= VARIANCE_FLOORS.shortfall) return "shortfall";
  return "missed";
};

// --- Benefits --------------------------------------------------------------------

/**
 * Measure one promised benefit against what actually happened.
 *
 * Both the promise and the achievement are computed in the declared direction, so a benefit that was supposed to
 * bring a number down reads exactly like one that was supposed to push a number up: a positive `promised`, a
 * positive `achieved` when it worked, and a negative `achieved` when the measure moved the wrong way. Callers
 * never have to remember which way a particular measure points, which matters because they will be summarising
 * six benefits at once and one of them will point the other way.
 *
 * Three refusals, and none of them bands. `invalid_baseline`, `invalid_target` and `invalid_observed` are
 * reported together because they arrive together — a review assembled from a broken export usually has more than
 * one hole, and returning them one at a time turns a data problem into a week of round trips.
 * `no_promised_movement` catches a target identical to its baseline, which is a benefit that promised nothing
 * and against which any observation whatsoever would divide by zero. `target_contradicts_direction` catches a
 * target on the wrong side of its own baseline: an initiative claiming to reduce something while aiming higher
 * than it started. Inferring the direction from the numbers would repair that into a coherent claim nobody made.
 *
 * The ratio is rounded on the same register as a maturity index rather than on a third precision of its own.
 * Both are derived reporting values read side by side in the same review pack, and a platform whose two headline
 * numbers rounded differently for no reason a reader could name would be inviting exactly the arithmetic
 * argument these bands exist to end.
 */
export const measureBenefit = (claim: BenefitClaim): BenefitOutcome => {
  const issues: string[] = [];

  if (!isFiniteMeasure(claim.baseline)) issues.push("invalid_baseline");
  if (!isFiniteMeasure(claim.target)) issues.push("invalid_target");
  if (!isFiniteMeasure(claim.observed)) issues.push("invalid_observed");

  if (issues.length > 0) {
    return { measurable: false, promised: 0, achieved: 0, ratio: 0, band: null, issues };
  }

  const rising = claim.direction === "increase";
  const promised = rising ? claim.target - claim.baseline : claim.baseline - claim.target;
  const achieved = rising ? claim.observed - claim.baseline : claim.baseline - claim.observed;

  if (promised <= 0) {
    issues.push(promised === 0 ? "no_promised_movement" : "target_contradicts_direction");
    return { measurable: false, promised, achieved, ratio: 0, band: null, issues };
  }

  const ratio = roundMaturity(achieved / promised);
  return { measurable: true, promised, achieved, ratio, band: bandForRatio(ratio), issues };
};

// --- Verdicts --------------------------------------------------------------------

/**
 * What an adoption review should recommend, across everything one initiative promised.
 *
 * The severest measurable outcome decides, not the average. That is the same rule the governance engine applies
 * to a refused ballot and it is the same argument: an average lets four comfortable findings outvote one serious
 * one, and the record would then show an institution that was told a benefit had been missed and reported the
 * initiative as sustained. Averaging is also how a programme learns to promise several easy benefits alongside
 * the one it is actually accountable for.
 *
 * `inconclusive` is reserved for having measured nothing, and it is a real verdict rather than a failure to
 * reach one. An initiative whose benefits cannot be measured has not been shown to work and has not been shown
 * not to; recommending `sustained` on that basis would let an absence of evidence read as evidence, and
 * recommending `revert` would punish a data problem as if it were a delivery one. Both mistakes are common and
 * they point in opposite directions, which is why the honest third answer needs a name.
 *
 * Unmeasurable benefits are excluded from the severity comparison but survive in the counts. `benefitsMeasured`
 * against `benefitsClaimed` is the finding a reviewer needs most: an initiative that promised six benefits and
 * could measure one has a `sustained` recommendation resting on a sixth of its own case, and the two numbers
 * sitting beside the verdict are what stop that being read as six successes.
 */
export const recommendVerdict = (
  outcomes: readonly BenefitOutcome[],
): RealizationRecommendation => {
  const bands: VarianceBand[] = [];
  for (const outcome of outcomes) {
    if (outcome.band !== null) bands.push(outcome.band);
  }

  const benefitsClaimed = outcomes.length;
  const benefitsMeasured = bands.length;

  if (benefitsMeasured === 0) {
    return { verdict: "inconclusive", worstBand: null, benefitsMeasured, benefitsClaimed };
  }

  let worstBand: VarianceBand = "exceeded";
  for (const band of bands) {
    if (varianceBandRank(band) > varianceBandRank(worstBand)) worstBand = band;
  }

  const verdict: RealizationVerdict =
    worstBand === "missed" ? "revert" : worstBand === "shortfall" ? "adjust" : "sustained";

  return { verdict, worstBand, benefitsMeasured, benefitsClaimed };
};
