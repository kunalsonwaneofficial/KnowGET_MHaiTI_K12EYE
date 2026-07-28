import {
  EVIDENCE_REQUIRING_ATTESTOR,
  READING_STANDINGS,
  type ReadingStanding,
  isReadingCurrent,
  normalizeSourceDomain,
  roundIndexValue,
  standingRank,
  weakestStanding,
} from "./command-value";
import type {
  EvidenceCitation,
  EvidenceIssue,
  EvidenceVerdict,
  ReadingAdmission,
  ReadingAudit,
  TraceVerdict,
  TracedReading,
} from "./command-view";

/**
 * The traceability engine: what a number has to be able to show before an institution is allowed to act on it.
 *
 * The contract's third clause is evidence-traceable KPIs, and the only version of that worth building is the one
 * where traceability is a precondition rather than an attribute. A dashboard whose figures are *usually* traceable
 * is worse than one that is honestly untraceable, because it teaches its readers that the provenance link is
 * decoration and they stop checking which numbers have one.
 *
 * So there are two gates, and a reading has to pass both to count. It must cite something — at least one record
 * on this platform, addressed well enough that somebody could go and look at it, with a named person behind it
 * when the kind of evidence is somebody's word. And it must sit close enough to the assessment's period to still
 * be about the same institution: {@link MAX_READING_AGE_PERIODS} periods, measured in ordinals so that staleness
 * is decidable without a clock anywhere in this package.
 *
 * Evidence is checked before currency, and the order carries a judgement. A figure that is both old and
 * unsourced is not an old figure; it is a figure of unknown origin that also happens to be old, and telling an
 * administrator it is stale would send them to refresh something nobody should have been using in the first
 * place.
 *
 * What the engine will not do is reject a reading for being soft. A projection is admissible and so is a
 * headteacher's return, because leadership legitimately plans against both and a platform that refused them
 * would simply be routed around. The handling is to let them in and make their softness impossible to lose:
 * standing is derived from the weakest evidence cited, never declared, and it travels through
 * {@link TraceVerdict.standing} into every assessment that consumed the reading.
 */

// --- Evidence --------------------------------------------------------------------

/** Stable codes for what can be wrong with the evidence behind a reading. Reported all at once. */
export const EVIDENCE_ISSUE_CODES = [
  "no_evidence",
  "missing_source_domain",
  "missing_source_ref",
  "missing_attestor",
  "attestor_not_required",
  "duplicate_citation",
] as const;
export type EvidenceIssueCode = (typeof EVIDENCE_ISSUE_CODES)[number];

const issue = (code: EvidenceIssueCode, citationIndex: number | null): EvidenceIssue => ({
  code,
  citationIndex,
});

/**
 * The identity of a cited record, for detecting a set that cites the same thing twice.
 *
 * `sourceRef` is trimmed but not case-folded, unlike every other key in this package. Refs are opaque
 * identifiers belonging to domains whose own case rules this package does not know, and folding them would merge
 * two genuinely different records in any domain that is case-sensitive. Under-merging costs a missed duplicate;
 * over-merging accuses an author of citing one record twice when they cited two.
 */
const citationKey = (citation: EvidenceCitation): string =>
  `${citation.kind}|${normalizeSourceDomain(citation.sourceDomain)}|${citation.sourceRef.trim()}`;

/** Whether a citation names somebody, as opposed to carrying an empty string where a name should be. */
const isAttested = (citation: EvidenceCitation): boolean =>
  citation.attestedBy !== null && citation.attestedBy.trim().length > 0;

/**
 * Inspect the evidence behind a reading and report everything wrong with it.
 *
 * An attestor supplied where none is required is an issue rather than a harmless extra. Every kind other than a
 * manual return points at a record that already carries its own authorship, so a name attached to one of those
 * citations records the person who pulled the report rather than the person accountable for the figure — and a
 * reader seeing a name against a citation reasonably concludes somebody vouched for it. That is a worse trace
 * wearing the appearance of a better one, which is the only kind this engine is really defending against.
 */
export const validateEvidence = (citations: readonly EvidenceCitation[]): EvidenceVerdict => {
  if (citations.length === 0) {
    return { usable: false, standing: null, issues: [issue("no_evidence", null)] };
  }

  const issues: EvidenceIssue[] = [];
  const seen = new Set<string>();

  citations.forEach((citation, index) => {
    if (normalizeSourceDomain(citation.sourceDomain).length === 0) {
      issues.push(issue("missing_source_domain", index));
    }
    if (citation.sourceRef.trim().length === 0) {
      issues.push(issue("missing_source_ref", index));
    }

    const requiresAttestor = EVIDENCE_REQUIRING_ATTESTOR.includes(citation.kind);
    if (requiresAttestor && !isAttested(citation)) {
      issues.push(issue("missing_attestor", index));
    }
    if (!requiresAttestor && isAttested(citation)) {
      issues.push(issue("attestor_not_required", index));
    }

    const key = citationKey(citation);
    if (seen.has(key)) issues.push(issue("duplicate_citation", index));
    seen.add(key);
  });

  if (issues.length > 0) return { usable: false, standing: null, issues };

  return {
    usable: true,
    standing: weakestStanding(citations.map((citation) => citation.kind)),
    issues: [],
  };
};

// --- Admission -------------------------------------------------------------------

/**
 * Whether a reading may count toward an assessment at the given period, and if not, why not.
 *
 * A reading ahead of the assessment is `out_of_period` rather than merely not current, and so is one filed
 * against a period that is not an ordinal at all. Both mean the reading is not on the grid the assessment is
 * counting from, which is a different fault from being behind on it and has a different fix.
 */
const admissionFor = (
  reading: TracedReading,
  assessmentPeriod: number,
  traceable: boolean,
): ReadingAdmission => {
  if (!traceable) return "untraceable";
  if (!Number.isInteger(reading.period) || !Number.isInteger(assessmentPeriod)) {
    return "out_of_period";
  }
  if (reading.period > assessmentPeriod) return "out_of_period";
  return isReadingCurrent(reading.period, assessmentPeriod) ? "admitted" : "stale";
};

const emptyStandingCounts = (): Record<ReadingStanding, number> => {
  const counts = {} as Record<ReadingStanding, number>;
  for (const standing of READING_STANDINGS) counts[standing] = 0;
  return counts;
};

/**
 * The weakest of a set of standings.
 *
 * {@link weakestStanding} answers the same question about evidence kinds; this answers it about standings that
 * have already been derived, which is what an assessment holds once each of its readings has been reduced to
 * one. Both order themselves with {@link standingRank}, so there is exactly one statement anywhere in this
 * package about which standing is softer than which.
 */
const weakestOf = (standings: readonly ReadingStanding[]): ReadingStanding | null => {
  let weakest: ReadingStanding | null = null;
  for (const standing of standings) {
    if (weakest === null || standingRank(standing) > standingRank(weakest)) weakest = standing;
  }
  return weakest;
};

/**
 * Audit every reading an assessment wants to consume, and report what its evidence base actually is.
 *
 * Returns an audit for each reading in the order given, so a caller can show an administrator the whole list
 * rather than a count of failures with no way to find them. The counts beside it exist because the first
 * question anyone asks of a thin assessment is which kind of thin it was.
 *
 * The verdict deliberately does not decide anything. It does not drop the rejected readings, refuse to produce a
 * standing, or mark the assessment unusable — the coverage floors in the indexing engine do that, counting the
 * admissions this engine hands them. Keeping the judgement in one place is what stops two different definitions
 * of "enough evidence" from drifting apart between the module that reports it and the module that enforces it.
 */
export const auditTrace = (
  readings: readonly TracedReading[],
  assessmentPeriod: number,
): TraceVerdict => {
  const audits: ReadingAudit[] = [];
  const standingCounts = emptyStandingCounts();
  const admittedStandings: ReadingStanding[] = [];
  let admitted = 0;
  let stale = 0;
  let outOfPeriod = 0;
  let untraceable = 0;

  for (const reading of readings) {
    const evidence = validateEvidence(reading.citations);
    const admission = admissionFor(reading, assessmentPeriod, evidence.usable);

    if (admission === "admitted") {
      admitted += 1;
      if (evidence.standing !== null) {
        standingCounts[evidence.standing] += 1;
        admittedStandings.push(evidence.standing);
      }
    } else if (admission === "stale") {
      stale += 1;
    } else if (admission === "out_of_period") {
      outOfPeriod += 1;
    } else {
      untraceable += 1;
    }

    audits.push({
      kpiKey: reading.kpiKey,
      period: reading.period,
      admission,
      standing: evidence.standing,
      age: roundIndexValue(assessmentPeriod - reading.period),
    });
  }

  return {
    standing: weakestOf(admittedStandings),
    audits,
    admitted,
    stale,
    outOfPeriod,
    untraceable,
    standingCounts,
  };
};
