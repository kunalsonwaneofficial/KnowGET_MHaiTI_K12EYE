# 49. Platform Evolution: one package, seven aggregates, eight pure engines, a quorum of distinct named people that nothing can route around, a lesson that stays uncomfortable until institutional memory says otherwise, a target stated before it is measured, and a recommendation to revert that reverts nothing

- **Status:** Accepted
- **Date:** 2026-12-31
- **Contract:** P2-D30 (Platform Evolution, Institutional Learning & Continuous Improvement)

## Context

P2-D30 is **the sixth and final contract of Program E — the intelligence core** (D25–D30), and the last of
Phase 2's thirty-six. It stands on the certified `v0.2.0` baseline, the frozen Phase-1 core, the full
operational base **D01–D24**, the **Institutional Knowledge Graph (P2-D25)**, the **Enterprise AI Operating
System (P2-D26)**, **Institutional Decision Intelligence (P2-D27)**, **Predictive Intelligence (P2-D28)** and
**Executive Intelligence (P2-D29)**. Every one of those contracts made the institution better at knowing
something. This one is about the institution changing itself, and about what it keeps from having done so.

The platform now records what happened, decides what to do, projects what is coming and reports how things
stand. What it has never had is an answer to the question that follows every one of those: _and then what?_ An
attention item is raised and somebody deals with it, and eighteen months later nobody can say whether the thing
that was done worked, whether the same problem has been solved four times by four people who never spoke, or
whether the institution is measurably better at anything than it was. Improvement in most institutions is real,
constant, and almost entirely unrecorded — it lives in the memory of whoever was in the room, and it leaves
when they do.

One rule defines the contract:

> **Lessons feed institutional memory; evolution always requires human governance.**

And it sits under the through-line that has governed all six Program E contracts:

> **AI recommends with evidence; humans approve; nothing self-modifies or self-deploys.**

The two sentences are the same sentence at different scopes, and this is the contract where the second one is
tested for real. D26 gated an agent's tool calls, D27 gated an automated act, D28 refused to let a projection
become a plan. All three were about the platform not doing something to the institution. This contract is
about the institution changing _itself_ — its practices, its policies, its structures — and the platform's job
is to make sure that when it does, a named human being agreed, in writing, with a reason, and that what
followed was measured against what was promised.

The design problem here is **self-congratulation**. Every other domain in the platform is checked by
something: an attendance figure is wrong in front of a teacher, a fee balance is wrong in front of a parent, a
forecast is wrong when the term ends. An improvement programme is checked by nobody, because the only evidence
it produces is its own paperwork. A domain built carelessly here would let an institution generate a complete,
auditable, entirely sincere record of continuous improvement in which nothing improved — signals raised and
triaged, initiatives proposed and approved, cycles opened and closed, lessons recorded, a maturity score
climbing every year — with no point anywhere in the chain at which the institution was obliged to find out
whether any of it worked. That artifact is worse than no artifact, because it is quotable.

So the contract's two clauses are engineered as **structure rather than as procedure**. Governance is a count
of distinct named people that the engine has no parameter to skip. A lesson's arrival in institutional memory
is a fact read off the knowledge graph rather than a status somebody set. A benefit is claimed before it is
measured, so a target cannot be written once the answer is known. A verdict of `revert` is a recommendation and
never an act. And the lineage engine exists to answer, for any one thing the institution believes it learned,
the only question that matters: **where does the account actually stop?**

Nothing in `@knowget/platform-evolution` imports Prisma, NestJS, an HTTP client, a model runtime, a provider
SDK or `fetch`; its only dependencies are `@knowget/types`, `@knowget/shared`, `@knowget/exceptions` and
`@knowget/events`. Two absences carry weight. **There is no clock**: a period is an integer ordinal on a grid
the caller defines, elapsed time is a distance between two of them, and no arithmetic here consults the date it
runs on. **And nothing in this package changes anything outside it** — it does not deploy, configure, migrate,
enable, disable or edit any other domain; it records what the institution decided to change about itself and
what happened next. As with every domain here, the design **begins with the pure engines**.

## Decision

1. **Eight pure engines are the computational core, built and tested first.** The **intake engine**
   (`inspectEvidence`, `derivePriority`, `inspectProgression`) decides whether a signal is admissible, how
   urgent corroboration has made it, and which status moves are legal. The **governance engine**
   (`requiredDeciders`, `isGateSettled`, `evaluateGate`, `MIN_DECIDERS_FOR_REVERSION`) is the contract's second
   clause and the module the whole domain rests on. The **lifecycle engine** (`requiredInitiativeGate`,
   `inspectAdvance`) says which gate stands in front of which transition. The **cadence engine** (`inspectSpan`,
   `elapsedPeriods`, `requiredCycleGate`, `inspectStageChange`) is improvement cycles without a calendar. The
   **learning engine** (`inspectLesson`, `inspectRetentionChange`, `reviewStanding`) is the contract's first
   clause. The **lineage engine** (`LINEAGE_STAGES`, `lineageStageRank`, `traceLineage`) is the audit the other
   seven make possible. The **maturity engine** (`inspectWeighting`, `levelForScore`, `assessMaturity`) is
   capability measured rather than asserted. The **realization engine** (`varianceBandRank`, `measureBenefit`,
   `recommendVerdict`) is the only place that asks whether any of it worked.

2. **A gate is a count of distinct named people, and nothing in the package can lower it.**
   `REQUIRED_DECIDERS` is a frozen total map over the four change classes — `clarification: 1`, `process: 1`,
   `policy: 2`, `structural: 3` — floored at `MIN_REQUIRED_DECIDERS` (1) rather than trusted, so no arrangement
   of inputs produces a gate that opens on nobody's agreement. There is no configuration, no override, and no
   parameter that could carry the message that this particular change is urgent enough to skip the count. The
   engine cannot be told to hurry, because the type has no field for it.

3. **The proposer's ballot is discarded before anything is counted, in both directions.** Their approval does
   not help them and their rejection does not stop them — a proposer who has changed their mind withdraws the
   initiative rather than voting it down. A gate assembled with no recorded proposer can **never be satisfied**
   (`unattributed_proposal`), because that is not a gate with a missing field; it is a gate with its safeguard
   switched off.

4. **The decider comes from the authenticated principal and is never a body field.** A gate clears on a count
   of distinct _people_, so a body-supplied decider would let one caller holding `evolution:govern` clear a
   three-decider structural gate by naming two colleagues — and the person directory cannot catch it, because
   the colleagues exist. The proposer still travels in the body, because the proposer-may-not-decide rule needs
   to know who put the change forward and that is usually not the person convening the gate.

5. **A person speaks once at a gate, and one refusal settles it.** A second ballot from somebody already
   counted is recorded as `repeat_ballot` and changes nothing — last-vote-wins would make the outcome depend on
   the order ballots arrived in and let a gate be re-run until the number came out right. A single `rejected`
   verdict refuses the gate however many affirmations sit opposite it: an institution whose governance let a
   majority overrule a refusal would be manufacturing the one record nobody ever wants to be shown. A decider
   who does not want to block but is not ready to agree has `deferred`, which leaves the gate open and costs
   nothing.

6. **Every ballot carries a compulsory rationale, including an approval.** Requiring a reason for yes is the
   whole difference between a decision record and a tally: an approval nobody had to explain is
   indistinguishable, a year later, from an approval nobody thought about.

7. **Reversion is floored higher than the change that introduced it.** `MIN_DECIDERS_FOR_REVERSION` is 2, so
   undoing even a clarification takes two people where introducing it took one. The asymmetry is deliberate:
   adopting a clarification affects a practice nobody has adapted to yet, while reverting one nine months later
   unpicks work everybody has since built on, retrained around and cited in their own decisions. A single
   person able to undo a change on the same authority that introduced it gives an institution a governance
   system that oscillates, each post-holder reversing their predecessor, every reversal fully documented, and
   nothing ever settling long enough to be evaluated.

8. **There is no `reverted` initiative status, and the absence is the design.** The eight statuses are
   `draft → submitted → under_review → approved | rejected` and `approved → piloting → adopted | withdrawn`.
   Reverting an adopted change is a **new initiative** carrying its own evidence, facing the reversion gate,
   with both records left standing. A `reverted` terminal state would let an institution erase a decision by
   relabelling it, and would lose the thing worth keeping — that the institution once believed this, on this
   evidence, with these people's agreement.

9. **The change class is read off the initiative, never believed from the body.** For the three initiative
   gates the service resolves the class from the stored aggregate, so a caller cannot lower the quorum by
   declaring a structural change a clarification on the way in. `change_class` and `proposed_by` are **copied
   onto the gate at convocation** rather than joined at read, so a gate's own record still says what it was
   convened under even if the initiative is later reclassified.

10. **A lesson is `provisional` until institutional memory says otherwise, and the discomfort is the point.**
    `INITIAL_LESSON_RETENTION` is `provisional`, and the only route to `retained` runs through
    `InstitutionalMemoryDirectory.commitmentResolved` — a fact read off the **P2-D25 knowledge graph** by lesson
    key, not a status a service sets. `commitment_unresolved` is the ordinary refusal at the end of every
    retrospective anybody has ever run, and the remedy is not to retry but to commit the lesson to the graph. A
    `provisional` lesson cannot be superseded, because that would hand every institution a tidy way to clear its
    unfinished records without a single commitment having resolved. There is no route out of `superseded`
    either: a lesson the institution has moved past stays readable exactly as it was, because the fact that it
    once believed something else is part of what it knows.

11. **A signal's priority is derived from corroboration, never declared.** `MIN_CORROBORATION_FOR_ELEVATED` (2)
    and `MIN_CORROBORATION_FOR_URGENT` (4) turn independent accounts into urgency, so the loudest filer does not
    outrank the most widely observed problem. Anonymous filing is supported and `raised_by` is legitimately NULL
    — an institution whose safeguarding, culture or leadership signals can only be raised with a name attached
    collects a filtered set — but an anonymous signal **cannot corroborate**, because a corroboration whose
    author cannot be counted is a way to manufacture urgency from one keyboard. A declined signal's key stays
    taken, so a problem raised again arrives at a key that already carries what the institution decided last
    time; there is deliberately no browsable list of everything anybody ever turned down.

12. **Improvement cycles hold no calendar and close only through a gate.** Periods are integer ordinals bounded
    by `MIN_PERIOD` (0) and `MAX_PERIOD` (1,000,000) on a grid the caller defines, so the same domain serves a
    termly, monthly or annual cadence without the platform having an opinion. `MIN_LESSONS_FOR_CLOSURE` is 1: a
    cycle that produced nothing anybody learned is **abandoned**, not closed, and the two words stay different
    on the record. `cycle_closure` is a real governance gate for the same reason — declaring a cycle of
    institutional improvement complete is a claim about the institution, not an administrative tidy-up.

13. **Maturity is scored over ten closed capability areas, and coverage travels with the score.**
    `CAPABILITY_AREAS` is closed at ten and shared by every assessment in every tenant, so two institutions'
    maturity indices mean the same thing and an institution's own history stays comparable with itself. Weights
    are bounded on both sides (`MIN_AREA_WEIGHT` 0.01, `MAX_AREA_WEIGHT` 0.5), must sum to `WEIGHT_SUM` 1 within
    `WEIGHT_TOLERANCE` 1e-6, and `MIN_AREA_COVERAGE` 0.7 with `MIN_EVIDENCE_PER_AREA` 1 floors how much of the
    institution a published index may have looked at. `LEVEL_FLOORS` maps score to the five-level vocabulary by
    **inclusive floor** — an area rated exactly 3.0 is `defined`, with no rounding argument available.

14. **A benefit is claimed before it is observed, and that ordering is the whole epistemic content of a
    review.** `claim` states measure, direction, baseline and target; `observe` records what it came to, and is
    admissible only against a benefit that was claimed first. A target written after the result is known is not
    a test. Benefits claimed and never measured stay on the record beside the ones that were — hence the
    separate `benefits_claimed` and `benefits_measured` counts — because a change that promised six improvements
    and could evidence one has not been shown to work. `VARIANCE_FLOORS` band the outcome at 1.1 / 0.9 / 0.5
    (`exceeded` / `met` / `shortfall`, with `missed` needing no floor), and the review's verdict is derived from
    the **worst** band rather than the average, because a change that met five targets and missed the one it was
    justified by has missed.

15. **A review is identified by `(tenant, initiative, period)`, and `revert` reverts nothing.** Reviewing at one
    period and again at four is the normal shape of benefits realization and early movement that decayed is a
    finding; a _second_ review at the same distance is refused by a database unique, because that is how an
    unwelcome verdict gets asked again until it comes out differently. `REALIZATION_VERDICTS` are `sustained`,
    `adjust`, `revert` and `inconclusive`, and `revert` is a **recommendation with a name against it** — acting
    on it means opening a reversion gate, which is a decision two people make.

16. **The lineage engine answers where the account stops.** `LINEAGE_STAGES` is a frozen ascending ladder —
    `unrecorded → evidence → signal → decision → outcome → memory` — and `traceLineage` returns the highest rung
    a claim actually reaches together with the gap that stopped it (`signal_without_evidence`, `no_signal`,
    `signal_not_taken_up`, `gate_unsettled`, `no_settled_gate`, `initiative_in_flight`, `no_lesson`,
    `lesson_provisional`). This is the engine that makes the domain falsifiable: an improvement programme is
    exactly as good as the proportion of its claims that reach `memory`, and a chain that stops at `signal` is
    an institution that noticed something and did nothing.

17. **Four directory ports, and no domain→domain package import** (ADR-0010). `OrganizationDirectory` and
    `PersonDirectory` anchor the tenant's structure and its named people. `EvidenceRecordDirectory` resolves the
    eight `EVIDENCE_KINDS` against their owning domains, with `attested_return` the only kind requiring a named
    attestor — a figure somebody typed is admissible, and anonymously typed is not.
    `InstitutionalMemoryDirectory` asks the P2-D25 graph, **by lesson key**, whether a commitment resolved,
    keeping the graph's addressing scheme out of this schema and letting a commitment made later by a different
    route still resolve for the lesson it was about.

18. **Five scopes gate 66 endpoints across seven controllers, and `evolution:govern` stands alone.**
    `evolution:read` is every read and is deliberately wide, because an institution that cannot look at what it
    is changing about itself has no governance to speak of. `evolution:contribute` — raising, corroborating,
    proposing, restating, recording a lesson — is the widest write scope on purpose, since a platform where only
    administrators may say something is wrong collects the observations of administrators. `evolution:manage` is
    the work of running the programme and none of it is consent. `evolution:assess` is separated because a
    maturity index is the number the institution will be judged by, and its coverage and weighting rules are
    worth nothing if whoever runs the backlog can also decide what the institution scored. `evolution:govern` is
    the scope of **consent** — convoking, balloting, approving, rejecting, adopting, closing a cycle — and no
    other scope implies it: every other scope in the platform governs what a person may _do_, and this one
    governs what the institution may _become_.

19. **Seven FORCE-RLS tables, one partial unique that holds a rule, and no soft deletes anywhere.**
    `improvement_signal`, `improvement_initiative`, `governance_decision`, `lesson`, `improvement_cycle`,
    `maturity_assessment` and `adoption_review` each `ENABLE` + `FORCE ROW LEVEL SECURITY` under one
    `tenant_isolation` policy (USING + WITH CHECK, fail-closed). Five absolute uniques are DB-backed, plus
    **`governance_decision_open_gate_key ON (tenant_id, initiative_id, gate) WHERE outcome = 'pending'`** — one
    open gate at a time per change, held by Postgres, so a second gate cannot be convoked beside an unsettled
    one and answered by a friendlier set of people. `governance_decision.initiative_id` is a deliberate
    polymorphic reference with **no FK** (an initiative at approval, pilot exit and reversion; a cycle at
    closure). **No table carries a `deleted_at` column and no repository declares a delete**, because every
    aggregate here is a record of what was noticed, proposed, decided, learned, run, assessed or found.

20. **Thirty-one `evolution.*` events, all value-, prose- and PII-free.** Signals, initiatives, gates, lessons,
    cycles, assessments and reviews announce that something happened and to what; no rationale, no lesson
    statement, no maturity score and no benefit figure travels on the bus. A rationale on an event is the
    governance record leaking into a channel with different retention and different readers, and a score on an
    event is a number detached from the coverage that qualifies it.

## Consequences

- **The platform can now say whether it is getting better, and can be shown not to be.** The lineage ladder is
  a deliberately unflattering instrument: it will report, accurately, that most of an institution's first-year
  improvement claims stop at `signal`. That is the intended result. A domain that could not produce that
  finding would be the self-congratulation machine this contract was written to avoid.
- **Governance is slower, and the slowness is the product.** A structural change needs three distinct people
  who are not its proposer, each with a written reason, and there is no expedited path. Institutions under
  pressure will feel this, and the alternative — an override that exists for emergencies — is the field that
  every subsequent change becomes an emergency in order to use.
- **`provisional` is the resting state of most lessons, and that will look like a backlog.** It is not one. A
  lesson that has not reached the knowledge graph has not entered institutional memory, and showing it as
  retained would make the register agree with itself about something that never happened. The remedy is
  operational — commit the lesson — and it is a real cost this contract deliberately imposes.
- **P2-D25 is load-bearing for the contract's first clause.** "Lessons feed institutional memory" is enforced
  by asking the graph, so graph population is a genuine operational prerequisite rather than a nicety. An
  institution that does not run its knowledge graph will find its lessons stay provisional, which is the honest
  answer rather than a defect.
- **The four evidence-owning domains and the person directory are hard dependencies at the composition root.**
  The module imports Organization, Person, Knowledge Graph, Assessment & Evaluation, Decision Intelligence,
  Predictive Intelligence and Executive Intelligence to bind four ports. A directory that silently failed to
  bind would turn "grounded in evidence" and "entered institutional memory" into claims nothing checked while
  every guard in the package still appeared to pass, which is why the DI-graph spec asserts all four.
- **The Program E through-line held to the last contract.** Nothing in this domain self-modifies or
  self-deploys, and the only recommendation it produces that could be mistaken for an act — `revert` — is
  explicitly one that opens a gate rather than closing anything. Six contracts, and the platform still has no
  path by which software changes the institution without a person agreeing.
- **The deferrals are recorded as TD-50**: the six key guards and the open-gate guard are check-then-act in the
  service (all seven uniques are DB-backed and reject `23505`, and the one that would actually matter under
  concurrency is the **partial** open-gate unique held by Postgres), and maturity assessment and lineage
  tracing run on the caller's thread. Neither weakens an absolute invariant.

## Alternatives considered

- **Let an urgent change bypass the gate.** Rejected, and it is the alternative that mattered most. Every
  institution that has ever suspended its own governance did so for a reason that looked excellent at the time,
  and an expedited path is not used rarely — it becomes the path, because the people who can invoke it are the
  people under the most pressure. The engine has no parameter that could carry the message, which is stronger
  than a policy saying not to send it.
- **Decide gates by majority.** Rejected — a governance record showing that somebody objected in writing and
  was outvoted is the single most damaging artifact an institution can produce about itself, and it would be
  produced routinely. Unanimity among those who voted, with `deferred` available to anyone unwilling to block,
  costs a legitimate decision nothing.
- **Accept the decider from the request body.** Rejected — the quorum counts distinct people, so a body-supplied
  decider lets one caller clear a three-person gate by naming two real colleagues, and no directory check can
  detect it because the colleagues exist. This is the single change that would have turned the quorum into
  decoration.
- **Let the last ballot from a decider win.** Rejected — the outcome would depend on arrival order, and a gate
  could be re-run until the number came out right. Genuine reconsideration is a new gate, and it leaves both
  records behind.
- **Make the rationale optional on affirmative ballots.** Rejected — an approval nobody had to explain is
  indistinguishable a year later from an approval nobody thought about, and the asymmetry (reasons for no,
  silence for yes) teaches an institution that agreement is the costless option.
- **Give reversion the same quorum as the change it undoes.** Rejected — the acts are not symmetric. Introducing
  a practice affects nobody who has adapted to it yet; withdrawing one after a year unpicks everything built on
  top. A floor of two is the minimum that stops single-handed oscillation.
- **Add a `reverted` initiative status.** Rejected — it lets an institution erase a decision by relabelling it
  and loses the record worth keeping, which is that the institution once believed this on this evidence with
  these people's agreement. A reversion is a new initiative facing its own gate, and both records stand.
- **Read the change class from the convocation body.** Rejected — the quorum is a function of the class, so a
  trusted class field is a self-service discount on governance. Resolving it from the stored initiative and
  copying it onto the gate keeps both the quorum honest and the gate's own record stable under later
  reclassification.
- **Let a service mark a lesson retained.** Rejected — "lessons feed institutional memory" would become a
  status somebody set, and the register would agree with itself about something that never happened. Asking the
  knowledge graph is the only version of the clause that is true, and `provisional` being uncomfortable is what
  makes anybody commit the lesson.
- **Allow a provisional lesson to be superseded.** Rejected — it is a tidy way to clear the unfinished records,
  and it would be used exactly when the register looked worst. A lesson that never reached memory has nothing
  to be superseded from.
- **Allow a route out of `superseded`.** Rejected — deciding the original was right after all is a new lesson
  with its own origin and its own commitment. Editing the register so that it never held the other view deletes
  the part that is actually institutional memory.
- **Let a filer declare a signal's priority.** Rejected — priority would track confidence and seniority rather
  than incidence, and the most widely observed problems in an institution are rarely raised by its most
  emphatic people. Deriving urgency from independent corroboration is the only version that resists the filer.
- **Refuse anonymous signals.** Rejected — safeguarding, culture and leadership concerns are precisely the ones
  that do not arrive with a name on them, and a channel that requires attribution collects a filtered set.
  Anonymous filing is admissible and anonymous _corroboration_ is not, because a corroboration whose author
  cannot be counted manufactures urgency from one keyboard.
- **Keep a browsable list of declined signals.** Rejected — recurrence is answered through the key, since a
  problem raised again arrives at a key already carrying what the institution decided last time. A searchable
  archive of everything anybody ever turned down is a different artifact with a different audience, and mostly
  an invitation to relitigate.
- **Close a cycle that produced no lessons.** Rejected — `closed` and `abandoned` mean different things and an
  institution is entitled to both, but a cycle that produced nothing anybody learned is the second one. One
  lesson is a low floor and the point is that it is not zero.
- **Let a tenant define its own capability areas.** Rejected — two institutions' maturity indices would be
  incomparable while both were called a maturity index, and an institution's own history would become
  incomparable with itself the first time an area was added. Ten closed areas with a 0.7 coverage floor let an
  assessment emphasize without letting it redefine.
- **Drop the maximum area weight.** Rejected — an assessment weighting one area at 0.9 would still be called an
  institutional maturity index while measuring one thing, and it would be authored under exactly the pressure
  that makes it attractive. A ceiling of 0.5 costs a legitimate author nothing.
- **Round to the nearest level rather than using inclusive floors.** Rejected — a rounding rule is an argument
  waiting to be had at every boundary, and it will be had by whoever benefits. `LEVEL_FLOORS` makes 3.0 exactly
  `defined` with nothing to discuss.
- **Allow an observation without a prior claim.** Rejected — it is the entire failure mode of benefits
  realization. A target written after the result is known makes every change turn out to have intended whatever
  it achieved, and the two-step ordering is the only structural defence against a review that cannot fail.
- **Drop benefits that were claimed but never measured.** Rejected — the unmeasured claims are the finding. A
  change that promised six improvements and could evidence one has not been shown to work, and a review showing
  only the measured benefit shows a success rate of 100%.
- **Take the review verdict from the average band.** Rejected — averaging lets a change that missed the one
  benefit it was justified by pass on the strength of five it was not. The worst band is what an institution
  would want to know if it were reading about somebody else's change.
- **Let a second review be opened at the same period.** Rejected — that is precisely how an unwelcome verdict
  gets asked again until it comes out differently. Different distances from adoption are legitimate and
  informative; the same distance twice is a retake, and the unique is on the table rather than in the service.
- **Have `revert` actually revert.** Rejected — it would be the one place in six Program E contracts where the
  platform changed the institution on the strength of its own arithmetic. The verdict is the most valuable
  record this domain produces and the one an institution has the most reason to wish away, and it earns its
  weight by being a recommendation that two named people then have to act on.
- **Publish rationales, lesson statements, maturity scores and benefit figures on the event bus.** Rejected —
  the rationale is the governance record and belongs where governance records are retained and read; a maturity
  score detached from its coverage is the artifact the coverage floor exists to prevent; and a benefit figure
  belongs to the domain that measured it. Events say that something happened and to what, which is what a bus
  is for.
- **Fold `evolution:govern` into `evolution:manage`.** Rejected — running the improvement programme and
  consenting to institutional change are different acts with different accountability, and one scope would hand
  the mandate out with the job. The same argument separates `evolution:assess`: the person running the backlog
  should not also decide what the institution scored on it.
