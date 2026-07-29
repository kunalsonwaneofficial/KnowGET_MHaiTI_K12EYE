# Engineering Delivery Report — P2-D30

**Platform Evolution, Institutional Learning & Continuous Improvement** · Phase 2 (Enterprise Domain Engineering) · Program: Intelligence Core

|                |                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D30 — Platform Evolution, Institutional Learning & Continuous Improvement                                                                                                                                                                                                                                                                                                                                        |
| **Status**     | 🟡 Delivered — pending CI. `@knowget/platform-evolution` typecheck/lint/format/build clean, **1154 tests** (25 files); `apps/api` typecheck/lint/build clean + platform-evolution DI-graph spec (3 tests) in the **241-test** api suite. Full monorepo green (TD-12 on the Prisma build in-sandbox).                                                                                                                |
| **Depends on** | **P2-D25 (Knowledge Graph)** — the store a lesson's memory commitment resolves against, and the contract's first clause; **P2-D10**, **P2-D27**, **P2-D28**, **P2-D29** — the stores an evidence citation resolves against; P2-D01-M01 (Organization) and P2-D01-M02 (Person) via directory ports; P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`). **Sixth and final contract of Program E** (D25–D30), and of Phase 2's 36. |
| **Date**       | 31 December 2026                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Next**       | Phase 2 certification                                                                                                                                                                                                                                                                                                                                                                                               |

---

## 1. Mission recap

Deliver the **evolution layer** — the sixth and final contract of Program E, and the place where an institution's
own changes to itself become something it can be held to.

Every contract before this one made the institution better at knowing something. This one is about what happens
after it knows: a problem is noticed, somebody proposes a change, people agree or refuse, the change is piloted
and adopted, and — the part institutions almost never have — somebody afterwards asks whether it worked, and what
was learned survives the departure of whoever was in the room.

One rule defines the contract: **lessons feed institutional memory; evolution always requires human governance**.
It sits under the Program E through-line that has governed all six contracts: **AI recommends with evidence;
humans approve; nothing self-modifies or self-deploys**. The two sentences are the same sentence at different
scopes, and this is where the second is tested for real — D26 gated an agent's tool calls, D27 gated an automated
act, D28 refused to let a projection become a plan, and all three were about the platform not doing something to
the institution. This contract is about the institution changing **itself**, and the platform's job is to ensure
that when it does, a named human agreed, in writing, with a reason, and that what followed was measured against
what was promised.

The design problem here is **self-congratulation**. Every other layer is checked by something — an attendance
figure is wrong in front of a teacher, a forecast is wrong when the term ends — while an improvement programme is
checked by nobody, because the only evidence it produces is its own paperwork. Built carelessly, this domain
would let an institution generate a complete, auditable, entirely sincere record of continuous improvement in
which nothing improved: signals triaged, initiatives approved, cycles closed, lessons recorded, a maturity score
climbing every year, and no point anywhere at which anyone was obliged to find out whether any of it worked. That
artifact is worse than none, because it is quotable.

Two absences are load-bearing and were decided before anything was written. **The package holds no clock** — a
period is an integer ordinal on a caller-defined grid, and no arithmetic here consults the date it runs on. **And
nothing in this package changes anything outside it**: it does not deploy, configure, migrate, enable, disable or
edit any other domain. As with every domain here, the design begins with the pure engines.

## 2. What was engineered

| Layer           | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engines**     | Eight pure, deterministic, **clock-free** engines built and tested first: **intake** (`inspectEvidence` / `derivePriority` / `inspectProgression`), **governance** (`requiredDeciders` / `isGateSettled` / `evaluateGate` / `MIN_DECIDERS_FOR_REVERSION` — the contract's second clause as arithmetic), **lifecycle** (`requiredInitiativeGate` / `inspectAdvance`), **cadence** (`inspectSpan` / `elapsedPeriods` / `requiredCycleGate` / `inspectStageChange` — improvement cycles without a calendar), **learning** (`inspectLesson` / `inspectRetentionChange` / `reviewStanding` — the first clause), **lineage** (`LINEAGE_STAGES` / `lineageStageRank` / `traceLineage` — where the account stops), **maturity** (`inspectWeighting` / `levelForScore` / `assessMaturity`), **realization** (`varianceBandRank` / `measureBenefit` / `recommendVerdict`) |
| **Domain**      | `@knowget/platform-evolution` — seven aggregates: `ImprovementSignal` (what somebody noticed, with its accounts and citations), `ImprovementInitiative` (what is proposed about it), `GovernanceDecision` (who agreed, and why), `Lesson` (what was learned, and whether memory has it), `ImprovementCycle` (the improvement programme's own cadence), `MaturityAssessment` (capability measured over ten closed areas), `AdoptionReview` (did it work?); seven application services on the platform event bus, **31 `evolution.*` events**, 96 typed errors, 11 ports. **No Prisma, no NestJS, no HTTP, no model runtime, no provider SDK, no `fetch`, no clock; value-, prose- and PII-free events**                                                                                                                                                          |
| **Persistence** | Seven models in `schema.prisma` + one migration (`20261231000000_add_platform_evolution`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed; **no table carries a soft-delete column and no repository declares a delete**; accounts, citations, ballots, originating signal ids, lesson areas, assessment weights/areas and review benefits as JSONB; five absolute uniques DB-backed plus **one partial unique that holds a rule rather than a shape** — `(tenant_id, initiative_id, gate) WHERE outcome = 'pending'`, one open gate at a time per change                                                                                                                                                                                                                                                      |
| **API**         | Seven Prisma/RLS repositories + four directory adapters + **seven permission-gated controllers / 66 endpoints** under `apps/api/src/domains/platform-evolution`, split `evolution:read` (every read) / `evolution:contribute` (raising, corroborating, proposing, recording lessons) / `evolution:manage` (running the programme) / `evolution:assess` (the maturity index, standing apart) / **`evolution:govern` (consent, standing alone)**; all bodies zod-validated; module wires 7 repos + 4 directories + 7 services and imports Organization, Person, Knowledge Graph, Assessment & Evaluation, Decision Intelligence, Predictive Intelligence and Executive Intelligence; registered in `app.module` and `apps/api` deps                                                                                                                               |

## 3. The two clauses, as structure

**Evolution always requires human governance.** `REQUIRED_DECIDERS` is a frozen total map over the four change
classes — `clarification: 1`, `process: 1`, `policy: 2`, `structural: 3` — floored at `MIN_REQUIRED_DECIDERS`
rather than trusted, so no arrangement of inputs produces a gate that opens on nobody's agreement. There is **no
configuration, no override, and no expedited path**: the engine cannot be told that this particular change is
urgent enough to skip the count, because the type has no field that would carry the message. Three properties
close the specific ways institutions talk past their own governance. **Nobody approves their own initiative** —
the proposer's ballot is discarded in both directions, and a gate with no recorded proposer can never be
satisfied, because that is not a gate with a missing field but a gate with its safeguard switched off. **A person
speaks once** — a repeat ballot is an issue and changes nothing, since last-vote-wins makes the outcome depend on
arrival order and lets a gate be re-run until the number comes out right. **One refusal settles it** — a single
`rejected` verdict refuses the gate however many affirmations sit opposite, because an institution whose
governance let a majority overrule a written objection would be manufacturing the one record nobody ever wants to
be shown. `deferred` exists for the decider who will not block but is not ready to agree, and costs nothing.

Two further guards make the count real rather than nominal. **The decider comes from the authenticated principal
and is never a body field**: a gate clears on a count of distinct _people_, so a body-supplied decider would let
one caller holding `evolution:govern` clear a three-decider structural gate by naming two colleagues — and the
person directory cannot catch it, because the colleagues exist. And **the change class is read off the initiative,
never believed from the body**, so a caller cannot lower the quorum by declaring a structural change a
clarification on the way in; the class and the proposer are then **copied onto the gate at convocation**, so the
gate's own record still says what it was convened under even if the initiative is later reclassified.

**Lessons feed institutional memory.** `INITIAL_LESSON_RETENTION` is `provisional`, and the only route to
`retained` runs through `InstitutionalMemoryDirectory.commitmentResolved` — **a fact read off the P2-D25
knowledge graph by lesson key, not a status a service sets**. `commitment_unresolved` is the ordinary refusal at
the end of every retrospective anybody has ever run, and the remedy is not to retry but to commit the lesson to
the graph. A `provisional` lesson **cannot be superseded**, because that would hand every institution a tidy way
to clear its unfinished records without a single commitment having resolved — and it would be used precisely when
the register looked worst. There is no route out of `superseded` either: a lesson the institution has moved past
stays readable exactly as it was, because the fact that it once believed something else is part of what it knows.

**And the third thing, which is not in the sentence but is what makes the other two checkable: the lineage
engine.** `LINEAGE_STAGES` is a frozen ascending ladder — `unrecorded → evidence → signal → decision → outcome →
memory` — and `traceLineage` returns the highest rung a claim actually reaches together with the gap that stopped
it (`signal_without_evidence`, `no_signal`, `signal_not_taken_up`, `gate_unsettled`, `no_settled_gate`,
`initiative_in_flight`, `no_lesson`, `lesson_provisional`). It is a deliberately unflattering instrument. An
improvement programme is exactly as good as the proportion of its claims that reach `memory`, and a chain that
stops at `signal` is an institution that noticed something and did nothing. Without it, every other guard in this
domain would still pass while the programme as a whole quietly failed.

## 4. Authority — five scopes, and why `evolution:govern` stands alone

`evolution:read` is every read — the signal queue, the initiative backlog, open and settled gates, the lesson
register, cycles, assessments and reviews — and is deliberately wide, because an institution that cannot look at
what it is changing about itself has no governance to speak of. A reader who can neither raise, run, assess nor
approve still sees exactly what was proposed, on what evidence, who agreed, and whether the benefit that
justified it arrived. `evolution:contribute` is the participation surface — raising and corroborating signals,
proposing and restating initiatives, reclassifying a draft, submitting it, recording and revising lessons — and
is the widest write scope on purpose, because the contract's premise is that improvement signals come from
everywhere and a platform where only administrators may say something is wrong collects the observations of
administrators. Nothing there settles anything. `evolution:manage` is the work of running the programme: triage,
merge, decline, pilot, withdraw, retain, supersede, open and reschedule cycles, and the whole of adoption review.
None of it is consent — every act either prepares a decision or records what happened after one.

**`evolution:assess` is separated from `evolution:manage`** because a maturity index is the number the institution
will be judged by, and the coverage and weighting rules that protect it are worth nothing if the person running
the improvement backlog can also decide what the institution scored on it.

**`evolution:govern` stands alone and is implied by nothing.** Convoking a gate, casting a ballot, approving,
rejecting and adopting an initiative, and closing a cycle all sit there — exactly the transitions the engine
stands a gate in front of. A head who can open cycles and edit initiatives still cannot approve one on that
authority. Every other scope in the platform governs what a person may _do_; this one governs **what the
institution may become**, and a permission model that bundled the second into the first would hand it out with
the job rather than with the mandate.

## 5. Measurement is claimed before it is taken, and `revert` reverts nothing

**A benefit is claimed first and observed second, and that ordering is the entire epistemic content of a
realization review.** `claim` states measure, direction, baseline and target before anything is measured;
`observe` records what it came to and is admissible only against a benefit that was claimed. A target written
after the result is known is not a test, and the two-step shape is what stops a change from having always
intended whatever it achieved. **Benefits claimed and never measured stay on the record beside the ones that
were** — hence the separate `benefits_claimed` and `benefits_measured` counts, and the nullable `worst_band` when
nothing measurable came back — because a change that promised six improvements and could evidence one has not
been shown to work, and a review showing only the measured benefit shows a success rate of 100%.
`VARIANCE_FLOORS` band the outcome at 1.1 / 0.9 / 0.5, and the verdict derives from the **worst** band rather
than the average, because a change that met five targets and missed the one it was justified by has missed.

**A review is identified by `(tenant, initiative, period)`, enforced by the database.** Reviewing at one period
and again at four is the normal shape of benefits realization and early movement that decayed is a finding; a
second review at the _same_ distance is refused, because that is how an unwelcome verdict gets asked again until
it comes out differently.

**`revert` is a recommendation with a name against it, and never an act.** It is the most valuable record this
domain produces and the one an institution has the most reason to wish away, and it earns its weight by being
something two named people then have to act on: reverting an adopted change means **opening a reversion gate**,
floored at `MIN_DECIDERS_FOR_REVERSION` (2) even for a clarification. The asymmetry is deliberate — adopting a
clarification affects a practice nobody has adapted to yet, while reverting one nine months later unpicks work
everybody has since built on and cited in their own decisions. And there is **no `reverted` initiative status at
all**: a reversion is a new initiative with its own evidence facing its own gate, and both records stand, because
a terminal `reverted` state would let an institution erase a decision by relabelling it and would lose the thing
worth keeping — that it once believed this, on this evidence, with these people's agreement.

**Priority is derived, and anonymity is asymmetric.** `MIN_CORROBORATION_FOR_ELEVATED` (2) and
`MIN_CORROBORATION_FOR_URGENT` (4) turn independent accounts into urgency, so the loudest filer does not outrank
the most widely observed problem. Anonymous filing is supported and `raised_by` is legitimately NULL — an
institution whose safeguarding, culture and leadership signals can only be raised with a name attached collects a
filtered set — but an anonymous signal **cannot corroborate**, because a corroboration whose author cannot be
counted manufactures urgency from one keyboard.

**Maturity is scored over ten closed capability areas** shared by every assessment in every tenant, with weights
bounded on both sides (`MIN_AREA_WEIGHT` 0.01, `MAX_AREA_WEIGHT` 0.5) summing to 1 within `WEIGHT_TOLERANCE`
1e-6, `MIN_AREA_COVERAGE` 0.7 and `MIN_EVIDENCE_PER_AREA` 1 flooring how much of the institution a published
index may have looked at, and `LEVEL_FLOORS` mapping score to level by **inclusive floor** so an area rated
exactly 3.0 is `defined` with no rounding argument available. **A cycle closes only through a gate** and only
with `MIN_LESSONS_FOR_CLOSURE` (1) lessons behind it: a cycle that produced nothing anybody learned is
**abandoned**, not closed, and the two words stay different on the record.

## 6. Quality gates

`@knowget/platform-evolution`: typecheck / lint / format / build clean, **1154 tests across 25 files** (eight
engine suites, seven aggregate suites, seven service suites, plus events, values and ports). `apps/api`:
typecheck / lint / build clean, platform-evolution DI-graph spec (**3 tests** — the seven controllers, the seven
exported service tokens, and the four directories) in the **241-test** api suite (81 files, 3 skipped). Full
monorepo typecheck / lint / tests green (the Prisma build and the `@knowget/database` integration test are TD-12
in-sandbox). Repo-wide `pnpm format:check` clean. Migration audited directly against Postgres after a full
41-migration replay to 225 tables: all seven tables `ENABLE` + `FORCE ROW LEVEL SECURITY` with exactly one
`tenant_isolation` policy each, the partial unique present with its exact `WHERE (outcome = 'pending'::text)`
predicate, `improvement_cycle.stage` defaulting to `'planning'`, and **zero `deleted_at` columns** across the
contract.

The DI-graph spec asserts the **four directories** bind, not only the services — and two of them carry the
contract's rule rather than a convenience. The evidence directory is what makes a citation resolvable rather than
merely well-shaped; the memory directory is what makes a lesson's retention a fact read off the institutional
knowledge graph rather than a status somebody set. A directory that silently failed to bind would turn "grounded
in evidence" and "entered institutional memory" into claims nothing checked, while every guard in the package
still appeared to pass — which is exactly the failure this contract exists to prevent.

## 7. Boundaries & debt

- **This domain records the institution's changes to itself; it makes none of them.** Nothing here deploys,
  configures, migrates, enables, disables or edits any other domain, and there is no route by which an approved
  initiative causes anything to happen in the platform. That is the Program E through-line at its last contract,
  and it is a boundary rather than an omission: an approval is authority for people to act, and the act belongs
  to whoever owns the thing being changed.
- **Ten capability areas are the closed scope**, and the closure is the feature. A tenant-extensible area set
  would make two institutions' maturity indices incomparable and would make an index incomparable with its own
  history the first time an area was added.
- **P2-D25 is load-bearing for the first clause.** "Lessons feed institutional memory" is enforced by asking the
  graph whether a commitment resolved, so graph population is a real operational prerequisite. An institution
  that does not run its knowledge graph will find its lessons stay `provisional` — which is the honest answer
  rather than a defect, and the discomfort is what makes anybody commit the lesson.
- **Evidence resolves against five stores.** Assessment results, decision records, forecast runs and knowledge
  assertions resolve to their owning domains by kind (P2-D10, P2-D27, P2-D28, P2-D25); everything else resolves
  through the P2-D25 graph by `(sourceDomain, sourceRef)`. `attested_return` is the only kind demanding a named
  attestor — a figure somebody typed is admissible, and anonymously typed is not.
- **`governance_decision.initiative_id` is a deliberate polymorphic reference with no FK** — an initiative at
  approval, pilot exit and reversion; a cycle at closure. A FK would have forced either two nullable columns or
  two tables holding the same rule, and the rule is what matters: one open gate at a time in front of one thing.
- **No domain→domain package import** (ADR-0010); the organization node, the person, every evidence citation and
  the memory commitment enter through four directory ports bound at the composition root.
- **TD-50 (new).** Two deferrals, neither weakening an absolute invariant. (a) The signal-key, initiative-key,
  lesson-key, cycle-key, assessment-key and review-period guards plus the open-gate guard are **check-then-act in
  the service** — all seven uniques are DB-backed and reject `23505`, so a concurrent clash costs a less friendly
  error rather than a lost invariant, and the rule that would actually matter under concurrency (one open gate
  per change) is held by a **partial unique index** rather than by service code. (b) **Maturity assessment and
  lineage tracing run on the caller's thread**: `assessMaturity` weights and rolls up ten areas synchronously and
  `traceLineage` walks a claim's chain inline; both are bounded rather than unbounded, and moving them behind a
  queue belongs with the outbox work in TD-01.
- **TD-12 (standing).** The Prisma query engine is stubbed in-sandbox, so `@knowget/database` builds/tests via
  the offline path; the seven-table migration was audited directly and is applied from scratch in CI.
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root.
- **TD-01 (standing).** Event delivery is in-process; the 31 `evolution.*` events ride the same bus.

## 8. Outcome

The evolution layer is complete behind its gates, and the platform can now say whether an institution is getting
better — and can be shown when it is not. The computational core is pure, deterministic and clock-free (eight
engines, seven aggregates, **1154 tests**, no model runtime, no clock, no network). A change clears a gate only
on a count of **distinct named people** the engine has no parameter to lower, none of whom is its proposer, each
with a **compulsory rationale including for a yes**, and **one refusal settles it**. The decider comes from the
principal and the change class from the initiative, so neither the quorum nor the classification is self-served.
Reversion is floored higher than adoption, and there is **no `reverted` state** — undoing a change is a new
initiative facing its own gate, with both records standing. A lesson is `provisional` until the **P2-D25 knowledge
graph** says a commitment resolved, cannot be superseded before it gets there, and can never leave `superseded`.
A signal's priority is **derived from independent corroboration**, anonymous filing is admissible and anonymous
corroboration is not. A benefit is **claimed before it is measured**, unmeasured claims stay on the record, the
verdict comes from the **worst** band, and `revert` **recommends and never acts**. Maturity is scored over ten
closed areas with coverage floored and weights bounded on both sides. And the lineage ladder reports, for any
claim, the rung the account actually reaches — the one instrument in the domain designed to produce an
unflattering answer. All seven tables are FORCE-RLS tenant-isolated and **none carries a soft-delete column**,
because every record here is what the institution noticed, proposed, decided, learned, ran, assessed or found.

Fourteen increments, each verified and pushed. **This completes Program E (D25–D30) and Phase 2's thirty-six
contracts; the next milestone is Phase 2 certification.**

**Reminder: rotate the GitHub PAT** used for pushes at this milestone boundary — it has not yet been rotated
across the P2-D18…D30 boundaries.
