# Engineering Delivery Report — P2-D28

**Predictive Intelligence, Simulation & Strategic Planning** · Phase 2 (Enterprise Domain Engineering) · Program: Intelligence Core

|                |                                                                                                                                                                                                                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D28 — Predictive Intelligence, Simulation & Strategic Planning                                                                                                                                                                                                                                                                 |
| **Status**     | ✅ Delivered — CI green, merged to `main` (`65a082a`). `@knowget/predictive-intelligence` typecheck/lint/format/build clean, **842 tests** (24 files); `apps/api` typecheck/lint/build clean + predictive-intelligence DI-graph spec (3 tests) in the **235-test** api suite. Full monorepo typecheck/lint/tests green (TD-12 on the Prisma build in-sandbox).           |
| **Depends on** | **P2-D25 (Institutional Knowledge Graph — series subjects resolve against it)**, P2-D01-M01 (Organization) and P2-D01-M02 (Person) and P2-D03 (Student) via directory ports, the operational base **D01–D24** whose forecasting deferred here, P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`). Fourth contract of **Program E** (D25–D30). |
| **Date**       | 29 December 2026                                                                                                                                                                                                                                                                                                                  |
| **Next**       | P2-D29 (fifth Program E contract)                                                                                                                                                                                                                                                                                                 |

---

## 1. Mission recap

Deliver the **prediction layer** — the fourth contract of Program E, and the place where the platform stops
describing what the institution has done and states **what it expects to happen**.

This is not one domain's forecasting need. **All twenty-four operational domains deferred their prediction here** —
enrolment projections, attendance risk, fee collection curves, staffing demand, transport load, hostel occupancy,
library circulation, health-centre volume, procurement lead times — rather than each growing a private projector
with a private notion of what a forecast is. That deferral is the design premise: twenty-four independently
reasonable projectors produce twenty-four incompatible answers, and an institution holding two numbers for next
term's enrolment holds neither.

One rule defines the contract, and it is four requirements in one sentence: **every forecast must include
confidence intervals, assumptions, uncertainty, and be reproducible/versioned**. Each is a well-known failure mode
written as a requirement. A point estimate with no interval reads as certainty nobody has. A projection whose
assumptions are unstated cannot be argued with, only believed. A forecast that does not grade its own reliability
makes a thin one and a solid one look identical in a report. A number that cannot be recomputed cannot be audited,
defended or corrected.

So the design problem is **honesty under pressure, not accuracy**. Users will always want the number tighter,
further out and less hedged than the evidence supports, and the pressure to negotiate each requirement is exactly
proportional to how badly the answer is wanted. Each is therefore expressed as structure: a constant nothing can
raise, a field with no absent representation, a constructor precondition, a digest. As with every domain here, the
design begins with the pure engines.

## 2. What was engineered

| Layer           | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engines**     | Eight pure, deterministic, **clock-free and seedless** engines built and tested first: **series** (`inspectSeries` / `findGapPeriods` / `countCompleteCycles` / `computeStatistics` / `splitHoldout`), **projection** (`resolveParameters` / `fitLinearTrend` / `project` / `projectBaseline` — six methods), **uncertainty** (`summarizeResiduals` / `spreadFor` / `horizonWidening` / `buildIntervals` / `assessUncertainty` / `computeCoverage` / `judgeCalibration` — requirements 1 and 3), **assumptions** (`requiresHolder` / `requiresReference` / `inspectAssumptions` — requirement 2), **reproducibility** (`canonicalize` / `reproducibilityKeyOf` / `diffInputs` / `maxValueDelta` / `reproduce` — requirement 4), **accuracy** (`scoreAgainstActuals` / `skillScore` / `computeAccuracy` / `isPublishable`), **simulation** (`isLeverAdmissible` / `orderLevers` / `applyLever` / `simulate`), **planning** (`expectedValueAt` / `trackingStateFor` / `computeObjectiveVariance` / `computePlanVariance`) |
| **Domain**      | `@knowget/predictive-intelligence` — seven aggregates: `ObservationSeries` (the measured history, its grain and declared cycle), `ForecastModel` (**versioned**; publication refused without a passing backtest), `ForecastRun` (points, intervals, assumptions, uncertainty assessment and reproducibility key; assumptions refused at production if they do not hold up), `Backtest` (holdout scoring with calibration verdict and frozen publishability), `Scenario` (declared levers), `SimulationRun` (one scenario applied to one forecast), `StrategicPlan` (objectives frozen at activation, progress in arrival order, reviews keeping the variance they saw); seven application services on the platform event bus, **30 `forecast.*` events**, 64 typed errors. **No Prisma, no NestJS, no HTTP, no model runtime, no provider SDK, no `fetch`, no clock, no random source; value-, prose- and PII-free events**                                                                                             |
| **Persistence** | Seven models in `schema.prisma` + one migration (`20261229000000_add_predictive_intelligence`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed; **five tables deliberately carry no soft-delete column** (series, run, backtest, simulation run, plan — the measured history, what was projected from it, how it scored, what was simulated and what was committed to); observations, points, intervals, assumptions, levers, objectives, readings and reviews as JSONB; the four absolute uniques DB-backed (series `(tenant, org, series_key)`; model `(tenant, model_key, version)`; scenario `(tenant, org, scenario_key)`; plan `(tenant, org, plan_key)`)                                                                                                                                                                                                                                                                                                        |
| **API**         | Seven Prisma/RLS repositories + three directory adapters + **seven permission-gated controllers / 77 endpoints** under `apps/api/src/domains/predictive-intelligence`, split `forecast:record` (the evidence) / `forecast:manage` (methods and cases) / `forecast:operate` (the runtime) / **`forecast:plan` (commitment, standing alone)** / `forecast:read` (every read); all bodies zod-validated; module wires 7 repos + 3 directories + 7 services; registered in `app.module` and `apps/api` deps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## 3. The four requirements, as structure

**Confidence intervals.** `REQUIRED_CONFIDENCE_LEVEL` is `80` and every `ForecastPoint` carries at least that
interval — a point that cannot state where the outcome is likely to fall is **not a weaker forecast, it is a
different claim, and the package cannot express it**. `CONFIDENCE_LEVELS` is closed at `[50, 80, 95]` on purpose:
an arbitrary level invites the level to be chosen _after_ the interval is seen, and a 60% band quoted because the
80% one looked alarming is a lie told in the vocabulary of statistics. The multipliers are a fixed table rather
than a computed inverse-normal, so the three admissible levels are exact and identical on every machine.

**Assumptions.** `produce` inspects the declared assumptions and throws `UndeclaredAssumptionsError` if they do
not hold up — a run on unstated assumptions is not a poorly documented run, it is **not a run**. An assumption's
`basis` carries obligations: `expert_judgement` demands a named person, `declared_policy` and `upstream_forecast`
demand the thing referred to, and the six issue codes are the whole vocabulary of the check. The holder rule is
why the `PersonDirectory` is not cosmetic: an assumption attributed to a person who does not exist **declares
nothing while looking like it declares something**, which is worse than declaring nothing at all.

**Uncertainty.** Four grades (`tight`, `moderate`, `wide`, `unusable`) and six **stable reason codes** —
`short_history`, `sparse_history`, `volatile_history`, `long_horizon`, `unstable_residuals`,
`seasonal_cycle_incomplete` — so a verdict is safe in an event, a response, a report and a test. `unusable` is a
real verdict the domain reaches and not a floor it avoids: a forecast the evidence cannot support says so in its
own grade rather than looking like every other forecast in the list. `judgeCalibration` closes the loop from the
other side, checking observed coverage against nominal within `CALIBRATION_TOLERANCE`.

**Reproducible and versioned.** `reproducibilityKeyOf` canonicalizes the exact inputs a run stood on — the
observations, the method, its version, its resolved parameters, the seed, the horizon, the confidence levels — and
sha256-digests them. `diffInputs` then says **which** of six stable drift codes moved when two runs disagree, so a
failed reproduction is an audit finding rather than an audit question. `FORECAST_PRECISION` is `6` and
`VALUE_TOLERANCE` is `10⁻⁶`, which is what makes reproduction _testable_: "reproducible" means same digest **and**
maximum value delta within tolerance, not a bit-equality that would fail for reasons having nothing to do with the
forecast. This is also why the package holds **no clock and no random source** — a forecast whose inputs can move
underneath it was never reproducible, and one that reads the wall clock has an input nobody pinned.

**And the fifth thing, which is not in the sentence but holds the other four up:** `MAX_HORIZON_RATIO` is `0.5`,
it is a constant beside the observation floor, and **nothing in the package can raise it** — no model parameter,
no tenant setting, no scenario, no request. Twelve observed months buy six forecast months and not a thirteenth;
below `MIN_OBSERVATIONS_FOR_FORECAST` (4) the admissible horizon is **zero**, not a small number. Every other
guard here can be argued with — a cycle declared differently, a method swapped, an assumption restated — but the
relationship between how much history you have and how far you may claim to see is the one a forecasting system
must not let its users negotiate, because the pressure to negotiate it is exactly proportional to how badly the
answer is wanted.

## 4. Authority — five scopes, and why `forecast:plan` stands alone

`forecast:record` gates the evidence a projection stands on — declaring a series, recording observations,
correcting them, withdrawing them. It is separate from everything downstream because a corrected observation
**retroactively edits the history every published model was fitted against**. That is a legitimate and necessary
act, and it is not the same act as producing a forecast. `forecast:manage` gates the methods and cases an
institution permits itself: drafting, publishing and retiring models, declaring and publishing scenarios, settled
ahead of time by people who answer for them. `forecast:operate` gates the runtime — producing, verifying,
superseding and invalidating runs, scoring backtests. `forecast:read` is every read and is deliberately wide,
because a forecast nobody may inspect fails this contract as surely as one carrying no intervals.

**`forecast:plan` is separate and is implied by nothing.** Drafting a plan, setting targets, activating it,
recording progress, reviewing it and abandoning it all sit there. Producing a forecast is an operational act;
setting a target against one and answering for it at review is a leadership act an institution is held to. **The
ability to project is not the ability to commit**, and the scope is that sentence written as authorization.

Accountable identity comes from the authenticated principal at every attributing endpoint — who produced a run,
scored a model, ran a simulation, activated or reviewed a plan — and is **never read from a body** anywhere in
this domain. Two deliberate asymmetries: `GET forecast/runs/:id/verification` is gated on `forecast:operate`
rather than `forecast:read` despite writing nothing, because recomputing a run from its pinned inputs is the
operator's check and not a general report; and `POST forecast/models/:id/revise` answers **201** rather than 200,
because it mints a sibling aggregate — a new version — rather than amending the one addressed.

## 5. Publication is earned, and commitment is frozen

**A model earns publication from a backtest, not from its author.** `publish` refuses with
`ModelNotPublishableError` unless a backtest scored it publishable, and `isPublishable` requires **both** positive
skill against the naive baseline **and** intervals that were not overconfident, on a non-empty holdout. Either
alone can be gamed by a model that is wrong in a comfortable direction: excellent skill with overconfident
intervals produces good central estimates surrounded by a range nobody should have planned inside, and honest
intervals with no skill are an accurate account of knowing nothing. Underconfidence does not disqualify —
intervals wider than they needed to be are a cost, not a lie — and saying so keeps the check about honesty rather
than polish. An empty holdout never qualifies, because absence of evidence is not a pass. The verdict is **frozen
at the moment of scoring** so it and its evidence cannot drift apart.

**A plan's objectives freeze at activation.** They may be added, amended and removed only while it is a draft. A
target that can be moved after the fact is not a target: the question a review exists to answer is whether the
institution met what it said it would, and a plan whose objectives track its performance always meets them. A
review keeps **the variance it saw** rather than one recomputed on read, along with the plan version it was
computed against — the difference between a record of what leadership was told and a recalculation of what they
should have been told. Progress readings are kept **in arrival order rather than sorted by period**, because a
correction arriving after a later reading is precisely the case a sort would silently reorder into the wrong
answer. Abandoned plans are kept: the record that a course was tried and changed is what a later leadership needs,
and deleting it turns a decision into an omission.

Scenarios and simulations are separate aggregates for the same reason D27 separates a recommendation from the
decision on it — collapsing them makes "what did we simulate in March" unanswerable once the scenario is amended.
`orderLevers` makes application order deterministic rather than dependent on declaration order, so the
reproducibility requirement reaches simulation too; `MAX_LEVER_FACTOR` (10) bounds how far a lever may move a
projection, because a scenario that multiplies enrolment by a thousand is not a scenario.

## 6. Quality gates

`@knowget/predictive-intelligence`: typecheck / lint / format / build clean, **842 tests across 24 files** (eight
engine suites, seven aggregate suites, seven service suites, plus events and ports). `apps/api`: typecheck / lint
/ build clean, predictive-intelligence DI-graph spec (**3 tests** — the seven controllers, the seven exported
service tokens, and the three directories) in the **235-test** api suite (79 files, 3 skipped). Full monorepo
typecheck / lint / tests green (the Prisma build and the `@knowget/database` integration test are TD-12
in-sandbox). Repo-wide `pnpm format:check` clean. Migration audited directly: all seven tables `ENABLE` + `FORCE
ROW LEVEL SECURITY` with `tenant_isolation` (USING + WITH CHECK), all four absolute uniques present, `deleted_at`
on exactly the two aggregates that have a discard path.

The DI-graph spec asserts the three **directories** bind, not only the services. A directory that silently failed
to bind would turn every "checked" in this domain into "assumed" — an unresolvable organization, an unverifiable
assumption holder, a series about a subject nobody can name — while every other test still passed.

## 7. Boundaries & debt

- **Six projection methods are the deliberate scope**: `naive`, `drift`, `moving_average`, `linear_trend`,
  `seasonal_naive`, `exponential_smoothing`. Richer methods (ARIMA, state-space, ML regressors) are a later
  increment **behind the same interval, assumption, uncertainty and reproducibility contract** — which is exactly
  what makes adding them safe rather than a rewrite. The seed field exists on the reproducibility inputs so a
  stochastic method cannot be added without pinning it.
- **Series subjects resolve against P2-D25.** Organizations, people and students resolve directly; the other
  twenty-one domains resolve through the graph by `(sourceDomain, sourceRef)`, which is what the graph is for
  rather than a convenient fallback. This makes graph population a real operational prerequisite for
  subject-scoped series in those domains — an intended cost, because a forecast about a subject the institution
  cannot identify is a number attributed to nothing. Entity **status** is deliberately not consulted: a closed
  cost centre is an archived record institutions still finish the history of, and the domain has a state for that
  already — the series is closed, not forbidden.
- **P2-D27's boundary held.** Its metrics engine is descriptive counts and rates by design and predicts nothing;
  this contract is where prediction lives. Keeping that boundary clean is what let D28 be an addition rather than
  a rewrite of D27.
- **No domain→domain package import** (ADR-0010); the organization owner, the person behind every attributed act
  and every assumption holder, and the subject a series measures all enter through directory ports bound at the
  composition root.
- **TD-48 (new).** Two deferrals, neither weakening an absolute invariant. (a) The series-key, model-version,
  scenario-key and plan-key guards are **check-then-act in the service** — all four absolute uniques are
  **DB-backed** and reject `23505`, so a concurrent clash costs a less friendly error rather than a lost
  invariant. (b) **Verification recomputes on the caller's thread**: `GET forecast/runs/:id/verification` reruns
  the projection from the run's pinned inputs synchronously, which is bounded by the horizon ratio but is still
  work done inline; moving it behind a queue belongs with the outbox work in TD-01.
- **TD-12 (standing).** The Prisma query engine is stubbed in-sandbox, so `@knowget/database` builds/tests via the
  offline path; the seven-table migration was audited directly and is applied from scratch in CI.
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root.
- **TD-01 (standing).** Event delivery is in-process; the 30 `forecast.*` events ride the same bus.

## 8. Outcome

The prediction layer is complete behind its gates, and the platform has **one definition of what a forecast is**.
The computational core is pure, deterministic, clock-free and seedless (eight engines, seven aggregates, **842
tests**, no model runtime, no clock, no random source, no network). An interval **has no absent representation**;
assumptions are **checked before a run exists**; the uncertainty grade is an **output rather than a note**, and
`unusable` is a verdict the domain is willing to reach; the reproducibility key is a **sha256 digest over pinned
inputs** and a failed reproduction says which input moved. The horizon ratio is a **constant no configuration can
raise**, so the one guard whose value is that it cannot be negotiated is not negotiable. A model **earns
publication** from a backtest that beat the naive baseline without overconfident intervals; a plan's objectives
**freeze at activation** and its reviews keep what they saw; `forecast:plan` stands alone so producing a
projection is not the same authority as committing the institution to it. All seven tables are FORCE-RLS
tenant-isolated, with five deliberately carrying no soft-delete column because the measured history, what was
projected from it, how it scored, what was simulated and what was committed to are the record.

Twelve increments, each verified and pushed. **Reminder: rotate the GitHub PAT** used for pushes at this milestone
boundary — it has not yet been rotated across the P2-D18…D28 boundaries.
