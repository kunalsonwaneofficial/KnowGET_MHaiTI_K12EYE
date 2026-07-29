/**
 * Value objects for Platform Evolution, Institutional Learning & Continuous Improvement (P2-D30). These are the
 * vocabulary of the only layer in the platform whose subject is the institution changing itself: where an
 * observation that something could be better comes from, how far through the institution a proposed change
 * reaches, who has to agree before it happens, what an institution has learned, and whether its capacity to do
 * any of this is improving. They are TEXT in the store and closed unions here — the grammar of institutional
 * change is fixed even though the *catalog* (signal keys, initiative keys, lesson keys, cycle keys, assessment
 * keys) is extensible, because every one of the twenty-nine contracts before this one will produce improvement
 * signals nobody has named yet and none of them may invent a new *kind* of authority.
 *
 * The contract's rule has two clauses and this module makes both of them structural:
 *
 * **Lessons feed institutional memory.** {@link LESSON_RETENTIONS} has no member meaning "written down
 * somewhere". A lesson is `provisional` until a memory commitment resolves against the institutional knowledge
 * graph (P2-D25), at which point it is `retained` — so the retrospective that produced twelve insights and
 * committed none of them reads as twelve unfinished records rather than as a completed retrospective. The
 * distinction is the whole of the clause: institutions do not fail to *notice* things, they fail to keep them,
 * and a category that let noticing count as keeping would be the failure with a status column.
 *
 * **Evolution always requires human governance.** {@link REQUIRED_DECIDERS} maps each {@link ChangeClass} to a
 * count of *distinct named people* who must agree, and its smallest value is one rather than zero. There is no
 * change class that clears a gate on arithmetic, no threshold above which the platform decides, and no
 * configuration that could introduce one — a per-tenant override here would be an institution voting once to
 * never have to vote again. {@link GOVERNANCE_GATES} names the four places a human decision is the only thing
 * that moves the record, and every one of them is a point where the institution is about to do something
 * differently.
 *
 * Four constants carry the rest of the honesty. {@link MIN_AREA_COVERAGE} and {@link MIN_EVIDENCE_PER_AREA} stop
 * a maturity assessment resting on whichever areas happened to file returns; {@link MAX_AREA_WEIGHT} stops one
 * capability quietly becoming the score; {@link MATURITY_PRECISION} fixes the decimal place at which derived
 * levels are rounded, which is what makes a reassessment *checkable* against its predecessor rather than merely
 * intended.
 *
 * Four absences are as deliberate as the declarations.
 *
 * There is **no vocabulary for enactment**. No deployment, no release, no rollout mechanism, no feature flag, no
 * schedule that fires. An initiative in this package reaches `adopted` and stops; what the institution then does
 * differently happens in the institution, and — where software is involved — through the delivery contract
 * (P5-D05), never from here. The platform is where a change is proposed, argued and recorded. It is not the
 * thing that performs it, and the absence of the words is what keeps that true after everyone who agreed to it
 * has moved on.
 *
 * There is **no self-modification vocabulary**: nothing here names a platform version, a configuration key, a
 * schema, or a model. An improvement domain that could describe changes to its own runtime would eventually be
 * asked to make one.
 *
 * There is **no role catalog**. Authority is expressed against opaque permission scope strings granted by the
 * identity and authorization contracts ({@link EVOLUTION_SCOPES}), never against a list of job titles
 * re-declared here. A governance layer holding a second opinion about who a principal is would discover the
 * disagreement as an unauthorized approval.
 *
 * There is **no governance-body vocabulary** — no committees, no meetings, no minutes, no quorum of a *body*.
 * The quorum here is a count of people, because a decision record has to survive the committee being renamed.
 * Institutional governance bodies belong to P2-D02 and are referenced from here by id.
 */

// --- Keys ------------------------------------------------------------------------

/**
 * The canonical form of a registry key: trimmed and lower-cased. Signal keys, initiative keys, lesson keys,
 * cycle keys and assessment keys all share one grammar, because a lesson is matched to a capability area and an
 * initiative to a cycle by exact string equality, and a catalog where `Staff-Onboarding` and `staff-onboarding`
 * are two records is a catalog in which the institution has learned the same thing twice and knows it once.
 */
export const normalizeKey = (value: string): string => value.trim().toLowerCase();

/** Longest accepted key. Long enough to be descriptive, short enough to index and to print in a decision note. */
export const MAX_KEY_LENGTH = 120;

/** Shortest accepted key. Two characters is not a name, and a one-character key is a typo that persisted. */
export const MIN_KEY_LENGTH = 3;

/**
 * Key grammar: lower-case alphanumerics separated by single dots, hyphens or underscores.
 *
 * Dotted segments are what let an institution namespace its improvement work by where it originated
 * (`academic.marking-turnaround`, `transport.route-audit`) without this package knowing anything about the
 * namespaces. It never parses one.
 */
const KEY_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

/** Is this a well-formed registry key, in canonical form and within length? */
export const isValidKey = (value: string): boolean =>
  value.length >= MIN_KEY_LENGTH &&
  value.length <= MAX_KEY_LENGTH &&
  value === normalizeKey(value) &&
  KEY_PATTERN.test(value);

// --- Summaries -------------------------------------------------------------------

/**
 * Longest accepted summary on a signal or an initiative.
 *
 * Long enough to state a problem, or a proposed change, in the terms the institution would actually use in the
 * meeting about it — and short enough that nobody pastes a report into the field. A domain whose summaries run to
 * pages is one where the summary stops being read, and a field everybody skips is a field that stops being
 * written honestly.
 */
export const MAX_SUMMARY_LENGTH = 1000;

/**
 * Shortest accepted summary. Below this the field is a title with a full stop after it.
 *
 * A signal reading *marking* is not something anybody can triage, and an initiative reading *fix timetabling* is
 * not something anybody can decide on. The floor exists because the cost of an unreadable improvement queue is
 * paid months later by whoever inherits it, and never by the person who filled the form in a hurry.
 */
export const MIN_SUMMARY_LENGTH = 20;

// --- Permission scopes -----------------------------------------------------------

/**
 * The five permission scopes this contract's surface is gated by.
 *
 * `evolution:govern` stands alone, and the separation is the point rather than a tidiness. The other four are
 * scopes of *participation*: reading what the institution is working on, raising a signal, running the cycles,
 * assessing capability. `evolution:govern` is the scope of *consent* — it is the only one that moves an
 * initiative past a gate, and it is deliberately not implied by any of the others. A head who can create cycles
 * and edit initiatives still cannot approve one on that authority; approving is a separate grant somebody made
 * on purpose.
 *
 * The reason it is separable at all is the reason the whole contract exists. Every other scope in the platform
 * governs what a person may *do*; this one governs what the institution may *become*, and a permission model
 * that bundled the second into the first would hand it out with the job rather than with the mandate.
 *
 * These are strings this package compares and never interprets. It holds no opinion about who should have them.
 */
export const EVOLUTION_SCOPES = [
  "evolution:read",
  "evolution:contribute",
  "evolution:manage",
  "evolution:assess",
  "evolution:govern",
] as const;

/** A permission scope gating some part of this contract's surface. */
export type EvolutionScope = (typeof EVOLUTION_SCOPES)[number];

/** The canonical form of a permission scope: trimmed and lower-cased. */
export const normalizeScope = (value: string): string => value.trim().toLowerCase();

/** Is this one of the five scopes this contract declares? */
export const isEvolutionScope = (value: string): value is EvolutionScope =>
  (EVOLUTION_SCOPES as readonly string[]).includes(normalizeScope(value));

// --- Evidence --------------------------------------------------------------------

/**
 * What a citation can point at — eight kinds, every one of them answerable.
 *
 * A signal, a lesson and a maturity area score all cite evidence, and the list is closed for the same reason
 * P2-D29's was: there is no member for an observation whose origin is unknown, and no member for "everybody
 * knows". An improvement domain is the easiest place in a platform for folklore to acquire a primary key —
 * somebody's strong opinion about why the timetable is bad becomes a signal, becomes an initiative, becomes a
 * lesson, and is quoted three years later as something the institution established. Requiring every one of
 * those steps to name a record that resolves is the only thing standing between institutional memory and
 * institutional rumour.
 *
 * `attested_return` is the deliberate escape hatch, and it is narrow on purpose: a judgement somebody made and
 * signed is admissible evidence, and much of what an institution learns genuinely arrives that way. What is not
 * admissible is a judgement nobody will put a name to, which is why the kind exists at all rather than being
 * left to an untyped free-text field that would have carried the same claims with none of the attribution.
 */
export const EVIDENCE_KINDS = [
  "domain_record",
  "attention_item",
  "decision_record",
  "forecast_run",
  "assessment_result",
  "audit_finding",
  "knowledge_assertion",
  "attested_return",
] as const;

/** The kind of record a citation resolves against. */
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** Is this a citable evidence kind? */
export const isEvidenceKind = (value: string): value is EvidenceKind =>
  (EVIDENCE_KINDS as readonly string[]).includes(value);

/** The one evidence kind that does not resolve to a record somebody else wrote, and so must name its attestor. */
export const ATTESTED_EVIDENCE_KIND: EvidenceKind = "attested_return";

// --- Signals ---------------------------------------------------------------------

/**
 * Where an improvement signal came from — eight sources, seven of which are another contract's output.
 *
 * This is the intake of the whole domain, and the shape of the list is an argument about what an improvement
 * programme should be made of. Six of these eight are things the platform *already knows*: an attention item
 * P2-D29 raised, a decision whose outcome P2-D27 recorded, a forecast P2-D28 missed, an audit finding, an
 * incident, an adoption review that did not go the way somebody promised. Institutions habitually run
 * improvement off the eighth alone — whatever came up in the meeting — and the result is an improvement
 * programme that works on what is most recently annoying rather than on what is most durably wrong.
 *
 * `stakeholder_feedback` is nonetheless first among equals rather than tolerated. The platform cannot observe a
 * parent's experience of the admissions process or a teacher's experience of the marking load, and a domain that
 * only accepted machine-visible sources would improve exactly the things that are easy to measure.
 */
export const SIGNAL_SOURCES = [
  "stakeholder_feedback",
  "incident",
  "audit_finding",
  "attention_item",
  "decision_outcome",
  "forecast_variance",
  "adoption_review",
  "operational_review",
] as const;

/** Where an improvement signal originated. */
export type SignalSource = (typeof SIGNAL_SOURCES)[number];

/** Is this a declared signal source? */
export const isSignalSource = (value: string): value is SignalSource =>
  (SIGNAL_SOURCES as readonly string[]).includes(value);

/**
 * What has happened to a signal — five states, and `accepted` is not one of the automatic ones.
 *
 * A raised signal is triaged, and triage has exactly three destinations: it becomes work (`accepted`), it joins
 * work already in flight (`merged`), or the institution decides not to act on it (`declined`). The fourth
 * outcome every real improvement queue actually has — nothing, forever — is not available here, because a signal
 * that sits untriaged is visibly untriaged rather than quietly resolved.
 *
 * `declined` carries a reason and stays readable. An institution that could delete the suggestions it did not
 * take would lose the most useful record in this domain: the one that shows what it kept being told and kept
 * choosing not to do, which is the pattern that explains most repeat findings.
 */
export const SIGNAL_STATUSES = ["raised", "triaged", "accepted", "merged", "declined"] as const;

/** The triage state of an improvement signal. */
export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

/** Is this a declared signal status? */
export const isSignalStatus = (value: string): value is SignalStatus =>
  (SIGNAL_STATUSES as readonly string[]).includes(value);

/** Signal statuses from which no further transition is legal. */
export const TERMINAL_SIGNAL_STATUSES: readonly SignalStatus[] = ["accepted", "merged", "declined"];

/** Is this signal state final? */
export const isTerminalSignalStatus = (status: SignalStatus): boolean =>
  TERMINAL_SIGNAL_STATUSES.includes(status);

/**
 * How much attention a signal is owed — three levels, derived rather than declared.
 *
 * Priority is computed by the intake engine from the source and from how many independent reports corroborate
 * it (see {@link file://./intake.ts}), and is deliberately not a field the raiser sets. Everybody's own signal
 * is urgent; a queue in which the raiser chooses the priority is a queue ordered by confidence rather than by
 * severity, and the quietest constituencies in a school lose that competition every time.
 */
export const SIGNAL_PRIORITIES = ["routine", "elevated", "urgent"] as const;

/** The derived priority of an improvement signal. */
export type SignalPriority = (typeof SIGNAL_PRIORITIES)[number];

/** Rank of a priority, ascending with urgency. Used for ordering queues, never for arithmetic. */
export const priorityRank = (priority: SignalPriority): number =>
  SIGNAL_PRIORITIES.indexOf(priority);

/** Independent corroborating reports needed before a signal is elevated above routine. */
export const MIN_CORROBORATION_FOR_ELEVATED = 2;

/** Independent corroborating reports needed before a signal is urgent whatever its source. */
export const MIN_CORROBORATION_FOR_URGENT = 4;

/**
 * Sources that start elevated on a single report, because one credible instance is already the pattern.
 *
 * An incident and an audit finding do not need corroborating: the institution has already established that the
 * thing happened, and waiting for it to happen twice before the improvement queue notices is the specific
 * failure mode that turns a near miss into a serious one.
 */
export const SELF_EVIDENT_SOURCES: readonly SignalSource[] = ["incident", "audit_finding"];

// --- Change classes --------------------------------------------------------------

/**
 * How far through the institution a proposed change reaches — four classes, ordered.
 *
 * This is the single most consequential declaration in the module, because {@link REQUIRED_DECIDERS} reads off
 * it: the class determines how many people must agree, so classifying a change is itself an act with governance
 * weight. A `clarification` writes down what everyone already does. A `process` changes how a thing is done
 * inside existing policy. A `policy` changes what the institution's rules say. A `structural` change alters what
 * the institution *is* — its roles, its reporting lines, what it offers.
 *
 * The classification is declared by the proposer and is not derivable, which is an honest limitation rather than
 * a gap: no arithmetic distinguishes a process tweak from a policy change, and a heuristic that tried would be
 * gamed within a term. What the contract does instead is make the class visible on the initiative, on every
 * decision, and on every event — so a structural change filed as a clarification is a thing a governor can see
 * rather than a thing they would have to reconstruct.
 */
export const CHANGE_CLASSES = ["clarification", "process", "policy", "structural"] as const;

/** How far through the institution a proposed change reaches. */
export type ChangeClass = (typeof CHANGE_CLASSES)[number];

/** Is this a declared change class? */
export const isChangeClass = (value: string): value is ChangeClass =>
  (CHANGE_CLASSES as readonly string[]).includes(value);

/** Rank of a change class, ascending with reach. */
export const changeClassRank = (changeClass: ChangeClass): number =>
  CHANGE_CLASSES.indexOf(changeClass);

/**
 * How many **distinct named people** must agree before a change of each class happens.
 *
 * This is *evolution always requires human governance*, expressed as the only thing that survives a busy term:
 * an integer the platform cannot lower and no tenant can configure. The smallest value is one, not zero. There
 * is no class of institutional change this platform will enact because a rule fired, a threshold was crossed, a
 * confidence interval narrowed or an agent concluded — and there is no code path to add one, because the map is
 * total over a closed union and every gate reads it.
 *
 * The escalation is proportional rather than uniform for a practical reason. A uniform requirement of one makes
 * structural change too easy; a uniform requirement of three makes clarifications so expensive that people stop
 * filing them, and an improvement programme nobody files into is worse than none, because it looks like the
 * institution has nothing to improve.
 *
 * Agreement is **unanimous among the deciders who actually recorded a verdict**, not a majority: a single
 * rejection settles the gate (see {@link file://./governance.ts}). Requiring three approvals and letting two
 * outvote a refusal would mean the third person's objection is on the record and had no effect, which is the
 * worst of both — the institution has documented that it was warned.
 */
export const REQUIRED_DECIDERS: Readonly<Record<ChangeClass, number>> = Object.freeze({
  clarification: 1,
  process: 1,
  policy: 2,
  structural: 3,
});

/** The fewest deciders any change class can require. Stated so a test can assert it is never zero. */
export const MIN_REQUIRED_DECIDERS = 1;

// --- Initiatives -----------------------------------------------------------------

/**
 * The lifecycle of a governed change — eight states.
 *
 * `draft → submitted → under_review → approved | rejected`, then `approved → piloting → adopted | withdrawn`.
 * The shape that matters is that there is no arrow into `approved` or `adopted` that does not pass a gate, and
 * both gates are crossed by people (see {@link GOVERNANCE_GATES}).
 *
 * `piloting` is between approval and adoption rather than optional, and it is where most of this domain's value
 * is. An institution that goes straight from "we agreed to do this" to "this is how we do things" never finds
 * out whether it worked, and — far more expensively — never builds the habit of asking. The pilot is what makes
 * {@link file://./realization.ts} have anything to compare.
 *
 * `adopted` is terminal, and the omission of a `reverted` state is deliberate rather than an oversight: a change
 * the institution decides to undo is a *new* initiative under the reversion gate, carrying its own proposal, its
 * own deciders and its own lesson. Flipping the original record back would erase the fact that the institution
 * once believed it — which is exactly the fact a later reader needs.
 */
export const INITIATIVE_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "piloting",
  "adopted",
  "withdrawn",
] as const;

/** The lifecycle state of an improvement initiative. */
export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number];

/** Is this a declared initiative status? */
export const isInitiativeStatus = (value: string): value is InitiativeStatus =>
  (INITIATIVE_STATUSES as readonly string[]).includes(value);

/** Initiative statuses from which no further transition is legal. */
export const TERMINAL_INITIATIVE_STATUSES: readonly InitiativeStatus[] = [
  "rejected",
  "adopted",
  "withdrawn",
];

/** Is this initiative state final? */
export const isTerminalInitiativeStatus = (status: InitiativeStatus): boolean =>
  TERMINAL_INITIATIVE_STATUSES.includes(status);

/** The fewest whole cycle periods an initiative must pilot for before adoption can be argued. */
export const MIN_PILOT_PERIODS = 1;

// --- Governance gates ------------------------------------------------------------

/**
 * The four points at which only a human decision moves the record.
 *
 * Each names a moment the institution is about to do something differently, and they are exhaustive by
 * construction — every transition the lifecycle engine marks as gated maps to one of these, and a transition
 * with no gate is one that changes no facts about the institution (opening a review, drafting, withdrawing your
 * own proposal).
 *
 * `approval` is the obvious one. `pilot_exit` is the one institutions skip: deciding that a trial justified
 * becoming permanent is a separate judgement from deciding it was worth trying, and collapsing the two is how
 * pilots become permanent by exhaustion. `reversion` gates undoing an adopted change, because reversal is a
 * change like any other and an institution that can quietly stop doing what it agreed to do has no policy, only
 * a mood. `cycle_closure` gates declaring an improvement period finished, which is the moment its lessons become
 * the institution's account of itself.
 */
export const GOVERNANCE_GATES = ["approval", "pilot_exit", "reversion", "cycle_closure"] as const;

/** A point in the lifecycle that only a human decision moves past. */
export type GovernanceGate = (typeof GOVERNANCE_GATES)[number];

/** Is this a declared governance gate? */
export const isGovernanceGate = (value: string): value is GovernanceGate =>
  (GOVERNANCE_GATES as readonly string[]).includes(value);

/**
 * What a decider concluded — four verdicts.
 *
 * `approved_with_conditions` is the one that earns its place. Real governance rarely says yes or no; it says yes
 * provided the safeguarding lead signs off, or provided it is reviewed at the end of term. Without the verdict
 * those conditions become an email, and the change proceeds while the condition is forgotten — so the verdict
 * exists precisely so that the conditions become data the adoption gate can be made to check.
 *
 * `deferred` is not an absence of a decision. It is a decider recording that they will not decide yet and why,
 * which is a different fact from having never been asked, and the difference matters when somebody later asks
 * why an initiative sat for two terms.
 */
export const DECISION_VERDICTS = [
  "approved",
  "approved_with_conditions",
  "rejected",
  "deferred",
] as const;

/** A single decider's conclusion at a gate. */
export type DecisionVerdict = (typeof DECISION_VERDICTS)[number];

/** Is this a declared decision verdict? */
export const isDecisionVerdict = (value: string): value is DecisionVerdict =>
  (DECISION_VERDICTS as readonly string[]).includes(value);

/** The verdicts that count toward satisfying a gate's decider requirement. */
export const AFFIRMATIVE_VERDICTS: readonly DecisionVerdict[] = [
  "approved",
  "approved_with_conditions",
];

/** Does this verdict count toward the required number of agreeing deciders? */
export const isAffirmativeVerdict = (verdict: DecisionVerdict): boolean =>
  AFFIRMATIVE_VERDICTS.includes(verdict);

/** How a gate currently stands, once every recorded decision has been read. */
export const GATE_OUTCOMES = ["pending", "satisfied", "refused"] as const;

/** The standing of a governance gate. */
export type GateOutcome = (typeof GATE_OUTCOMES)[number];

/** Longest accepted rationale on a decision. Long enough to reason, short enough that nobody attaches a report. */
export const MAX_RATIONALE_LENGTH = 2000;

/** Shortest accepted rationale. A decision with no stated reason is a signature, and this contract wants both. */
export const MIN_RATIONALE_LENGTH = 10;

/** Most conditions a single decision may attach. Beyond this the decider is drafting the initiative, not judging it. */
export const MAX_DECISION_CONDITIONS = 10;

// --- Lessons ---------------------------------------------------------------------

/**
 * What kind of thing was learned — six categories.
 *
 * Deliberately coarse. A taxonomy fine enough to be interesting is a taxonomy nobody applies consistently, and
 * an inconsistently applied category is worse than a coarse one because it looks searchable. Six is the number
 * at which a person choosing under time pressure still picks the same one twice.
 */
export const LESSON_CATEGORIES = [
  "practice",
  "process",
  "policy",
  "capability",
  "risk",
  "stakeholder",
] as const;

/** What kind of thing a lesson is about. */
export type LessonCategory = (typeof LESSON_CATEGORIES)[number];

/** Is this a declared lesson category? */
export const isLessonCategory = (value: string): value is LessonCategory =>
  (LESSON_CATEGORIES as readonly string[]).includes(value);

/**
 * What produced a lesson — five origins, every one of them an event the institution can point at.
 *
 * There is no `observation` and no `insight`. A lesson in this domain is downstream of something that
 * *happened*: an initiative concluded, an adoption review found what it found, a cycle was reviewed, an incident
 * was examined, a decision was revisited. The restriction is what stops the lesson store from becoming a
 * suggestion box with better typography.
 */
export const LESSON_ORIGINS = [
  "initiative_outcome",
  "adoption_review",
  "cycle_retrospective",
  "incident_review",
  "decision_review",
] as const;

/** What produced a lesson. */
export type LessonOrigin = (typeof LESSON_ORIGINS)[number];

/** Is this a declared lesson origin? */
export const isLessonOrigin = (value: string): value is LessonOrigin =>
  (LESSON_ORIGINS as readonly string[]).includes(value);

/**
 * Whether a lesson has actually reached institutional memory — three states, and this is the contract's first
 * clause with a type.
 *
 * A lesson is born `provisional`. It becomes `retained` when, and only when, a memory commitment resolves
 * against the institutional knowledge graph (P2-D25) — not when it is written, not when it is reviewed, not when
 * somebody marks it done. `superseded` is what a later lesson does to an earlier one it corrects, and the
 * earlier one stays readable, because the fact that the institution once concluded the opposite is part of what
 * it knows.
 *
 * Everything in this domain is arranged so that `provisional` is uncomfortable. It is on the lesson, on the
 * cycle that produced it, on the events, and it is what {@link file://./lineage.ts} reports as a broken chain.
 * The reason for the discomfort is that *provisional* is the true state of almost every lesson every institution
 * has ever recorded, and a system that let it be the quiet default would be an accurate model of the problem
 * rather than an intervention in it.
 */
export const LESSON_RETENTIONS = ["provisional", "retained", "superseded"] as const;

/** Whether a lesson has reached institutional memory. */
export type LessonRetention = (typeof LESSON_RETENTIONS)[number];

/** Is this a declared retention state? */
export const isLessonRetention = (value: string): value is LessonRetention =>
  (LESSON_RETENTIONS as readonly string[]).includes(value);

/** The retention state a lesson holds until its memory commitment resolves. */
export const INITIAL_LESSON_RETENTION: LessonRetention = "provisional";

/**
 * Whole periods after which a retained lesson is due for review.
 *
 * Not an expiry. A lesson does not stop being true because time passed, and nothing here deletes or demotes one.
 * What the constant drives is a derived `reviewDue` flag: an institution whose retained lessons are all four
 * years old has not become wise, it has stopped looking, and that is a condition worth surfacing without
 * pretending the lessons themselves have decayed.
 */
export const LESSON_REVIEW_PERIODS = 8;

/** Longest accepted lesson statement. A lesson that needs more than this is a report with a lesson in it. */
export const MAX_LESSON_STATEMENT_LENGTH = 1000;

/** Shortest accepted lesson statement. */
export const MIN_LESSON_STATEMENT_LENGTH = 20;

/** Most capability areas a single lesson may declare itself applicable to. */
export const MAX_LESSON_APPLICABILITY = 5;

// --- Improvement cycles ----------------------------------------------------------

/**
 * The stages of an improvement cycle — five.
 *
 * `planning → executing → reviewing → closed`, with `abandoned` reachable from anything before `closed`. The
 * separation of `reviewing` from `closed` is the load-bearing one: review is where the cycle's lessons are
 * written, and closure is a gate (see {@link GOVERNANCE_GATES}) that a human crosses once they exist. A cycle
 * that could close directly from `executing` would be a cycle that produced no lessons, which is the normal
 * outcome of every improvement programme that has ever quietly stopped.
 *
 * `abandoned` is available and honest. Cycles are abandoned — a head leaves, a priority changes, an inspection
 * lands — and a domain that only modelled successful cycles would have its most instructive records forced into
 * `closed`.
 */
export const CYCLE_STAGES = ["planning", "executing", "reviewing", "closed", "abandoned"] as const;

/** The stage of an improvement cycle. */
export type CycleStage = (typeof CYCLE_STAGES)[number];

/** Is this a declared cycle stage? */
export const isCycleStage = (value: string): value is CycleStage =>
  (CYCLE_STAGES as readonly string[]).includes(value);

/** Cycle stages from which no further transition is legal. */
export const TERMINAL_CYCLE_STAGES: readonly CycleStage[] = ["closed", "abandoned"];

/** Is this cycle stage final? */
export const isTerminalCycleStage = (stage: CycleStage): boolean =>
  TERMINAL_CYCLE_STAGES.includes(stage);

/** The fewest lessons a cycle must have produced before it is eligible to close. */
export const MIN_LESSONS_FOR_CLOSURE = 1;

// --- Capability areas & maturity -------------------------------------------------

/**
 * The ten capability areas an institution's maturity is assessed across — closed, fixed at the platform.
 *
 * These are deliberately *capabilities* rather than outcomes, which is what distinguishes them from P2-D29's ten
 * health pillars. A health pillar asks how the institution is doing; a capability area asks how well it is able
 * to do it, and the two come apart constantly — a school can have excellent attendance because of one
 * extraordinary person and no attendance *capability* at all, and the year that person leaves is the year it
 * finds out. That gap is precisely what an improvement programme exists to close, so it needs its own axis.
 *
 * The set is not per-tenant, for the reason the health pillars are not: an institution chooses how much each
 * area weighs and what evidence it offers, but it does not get to decide that safeguarding capability is not
 * part of its maturity. A tenant-extensible set would also make an institution's own history incomparable with
 * itself the first time an area was added — the score would move because the question changed, and nothing on
 * the record would say so.
 *
 * `continuous_improvement` is the tenth and it assesses this domain itself: how good the institution is at
 * learning. An improvement programme that never scored its own capability would be the only part of the
 * institution exempt from the standard it applies to everything else.
 */
export const CAPABILITY_AREAS = [
  "governance_and_leadership",
  "academic_practice",
  "learner_support",
  "staff_capability",
  "operational_process",
  "financial_stewardship",
  "data_and_information",
  "safeguarding_and_compliance",
  "stakeholder_engagement",
  "continuous_improvement",
] as const;

/** One of the ten capability areas institutional maturity is assessed across. */
export type CapabilityArea = (typeof CAPABILITY_AREAS)[number];

/** Is this a declared capability area? */
export const isCapabilityArea = (value: string): value is CapabilityArea =>
  (CAPABILITY_AREAS as readonly string[]).includes(value);

/** How many capability areas there are. Fixed at ten; asserted in tests so a silent addition cannot pass. */
export const CAPABILITY_AREA_COUNT = CAPABILITY_AREAS.length;

/**
 * The five maturity levels, ascending.
 *
 * A conventional ladder, and conventional on purpose: this is the one vocabulary in the contract that an
 * institution will be asked to explain to an inspector, a trust board or a prospective parent, and inventing a
 * private five-point scale would make every such conversation start from scratch.
 *
 * The levels are ordinal, not cardinal, and the distinction is enforced rather than noted. {@link levelRank}
 * exists for ordering and comparison; the arithmetic in {@link file://./maturity.ts} runs on the declared
 * numeric scores an assessor gives, and never on the position of a word in this array.
 */
export const MATURITY_LEVELS = [
  "initial",
  "developing",
  "defined",
  "managed",
  "optimizing",
] as const;

/** A capability maturity level. */
export type MaturityLevel = (typeof MATURITY_LEVELS)[number];

/** Is this a declared maturity level? */
export const isMaturityLevel = (value: string): value is MaturityLevel =>
  (MATURITY_LEVELS as readonly string[]).includes(value);

/** Rank of a maturity level, ascending. `initial` is 0. */
export const levelRank = (level: MaturityLevel): number => MATURITY_LEVELS.indexOf(level);

/** The lowest score on the maturity scale. */
export const MIN_MATURITY_SCORE = 1;

/** The highest score on the maturity scale. */
export const MAX_MATURITY_SCORE = 5;

/**
 * The score at or above which each level is reached.
 *
 * Floors are inclusive, so a score sitting exactly on a boundary takes the higher level — an assessor who wrote
 * 3 meant `defined`, and a boundary reading the other way would put every whole number one level below where its
 * author put it.
 */
export const LEVEL_FLOORS: Readonly<Record<MaturityLevel, number>> = Object.freeze({
  initial: 1,
  developing: 2,
  defined: 3,
  managed: 4,
  optimizing: 5,
});

/**
 * The fraction of the ten capability areas that must have reported before a maturity assessment can be
 * published.
 *
 * A single platform constant, not a tenant setting, and nothing in this package can lower it. The classic abuse
 * of a maturity score is a confident headline resting on the three areas that happened to have evidence to hand,
 * and the only defence that survives a busy term is arithmetic that refuses rather than a footnote nobody opens.
 * An under-covered assessment is still computed and still readable — suppressing it would push people back to
 * spreadsheets — but it stays provisional and cannot be the number anybody quotes.
 */
export const MIN_AREA_COVERAGE = 0.7;

/** The fewest pieces of evidence an area's score must cite before the area counts as having reported. */
export const MIN_EVIDENCE_PER_AREA = 1;

/** Decimal places at which derived maturity values are rounded, so a reassessment is checkable against its prior. */
export const MATURITY_PRECISION = 2;

/** Decimal places at which declared area weights are rounded. */
export const WEIGHT_PRECISION = 4;

/** The least any capability area may weigh. Below this the area is present in name only. */
export const MIN_AREA_WEIGHT = 0.01;

/** The most any capability area may weigh. Caps any single capability below a majority of the score. */
export const MAX_AREA_WEIGHT = 0.5;

/** The sum declared area weights must reach, within {@link WEIGHT_TOLERANCE}. */
export const WEIGHT_SUM = 1;

/** How far a declared weight set may sum from {@link WEIGHT_SUM} — a rounding allowance, not a licence. */
export const WEIGHT_TOLERANCE = 1e-6;

// --- Benefit realization ---------------------------------------------------------

/** Which way a benefit is expected to move the measure it names. */
export const BENEFIT_DIRECTIONS = ["increase", "decrease"] as const;

/** The direction in which an initiative expects to move its measure. */
export type BenefitDirection = (typeof BENEFIT_DIRECTIONS)[number];

/** Is this a declared benefit direction? */
export const isBenefitDirection = (value: string): value is BenefitDirection =>
  (BENEFIT_DIRECTIONS as readonly string[]).includes(value);

/**
 * How an observed outcome compared with what was promised — four bands.
 *
 * Banded rather than reported as a bare percentage because the number on its own invites the wrong conversation.
 * "We achieved 82% of the projected improvement" is an argument; `shortfall` is a finding, and the point of an
 * adoption review is to produce findings that an institution acts on rather than percentages it negotiates with.
 */
export const VARIANCE_BANDS = ["exceeded", "met", "shortfall", "missed"] as const;

/** How an observed outcome compared with the expected benefit. */
export type VarianceBand = (typeof VARIANCE_BANDS)[number];

/** Is this a declared variance band? */
export const isVarianceBand = (value: string): value is VarianceBand =>
  (VARIANCE_BANDS as readonly string[]).includes(value);

/**
 * The fraction of the promised improvement at or above which each band is reached.
 *
 * `met` sits at 0.9 rather than 1.0 deliberately: an initiative that delivered ninety per cent of a forecast
 * benefit worked, and a scheme that called that a shortfall would teach everybody to promise less. `missed` has
 * no floor — it is where everything below `shortfall` lands, including negative realization, because an
 * initiative that moved the measure the wrong way and one that did nothing both need the same conversation.
 */
export const VARIANCE_FLOORS: Readonly<Record<Exclude<VarianceBand, "missed">, number>> =
  Object.freeze({
    exceeded: 1.1,
    met: 0.9,
    shortfall: 0.5,
  });

/**
 * What an adoption review concluded should happen next — four verdicts.
 *
 * `revert` does not itself revert anything. It is a recommendation that becomes an initiative under the
 * reversion gate, with its own deciders, because undoing a change the institution agreed to is a change the
 * institution has to agree to. A review that could reverse an adoption directly would be the one place in this
 * contract where something happened to the institution without anybody deciding it should.
 */
export const REALIZATION_VERDICTS = ["sustained", "adjust", "revert", "inconclusive"] as const;

/** What an adoption review concluded should happen next. */
export type RealizationVerdict = (typeof REALIZATION_VERDICTS)[number];

/** Is this a declared realization verdict? */
export const isRealizationVerdict = (value: string): value is RealizationVerdict =>
  (REALIZATION_VERDICTS as readonly string[]).includes(value);

// --- Periods ---------------------------------------------------------------------

/**
 * The lowest legal period index.
 *
 * A period is an integer index into a grid the caller defines — a term, a half-term, a year — and this package
 * holds no clock and no calendar. That is what makes a maturity assessment reproduce exactly and a lesson's
 * review-due date decidable without asking what today is. Which grid a tenant uses is the caller's business;
 * that periods are ordered and countable is this package's.
 */
export const MIN_PERIOD = 0;

/** The highest legal period index. Far beyond any institution's horizon; present so the column has a bound. */
export const MAX_PERIOD = 1_000_000;

/** Is this a usable period index? */
export const isValidPeriod = (period: number): boolean =>
  Number.isSafeInteger(period) && period >= MIN_PERIOD && period <= MAX_PERIOD;

// --- Numeric helpers -------------------------------------------------------------

/** Is this a number arithmetic can be trusted with? Excludes `NaN` and both infinities. */
export const isFiniteMeasure = (value: number): boolean => Number.isFinite(value);

/**
 * Move a number's decimal point by shifting its base-ten exponent rather than multiplying by a power of ten.
 *
 * The multiplication is what a rounding helper normally does and it is wrong at exactly the values people
 * notice: `1.005 * 100` is `100.49999999999999`, so the obvious implementation rounds an assessor's 1.005 down
 * to 1.00 and reports a score nobody entered. Shifting the exponent of the decimal literal avoids introducing
 * the error in the first place.
 */
const shiftExponent = (value: number, by: number): number => {
  const parts = value.toExponential().split("e");
  const mantissa = parts[0] ?? "0";
  const exponent = Number(parts[1] ?? "0");
  return Number(`${mantissa}e${exponent + by}`);
};

/**
 * Round to a fixed number of decimal places, away from zero at the midpoint, without floating-point drift.
 *
 * Rounding runs on the magnitude and the sign is reapplied, which is what makes the midpoint resolve away from
 * zero symmetrically rather than toward positive infinity. Non-finite input rounds to zero rather than
 * propagating, which is what lets {@link clampMaturityScore} floor it; and a rounded zero is normalized to
 * positive zero, so a reassessment that moved a score by nothing serializes identically whichever side of zero
 * the unrounded delta fell on.
 */
const roundTo = (value: number, precision: number): number => {
  if (!isFiniteMeasure(value)) return 0;
  const magnitude = shiftExponent(
    Math.round(shiftExponent(Math.abs(value), precision)),
    -precision,
  );
  const signed = value < 0 ? -magnitude : magnitude;
  return signed === 0 ? 0 : signed;
};

/** Round a derived maturity value to {@link MATURITY_PRECISION} places. */
export const roundMaturity = (value: number): number => roundTo(value, MATURITY_PRECISION);

/** Round a declared area weight to {@link WEIGHT_PRECISION} places. */
export const roundWeight = (value: number): number => roundTo(value, WEIGHT_PRECISION);

/** Clamp a score onto the maturity scale. Non-finite scores floor rather than ceiling — see the banding engine. */
export const clampMaturityScore = (score: number): number => {
  if (!isFiniteMeasure(score)) return MIN_MATURITY_SCORE;
  if (score < MIN_MATURITY_SCORE) return MIN_MATURITY_SCORE;
  if (score > MAX_MATURITY_SCORE) return MAX_MATURITY_SCORE;
  return score;
};
