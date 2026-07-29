import {
  ATTESTED_EVIDENCE_KIND,
  MIN_CORROBORATION_FOR_ELEVATED,
  MIN_CORROBORATION_FOR_URGENT,
  SELF_EVIDENT_SOURCES,
  type SignalPriority,
  type SignalSource,
  type SignalStatus,
  isTerminalSignalStatus,
  isValidKey,
  normalizeKey,
  priorityRank,
} from "./evolution-value";
import type {
  EvidenceCitation,
  EvidenceIssue,
  EvidenceVerdict,
  PriorityVerdict,
  ProgressionVerdict,
  SignalAccount,
} from "./evolution-view";

/**
 * The intake engine: what an improvement signal stands on, how much of the institution is behind it, and where
 * it is allowed to go next.
 *
 * This is the front door of the contract, and the front door is where an institution's improvement agenda is
 * actually decided. Everything downstream — initiatives, gates, pilots, lessons — operates on signals that got
 * through here, so a triage that ranked by insistence rather than by evidence would quietly set the agenda for
 * years while looking like an administrative step.
 *
 * Two rules do the work and both are arithmetic rather than judgement, which is what makes them arguable. The
 * first is that corroboration counts *people*, not filings: four messages from one frustrated colleague are one
 * account, and the engine says so out loud rather than absorbing the difference. The second is that two sources
 * need no seconding at all — an incident happened and an audit finding was written by somebody whose job is to
 * write them, so neither is an opinion waiting for support. Everything else starts at `routine` and earns its
 * way up.
 *
 * The engine never refuses and never throws. It reports, and the aggregates decide what to do about the report.
 * The one thing it will not do is fabricate: a signal with nothing behind it comes back unusable rather than
 * coming back with a default priority, because a priority assigned to an empty claim is the beginning of an
 * institution that improves whatever was raised most recently.
 */

// --- Evidence --------------------------------------------------------------------

/**
 * Inspect the records a signal claims to stand on.
 *
 * Five things can be wrong and all five are reported together rather than one at a time, because the caller is
 * a person filling in a form: `no_evidence` when nothing was cited at all, `invalid_source_domain` when the
 * naming of the citing contract is not a key this platform could resolve, `blank_source_ref` when the record
 * inside it was left empty, `unattested_citation` when a kind that means *somebody vouched for this* arrives
 * with nobody vouching, and `duplicate_citation` when the same record is cited twice.
 *
 * The duplicate rule matters more than it looks. Citations are how a signal demonstrates it is about something
 * real, and a set of five citations that are the same incident five times is a set of one — exactly the shape
 * an eager author produces when trying to make a case look stronger. Collapsing them here means the strength of
 * a signal is never a function of how many times its author was willing to paste a reference.
 */
export const inspectEvidence = (citations: readonly EvidenceCitation[]): EvidenceVerdict => {
  const issues: EvidenceIssue[] = [];

  if (citations.length === 0) {
    issues.push({ code: "no_evidence", citationIndex: null });
    return { usable: false, cited: 0, issues };
  }

  const seen = new Set<string>();
  let cited = 0;

  citations.forEach((citation, index) => {
    const domain = normalizeKey(citation.sourceDomain);
    const ref = citation.sourceRef.trim();
    const attestedBy = citation.attestedBy === null ? "" : citation.attestedBy.trim();
    let sound = true;

    if (!isValidKey(domain)) {
      issues.push({ code: "invalid_source_domain", citationIndex: index });
      sound = false;
    }
    if (ref.length === 0) {
      issues.push({ code: "blank_source_ref", citationIndex: index });
      sound = false;
    }
    if (citation.kind === ATTESTED_EVIDENCE_KIND && attestedBy.length === 0) {
      issues.push({ code: "unattested_citation", citationIndex: index });
      sound = false;
    }

    const identity = `${domain}#${ref}`;
    if (seen.has(identity)) {
      issues.push({ code: "duplicate_citation", citationIndex: index });
      sound = false;
    } else {
      seen.add(identity);
    }

    if (sound) cited += 1;
  });

  return { usable: issues.length === 0, cited, issues };
};

// --- Priority --------------------------------------------------------------------

/**
 * Derive a signal's priority from who is behind it and where it came from.
 *
 * Corroboration is the number of *distinct* people who filed an account, and the two ways an account fails to
 * add to that number are both reported rather than swallowed. A repeat is somebody already counted, and it is
 * not a fault — people do follow up — but it must not raise a signal's standing or the standing becomes a
 * measure of persistence. An unattributed account is one with no identifiable person behind it, and it cannot
 * corroborate at all: corroboration is a claim that several people saw the same thing independently, and an
 * anonymous filing might be the same person for the third time. It is still counted and reported, because an
 * institution whose signals arrive unattributed has a problem worth seeing.
 *
 * The originating source sets a floor rather than a value. An incident and an audit finding are already facts
 * when they arrive, so they start at `elevated` without anybody seconding them — but they still reach `urgent`
 * only the same way anything else does, by enough independent people naming the same problem. A floor that also
 * capped would mean an incident nobody could corroborate and an incident half the school witnessed were the
 * same size of problem.
 */
export const derivePriority = (
  source: SignalSource,
  accounts: readonly SignalAccount[],
): PriorityVerdict => {
  const raisers = new Set<string>();
  let repeatAccounts = 0;
  let unattributed = 0;

  for (const account of accounts) {
    const raisedBy = account.raisedBy.trim();
    if (raisedBy.length === 0) {
      unattributed += 1;
    } else if (raisers.has(raisedBy)) {
      repeatAccounts += 1;
    } else {
      raisers.add(raisedBy);
    }
  }

  const corroboration = raisers.size;
  const selfEvident = SELF_EVIDENT_SOURCES.includes(source);
  const floor: SignalPriority = selfEvident ? "elevated" : "routine";
  const earned: SignalPriority =
    corroboration >= MIN_CORROBORATION_FOR_URGENT
      ? "urgent"
      : corroboration >= MIN_CORROBORATION_FOR_ELEVATED
        ? "elevated"
        : "routine";
  const priority = priorityRank(earned) >= priorityRank(floor) ? earned : floor;

  return { priority, corroboration, repeatAccounts, unattributed, selfEvident };
};

// --- Progression -----------------------------------------------------------------

/**
 * Which statuses a signal may move to from each status it can be in.
 *
 * The shape of this map is the argument. `raised` reaches only `triaged` — a signal cannot be declined before
 * somebody has looked at it, which is the difference between an institution that considers what it is told and
 * one that has an inbox. Every disposal therefore passes through a step that leaves a record of who considered
 * it, and `declined` stops being the cheapest way to make a signal go away.
 *
 * The three dispositions are all terminal, including `merged`. A signal folded into another one is not waiting
 * for anything; the work continues under the signal it was merged into, and reopening it would produce two
 * records of the same problem moving in parallel — which is what merging existed to prevent.
 *
 * Frozen at both levels. A shallow freeze would leave the target lists open to being pushed onto at runtime,
 * and a caller who could append `declined` to what `raised` reaches would have removed the triage step from the
 * whole institution without touching this file.
 */
export const SIGNAL_PROGRESSIONS: Readonly<Record<SignalStatus, readonly SignalStatus[]>> =
  Object.freeze({
    raised: Object.freeze<SignalStatus[]>(["triaged"]),
    triaged: Object.freeze<SignalStatus[]>(["accepted", "merged", "declined"]),
    accepted: Object.freeze<SignalStatus[]>([]),
    merged: Object.freeze<SignalStatus[]>([]),
    declined: Object.freeze<SignalStatus[]>([]),
  });

/**
 * Whether a signal may move from one status to another, and if not, which kind of not.
 *
 * Three refusals rather than one, because each sends the caller somewhere different. `same_status` means the
 * update is a no-op and probably a double submission. `terminal_status` means the signal is finished and the
 * work belongs on a new one. `unreachable_status` means the move skips a step the institution requires — in
 * practice, almost always an attempt to dispose of something nobody has triaged.
 */
export const inspectProgression = (from: SignalStatus, to: SignalStatus): ProgressionVerdict => {
  if (from === to) return { allowed: false, from, to, refusal: "same_status" };
  if (isTerminalSignalStatus(from)) return { allowed: false, from, to, refusal: "terminal_status" };
  if (!SIGNAL_PROGRESSIONS[from].includes(to)) {
    return { allowed: false, from, to, refusal: "unreachable_status" };
  }
  return { allowed: true, from, to, refusal: null };
};
