import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { rankAttention } from "./attention";
import {
  type AttentionReason,
  type AttentionSeverity,
  type AttentionStatus,
  isAttentionOpen,
} from "./command-value";
import type { AttentionSignal, AttentionSubjectKind } from "./command-view";
import {
  AttentionItemClosedError,
  AttentionItemNotOpenError,
  AttentionSignalMismatchError,
  EmptyDismissalReasonError,
} from "./errors";
import type { HealthIndexAssessment } from "./health-index-assessment";

/**
 * An attention item: one finding an institution has been asked to look at, and what it did about it.
 *
 * The attention engine raises signals; this aggregate is what happens to one after a person sees it. The
 * difference is the entire reason the aggregate exists. A signal is what the arithmetic says right now and it is
 * recomputed from scratch every time an assessment runs; an item is a row somebody acknowledged on a Tuesday and
 * dismissed on a Thursday with a reason. Recomputation cannot produce that and must not erase it.
 *
 * **Identity is the assessment and the key together, so there is no reopening.** A finding that comes back at the
 * next period is a fresh item against a fresh assessment, not the old one revived — and that is not bookkeeping.
 * *This has recurred in three consecutive terms* and *this has been open for three terms* are different facts
 * about an institution, calling for different responses from different people, and a queue that reopened rows
 * would render them identical. Recurrence is a query across periods; staying open is a property of one item.
 *
 * **Within a period, a finding that deteriorates is restated rather than duplicated.** This is where the attention
 * engine's decision to keep severity out of a signal's key is finally spent: because the key does not move when
 * the severity does, a pillar that was advisory on Monday and urgent on Friday is the same row getting worse
 * instead of two rows, one of which somebody is already working on. Without a restatement path here that design
 * would have bought nothing, and the queue would grow a second copy of exactly the problems that were being
 * attended to.
 *
 * The signal is flattened onto the record rather than nested, for the same reason an assessment's verdict is:
 * these are the columns a queue is filtered, sorted and counted by, and a severity buried in a JSON document
 * cannot be indexed. {@link toAttentionSignal} is the one mapper back, so the flattening cannot drift into two
 * opinions about what was raised.
 *
 * The lifecycle is flat columns — acknowledged when and by whom, closed when, by whom and with what note — rather
 * than an event array. An item has at most two transitions in its life, and at that size columns answer questions
 * an array cannot: *what did I acknowledge and never close*, *how long do urgent findings sit before anyone picks
 * them up*, *which of these were dismissed rather than fixed*. Those are the questions asked of a queue, and every
 * one of them is a `WHERE` clause against a column and a table scan with a JSON parse against a log.
 *
 * Actors are ids, and they are required parameters that accept `null`. An automated closure genuinely has no
 * person behind it and the type says so; what is refused is omitting the argument, because a defaulted actor is
 * how *who closed this* quietly becomes empty on whichever path somebody wrote in a hurry.
 */

// --- The aggregate ---------------------------------------------------------------

export interface AttentionItem {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The assessment that raised this. Half of the item's identity, and why nothing is ever reopened. */
  readonly assessmentId: Uuid;
  /** Copied from the assessment, so a queue can be read by series without a join. */
  readonly indexKey: string;
  /** Copied from the assessment. Which period's arithmetic raised this. */
  readonly period: number;
  /** The engine's stable identity for the finding. The other half of this item's identity. */
  readonly key: string;
  readonly reason: AttentionReason;
  /** Moves when the finding deteriorates, which is why it is not part of the key. */
  readonly severity: AttentionSeverity;
  readonly subjectKind: AttentionSubjectKind;
  /** The pillar or KPI this is about. Empty for an index-level finding, which has no subject but itself. */
  readonly subject: string;
  /** The quantity the finding was last raised on, in whatever its reason measures. Never summed across items. */
  readonly observed: number | null;
  readonly status: AttentionStatus;
  readonly acknowledgedAt: ISODateString | null;
  readonly acknowledgedBy: Uuid | null;
  readonly closedAt: ISODateString | null;
  readonly closedBy: Uuid | null;
  /** Why it was closed. Optional on a resolution, compulsory on a dismissal. */
  readonly closureNote: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

// --- Raising ---------------------------------------------------------------------

/**
 * Put a raised signal into the queue.
 *
 * The assessment is passed in rather than its id, and everything the item knows beyond the finding itself comes
 * from it — tenant, organization, series, period. None of them is a parameter, because a caller able to supply the
 * period would be able to file this period's finding against last period's queue, where nobody is looking.
 *
 * Nothing here refuses a duplicate. This package holds no directory of its own items and a uniqueness check
 * invented inside an aggregate would be a second opinion about what exists; the identity rule is enforced where
 * identity is stored, and a caller holding an existing item restates it rather than raising again.
 */
export function raiseAttentionItem(
  assessment: HealthIndexAssessment,
  signal: AttentionSignal,
): AttentionItem {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: assessment.tenantId,
    organizationId: assessment.organizationId,
    assessmentId: assessment.id,
    indexKey: assessment.indexKey,
    period: assessment.period,
    key: signal.key,
    reason: signal.reason,
    severity: signal.severity,
    subjectKind: signal.subjectKind,
    subject: signal.subject,
    observed: signal.observed,
    status: "open",
    acknowledgedAt: null,
    acknowledgedBy: null,
    closedAt: null,
    closedBy: null,
    closureNote: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (item: AttentionItem, patch: Partial<AttentionItem>): AttentionItem => ({
  ...item,
  ...patch,
  updatedAt: nowIso(),
});

/** A closed item is a record of a decision a person made. Every transition below starts here. */
function requireOpen(item: AttentionItem): void {
  if (!isAttentionOpen(item.status)) {
    throw new AttentionItemClosedError(item.id, item.status);
  }
}

/**
 * Update an open item from a fresh raising of the same finding.
 *
 * Severity and the observed quantity move; nothing else does. The reason, the subject and the key are what make
 * this the same finding, so a restatement that changed them would be a different item wearing this one's history —
 * and the acknowledgement on it would then say somebody had looked at something they never saw.
 *
 * The keys are compared rather than assumed equal. Both sides come from the same engine and are already
 * normalized, so this is not a formatting check: it is the one thing that stops a caller iterating two collections
 * from writing one finding's severity onto another's row, which would leave the queue reading as though both had
 * been attended to.
 *
 * A closed item is not restated. A finding that deteriorated after somebody resolved it is a fresh observation
 * about a period already assessed, and quietly reopening the closed row would erase the record that a human looked
 * at this and made a call — which is the only thing separating a queue from a list of alerts.
 */
export function restateAttentionItem(item: AttentionItem, signal: AttentionSignal): AttentionItem {
  requireOpen(item);
  if (signal.key !== item.key) {
    throw new AttentionSignalMismatchError(item.id, item.key, signal.key);
  }
  return touch(item, { severity: signal.severity, observed: signal.observed });
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Say that somebody has picked this up.
 *
 * Available from `open` and nowhere else. Acknowledging twice would move the timestamp that says how long a
 * finding sat before anyone touched it, and that interval is the only measure a queue has of its own credibility —
 * a platform that cannot tell whether its urgent items are read within a day or a fortnight cannot tell whether it
 * is raising them too loudly.
 */
export function acknowledgeAttentionItem(item: AttentionItem, actor: Uuid | null): AttentionItem {
  if (item.status !== "open") {
    throw new AttentionItemNotOpenError(item.id, item.status);
  }
  return touch(item, {
    status: "acknowledged",
    acknowledgedAt: nowIso(),
    acknowledgedBy: actor,
  });
}

/**
 * Close the item because the institution dealt with it.
 *
 * Reachable from `open` as well as from `acknowledged`, because a finding somebody fixed the moment they read it
 * should not require a ceremonial acknowledgement first — a workflow that insists on the intermediate state gets
 * the intermediate state clicked through, which makes the acknowledgement timestamp meaningless.
 *
 * The note is optional here and compulsory on a dismissal, and the asymmetry is the point. A resolution is
 * corroborated by the next period's assessment: the finding either comes back or it does not. A dismissal leaves
 * nothing behind at all.
 */
export function resolveAttentionItem(
  item: AttentionItem,
  actor: Uuid | null,
  note?: string | null,
): AttentionItem {
  requireOpen(item);
  return touch(item, {
    status: "resolved",
    closedAt: nowIso(),
    closedBy: actor,
    closureNote: note?.trim() || null,
  });
}

/**
 * Close the item because it should not have been raised.
 *
 * The reason is compulsory, and it is the only compulsory free text in this package. A dismissal is the platform
 * being told it was wrong, and an unexplained one is indistinguishable from an item nobody looked at — which is
 * exactly the pile a queue is supposed to prevent. It is also the only feedback the raising rules will ever get
 * about being too loud, and rules nobody can see the cost of are the ones that stay too loud.
 */
export function dismissAttentionItem(
  item: AttentionItem,
  actor: Uuid | null,
  reason: string,
): AttentionItem {
  requireOpen(item);
  const note = reason.trim();
  if (note.length === 0) throw new EmptyDismissalReasonError();
  return touch(item, {
    status: "dismissed",
    closedAt: nowIso(),
    closedBy: actor,
    closureNote: note,
  });
}

// --- Reading ---------------------------------------------------------------------

/** Whether this item is still asking for something. Covers `open` and `acknowledged` alike. */
export const isAttentionItemOpen = (item: AttentionItem): boolean => isAttentionOpen(item.status);

/** Whether somebody has picked this up without yet closing it. */
export const isAttentionItemAcknowledged = (item: AttentionItem): boolean =>
  item.status === "acknowledged";

/** Whether the institution decided this was worth raising, once it was closed. */
export const isAttentionItemDismissed = (item: AttentionItem): boolean =>
  item.status === "dismissed";

/**
 * The finding, back in the engine's shape.
 *
 * The one mapper out of the flattened columns, so a briefing pins what the queue actually holds rather than a
 * reassembly performed in some service. Says nothing about the item's status: a dismissed finding still describes
 * what was observed, and whether it belongs in front of anybody is the caller's filter to apply.
 */
export const toAttentionSignal = (item: AttentionItem): AttentionSignal => ({
  key: item.key,
  reason: item.reason,
  severity: item.severity,
  subjectKind: item.subjectKind,
  subject: item.subject,
  observed: item.observed,
});

/** The items still asking for something, in the order they were given. */
export const openAttentionItems = (items: readonly AttentionItem[]): readonly AttentionItem[] =>
  items.filter(isAttentionItemOpen);

/**
 * One assessment's items in the order attention ranks them, loudest first.
 *
 * Ordered by mapping through the engine rather than by re-sorting the records against a severity comparison
 * written here. A second comparison would be a second definition of *loudest*, and the day the engine's ordering
 * was tuned the queue and the briefing drawn from it would lead with different findings — in a package whose whole
 * purpose is that leadership is shown one story about the institution.
 *
 * Keys are unique within an assessment, which is what makes the round trip lossless, and an item is emitted at
 * most once regardless. Items from two assessments are two queues; ranking them together would interleave periods
 * and is not what this offers.
 */
export const rankAttentionItems = (items: readonly AttentionItem[]): readonly AttentionItem[] => {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const ranked: AttentionItem[] = [];
  for (const signal of rankAttention(items.map(toAttentionSignal))) {
    const item = byKey.get(signal.key);
    if (item === undefined) continue;
    byKey.delete(signal.key);
    ranked.push(item);
  }
  return ranked;
};
