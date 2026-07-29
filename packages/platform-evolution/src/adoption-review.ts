import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  BenefitAlreadyObservedError,
  BenefitNotClaimedError,
  EmptyMeasureKeyError,
  IncoherentBenefitClaimError,
  InvalidMeasureKeyError,
  InvalidReviewPeriodError,
  RepeatBenefitClaimError,
  ReviewConcludedError,
  UnmeasurableObservationError,
} from "./errors";
import {
  type BenefitDirection,
  type RealizationVerdict,
  type VarianceBand,
  isValidKey,
  isValidPeriod,
  normalizeKey,
} from "./evolution-value";
import type { BenefitOutcome, RealizationRecommendation } from "./evolution-view";
import { measureBenefit, recommendVerdict } from "./realization";

/**
 * An adoption review: what an adopted change was supposed to achieve, what it actually achieved, and what the
 * institution should do about the difference.
 *
 * This is the record the whole contract points at. An initiative reaching `adopted` means the institution agreed
 * to make a change; it says nothing about whether the change worked. Almost every improvement programme stops at
 * the agreement, which is why almost every institution can list what it changed last year and none of them can
 * say which of those changes helped. The verdict here — sustain, adjust, revert — is the only thing that closes
 * that loop, and it has to be reachable from evidence rather than from whoever proposed the change.
 *
 * **A benefit is claimed before it is observed, and the gap between the two is the point.** Baseline and target
 * are recorded when the review opens, months before anybody knows what happened. Recording them afterwards would
 * let a target be set to whatever the observation turned out to be, and the resulting review would be a
 * ceremonial confirmation of every change the institution ever made. The observation lands later, once, and is
 * refused a second time: replacing it is how a shortfall becomes a success by being measured again in a better
 * quarter, with no trace in the record that a first reading existed.
 *
 * **A claim that cannot be missed is refused where it is made.** A target equal to its baseline promises no
 * movement; a target on the wrong side of the baseline promises movement away from the thing the initiative
 * claimed to improve. Both produce a benefit that no observation could ever fall short of, and the realization
 * engine's own comment explains why the direction is not inferred from the numbers instead: inferring it would
 * repair the claim into a coherent one nobody made.
 *
 * **An unobserved benefit stays on the record, and this is deliberate.** `observed` is nullable, so an initiative
 * that promised six benefits and could measure one carries five nulls rather than one benefit and five omissions.
 * That is what makes `benefitsMeasured` against `benefitsClaimed` mean anything, and what makes `inconclusive` a
 * verdict the review can actually reach. A model that only stored measurable benefits would report the same
 * initiative as a clean `sustained`, resting on a sixth of its own case, and nothing on the screen would say so.
 *
 * **Concluding is the freeze.** From that moment the verdict is what the institution acts on, and a review that
 * could still take claims and observations afterwards would let the verdict people acted on and the evidence
 * behind it diverge — which is the exact failure adoption review exists to catch everywhere else.
 *
 * Periods are integer indices into a grid the caller defines, so how long after adoption the institution looked
 * is a fact about the review rather than an artefact of when somebody happened to run the report.
 */

// --- The aggregate ---------------------------------------------------------------

export interface ReviewedBenefit {
  /** What this benefit is called. How a claim and its later observation find each other. */
  readonly measureKey: string;
  /** Which way the measure was supposed to move. Fixed at the claim; never inferred from the numbers. */
  readonly direction: BenefitDirection;
  /** Where the measure stood before the change. */
  readonly baseline: number;
  /** Where the change promised to take it. */
  readonly target: number;
  /** Where it actually stood at the review. `null` until somebody looks. */
  readonly observed: number | null;
  /** Movement the claim promised, in the declared direction. Always positive. Derived, never set. */
  readonly promised: number;
  /** Movement achieved, in the declared direction. Negative if it went the wrong way. `0` while unobserved. */
  readonly achieved: number;
  /** `achieved` over `promised`. `0` while unobserved. Derived, never set. */
  readonly ratio: number;
  /** How far off the promise this landed. `null` while unobserved. Derived, never set. */
  readonly band: VarianceBand | null;
  readonly recordedAt: ISODateString;
}

export interface AdoptionReview {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The adopted change being reviewed. */
  readonly initiativeId: Uuid;
  /** How far after adoption the institution looked, on the caller's grid. */
  readonly reviewPeriod: number;
  /** Everything the change promised, measured or not. */
  readonly benefits: readonly ReviewedBenefit[];
  /** What the review recommends. Derived from the severest measured band, never set. */
  readonly verdict: RealizationVerdict;
  /** The severest band any measured benefit landed in. `null` when nothing could be measured. Derived. */
  readonly worstBand: VarianceBand | null;
  /** How many claimed benefits could actually be measured. Derived, never set. */
  readonly benefitsMeasured: number;
  /** How many were claimed. Read beside `benefitsMeasured` or not at all. Derived, never set. */
  readonly benefitsClaimed: number;
  readonly openedAt: ISODateString;
  readonly openedBy: Uuid;
  /** When the verdict became something the institution acts on. */
  readonly concludedAt: ISODateString | null;
  readonly concludedBy: Uuid | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface OpenReviewParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly initiativeId: Uuid;
  readonly reviewPeriod: number;
  readonly openedBy: Uuid;
}

export interface RecordBenefitParams {
  readonly measureKey: string;
  readonly direction: BenefitDirection;
  readonly baseline: number;
  readonly target: number;
}

// --- Opening ---------------------------------------------------------------------

/**
 * The four derived columns, flattened from the realization engine's recommendation.
 *
 * Stored rather than computed on read, for the same reason a governance decision stores its counts: the verdict
 * somebody acted on has to still be the verdict the record shows, and a derivation repeated at every read is a
 * second opinion waiting to disagree with the first.
 */
const applyRecommendation = (
  recommendation: RealizationRecommendation,
): Pick<AdoptionReview, "benefitsClaimed" | "benefitsMeasured" | "verdict" | "worstBand"> => ({
  verdict: recommendation.verdict,
  worstBand: recommendation.worstBand,
  benefitsMeasured: recommendation.benefitsMeasured,
  benefitsClaimed: recommendation.benefitsClaimed,
});

/**
 * A stored benefit mapped back to the thin shape the engine reasons about.
 *
 * An unobserved benefit is handed to the engine as `null`, which is not a finite measure, so it comes back
 * `measurable: false` with no band — exactly the treatment the counts and the `inconclusive` verdict are built
 * on. Substituting the target for a missing observation would make every unobserved benefit read as met.
 */
const toOutcome = (benefit: ReviewedBenefit): BenefitOutcome =>
  measureBenefit({
    direction: benefit.direction,
    baseline: benefit.baseline,
    target: benefit.target,
    observed: benefit.observed ?? Number.NaN,
  });

/**
 * Open a review against an adopted change.
 *
 * Nothing here checks that the initiative was adopted, or that this is the first review for the period. Neither
 * is decidable from a review in isolation, and both are refused where the repositories are.
 */
export function openReview(params: OpenReviewParams): AdoptionReview {
  if (!isValidPeriod(params.reviewPeriod)) throw new InvalidReviewPeriodError(params.reviewPeriod);

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    initiativeId: params.initiativeId,
    reviewPeriod: params.reviewPeriod,
    benefits: [],
    ...applyRecommendation(recommendVerdict([])),
    openedAt: now,
    openedBy: params.openedBy,
    concludedAt: null,
    concludedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (review: AdoptionReview, patch: Partial<AdoptionReview>): AdoptionReview => ({
  ...review,
  ...patch,
  updatedAt: nowIso(),
});

/** A concluded review is what the institution acted on, and it stops moving. */
function requireOpen(review: AdoptionReview): void {
  if (review.concludedAt !== null) throw new ReviewConcludedError(review.id);
}

/** Re-derive the whole standing from the stored benefits. There is one path to these four numbers. */
const restate = (review: AdoptionReview, benefits: readonly ReviewedBenefit[]): AdoptionReview =>
  touch(review, {
    benefits,
    ...applyRecommendation(recommendVerdict(benefits.map(toOutcome))),
  });

// --- Benefits --------------------------------------------------------------------

/**
 * Check that a claim describes a benefit capable of being missed, and hand back the promise it makes.
 *
 * The engine measures a whole claim at once, so the claim-level faults are surfaced by probing it with the target
 * standing in for the observation — a hypothetical perfect result — and dropping `invalid_observed` from what
 * comes back. What survives is exactly the four faults that belong to the promise itself: a broken baseline, a
 * broken target, a target that promises no movement, and a target on the wrong side of its own baseline. The
 * observation is somebody else's problem, months from now, and {@link observeBenefit} is where it is refused.
 *
 * The probe is returned rather than discarded because it already carries the one number a claim knows before
 * anybody looks: how much movement was promised. Asking the engine for that number a second time against a
 * missing observation would answer `0`, and a review listing six benefits that each promised nothing is not a
 * record of what the institution was told it would get.
 */
function requireCoherentClaim(measureKey: string, params: RecordBenefitParams): BenefitOutcome {
  const probe = measureBenefit({
    direction: params.direction,
    baseline: params.baseline,
    target: params.target,
    observed: params.target,
  });
  const issues = probe.issues.filter((issue) => issue !== "invalid_observed");
  if (issues.length > 0) throw new IncoherentBenefitClaimError(measureKey, issues);
  return probe;
}

/**
 * Claim a benefit: this is what the change was supposed to achieve, and it is written down before anybody knows.
 *
 * The measure key is normalized here and the observation will be normalized the same way months later, which is
 * the entire reason a malformed key is refused at the claim rather than tolerated until an observation arrives
 * that will not file against anything.
 */
export function recordBenefit(review: AdoptionReview, params: RecordBenefitParams): AdoptionReview {
  requireOpen(review);

  const measureKey = normalizeKey(params.measureKey);
  if (measureKey.length === 0) throw new EmptyMeasureKeyError();
  if (!isValidKey(measureKey)) throw new InvalidMeasureKeyError(measureKey);
  if (review.benefits.some((benefit) => benefit.measureKey === measureKey)) {
    throw new RepeatBenefitClaimError(review.id, measureKey);
  }
  const promise = requireCoherentClaim(measureKey, params);

  const claimed: ReviewedBenefit = {
    measureKey,
    direction: params.direction,
    baseline: params.baseline,
    target: params.target,
    observed: null,
    promised: promise.promised,
    achieved: 0,
    ratio: 0,
    band: null,
    recordedAt: nowIso(),
  };
  return restate(review, [...review.benefits, claimed]);
}

/**
 * Land the observation for a claimed benefit. Once.
 *
 * The claim has already been checked, so the only thing that can be wrong here is the observation itself, and an
 * unusable one is refused rather than stored as a benefit that looks observed and has no band. A second
 * observation is refused for the reason the module comment gives: the first reading is what the institution saw
 * at the interval it committed to, and a later interval is a later review.
 */
export function observeBenefit(
  review: AdoptionReview,
  measureKey: string,
  observed: number,
): AdoptionReview {
  requireOpen(review);

  const key = normalizeKey(measureKey);
  const existing = review.benefits.find((benefit) => benefit.measureKey === key);
  if (existing === undefined) throw new BenefitNotClaimedError(review.id, key);
  if (existing.observed !== null) throw new BenefitAlreadyObservedError(review.id, key);

  const outcome = measureBenefit({
    direction: existing.direction,
    baseline: existing.baseline,
    target: existing.target,
    observed,
  });
  if (!outcome.measurable) throw new UnmeasurableObservationError(key, outcome.issues);

  const observedBenefit: ReviewedBenefit = {
    ...existing,
    observed,
    promised: outcome.promised,
    achieved: outcome.achieved,
    ratio: outcome.ratio,
    band: outcome.band,
  };
  return restate(
    review,
    review.benefits.map((benefit) => (benefit.measureKey === key ? observedBenefit : benefit)),
  );
}

// --- Concluding ------------------------------------------------------------------

/**
 * Conclude the review. The verdict is now what the institution acts on.
 *
 * No coverage floor and no refusal for having measured nothing. `inconclusive` is a verdict the engine reaches
 * deliberately, and it is the finding a reviewer most needs to be able to file: an initiative whose benefits
 * could not be measured has not been shown to work, and forcing the review to stay open until somebody produces
 * numbers is how that finding turns into a review nobody ever concluded and a change nobody ever questioned.
 *
 * Nothing follows from the verdict inside this package. `revert` does not undo anything — undoing an adopted
 * change is a fresh initiative under the reversion gate, with its own proposal and its own deciders — and neither
 * does `adjust`. The review recommends; people decide.
 */
export function concludeReview(review: AdoptionReview, actor: Uuid): AdoptionReview {
  requireOpen(review);
  return touch(review, { concludedAt: nowIso(), concludedBy: actor });
}

// --- Reading ---------------------------------------------------------------------

/** Whether the verdict is settled. */
export const isReviewConcluded = (review: AdoptionReview): boolean => review.concludedAt !== null;

/**
 * The review's recommendation, re-derived from its stored benefits.
 *
 * On a stored review this agrees with the four columns by construction, which is what makes re-deriving it a
 * cheap invariant rather than a second opinion. It is exposed so that a caller can show somebody what concluding
 * now would say before they conclude.
 */
export const reviewRecommendation = (review: AdoptionReview): RealizationRecommendation =>
  recommendVerdict(review.benefits.map(toOutcome));

/**
 * The measures nobody has looked at yet. What is left to do before the verdict rests on the whole case.
 *
 * Worth having beside `benefitsMeasured`, because the count says how much of the case is missing and this says
 * which parts — and the parts that go unobserved are rarely the ones the change was easiest to defend on.
 */
export const reviewUnobservedMeasures = (review: AdoptionReview): readonly string[] =>
  review.benefits
    .filter((benefit) => benefit.observed === null)
    .map((benefit) => benefit.measureKey);
