import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { rankAttention } from "./attention";
import {
  type BriefingStatus,
  normalizeBriefingKey,
  normalizeScope,
  scopeGrants,
} from "./command-value";
import type { AttentionSignal, RecordedIndex } from "./command-view";
import {
  BriefingAssessmentMismatchError,
  BriefingNotDraftingError,
  BriefingNotIssuedError,
  EmptyBriefingAudienceScopeError,
  EmptyBriefingKeyError,
  EmptyBriefingTitleError,
  UncitableAssessmentError,
} from "./errors";
import {
  type HealthIndexAssessment,
  isAssessmentFinal,
  toRecordedIndex,
} from "./health-index-assessment";

/**
 * An executive briefing: what leadership was told, on what date, on the strength of which figure.
 *
 * This is the point where a number stops being something the platform holds and becomes something an institution
 * is answerable for. Everything below it in this package is arithmetic that can be re-run; a briefing is a document
 * that went out, and the questions asked about it years later are not *what does the platform say now* but *what
 * were we shown, and was it sound at the time*. Those are different questions and only one of them is answerable
 * by a lookup, which is what shapes this aggregate.
 *
 * **A briefing pins what it cited, and here the pinning is about the document rather than about reproduction.** An
 * assessment pins its inputs so the figure can be produced again; a briefing pins the figure itself — value, band,
 * coverage, fingerprint — so that it keeps saying what it said even after the assessment behind it is invalidated.
 * That case is not hypothetical, it is the normal one: a withdrawn reading turns up, the composite is invalidated,
 * and the briefing that quoted it must remain readable exactly as circulated. A briefing that resolved its figure
 * through the assessment would answer the wrong question at precisely the moment somebody needed the right one,
 * and an institution correcting itself would have destroyed the record of what it was correcting.
 *
 * The findings are pinned **in rank order**, so the document's ordering freezes with its content. A briefing whose
 * findings re-ranked on read would show a different top item to a reader next year than to the board that received
 * it, and the top item is the whole of what a briefing communicates.
 *
 * Only a **final** assessment may be cited, and issuing re-checks that against the assessment in hand rather than
 * trusting the draft. A briefing is composed on Tuesday and issued on Friday, and what can change in between is
 * exactly the thing that matters: the assessment is invalidated. Passing the aggregate rather than an id is what
 * makes that check possible at all, and it is why handing in the wrong assessment has to be refused rather than
 * absorbed.
 *
 * **There is no supersession pointer, and the absence is deliberate.** Every other lifecycle in this package links
 * a record to the one that replaced it, because those replacements happen inside the platform and the platform can
 * therefore guarantee the chain. A briefing leaves: it goes into a meeting pack, an email thread, a printed board
 * paper. A structural pointer to the corrected version would imply the successor reached everybody the original
 * did, which is the one thing this contract cannot know and the worst possible thing to be quietly wrong about.
 * A correction is a new briefing, and the relationship between the two is editorial.
 *
 * The platform writes none of the words. The title and the narrative are the author's; the findings carry reason
 * codes and severities and no sentences, exactly as the attention engine emitted them.
 */

// --- The aggregate ---------------------------------------------------------------

export interface ExecutiveBriefing {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** How the briefing is addressed. Normalized on the way in and never edited afterwards. */
  readonly briefingKey: string;
  readonly title: string;
  /** The author's covering words, if any. Never generated, and never derived from the findings. */
  readonly narrative: string | null;
  /**
   * The permission scope a reader must hold. Required, because unlike a panel a briefing has no larger document
   * to be quietly dropped out of — a blank audience here would fail open on the most sensitive record this
   * contract produces.
   */
  readonly audienceScope: string;
  /** The assessment this briefing was cleared against. Records which figure, not where to look it up. */
  readonly assessmentId: Uuid;
  /** Copied from the assessment. What series the cited figure belongs to. */
  readonly indexKey: string;
  /** Copied from the assessment. Which period the cited figure is about. */
  readonly period: number;
  /**
   * The figure as it stood when this was drafted, pinned. Survives the assessment being invalidated, which is the
   * entire reason it is a copy rather than a reference.
   */
  readonly cited: RecordedIndex;
  /** What leadership was pointed at, frozen in the order they were ranked in. */
  readonly findings: readonly AttentionSignal[];
  readonly status: BriefingStatus;
  readonly issuedAt: ISODateString | null;
  readonly withdrawnAt: ISODateString | null;
  readonly withdrawalReason: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DraftBriefingParams {
  readonly briefingKey: string;
  readonly title: string;
  readonly narrative?: string | null;
  /** The permission scope this briefing is for. Normalized, and refused when it normalizes to nothing. */
  readonly audienceScope: string;
  readonly findings: readonly AttentionSignal[];
}

/** What may be changed about a briefing while it is still being written. */
export interface ReviseBriefingParams {
  readonly title: string;
  /** Omit to leave the existing narrative alone; pass `null` to clear it. */
  readonly narrative?: string | null;
}

const trimmedOrNull = (value: string | null | undefined): string | null => value?.trim() || null;

/**
 * A defensive copy of a signal, field by field.
 *
 * Explicit rather than a spread for the same reason the attention engine emits no wording: a spread would carry
 * whatever the caller happened to attach, and the field somebody would eventually attach is a rendered sentence.
 * Adding a field to the signal shape fails to compile here until somebody has decided whether a document that
 * already circulated should have been carrying it.
 */
const copyFinding = (signal: AttentionSignal): AttentionSignal => ({
  key: signal.key,
  reason: signal.reason,
  severity: signal.severity,
  subjectKind: signal.subjectKind,
  subject: signal.subject,
  observed: signal.observed,
});

/**
 * The findings as they will be stored: ranked, then detached.
 *
 * Ranked here rather than trusted from the caller, so the order a briefing froze is the order the attention engine
 * produces and not the order a service happened to assemble its array in. Two briefings drawn from the same
 * findings therefore lead with the same item, which is the only sense in which a briefing is reproducible at all.
 */
const pinFindings = (findings: readonly AttentionSignal[]): readonly AttentionSignal[] =>
  rankAttention(findings).map(copyFinding);

/** A figure that may be put in front of a board, detached from the assessment holding it. */
const pinCited = (assessment: HealthIndexAssessment): RecordedIndex => {
  const recorded = toRecordedIndex(assessment);
  return {
    value: recorded.value,
    band: recorded.band,
    pillarCoverage: recorded.pillarCoverage,
    fingerprint: recorded.fingerprint,
  };
};

// --- Drafting --------------------------------------------------------------------

/**
 * Begin a briefing against a figure the institution stands behind.
 *
 * The clearance check happens at draft time as well as at issue, and the duplication is deliberate. Discovering at
 * the moment of circulation that the whole document rested on a provisional number is the most expensive possible
 * time to find out; refusing at the start means the only thing issuing can discover is a change since, which is a
 * far smaller conversation.
 *
 * Everything the briefing knows about the figure comes from the assessment in hand — tenant, organization, series,
 * period, and the four facts of the figure itself. None of them is a parameter, because a caller able to supply
 * the period a briefing quotes could file a document about last term under this one.
 */
export function draftBriefing(
  assessment: HealthIndexAssessment,
  params: DraftBriefingParams,
): ExecutiveBriefing {
  if (!isAssessmentFinal(assessment)) {
    throw new UncitableAssessmentError(assessment.id, assessment.status);
  }

  const briefingKey = normalizeBriefingKey(params.briefingKey);
  if (briefingKey.length === 0) throw new EmptyBriefingKeyError();

  const title = params.title.trim();
  if (title.length === 0) throw new EmptyBriefingTitleError();

  const audienceScope = normalizeScope(params.audienceScope);
  if (audienceScope.length === 0) throw new EmptyBriefingAudienceScopeError();

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: assessment.tenantId,
    organizationId: assessment.organizationId,
    briefingKey,
    title,
    narrative: trimmedOrNull(params.narrative),
    audienceScope,
    assessmentId: assessment.id,
    indexKey: assessment.indexKey,
    period: assessment.period,
    cited: pinCited(assessment),
    findings: pinFindings(params.findings),
    status: "drafting",
    issuedAt: null,
    withdrawnAt: null,
    withdrawalReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  briefing: ExecutiveBriefing,
  patch: Partial<ExecutiveBriefing>,
): ExecutiveBriefing => ({
  ...briefing,
  ...patch,
  updatedAt: nowIso(),
});

/** A briefing is written before it goes out and not afterwards. Every edit below starts here. */
function requireDrafting(briefing: ExecutiveBriefing): void {
  if (briefing.status !== "drafting") {
    throw new BriefingNotDraftingError(briefing.id, briefing.status);
  }
}

/**
 * Change what the briefing says in its own voice.
 *
 * Refused once the briefing has been issued, and this is the strictest edit rule in the package — stricter than a
 * superseded index definition's, which at least stays a record of arithmetic somebody can re-run. A document that
 * circulated is quoted from memory, forwarded, and printed; editing the copy the platform holds would leave the
 * platform's version and the board's version disagreeing with no trace of which came first. A briefing that needs
 * different words is a new briefing.
 */
export function reviseBriefing(
  briefing: ExecutiveBriefing,
  params: ReviseBriefingParams,
): ExecutiveBriefing {
  requireDrafting(briefing);
  const title = params.title.trim();
  if (title.length === 0) throw new EmptyBriefingTitleError();
  return touch(briefing, {
    title,
    narrative:
      params.narrative === undefined ? briefing.narrative : trimmedOrNull(params.narrative),
  });
}

/**
 * Replace what the briefing points leadership at.
 *
 * Wholesale rather than one finding at a time, because the set is ranked as a set — inserting a `critical` item
 * into a list would leave it wherever the caller put it, and a briefing whose loudest finding is fourth on the
 * page has failed at the only job a briefing has.
 */
export function setBriefingFindings(
  briefing: ExecutiveBriefing,
  findings: readonly AttentionSignal[],
): ExecutiveBriefing {
  requireDrafting(briefing);
  return touch(briefing, { findings: pinFindings(findings) });
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Send it.
 *
 * The assessment is passed in rather than looked up, and the three guards are the reason. Status, so a briefing
 * cannot be issued twice or resurrected after withdrawal. Identity, because an aggregate handed in by a caller can
 * be the wrong one and accepting it would clear a document against a figure it does not quote. Standing, because
 * the days between drafting and issuing are exactly when an assessment gets invalidated — a reading is withdrawn,
 * a feed is found to have been double-counting — and the whole value of re-checking is that it catches the case
 * where the draft was sound and the world moved.
 *
 * Nothing is recomputed. The figure and the findings pinned at draft time go out as they were pinned, because a
 * briefing that quietly refreshed its numbers at the moment of issue would be a different document from the one
 * its author reviewed.
 */
export function issueBriefing(
  briefing: ExecutiveBriefing,
  assessment: HealthIndexAssessment,
): ExecutiveBriefing {
  requireDrafting(briefing);
  if (assessment.id !== briefing.assessmentId) {
    throw new BriefingAssessmentMismatchError(briefing.id, briefing.assessmentId, assessment.id);
  }
  if (!isAssessmentFinal(assessment)) {
    throw new UncitableAssessmentError(assessment.id, assessment.status);
  }
  return touch(briefing, { status: "issued", issuedAt: nowIso() });
}

/**
 * Retract a briefing that went out.
 *
 * Reachable from `issued` and nowhere else. A draft nobody has seen is abandoned rather than retracted, and
 * recording a retraction against it would put a correction on the institution's record for a document that was
 * never on it.
 *
 * The reason is free text and unenforced, the same judgement the assessment aggregate makes about invalidation:
 * what makes this auditable is that it happened, when, and to which briefing. A dismissal on an attention item is
 * the one place in this package where a reason is compulsory, and it is compulsory there because nothing else
 * would ever record that a human looked.
 */
export function withdrawBriefing(
  briefing: ExecutiveBriefing,
  reason?: string | null,
): ExecutiveBriefing {
  if (briefing.status !== "issued") {
    throw new BriefingNotIssuedError(briefing.id, briefing.status);
  }
  return touch(briefing, {
    status: "withdrawn",
    withdrawnAt: nowIso(),
    withdrawalReason: reason?.trim() || null,
  });
}

// --- Reading ---------------------------------------------------------------------

/** Whether this briefing has gone out. */
export const isBriefingIssued = (briefing: ExecutiveBriefing): boolean =>
  briefing.status === "issued";

/** Whether the institution has retracted it. Still readable, no longer standing. */
export const isBriefingWithdrawn = (briefing: ExecutiveBriefing): boolean =>
  briefing.status === "withdrawn";

/**
 * Whether issuing would succeed — the read-side of exactly the guards {@link issueBriefing} applies, in the same
 * order, so a review screen can say the figure was withdrawn underneath the draft rather than offering the action
 * and failing on it.
 */
export const isBriefingIssuable = (
  briefing: ExecutiveBriefing,
  assessment: HealthIndexAssessment,
): boolean =>
  briefing.status === "drafting" &&
  assessment.id === briefing.assessmentId &&
  isAssessmentFinal(assessment);

/**
 * Whether a reader holding these scopes may see this briefing.
 *
 * All or nothing, which is the difference between a briefing and a dashboard. A dashboard composes down to the
 * panels a viewer reaches because a partial dashboard is still a coherent page; a briefing composed down to the
 * findings somebody may see would be an argument with its evidence removed, reading as though the institution had
 * less to say than it did.
 */
export const briefingVisibleTo = (
  briefing: ExecutiveBriefing,
  grantedScopes: readonly string[],
): boolean => scopeGrants(grantedScopes, briefing.audienceScope);

/**
 * The loudest thing this briefing said, or `null` if it pointed at nothing.
 *
 * The first pinned finding, because the findings were ranked when they were pinned. Reading position zero rather
 * than re-ranking is the point: this answers what the board was actually led with, which is a fact about the
 * document and not a fact about the findings it happens to contain.
 */
export const briefingHeadline = (briefing: ExecutiveBriefing): AttentionSignal | null =>
  briefing.findings[0] ?? null;
