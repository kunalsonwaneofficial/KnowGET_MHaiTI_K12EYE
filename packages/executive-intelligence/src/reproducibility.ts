import { INDEX_PRECISION, WEIGHT_PRECISION, roundIndexValue, roundWeight } from "./command-value";
import type {
  IndexRun,
  PillarInput,
  PillarWeight,
  RecordedIndex,
  ReproductionFault,
  ReproductionVerdict,
} from "./command-view";
import { assessIndex } from "./indexing";

/**
 * The reproducibility engine: how an index defends itself six months later.
 *
 * A composite is quoted in places its author will not be standing — a board paper, an inspection response, a
 * funding case — and the question that eventually arrives is not whether the number was right but whether it can
 * be produced again. An institution that cannot re-derive its own headline figure has not published a
 * measurement; it has published an assertion with a decimal point in it.
 *
 * The mechanism is that an assessment pins its inputs and carries a fingerprint of them, and a re-run recomputes
 * through {@link assessIndex} — the real engine, not a copy of it, because a checker with its own arithmetic
 * verifies the checker.
 *
 * Two properties make the check mean something.
 *
 * The fingerprint covers exactly what the arithmetic reads and nothing else. No period, no author, no timestamp,
 * no status. So a fingerprint mismatch always means the inputs differ somewhere the value could depend on, which
 * in turn is what separates a reproduction from a coincidence: an index that comes out at 71.4 again from a
 * different input set has not been reproduced, and a comparison that only looked at values would have called it
 * confirmed.
 *
 * And there is no tolerance. Not a small one, not a configurable one. Every derived value in this package is
 * rounded to {@link INDEX_PRECISION} before it is stored precisely so that identical can mean identical, and a
 * tolerance band on top of that would be nothing but a place for a real change to hide — which is the only thing
 * a tolerance is ever used for once a system is under pressure.
 *
 * The same call answers a second question the domain needs. Re-run against the pinned inputs and any
 * disagreement means the record is wrong. Re-run against today's inputs and `inputs_changed` is expected — what
 * matters then is the drift, and whether the institution moved. One engine, because these are the same
 * arithmetic asked at two moments, and two engines would eventually disagree about what "the same" meant.
 */

// --- Fingerprinting --------------------------------------------------------------

/** Hex characters in a fingerprint. A 64-bit digest, rendered fixed-width so records line up. */
export const FINGERPRINT_LENGTH = 16;

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const SIXTY_FOUR_BITS = 0xffffffffffffffffn;

/**
 * A 64-bit FNV-1a digest of a canonical string.
 *
 * Non-cryptographic, and that is a deliberate limit rather than an oversight. This detects an input set that
 * changed between two runs — an edited reading, a re-weighted definition, a pillar that quietly appeared — which
 * is the failure a health index actually suffers. It is not a tamper control and must never be used as one: the
 * pinned inputs themselves are the record, the fingerprint is only the cheap way to notice they moved, and a
 * platform that treated a matching digest as proof of integrity would have built an authenticity guarantee out
 * of a hash function chosen for being fast.
 */
const digest = (input: string): string => {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash ^ BigInt(input.charCodeAt(index))) * FNV_PRIME;
    hash &= SIXTY_FOUR_BITS;
  }
  return hash.toString(16).padStart(FINGERPRINT_LENGTH, "0");
};

/**
 * One weight, rendered at the precision it is stored and compared at.
 *
 * Fixed-width rather than the number's own shortest form, so `0.1` and `0.1000` cannot fingerprint differently
 * while being the same declared weight.
 */
const renderWeight = (entry: PillarWeight): string =>
  `${entry.pillar}=${roundWeight(entry.weight).toFixed(WEIGHT_PRECISION)}`;

/**
 * One pillar's report: its score and both coverage counts.
 *
 * The counts are in the digest, not just the score. A pillar that reported four of nine indicators and then
 * reported four of six is a materially different input even when the score is identical, and it is exactly the
 * change that quietly widens or narrows what an index is measuring between two periods that look comparable.
 */
const renderInput = (entry: PillarInput): string =>
  `${entry.pillar}=${roundIndexValue(entry.score).toFixed(INDEX_PRECISION)}@${entry.kpisRead}/${entry.kpisDeclared}`;

/**
 * The canonical text of a run: sorted, fixed-precision, and free of anything the arithmetic does not read.
 *
 * Sorted because a definition whose rows were reordered is the same definition. Declaration order does affect
 * the order contributions come back in, but not the value, and a fingerprint that changed when somebody dragged
 * a row up a list would cry drift at an edit that moved nothing.
 */
const canonicalize = (run: IndexRun): string => {
  const weights = run.weights.map(renderWeight).sort().join(",");
  const inputs = run.inputs.map(renderInput).sort().join(",");
  return `w[${weights}]i[${inputs}]`;
};

/** The fingerprint an assessment stores alongside its value, and a re-run recomputes to compare against. */
export const fingerprintRun = (run: IndexRun): string => digest(canonicalize(run));

// --- Reproduction ----------------------------------------------------------------

/**
 * Re-run an index and report every way the result failed to agree with the record.
 *
 * All four faults are reported, never the first one. A run that drifted in value has almost always drifted in
 * band and coverage too, and an auditor handed only the value difference has to ask three more times to find out
 * whether the institution changed band — which is the part anybody outside the finance office will actually
 * react to.
 *
 * `drift` is `null` rather than `0` when either side has no value. A composite that could not be computed and
 * one that came out at zero are different events, and a drift of "nothing" between them would read as agreement.
 */
export const reproduce = (recorded: RecordedIndex, run: IndexRun): ReproductionVerdict => {
  const recomputedFingerprint = fingerprintRun(run);
  const recomputed = assessIndex(run.weights, run.inputs);
  const inputsMatch = recorded.fingerprint === recomputedFingerprint;

  const faults: ReproductionFault[] = [];
  if (!inputsMatch) faults.push("inputs_changed");
  if (recorded.value !== recomputed.value) faults.push("value_drift");
  if (recorded.band !== recomputed.band) faults.push("band_drift");
  if (recorded.pillarCoverage !== recomputed.pillarCoverage) faults.push("coverage_drift");

  const drift =
    recorded.value !== null && recomputed.value !== null
      ? roundIndexValue(recomputed.value - recorded.value)
      : null;

  return {
    reproduced: faults.length === 0,
    inputsMatch,
    recordedFingerprint: recorded.fingerprint,
    recomputedFingerprint,
    recordedValue: recorded.value,
    recomputedValue: recomputed.value,
    drift,
    faults,
  };
};
