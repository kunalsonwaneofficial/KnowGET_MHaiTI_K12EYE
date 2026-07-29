import { PlatformError } from "@knowget/exceptions";

/**
 * The domain error model for platform evolution, institutional learning and continuous improvement. Every failure
 * this contract can produce is a typed, operational error carrying a stable code, an HTTP status and structured
 * details — never a bare string, and never free text an API consumer has to parse.
 *
 * Almost every class here is a refusal rather than a fault, and the refusals are where this contract's rule stops
 * being a sentence in a document and becomes a property of the code:
 *
 * - {@link UnusableSignalEvidenceError} means there is no path that brings a signal into existence standing on
 *   nothing. An improvement queue whose entries need no evidence is an opinion queue, and the constituency with
 *   the most time to spend filing wins it.
 * - {@link SignalSettledError} and {@link InvalidSignalProgressionError} mean a signal is disposed of once, in
 *   the open, and only after somebody has triaged it. `declined` is never the cheap way to make something go
 *   away, because getting there leaves a record of who considered it and why they said no.
 * - {@link GovernanceGateNotConvenedError}, {@link GovernanceGatePendingError} and
 *   {@link GovernanceGateRefusedError} are *evolution always requires human governance*, written three times
 *   because the three situations have three different remedies: nobody has been asked, somebody has not answered
 *   yet, somebody said no. The third has no remedy on this initiative at all, and collapsing it into the second
 *   is how an institution ends up re-running a gate until the answer changes.
 * - {@link PilotTooShortError} means a change becomes institutional practice only after it has actually run for
 *   a whole period somewhere. An institution that adopts on the strength of having agreed has learned nothing
 *   from the change and has left the realization engine nothing to measure it against.
 * - {@link InitiativeTextFrozenError} means what the deciders read is what the institution agreed to. A proposal
 *   that could be rewritten after approval would make every decision record a statement about a document that no
 *   longer exists.
 * - {@link InitiativeNotDraftError} means a change's class — which is to say how many people have to agree to it
 *   — is fixed before anybody is asked. Reclassifying mid-review is the one move that lowers a quorum after the
 *   voting has started, and it would never look like anything but tidying up.
 * - {@link InitiativeSettledError} means `adopted`, `rejected` and `withdrawn` are ends. Undoing an adopted
 *   change is a new initiative under the reversion gate, because the fact that the institution once believed in
 *   it is exactly the fact a later reader needs.
 *
 * A refusal is a 409 or a 422 carrying the specifics an operator needs to act on it, because these are the
 * platform enforcing its contract rather than something going wrong inside it.
 *
 * Some of these are raised by the services rather than by the aggregates, and the split is not arbitrary. An
 * aggregate holds one record and can only refuse what that record can see; whether a key is already taken, or
 * whether a cited record exists elsewhere in the platform, is not decidable from a single object and is refused
 * where the repositories and directories are. They are written down here regardless, so that one file answers the
 * question of everything this contract will refuse to do.
 */

// --- Improvement signals ---------------------------------------------------------

/** The requested improvement signal does not exist in the current tenant. */
export class ImprovementSignalNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Improvement signal "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/**
 * A signal key is how an initiative, a lesson and a lineage trace all address the same reported problem, so two
 * signals cannot answer to one key. Reusing a settled signal's key is refused for the same reason: the settled
 * signal still holds what the institution decided about that problem, and a second signal wearing its key would
 * make the record of a suggestion that was declined read as though it had eventually been accepted.
 */
export class DuplicateSignalKeyError extends PlatformError {
  constructor(signalKey: string) {
    super(`Improvement signal "${signalKey}" already exists in this tenant`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { signalKey },
    });
  }
}

/** A signal is addressed by key by every initiative, lesson and trace that refers back to it. */
export class EmptySignalKeyError extends PlatformError {
  constructor() {
    super("An improvement signal must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/**
 * Keys are matched by exact string equality across five kinds of record in this domain, so a key that is not in
 * canonical form is a record nothing will ever find again. Repairing it silently would be worse: the institution
 * would hold two spellings of one problem and know about one of them.
 */
export class InvalidSignalKeyError extends PlatformError {
  constructor(signalKey: string) {
    super(`Improvement signal key "${signalKey}" is not a well-formed registry key`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { signalKey },
    });
  }
}

/** A signal nobody can read is a signal nobody can triage, and it will sit in the queue forever. */
export class SignalSummaryLengthError extends PlatformError {
  constructor(length: number, minimum: number, maximum: number) {
    super(`An improvement signal summary must be ${minimum}–${maximum} characters; got ${length}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { length, minimum, maximum },
    });
  }
}

/**
 * The signal does not stand on records anybody could check.
 *
 * This is the front door of the whole contract and the one refusal that shapes everything downstream. A signal
 * admitted without usable evidence acquires a priority, a place in a queue and eventually an initiative — and by
 * the time anyone asks what it was based on, the answer is four screens back and belongs to somebody who left.
 * The codes carried here are the intake engine's own, so the caller is told every problem at once rather than
 * discovering them one correction at a time.
 */
export class UnusableSignalEvidenceError extends PlatformError {
  constructor(signalKey: string, issues: readonly string[]) {
    super(`Improvement signal "${signalKey}" does not stand on usable evidence`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { signalKey, issues },
    });
  }
}

/** The signal is already in the state somebody asked for — almost always a resubmitted form. */
export class SignalAlreadyInStatusError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Improvement signal "${id}" is already ${status}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/**
 * The signal has been disposed of and nothing further happens to it.
 *
 * That covers corroborating it, rewriting it and moving it, and the uniformity is the point. A settled signal is
 * the record of a decision the institution made about a problem at a moment; a later account added to it, or a
 * summary rewritten under it, would make that decision look like it was taken on evidence it never saw. The work
 * continues on a new signal, which is also how recurrence becomes visible.
 */
export class SignalSettledError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Improvement signal "${id}" was settled as ${status} and can no longer be changed`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/**
 * The move skips a step the institution requires — in practice, almost always disposing of something nobody has
 * triaged. Triage is the step that leaves a record of a person having considered the thing, and a queue that can
 * be emptied without it is an inbox with a delete key.
 */
export class InvalidSignalProgressionError extends PlatformError {
  constructor(id: string, from: string, to: string) {
    super(`Improvement signal "${id}" cannot move from ${from} to ${to}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, from, to },
    });
  }
}

/**
 * Declining requires a stated reason, and it is the only compulsory free text on a signal.
 *
 * An unexplained decline is indistinguishable from a signal nobody read, and the collection of them is the most
 * useful record this domain holds: what the institution kept being told, and kept choosing not to act on. That
 * pattern explains most repeat audit findings, and it only exists if the reasons were written down.
 */
export class EmptyDeclineReasonError extends PlatformError {
  constructor() {
    super("Declining an improvement signal requires a stated reason", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** Merging a signal into itself would leave a record that points at nothing and closes the loop on nobody. */
export class SignalMergedIntoItselfError extends PlatformError {
  constructor(id: string) {
    super(`Improvement signal "${id}" cannot be merged into itself`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Improvement initiatives -----------------------------------------------------

/** The requested improvement initiative does not exist in the current tenant. */
export class ImprovementInitiativeNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Improvement initiative "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/**
 * An initiative key is what a decision, a pilot, an adoption review and a lesson all quote when they refer to the
 * change. Two initiatives on one key would give an institution two answers to *what did we decide about this*,
 * and no way to tell which one the governance record belonged to.
 */
export class DuplicateInitiativeKeyError extends PlatformError {
  constructor(initiativeKey: string) {
    super(`Improvement initiative "${initiativeKey}" already exists in this tenant`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { initiativeKey },
    });
  }
}

/** An initiative is addressed by key by every decision and review that stands on it. */
export class EmptyInitiativeKeyError extends PlatformError {
  constructor() {
    super("An improvement initiative must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The key is not in the canonical form the rest of this domain matches against. */
export class InvalidInitiativeKeyError extends PlatformError {
  constructor(initiativeKey: string) {
    super(`Improvement initiative key "${initiativeKey}" is not a well-formed registry key`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { initiativeKey },
    });
  }
}

/**
 * A proposal nobody can read is a proposal nobody can decide on, and it will still be voted through.
 *
 * That is the specific failure this bound exists for. Governance under time pressure approves what it cannot
 * evaluate rather than admitting it cannot evaluate it, so the summary is checked before the gate rather than
 * left to the deciders to complain about.
 */
export class InitiativeSummaryLengthError extends PlatformError {
  constructor(length: number, minimum: number, maximum: number) {
    super(
      `An improvement initiative summary must be ${minimum}–${maximum} characters; got ${length}`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { length, minimum, maximum },
      },
    );
  }
}

/**
 * The same signal is named twice as an origin of one initiative.
 *
 * Refused rather than collapsed. How many distinct problems a change was raised to address is a fact governors
 * read off the proposal, and quietly deduplicating a pasted list would leave the institution holding a number it
 * did not write and cannot account for.
 */
export class DuplicateOriginatingSignalError extends PlatformError {
  constructor(signalId: string) {
    super(`Improvement signal "${signalId}" is named twice as an origin of this initiative`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { signalId },
    });
  }
}

/** The initiative is already in the state somebody asked for. */
export class InitiativeAlreadyInStatusError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Improvement initiative "${id}" is already ${status}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/**
 * The initiative has reached one of its three ends and nothing further happens to it.
 *
 * `adopted` is terminal alongside `rejected` and `withdrawn`, which is the asymmetry that makes this domain
 * honest. Reverting an adopted change is a fresh initiative under the reversion gate, with its own proposal, its
 * own deciders and its own lesson — because flipping this record back would erase the period in which the
 * institution believed the change was right, and that period is what the next reader is trying to understand.
 */
export class InitiativeSettledError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Improvement initiative "${id}" was settled as ${status} and can no longer be changed`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/**
 * The move skips a step. The forward path is deliberately narrow and every step on it leaves a record of somebody
 * having done something; a lifecycle that allowed a draft to become adopted would let a change become how the
 * institution works on the strength of one update by one person.
 */
export class InvalidInitiativeProgressionError extends PlatformError {
  constructor(id: string, from: string, to: string) {
    super(`Improvement initiative "${id}" cannot move from ${from} to ${to}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, from, to },
    });
  }
}

/**
 * Adoption was asked for before the pilot had run a whole period.
 *
 * The requirement is small on purpose — one completed period — because the point is not the duration but the
 * existence of an interval in which the change was in contact with reality. Without it, an adoption review has
 * nothing to observe and the benefit claims attached to the initiative can never be measured against anything.
 */
export class PilotTooShortError extends PlatformError {
  constructor(id: string, pilotPeriods: number, required: number) {
    super(
      `Improvement initiative "${id}" has piloted for ${pilotPeriods} of the ${required} periods required`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { id, pilotPeriods, required },
      },
    );
  }
}

/**
 * The move requires a governance gate and no gate has been convened for it.
 *
 * Nobody has been asked. This is the refusal that makes *evolution always requires human governance* into
 * something other than an aspiration: there is no argument the caller can supply, no flag and no override, that
 * advances an initiative past a gate that was never held.
 */
export class GovernanceGateNotConvenedError extends PlatformError {
  constructor(id: string, gate: string) {
    super(`Improvement initiative "${id}" has no ${gate} gate; it cannot advance without one`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, gate },
    });
  }
}

/** The gate was convened and has not been settled: some of the people asked have not answered yet. */
export class GovernanceGatePendingError extends PlatformError {
  constructor(id: string, gate: string) {
    super(`The ${gate} gate on improvement initiative "${id}" is still pending`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, gate },
    });
  }
}

/**
 * Somebody refused, and a refused gate is settled.
 *
 * Kept apart from a pending one deliberately. There is no remedy for this on this initiative — pursuing the
 * change means a new proposal that addresses the objection, which is a different act with a different record.
 * An institution that could keep re-opening a refused gate would eventually get the answer it wanted, and the
 * refusal would survive only as a line in a log nobody reads.
 */
export class GovernanceGateRefusedError extends PlatformError {
  constructor(id: string, gate: string) {
    super(`The ${gate} gate on improvement initiative "${id}" was refused`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, gate },
    });
  }
}

/**
 * The proposal cannot be rewritten once the institution has approved it.
 *
 * A decision record names an initiative and a moment; if the text underneath it can move, the record stops being
 * evidence of what was agreed and becomes a pointer to whatever the proposer last thought. Amending an approved
 * change is a new proposal, which is more work than editing a field and is meant to be.
 */
export class InitiativeTextFrozenError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Improvement initiative "${id}" is ${status}; its proposal can no longer be edited`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/**
 * The change class is fixed once the initiative leaves the drafting table.
 *
 * The class decides how many distinct people must agree, so reclassifying a submitted initiative changes the
 * quorum it faces. Downward, that is a change nobody would call by its real name; upward it invalidates ballots
 * already cast. Either way it happens before anybody is asked, or it does not happen.
 */
export class InitiativeNotDraftError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Improvement initiative "${id}" is ${status}; its change class is fixed`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/** Withdrawing requires a stated reason: an initiative that vanished without one looks like one that was lost. */
export class EmptyWithdrawalReasonError extends PlatformError {
  constructor() {
    super("Withdrawing an improvement initiative requires a stated reason", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/**
 * A period index outside the grid this domain counts on.
 *
 * Periods are integers the caller defines, never dates this package reads off a clock, which is what makes a
 * pilot's length reproducible years later. A period that is not a whole number in range would make the pilot
 * arithmetic produce a figure nobody could reconstruct.
 */
export class InvalidPilotPeriodError extends PlatformError {
  constructor(period: number) {
    super(`Period ${period} is not a valid period index`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { period },
    });
  }
}
