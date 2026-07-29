import type {
  CapabilityArea,
  ChangeClass,
  CycleStage,
  DecisionVerdict,
  EvidenceKind,
  GateOutcome,
  GovernanceGate,
  InitiativeStatus,
  LessonCategory,
  LessonOrigin,
  LessonRetention,
  SignalPriority,
  SignalSource,
  SignalStatus,
} from "./evolution-value";

/**
 * The shapes the engines of Platform Evolution, Institutional Learning & Continuous Improvement (P2-D30) read
 * and return. These are structures, not records: nothing here has an identity, a tenant or a lifecycle, and
 * nothing here is stored. The aggregates assemble persisted state out of these; the engines only ever compute
 * over them.
 *
 * One property runs through the whole module and is worth stating once rather than thirty times below. Every
 * verdict here arrives with its own derivation attached — not a boolean, and not a number a reader has to take
 * on trust. A signal's priority comes with the count of distinct people behind it and whether its source
 * carried it on its own. A gate's outcome comes with what was required, what was counted, and every ballot that
 * could not be counted with the reason it could not.
 *
 * That is not defensive verbosity, it is the contract. This is the one package where an institution records why
 * it changed something and who agreed, and a governance record that says only `approved` is worth nothing
 * eighteen months later when an inspector, a new head, or the same people with different memories ask how the
 * decision was reached. A verdict that carries its derivation can be re-read; one that carries a conclusion can
 * only be believed or doubted.
 */

// --- Evidence --------------------------------------------------------------------

/**
 * One record a signal, a lesson or an assessment stands on.
 *
 * A citation points outward and never inward: `sourceDomain` and `sourceRef` address a row this package does not
 * own and will not reproduce. Twenty-nine contracts hold what the institution did; this one holds why it changed
 * its mind. The moment it copies a figure it is citing, the copy and the original begin to disagree and the
 * citation stops being evidence and becomes decoration.
 *
 * The two reference fields are held to deliberately different standards. `sourceDomain` names a contract inside
 * this platform, so it is a key and is checked as one. `sourceRef` names a row inside that contract's own
 * identifier scheme, so it is checked only for being present — imposing a grammar on another domain's
 * identifiers would be this package deciding how a domain it never reads should name things.
 */
export interface EvidenceCitation {
  readonly kind: EvidenceKind;
  /** Which domain holds the cited record. Normalized. */
  readonly sourceDomain: string;
  /** The cited record's identifier inside that domain. Opaque here, and never dereferenced by this package. */
  readonly sourceRef: string;
  /** Who stands behind the record, for the kind that requires it. `null` for the kinds that do not. */
  readonly attestedBy: string | null;
}

/** One thing wrong with a set of citations, and the citation it is wrong at when that is meaningful. */
export interface EvidenceIssue {
  readonly code: string;
  /** The offending citation's index, or `null` when the issue is a property of the whole set. */
  readonly citationIndex: number | null;
}

/**
 * The result of inspecting the evidence behind a signal. Every issue, not the first one.
 *
 * All of them, because the caller is a person filling in a form and returning one problem at a time turns a
 * single correction into four round trips. The same argument runs through every `*Verdict` in this module.
 */
export interface EvidenceVerdict {
  readonly usable: boolean;
  /** Citations that raised no issue of their own. */
  readonly cited: number;
  readonly issues: readonly EvidenceIssue[];
}

// --- Signal intake ---------------------------------------------------------------

/**
 * One person's independent account of the thing a signal is about.
 *
 * `raisedBy` is an opaque person reference and it is the field that carries all the weight: corroboration is
 * counted in *people*, never in filings. The distinction is the entire point of the intake engine. An
 * institution that counted filings would give a determined complainant the standing of a department, and the
 * signals reaching leadership would be the ones somebody had the stamina to keep sending rather than the ones
 * the most people had independently noticed.
 */
export interface SignalAccount {
  readonly raisedBy: string;
  readonly source: SignalSource;
}

/**
 * A signal's priority, with the arithmetic that produced it.
 *
 * Priority is derived rather than declared, and the derivation travels with it, because the alternative is a
 * field somebody sets to `urgent` and nobody can argue with. Here the number of distinct people is visible, the
 * filings that did not add anybody are visible, and whether the source alone carried it is visible — so a
 * disagreement about a signal's priority becomes a disagreement about facts a reader can check.
 */
export interface PriorityVerdict {
  readonly priority: SignalPriority;
  /** Distinct people standing behind the signal, after repeat filings collapse. */
  readonly corroboration: number;
  /** Accounts filed by somebody already counted. Reported rather than dropped silently. */
  readonly repeatAccounts: number;
  /** Accounts with no identifiable person behind them. These cannot corroborate; see the engine for why. */
  readonly unattributed: number;
  /** Whether the originating source carried the signal above `routine` with nobody seconding it. */
  readonly selfEvident: boolean;
}

/** Why a signal may not move to the status somebody asked for. */
export type ProgressionRefusal = "same_status" | "terminal_status" | "unreachable_status";

/** Whether a signal may move between two statuses, and if not, which kind of not. */
export interface ProgressionVerdict {
  readonly allowed: boolean;
  readonly from: SignalStatus;
  readonly to: SignalStatus;
  /** `null` when the move is allowed. */
  readonly refusal: ProgressionRefusal | null;
}

// --- Governance gates ------------------------------------------------------------

/**
 * One person's vote at a gate.
 *
 * A ballot names a person, not a role. Roles are renamed, merged and abolished; the decision record has to
 * outlive all three. Whether that person was entitled to vote is a question for the identity contracts and the
 * `evolution:govern` scope, not for this engine, which knows only that they are somebody and not the proposer.
 */
export interface GateBallot {
  readonly deciderId: string;
  readonly verdict: DecisionVerdict;
}

/** One ballot that could not be counted, and why. */
export interface BallotIssue {
  readonly code: string;
  /** The offending ballot's index, or `null` when the issue is a property of the whole gate. */
  readonly ballotIndex: number | null;
}

/**
 * A gate as the governance engine sees it: what is being decided, by whose proposal, and who has spoken.
 *
 * `proposedBy` is required rather than optional, and that is load-bearing. The rule that nobody approves their
 * own initiative can only be applied against a recorded proposer, so a gate assembled without one is not a gate
 * with a missing field — it is a gate whose central safeguard cannot run, and the engine says so.
 */
export interface GateRequest {
  readonly gate: GovernanceGate;
  readonly changeClass: ChangeClass;
  /** Who put the change forward. Their own ballot never counts, in either direction. */
  readonly proposedBy: string;
  readonly ballots: readonly GateBallot[];
}

/**
 * Where a gate stands, with everything a reader needs to see why.
 *
 * `refused` is a boolean beside three counts on purpose. It is not the losing side of a tally — a single
 * refusal settles the gate however many affirmations sit opposite it, so it cannot be represented as a number
 * that something else might outweigh. An institution whose governance let a majority overrule a refusal would
 * be building the one record nobody wants to find later: proof that it was warned and went ahead.
 */
export interface GateVerdict {
  readonly gate: GovernanceGate;
  readonly outcome: GateOutcome;
  /** Distinct people who must agree before this gate opens. Never zero. */
  readonly required: number;
  /** Distinct people who did agree, after the proposer and repeat ballots are removed. */
  readonly affirmed: number;
  /** How many more are needed. `0` once the gate has settled either way. */
  readonly outstanding: number;
  /** Affirmations that came with conditions attached. The conditions themselves stay on the record. */
  readonly conditional: number;
  /** Whether anybody refused. One refusal settles the gate, whatever the count on the other side. */
  readonly refused: boolean;
  /** How many deferred. A deferral leaves the gate open rather than settling it in either direction. */
  readonly deferrals: number;
  readonly issues: readonly BallotIssue[];
}

// --- Initiative lifecycle --------------------------------------------------------

/**
 * A proposed move of an initiative from one lifecycle state to another, with everything the engine needs to
 * decide it.
 *
 * `gateOutcome` is nullable because the absence of a gate and the presence of an unsatisfied one are different
 * situations with different remedies, and collapsing them into a falsy check would tell the caller to wait for
 * people who were never asked. `pilotPeriods` arrives already counted rather than as a pair of period indices:
 * the lifecycle engine has no business doing calendar arithmetic, and the cadence engine has no business knowing
 * what a pilot is.
 */
export interface AdvanceRequest {
  readonly from: InitiativeStatus;
  readonly to: InitiativeStatus;
  /** The outcome of the gate this move requires, or `null` when no gate has been convened for it. */
  readonly gateOutcome: GateOutcome | null;
  /** Whole periods the initiative has already piloted for. Ignored by moves that are not adoption. */
  readonly pilotPeriods: number;
}

/** Why an initiative may not move to the state somebody asked for. */
export type AdvanceRefusal =
  | "same_status"
  | "terminal_status"
  | "unreachable_status"
  | "pilot_too_short"
  | "gate_missing"
  | "gate_pending"
  | "gate_refused";

/**
 * Whether an initiative may make this move, which gate the move stands on, and if it may not, which kind of not.
 *
 * `gate` is reported whether the move is allowed or refused, because a caller assembling a governance record
 * needs to know which gate a transition rested on even when it went through — that is the field an auditor reads
 * eighteen months later to find the ballots.
 */
export interface AdvanceVerdict {
  readonly allowed: boolean;
  readonly from: InitiativeStatus;
  readonly to: InitiativeStatus;
  /** The gate this move requires, or `null` when it requires none. */
  readonly gate: GovernanceGate | null;
  /** `null` when the move is allowed. */
  readonly refusal: AdvanceRefusal | null;
}

// --- Improvement cadence ---------------------------------------------------------

/**
 * A span of periods, checked and counted.
 *
 * Issues here are bare codes with no index, because a span has two named ends rather than a list of members —
 * an index would be a position in something that has no positions. The count is inclusive of both ends: a cycle
 * that runs from period 4 to period 4 is one period long, not zero, because it is a real cycle that happened.
 */
export interface SpanVerdict {
  readonly usable: boolean;
  readonly startPeriod: number;
  readonly endPeriod: number;
  /** Periods the span covers, counting both ends. `0` when the span is unusable. */
  readonly periods: number;
  readonly issues: readonly string[];
}

/**
 * A proposed move of an improvement cycle from one stage to another.
 *
 * `lessonsRecorded` is what makes closure mean something. A cycle that closes having written nothing down is an
 * improvement programme that ran, consumed a term of everybody's attention, and left the institution knowing
 * exactly what it knew before.
 */
export interface StageChangeRequest {
  readonly from: CycleStage;
  readonly to: CycleStage;
  /** The outcome of the gate this move requires, or `null` when no gate has been convened for it. */
  readonly gateOutcome: GateOutcome | null;
  /** Lessons the cycle has produced so far. Ignored by moves that are not closure. */
  readonly lessonsRecorded: number;
}

/** Why an improvement cycle may not move to the stage somebody asked for. */
export type StageRefusal =
  | "same_stage"
  | "terminal_stage"
  | "unreachable_stage"
  | "no_lessons"
  | "gate_missing"
  | "gate_pending"
  | "gate_refused";

/** Whether a cycle may make this move, which gate it stands on, and if it may not, which kind of not. */
export interface StageChangeVerdict {
  readonly allowed: boolean;
  readonly from: CycleStage;
  readonly to: CycleStage;
  /** The gate this move requires, or `null` when it requires none. */
  readonly gate: GovernanceGate | null;
  /** `null` when the move is allowed. */
  readonly refusal: StageRefusal | null;
}

// --- Institutional learning ------------------------------------------------------

/**
 * A lesson as somebody has written it, before the institution has agreed it is one.
 *
 * `originRef` sits beside the origin rather than being folded into it because the origin says what kind of event
 * produced the lesson and the reference says which one. A lesson whose origin is `cycle_retrospective` and whose
 * reference is blank is the shape institutional folklore arrives in — a conclusion with a category and no event
 * behind it — and separating the two fields is what lets the engine refuse it without refusing the category.
 *
 * `applicability` is loose strings rather than {@link CapabilityArea} values because this is a draft: a person
 * has typed or picked something and the engine's job is to say which of those the institution recognises. Typing
 * the field as the closed union would move that check to the compiler, where a caller reading a form submission
 * cannot satisfy it without casting, and a cast is how unknown areas get in.
 */
export interface LessonDraft {
  readonly statement: string;
  readonly category: LessonCategory;
  readonly origin: LessonOrigin;
  /** The record the lesson came out of, inside the origin's own identifier scheme. Never dereferenced here. */
  readonly originRef: string;
  /** Capability areas the lesson claims to speak to, as submitted. */
  readonly applicability: readonly string[];
}

/** One thing wrong with a lesson draft, and the applicability entry it is wrong at when that is meaningful. */
export interface LessonIssue {
  readonly code: string;
  /** The offending applicability entry's index, or `null` when the issue is a property of the lesson itself. */
  readonly areaIndex: number | null;
}

/**
 * Whether a lesson is well enough formed to be recorded, and which areas of the institution it speaks to.
 *
 * `areas` is the surviving applicability, normalized and deduplicated, and it is returned even when the draft is
 * unusable. A caller correcting a statement that is forty characters short should not also lose the six areas
 * they picked correctly, and an engine that returned nothing on failure would make that the caller's problem to
 * solve by re-reading the request it just sent.
 */
export interface LessonVerdict {
  readonly usable: boolean;
  /** Recognised applicability, in submitted order, with unknown and repeated entries removed. */
  readonly areas: readonly CapabilityArea[];
  readonly issues: readonly LessonIssue[];
}

/**
 * A proposed move of a lesson between retention states, with what the move stands on.
 *
 * `commitmentResolved` is a boolean rather than a commitment record because whether a memory commitment resolved
 * against the institutional knowledge graph is P2-D25's question, answered in P2-D25's vocabulary, and a domain
 * that modelled the commitment here would be holding a second opinion about a fact it does not own.
 *
 * `lessonKey` is present for one rule: a lesson may not supersede itself. It looks like a rule nobody needs
 * until a caller passes the key it is editing into both fields and the institution acquires a lesson that is its
 * own replacement, readable forever and pointing at nothing.
 */
export interface RetentionChangeRequest {
  readonly from: LessonRetention;
  readonly to: LessonRetention;
  /** This lesson's own key, so a lesson cannot be recorded as replacing itself. */
  readonly lessonKey: string;
  /** Whether the memory commitment for this lesson has resolved against the knowledge graph (P2-D25). */
  readonly commitmentResolved: boolean;
  /** The lesson that replaces this one, or `null` when none has been named. */
  readonly supersededBy: string | null;
}

/** Why a lesson may not move to the retention state somebody asked for. */
export type RetentionRefusal =
  | "same_retention"
  | "terminal_retention"
  | "unreachable_retention"
  | "commitment_unresolved"
  | "no_superseding_lesson"
  | "self_supersession";

/** Whether a lesson may make this retention move, and if not, which kind of not. */
export interface RetentionVerdict {
  readonly allowed: boolean;
  readonly from: LessonRetention;
  readonly to: LessonRetention;
  /** `null` when the move is allowed. */
  readonly refusal: RetentionRefusal | null;
}

/**
 * Where a lesson stands against its review interval.
 *
 * Nothing here demotes, expires or deletes anything, and `reviewDue` is a derived flag rather than a stored
 * state for exactly that reason. A lesson does not stop being true because eight periods passed; what has
 * happened is that nobody has looked at it since, which is a fact about the institution rather than about the
 * lesson. Keeping it derived also means it is decidable from the record alone, at any period a reader cares to
 * ask about, rather than depending on when a job last ran.
 */
export interface ReviewStanding {
  readonly retention: LessonRetention;
  /** Whether the review interval has elapsed. Only ever true for a lesson that reached memory. */
  readonly reviewDue: boolean;
  /** Whole periods completed since the lesson entered memory. `0` when it never has. */
  readonly periodsSinceRetention: number;
  /** Periods still to run before review falls due. `0` once it has, and `0` for a lesson not in memory. */
  readonly periodsUntilDue: number;
}

// --- Lineage ---------------------------------------------------------------------

/**
 * How far back a change's record can be read: from nothing at all to a lesson that reached memory.
 *
 * The six stages are a ladder rather than a set, and each rung is a claim the institution can make about a
 * change it made. `unrecorded` is the honest bottom — something happened and nothing links back to why.
 * `memory` is the top, and it is the only stage at which the change has actually finished the round trip this
 * whole contract describes.
 */
export type LineageStage = "unrecorded" | "evidence" | "signal" | "decision" | "outcome" | "memory";

/**
 * One signal in a chain, reduced to the two facts lineage cares about.
 *
 * `evidenceCited` is a count rather than the citations themselves because {@link EvidenceVerdict} has already
 * inspected them. Re-checking here would mean two engines holding an opinion about the same citations, and the
 * first time they disagreed the institution would have two answers about whether its own record was sound.
 */
export interface LineageSignal {
  readonly status: SignalStatus;
  /** Citations that survived inspection. Counted, never re-inspected. */
  readonly evidenceCited: number;
}

/** One gate in a chain, reduced to which gate it was and where it ended up. */
export interface LineageGate {
  readonly gate: GovernanceGate;
  readonly outcome: GateOutcome;
}

/** One lesson in a chain, reduced to whether it reached institutional memory. */
export interface LineageLesson {
  readonly retention: LessonRetention;
}

/**
 * Everything the institution holds about one change, assembled for reading backwards.
 *
 * A chain is built by the caller out of records this package owns; the engine does not fetch anything. That
 * keeps the trace reproducible — the same chain always yields the same verdict — and it keeps the engine honest
 * about what it is doing, which is reading a record rather than establishing one.
 */
export interface LineageChain {
  readonly signals: readonly LineageSignal[];
  readonly initiativeStatus: InitiativeStatus;
  readonly gates: readonly LineageGate[];
  readonly lessons: readonly LineageLesson[];
}

/** One place a chain stops or thins, and the link it happens at when the link exists to point at. */
export interface LineageGap {
  readonly code: string;
  /** The offending link's index within its own list, or `null` when the gap is a whole link's absence. */
  readonly linkIndex: number | null;
}

/**
 * How far a change's record reads back, and everywhere it is thinner than it should be.
 *
 * `reachedStage` and `gaps` answer different questions and both are needed. The stage is where the chain stops,
 * which is what a person asking "can we show how this decision was reached" wants. The gaps are every weakness
 * found, including ones above the break — a chain that stops at `decision` may also have two signals citing no
 * evidence, and an institution repairing its records should be told about both rather than led through them one
 * release at a time.
 */
export interface LineageVerdict {
  /** Whether the chain reads all the way back to a lesson in memory. */
  readonly traceable: boolean;
  readonly reachedStage: LineageStage;
  readonly gaps: readonly LineageGap[];
}
