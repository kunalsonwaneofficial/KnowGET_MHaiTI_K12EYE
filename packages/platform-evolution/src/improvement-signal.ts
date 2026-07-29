import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyDeclineReasonError,
  EmptySignalKeyError,
  InvalidSignalKeyError,
  InvalidSignalProgressionError,
  SignalAlreadyInStatusError,
  SignalMergedIntoItselfError,
  SignalSettledError,
  SignalSummaryLengthError,
  UnusableSignalEvidenceError,
} from "./errors";
import {
  MAX_SUMMARY_LENGTH,
  MIN_SUMMARY_LENGTH,
  type SignalPriority,
  type SignalSource,
  type SignalStatus,
  isTerminalSignalStatus,
  isValidKey,
  normalizeKey,
} from "./evolution-value";
import type { EvidenceCitation, PriorityVerdict, SignalAccount } from "./evolution-view";
import { derivePriority, inspectEvidence, inspectProgression } from "./intake";

/**
 * An improvement signal: one thing somebody says is not working, and what the institution did about it.
 *
 * This is the front door of the contract. Everything downstream — an initiative, a governance decision, a pilot,
 * an adoption review, a lesson in institutional memory — traces back to a signal, and the quality of the whole
 * chain is set here. An institution whose improvement queue accepts assertions will spend its governance capacity
 * deciding between assertions, and the changes it makes will be the ones whose proposers were most persistent.
 *
 * **Evidence is required at the door rather than at the gate.** {@link raiseSignal} runs the intake engine and
 * refuses a signal that cites nothing checkable, which is the one moment where refusing is cheap. Admitted, the
 * same signal acquires a priority, a place in a queue and eventually a decision record, and by the time anybody
 * asks what it rested on the question costs a week and reaches somebody who has left.
 *
 * **Priority is derived and re-derived, never set.** The intake engine counts distinct people, not filings, and
 * the counts it produced are flattened onto the record beside the priority itself. That flattening is what lets a
 * queue be filtered by priority and sorted by corroboration in the database rather than in a service, and
 * {@link signalPriorityVerdict} is the one mapper back, so the columns cannot drift into a second opinion about
 * what the engine said. {@link corroborateSignal} re-runs the derivation on every new account, so a signal that
 * three more people independently raise moves up on its own — an institution where priority had to be escalated
 * by hand escalates the signals whose raisers know who to ask.
 *
 * **Disposal happens once, in the open, and only after triage.** `accepted`, `merged` and `declined` are ends;
 * nothing is reopened, corroborated, rewritten or re-triaged afterwards. A settled signal is the record of what
 * the institution decided about a problem on the evidence it had at the time, and a later account added
 * underneath it would make that decision look like it was taken on evidence nobody had seen. A problem that comes
 * back is a new signal, which is also the only way recurrence ever becomes visible: three declined signals on one
 * theme is a finding about the institution, and one signal declined three times is a row in a log.
 *
 * Declining requires a stated reason, and it is the only compulsory free text here. The collection of those
 * reasons is the most useful record this aggregate holds — what the institution kept being told and kept choosing
 * not to act on — and it exists only because the reason could not be skipped.
 *
 * Actors are ids and they are required parameters that accept `null`, on the D29 rule: an automated triage
 * genuinely has no person behind it, but a defaulted actor is how *who declined this* quietly goes empty.
 */

// --- The aggregate ---------------------------------------------------------------

export interface ImprovementSignal {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** How every initiative, lesson and lineage trace addresses this problem. Immutable once raised. */
  readonly signalKey: string;
  /** Where the signal came from. Immutable: it is half of how the priority floor was justified. */
  readonly source: SignalSource;
  /** What is not working, in the institution's own words. Editable until the signal settles. */
  readonly summary: string;
  readonly status: SignalStatus;
  /** Derived by the intake engine and re-derived on every account. Never set directly. */
  readonly priority: SignalPriority;
  /** Distinct people standing behind this, after repeat filings collapse. */
  readonly corroboration: number;
  /** Filings by somebody already counted. Kept because a queue that hides them looks quieter than it is. */
  readonly repeatAccounts: number;
  /** Filings with nobody identifiable behind them. These cannot corroborate; the intake engine says why. */
  readonly unattributed: number;
  /** Whether the source alone carried this above `routine`. */
  readonly selfEvident: boolean;
  /** The records this stands on. Checked at intake and never dereferenced by this package. */
  readonly citations: readonly EvidenceCitation[];
  /** Every account filed, in the order filed. The derivation above is a function of exactly this list. */
  readonly accounts: readonly SignalAccount[];
  /** Who raised it. `null` for an anonymous raising, which the engine then counts as unattributed. */
  readonly raisedBy: Uuid | null;
  readonly triagedAt: ISODateString | null;
  readonly triagedBy: Uuid | null;
  readonly settledAt: ISODateString | null;
  readonly settledBy: Uuid | null;
  /** The signal this was folded into, when it was merged. Never this signal. */
  readonly mergedIntoSignalId: Uuid | null;
  /** Why the institution said no. Compulsory on a decline and empty everywhere else. */
  readonly declineReason: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RaiseSignalParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly signalKey: string;
  readonly source: SignalSource;
  readonly summary: string;
  /** At least one checkable record. The intake engine decides what counts as checkable. */
  readonly citations: readonly EvidenceCitation[];
  /** `null` raises anonymously, which is permitted and which corroborates nothing. */
  readonly raisedBy: Uuid | null;
}

// --- Raising ---------------------------------------------------------------------

/**
 * A defensive copy of the cited records.
 *
 * The citations are the justification for admitting the signal at all, and a stored justification must not be
 * able to change because the caller reused the array it passed in. Cheap here, and unreconstructable later once
 * the signal has become an initiative that an audit is asking about.
 */
const copyCitations = (citations: readonly EvidenceCitation[]): readonly EvidenceCitation[] =>
  citations.map((citation) => ({
    kind: citation.kind,
    sourceDomain: citation.sourceDomain,
    sourceRef: citation.sourceRef,
    attestedBy: citation.attestedBy,
  }));

/** A summary nobody can read is a signal nobody can triage, and it sits in the queue forever. */
function requireSummary(summary: string): string {
  const text = summary.trim();
  if (text.length < MIN_SUMMARY_LENGTH || text.length > MAX_SUMMARY_LENGTH) {
    throw new SignalSummaryLengthError(text.length, MIN_SUMMARY_LENGTH, MAX_SUMMARY_LENGTH);
  }
  return text;
}

/**
 * Raise a signal: say that something is not working, and show what says so.
 *
 * The evidence check is the reason this function can throw at all. {@link inspectEvidence} reports every problem
 * with the citation set at once and the codes travel into the refusal, so somebody filling in a form is told the
 * whole story rather than discovering it one correction at a time.
 *
 * An anonymous raising is permitted and seeds an account with no person on it. That account is then counted as
 * unattributed by the intake engine exactly as documented, with no special case here — which is the honest
 * outcome: anonymity is a legitimate way to report something the reporter cannot safely put their name to, and it
 * genuinely cannot corroborate, because one person filing anonymously four times is indistinguishable from four.
 *
 * Nothing here refuses a duplicate key. This package holds no directory of its own signals, and a uniqueness
 * check invented inside an aggregate would be a second opinion about what exists; that rule lives where identity
 * is stored.
 */
export function raiseSignal(params: RaiseSignalParams): ImprovementSignal {
  const signalKey = normalizeKey(params.signalKey);
  if (signalKey.length === 0) throw new EmptySignalKeyError();
  if (!isValidKey(signalKey)) throw new InvalidSignalKeyError(signalKey);

  const summary = requireSummary(params.summary);

  const evidence = inspectEvidence(params.citations);
  if (!evidence.usable) {
    throw new UnusableSignalEvidenceError(
      signalKey,
      evidence.issues.map((issue) => issue.code),
    );
  }

  const accounts: readonly SignalAccount[] = [
    { raisedBy: params.raisedBy ?? "", source: params.source },
  ];
  const derived = derivePriority(params.source, accounts);

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    signalKey,
    source: params.source,
    summary,
    status: "raised",
    priority: derived.priority,
    corroboration: derived.corroboration,
    repeatAccounts: derived.repeatAccounts,
    unattributed: derived.unattributed,
    selfEvident: derived.selfEvident,
    citations: copyCitations(params.citations),
    accounts,
    raisedBy: params.raisedBy,
    triagedAt: null,
    triagedBy: null,
    settledAt: null,
    settledBy: null,
    mergedIntoSignalId: null,
    declineReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  signal: ImprovementSignal,
  patch: Partial<ImprovementSignal>,
): ImprovementSignal => ({
  ...signal,
  ...patch,
  updatedAt: nowIso(),
});

/** A settled signal is the record of a decision somebody made. Every edit below starts here. */
function requireUnsettled(signal: ImprovementSignal): void {
  if (isTerminalSignalStatus(signal.status)) {
    throw new SignalSettledError(signal.id, signal.status);
  }
}

/**
 * Ask the intake engine whether a move is permitted, and raise the refusal it names.
 *
 * One helper for all four transitions, because the alternative is four hand-written status checks that agree with
 * the engine's table on the day they are written. The three refusals get three error types rather than one: being
 * asked to triage something already triaged is a resubmitted form, being asked to change something settled is an
 * attempt to rewrite history, and being asked to decline something nobody triaged is a queue being emptied
 * without being read. They read identically to a `switch` and completely differently to an operator.
 */
function requireProgression(signal: ImprovementSignal, to: SignalStatus): void {
  const verdict = inspectProgression(signal.status, to);
  if (verdict.allowed) return;
  if (verdict.refusal === "same_status") {
    throw new SignalAlreadyInStatusError(signal.id, signal.status);
  }
  if (verdict.refusal === "terminal_status") {
    throw new SignalSettledError(signal.id, signal.status);
  }
  throw new InvalidSignalProgressionError(signal.id, signal.status, to);
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Restate what the signal is about.
 *
 * Permitted right up to disposal, because the first description of a problem is written by whoever noticed it and
 * triage frequently establishes what it actually is. Refused afterwards: the summary is what the person who
 * declined it read, and a decision record pointing at text that has since changed is worse than no record.
 */
export function reviseSignalSummary(signal: ImprovementSignal, summary: string): ImprovementSignal {
  requireUnsettled(signal);
  return touch(signal, { summary: requireSummary(summary) });
}

/**
 * Add another person's account of the same problem, and let the priority follow.
 *
 * The whole account list is re-derived rather than the counts being incremented. Incrementing would need this
 * aggregate to know that a repeat filing does not count, that an anonymous one does not either, and that a source
 * sets a floor — three rules that already exist in the intake engine and that would then exist twice, agreeing
 * until the day one of them was tuned.
 *
 * Refused once the signal is settled, which is the same rule as everywhere else and matters most here: an account
 * arriving after a decline is the institution being told the problem is worse than it judged, and folding it
 * silently under the closed record would leave that message somewhere nobody looks. It belongs on a new signal.
 */
export function corroborateSignal(
  signal: ImprovementSignal,
  account: SignalAccount,
): ImprovementSignal {
  requireUnsettled(signal);
  const accounts: readonly SignalAccount[] = [
    ...signal.accounts,
    { raisedBy: account.raisedBy, source: account.source },
  ];
  const derived = derivePriority(signal.source, accounts);
  return touch(signal, {
    accounts,
    priority: derived.priority,
    corroboration: derived.corroboration,
    repeatAccounts: derived.repeatAccounts,
    unattributed: derived.unattributed,
    selfEvident: derived.selfEvident,
  });
}

/**
 * Record that somebody has read this and judged it.
 *
 * The step exists to be evidence that a person looked. It is the only route to any of the three disposals, so a
 * queue cannot be emptied by a bulk operation that never showed anything to anybody, and the interval between
 * raising and triage is the only measure the institution has of whether its improvement queue is being read at
 * all.
 */
export function triageSignal(signal: ImprovementSignal, actor: Uuid | null): ImprovementSignal {
  requireProgression(signal, "triaged");
  return touch(signal, { status: "triaged", triagedAt: nowIso(), triagedBy: actor });
}

/**
 * Accept the signal: the institution agrees this is a problem worth addressing.
 *
 * Terminal, and it is the acceptance that most obviously wants not to be. What follows is an initiative naming
 * this signal as an origin, and keeping the signal open until that initiative concluded would make the queue a
 * duplicate of the initiative pipeline that eventually disagreed with it. The signal's question — *is this a real
 * problem* — has been answered here; whether anything was done about it is a different question with its own
 * record and its own lineage trace.
 */
export function acceptSignal(signal: ImprovementSignal, actor: Uuid | null): ImprovementSignal {
  requireProgression(signal, "accepted");
  return touch(signal, { status: "accepted", settledAt: nowIso(), settledBy: actor });
}

/**
 * Fold the signal into another one that describes the same problem.
 *
 * The target is stored rather than the two records being combined, so the corroboration on each stays attached to
 * the people who actually filed it. Merging the accounts across would let a problem look independently noticed by
 * six people when three of them were describing something that turned out to be the same thing — and the intake
 * engine's count of distinct people is only worth anything if it means what it says.
 *
 * The target id is not checked for existence here, for the same reason a duplicate key is not: this aggregate has
 * no directory. Self-merge is checked, because that is decidable from the record in hand and is what a bulk merge
 * of a selection containing its own target does.
 */
export function mergeSignal(
  signal: ImprovementSignal,
  mergedIntoSignalId: Uuid,
  actor: Uuid | null,
): ImprovementSignal {
  requireProgression(signal, "merged");
  if (mergedIntoSignalId === signal.id) throw new SignalMergedIntoItselfError(signal.id);
  return touch(signal, {
    status: "merged",
    mergedIntoSignalId,
    settledAt: nowIso(),
    settledBy: actor,
  });
}

/**
 * Decline the signal: the institution has considered this and is not acting on it.
 *
 * The reason is compulsory. An unexplained decline is indistinguishable from a signal nobody read, and it is the
 * declines — not the acceptances — that a later reader most needs to understand, because a repeat audit finding
 * is almost always something the institution was told about and decided against. That pattern is only legible if
 * the reasons were written down at the time by the person who made the call.
 */
export function declineSignal(
  signal: ImprovementSignal,
  actor: Uuid | null,
  reason: string,
): ImprovementSignal {
  requireProgression(signal, "declined");
  const declineReason = reason.trim();
  if (declineReason.length === 0) throw new EmptyDeclineReasonError();
  return touch(signal, {
    status: "declined",
    declineReason,
    settledAt: nowIso(),
    settledBy: actor,
  });
}

// --- Reading ---------------------------------------------------------------------

/** Whether the signal is still asking the institution for something. Covers `raised` and `triaged` alike. */
export const isSignalOpen = (signal: ImprovementSignal): boolean =>
  !isTerminalSignalStatus(signal.status);

/** Whether the institution has disposed of this, however it disposed of it. */
export const isSignalSettled = (signal: ImprovementSignal): boolean =>
  isTerminalSignalStatus(signal.status);

/** Whether the institution considered this and said no. The subset a recurrence query is drawn from. */
export const isSignalDeclined = (signal: ImprovementSignal): boolean =>
  signal.status === "declined";

/**
 * The derivation, back in the intake engine's shape.
 *
 * Reassembled from the stored columns rather than recomputed from the accounts, and the difference is the point.
 * This reports what the signal was last derived to be — which is what the queue was sorted by and what somebody
 * triaged against — rather than what the current engine would say about the same accounts today. A reader
 * comparing a decision to the priority it was taken under needs the former.
 */
export const signalPriorityVerdict = (signal: ImprovementSignal): PriorityVerdict => ({
  priority: signal.priority,
  corroboration: signal.corroboration,
  repeatAccounts: signal.repeatAccounts,
  unattributed: signal.unattributed,
  selfEvident: signal.selfEvident,
});
