# 47. Predictive Intelligence: one package, seven aggregates, eight pure engines, a horizon ratio that is a constant, an interval that cannot be omitted, assumptions as a precondition of producing, and reproducibility as a digest over pinned inputs

- **Status:** Accepted
- **Date:** 2026-12-29
- **Contract:** P2-D28 (Predictive Intelligence, Simulation & Strategic Planning)

## Context

P2-D28 is **the fourth contract of Program E — the intelligence core** (D25–D30), on the certified `v0.2.0`
baseline, the frozen Phase-1 core, the full operational base **D01–D24**, the **Institutional Knowledge Graph
(P2-D25)**, the **Enterprise AI Operating System (P2-D26)** and **Institutional Decision Intelligence (P2-D27)**.
It is where the platform stops describing what the institution has done and states **what it expects to happen**.

This contract is not one domain's forecasting need. **All twenty-four operational domains deferred their
prediction here** — enrolment projections, attendance risk, fee collection curves, staffing demand, transport
load, hostel occupancy, library circulation, health-centre volume, procurement lead times — rather than each
growing a private projector with a private notion of what a forecast is. That deferral is the whole design
premise: twenty-four independently reasonable projectors would produce twenty-four incompatible answers, and an
institution holding two numbers for next term's enrolment holds neither.

One rule defines the contract, and it is four requirements in one sentence:

> **Every forecast must include confidence intervals, assumptions, uncertainty, and be reproducible/versioned.**

Each of the four is a well-known failure mode written as a requirement. A point estimate with no interval reads
as certainty nobody has. A projection whose assumptions are unstated cannot be argued with, only believed. A
forecast that does not grade its own reliability makes a thin one and a solid one look identical in a report. And
a number that cannot be recomputed cannot be audited, defended or corrected — six months on, nobody can say what
produced it.

The design question this contract poses is therefore **honesty under pressure, not accuracy**. A forecasting
system's users will always want the number to be tighter, further out and less hedged than the evidence supports,
and the pressure to negotiate each of the four requirements is exactly proportional to how badly the answer is
wanted. So each is expressed as **structure rather than as procedure**: a constant nothing can raise, a field
with no absent representation, a constructor precondition, a digest.

Nothing in `@knowget/predictive-intelligence` imports Prisma, NestJS, an HTTP client, a model runtime, a provider
SDK or `fetch`; its only dependencies are `@knowget/types`, `@knowget/shared`, `@knowget/exceptions` and
`@knowget/events`. Two absences are load-bearing rather than incidental: **there is no clock and no random
source** anywhere in the package (`node:crypto`'s `createHash` is the one platform call, and it is deterministic
by definition). As with every domain here, the design **begins with the pure engines**.

## Decision

1. **Eight pure engines are the computational core, built and tested first.** The **series engine**
   (`sortObservations`, `findGapPeriods`, `countCompleteCycles`, `seasonalPosition`, `inspectSeries`,
   `computeStatistics`, `maxHoldoutSize`, `splitHoldout`) establishes what the history actually is before
   anything projects from it. The **projection engine** (`resolveParameters`, `fitLinearTrend`, `project`,
   `projectBaseline`, `requiredCycleFor`) produces the central estimates across six methods. The **uncertainty
   engine** (`summarizeResiduals`, `spreadFor`, `horizonWidening`, `buildIntervals`, `attachIntervals`,
   `labelsOf`, `assessUncertainty`, `computeCoverage`, `judgeCalibration`) is the contract's first and third
   requirements together. The **assumption engine** (`requiresHolder`, `requiresReference`, `assumptionKeysOf`,
   `inspectAssumptions`) is the second. The **reproducibility engine** (`canonicalize`, `reproducibilityKeyOf`,
   `sameInputs`, `diffInputs`, `maxValueDelta`, `reproduce`) is the fourth. The **accuracy engine**
   (`scoreAgainstActuals`, `meanAbsoluteError`, `rootMeanSquaredError`, `meanAbsolutePercentageError`,
   `skillScore`, `computeAccuracy`, `isPublishable`) is what makes a method's claim to be used checkable. The
   **simulation engine** (`isLeverAdmissible`, `orderLevers`, `applyLever`, `simulate`, `leverAssumptionPairs`)
   turns a scenario into an outcome. The **planning engine** (`elapsedFraction`, `expectedValueAt`,
   `progressRatioFor`, `hasMetTarget`, `shortfallRatio`, `trackingStateFor`, `latestProgressAt`,
   `computeObjectiveVariance`, `computePlanVariance`) measures a commitment against what happened.

   Every engine is a function of its arguments and nothing else. **There is no clock**: a period grid is derived
   from declared grain and declared start, never from "now", so two callers projecting the same series always
   agree and a test never depends on the date it runs. **There is no random source**: every method here is
   deterministic, and a seed field exists on the reproducibility inputs so that a future stochastic method cannot
   be added without pinning it.

2. **The horizon ratio is a constant, not a parameter.** `MAX_HORIZON_RATIO` is `0.5`, it lives in the value
   module beside the observation floor, and **nothing in this package can raise it** — no model parameter, no
   tenant setting, no scenario, no request. Twelve observed months buy six forecast months and not a thirteenth.
   `maxHorizonFor` and `isHorizonAdmissible` are the whole of the rule, and `MIN_OBSERVATIONS_FOR_FORECAST` (4)
   is its floor: below four observations the admissible horizon is **zero**, not a small number.

   Every other guard in this domain can be argued with — a seasonal cycle can be declared differently, a method
   swapped, an assumption restated — but the relationship between how much history you have and how far you may
   claim to see is the one a forecasting system must not let its users negotiate. `long_horizon` is
   simultaneously an uncertainty reason, so a horizon that is admissible but ambitious still degrades the grade
   rather than passing silently.

3. **A prediction interval has no absent representation.** `REQUIRED_CONFIDENCE_LEVEL` is `80` and every
   `ForecastPoint` carries at least that interval; a point that cannot state where the outcome is likely to fall
   is **not a weaker forecast, it is a different claim, and this package cannot express it**. `CONFIDENCE_LEVELS`
   is closed at `[50, 80, 95]` on purpose: an arbitrary level invites the level to be chosen _after_ the interval
   is seen, and a 60% band quoted because the 80% one looked alarming is a lie told in the vocabulary of
   statistics. `CONFIDENCE_MULTIPLIERS` is a fixed table rather than a computed inverse-normal, so the three
   admissible levels are exact and identical on every machine.

   Intervals widen with horizon (`horizonWidening`) and with residual spread (`spreadFor`), and
   `MIN_RESIDUALS_FOR_STABLE_SPREAD` (3) is the point below which the spread itself is not trustworthy — which
   surfaces as `unstable_residuals` rather than as a confidently narrow band computed from two numbers.

4. **Uncertainty is graded, and the grade is a first-class output.** `UNCERTAINTY_GRADES` are `tight`,
   `moderate`, `wide` and `unusable`, and the six `UNCERTAINTY_REASONS` — `short_history`, `sparse_history`,
   `volatile_history`, `long_horizon`, `unstable_residuals`, `seasonal_cycle_incomplete` — are **stable codes,
   never prose**, so they are safe in an event, an API response, a report and a test. `unusable` is a real
   verdict the domain is willing to reach and not a floor it avoids: a forecast the evidence cannot support says
   so in its own grade rather than looking like every other forecast in the list.

   `judgeCalibration` closes the loop the other way. `CALIBRATION_VERDICTS` are `calibrated`, `overconfident` and
   `underconfident`, computed from observed coverage against nominal within `CALIBRATION_TOLERANCE` — so the
   intervals a model actually produced are checked against what actually happened, and the check is the same
   arithmetic every time.

5. **Assumptions are a precondition of producing a run, not a field on one.** `produce` inspects the declared
   assumptions and throws `UndeclaredAssumptionsError` if they do not hold up — so a run on unstated assumptions
   is not a poorly documented run, it is **not a run**. An assumption declares its `kind` (`continuity`,
   `exogenous`, `policy`, …) and its `basis`, and the basis carries obligations: `BASES_REQUIRING_HOLDER`
   (`expert_judgement`) demands a named person, `BASES_REQUIRING_REFERENCE` (`declared_policy`,
   `upstream_forecast`) demands the thing referred to. The six `ASSUMPTION_ISSUE_CODES` — `no_assumptions`,
   `duplicate_assumption_key`, `missing_holder`, `missing_reference`, `unstated_assumption`,
   `contradictory_assumptions` — are the whole vocabulary of the check.

   The holder rule is why the `PersonDirectory` port exists and is not cosmetic: an assumption attributed to a
   person who does not exist **declares nothing while looking like it declares something**, which is worse than
   declaring nothing at all. Attribution the platform cannot resolve is refused at the moment it is made.

6. **Reproducibility is a sha256 digest over canonicalized pinned inputs, and drift is diagnosed rather than
   reported as a boolean.** `reproducibilityKeyOf` canonicalizes the exact inputs a run stood on — the
   observations, the method, its version, its resolved parameters, the seed, the horizon, the confidence levels —
   and digests them. Two runs with the same digest stood on the same ground; two with different digests did not,
   and `diffInputs` says **which** of `observations_changed`, `parameters_changed`, `method_changed`,
   `seed_changed`, `horizon_changed` and `values_changed` moved.

   `FORECAST_PRECISION` is `6` and `VALUE_TOLERANCE` is `10 ** -6`, which is what makes reproduction _testable_:
   floating-point arithmetic will not return bit-identical values across every path, so "reproducible" is defined
   as same digest **and** maximum value delta within tolerance, rather than as an equality that would fail for
   reasons having nothing to do with the forecast. This is also why the package holds no clock and no random
   source — a forecast whose inputs can move underneath it was never reproducible, and one that reads the wall
   clock has an input nobody pinned.

7. **Publication is earned by a backtest, not granted by an author.** A `ForecastModel` is `draft → published →
retired`, and `publish` refuses with `ModelNotPublishableError` unless a backtest scored it publishable.
   `isPublishable` is two conditions and both are required: **positive skill against the naive baseline**, and
   **intervals that were not overconfident**, on a non-empty holdout. Either alone can be gamed by a model that
   is wrong in a comfortable direction — excellent skill with overconfident intervals produces good central
   estimates surrounded by a range nobody should have planned inside, and honest intervals with no skill are an
   accurate account of knowing nothing. Underconfidence does not disqualify: intervals wider than they needed to
   be are a cost, not a lie, and saying so keeps the check about honesty rather than polish. An empty holdout
   never qualifies, because absence of evidence is not a pass.

   Models are **versioned**, with `(tenant, model_key, version)` unique in the database. Amending a published
   model mints a new version rather than editing one that runs have already been produced against.

8. **Observation history is correctable, and correcting it is a separate authority from everything downstream.**
   `forecast:record` gates declaring a series, recording observations, correcting them and withdrawing them — and
   it is separate from every other scope precisely because a corrected observation **retroactively edits the
   history every published model was fitted against**. That is a legitimate and necessary act (a data steward
   fixing a bad reading), and it is not the same act as producing a forecast or committing to a target.
   `forecast.series.observation_corrected` and `.observation_withdrawn` are distinct events for the same reason:
   downstream, the interesting question is not "did the series change" but "was something restated or removed".

9. **Scenarios and simulations are separate aggregates.** A `Scenario` is a declared set of levers — the case an
   institution permits itself to reason about, settled ahead of time and `draft → published → archived`. A
   `SimulationRun` is one execution of a published scenario against a forecast run, and it is a record of what
   was actually computed. Collapsing them would make "what did we simulate in March" unanswerable once the
   scenario moved on, which is the same reason D27 keeps a recommendation separate from the decision on it.

   `LEVER_KINDS` are `additive`, `multiplicative`, `override` and `growth_rate`; `MAX_LEVER_FACTOR` is `10` and
   bounds how far a lever may move a projection, because a scenario that multiplies enrolment by a thousand is
   not a scenario. `orderLevers` makes application order deterministic rather than dependent on declaration
   order, so the same scenario against the same forecast always produces the same outcome — the reproducibility
   requirement reaching simulation. `leverAssumptionPairs` carries each lever's assumption alongside it, because
   a simulated outcome inherits the assumption requirement rather than escaping it.

10. **Strategic plan objectives freeze at activation.** A `StrategicPlan` is `draft → active → completed |
abandoned`, and objectives may be added, amended and removed **only while it is a draft**. A target that can
    be moved after the fact is not a target: the question a review exists to answer is whether the institution
    met what it said it would, and a plan whose objectives track its performance always meets them.

    A review keeps **the variance it saw** rather than one recomputed on read, and keeps the plan version it was
    computed against — the difference between a record of what leadership was told and a recalculation of what
    they should have been told. `TRACKING_STATES` are `on_track`, `at_risk`, `off_track`, `achieved` and `missed`
    with `PLAN_ON_TRACK_TOLERANCE` (0.05) and `PLAN_AT_RISK_TOLERANCE` (0.15) as the bands; progress readings are
    kept **in arrival order rather than sorted by period**, because a correction arriving after a later reading
    is precisely the case a sort would silently reorder into the wrong answer. Abandoned plans are kept: the
    record that a course was tried and changed is what a later leadership needs, and deleting it turns a decision
    into an omission.

11. **One pure package, `@knowget/predictive-intelligence`, seven aggregates.** `ObservationSeries` (the measured
    history, its grain, its declared seasonal cycle and its observations; `active ↔ closed`). `ForecastModel` (a
    versioned method and parameter set; `draft → published → retired`). `ForecastRun` (one projection, with its
    points, intervals, assumptions, uncertainty assessment and reproducibility key; `completed → superseded |
invalidated`). `Backtest` (one holdout scoring, with its accuracy scores, calibration verdict and frozen
    publishability). `Scenario` (a declared lever set; `draft → published → archived`). `SimulationRun` (one
    scenario applied to one forecast; `completed → superseded`). `StrategicPlan` (objectives, progress readings
    and reviews; `draft → active → completed | abandoned`).

12. **No domain→domain package import; three directory ports instead.** `OrganizationDirectory` resolves the
    organization every series, model, scenario and plan hangs off (P2-D01-M01). `PersonDirectory` resolves every
    attributed act — who produced a run, who scored a model, who ran a simulation, who activated or reviewed a
    plan — and every `expert_judgement` assumption holder (P2-D01-M02). `SeriesSubjectDirectory` resolves **what
    a series is actually about**, and it is the interesting one: a subject-scoped series measures attendance for
    one grade section, cash flow for one cost centre, demand on one route, occupancy in one block, and no single
    service resolves all twenty-four domains' records. The composition root binds it to organization, person and
    student services directly, and to the **P2-D25 knowledge graph** by `(sourceDomain, sourceRef)` for
    everything else — which is exactly what the graph is for rather than a convenient fallback.

    An unresolvable subject answers `false` and the series is refused. A directory that returned `true` for
    domains it does not know would leave the guard running on every request and checking nothing on most of them,
    which is worse than no guard because it reads like one. Entity status is deliberately not consulted: a closed
    cost centre and a discontinued route are archived records institutions still finish the history of, and this
    domain already has a state for that — the series is **closed, not forbidden**.

13. **The API splits along authority, in five permission scopes.** `forecast:record` is the evidence a projection
    stands on, separate because correcting an observation edits history retroactively. `forecast:manage` is the
    methods and cases an institution permits itself — drafting, publishing and retiring models, declaring and
    publishing scenarios — settled ahead of time by people who answer for them. `forecast:operate` is the runtime
    that produces, verifies, supersedes and invalidates runs, and scores backtests. **`forecast:plan` stands
    alone**: setting a target against a projection, activating it and answering for it at review are leadership
    acts an institution is held to, and the ability to project is not the ability to commit. `forecast:read` is
    every read and is **deliberately wide**, because a forecast nobody may inspect fails this contract as surely
    as one carrying no intervals. **77 endpoints across 7 controllers**, all permission-gated, every body
    zod-validated.

    `GET forecast/runs/:id/verification` is a consequence-free read gated on `forecast:operate` rather than
    `forecast:read`: it recomputes the run from its pinned inputs, which is the operator's check and not a
    general report. Accountable identity is taken from the authenticated principal at every attributing endpoint
    and **never read from a body anywhere in this domain**.

14. **Seven FORCE-RLS tables, and five of them carry no soft-delete column.** A `forecast_model` and a `scenario`
    can be withdrawn before anything stands on them, so they keep `deleted_at`. An `observation_series`, a
    `forecast_run`, a `backtest`, a `simulation_run` and a `strategic_plan` **cannot** — they are the measured
    history, what was projected from it, how it scored, what was simulated and what was committed to — so there
    is no `remove` path and therefore no column to imply one. Declaring a soft-delete column that no read filters
    is worse than not having it. Four absolute uniques are DB-backed: series `(tenant, organization, series_key)`,
    model `(tenant, model_key, version)`, scenario `(tenant, organization, scenario_key)` and plan `(tenant,
organization, plan_key)`.

15. **30 `forecast.*` events carry ids, keys, statuses, grades, reason codes and counts — never forecast values,
    never assumption prose, never people.** A run's projected numbers, an assumption's `statement`, a model's
    `description` and a plan's `name` stay in the domain. Grades and reason _codes_ travel, because an
    uncertainty verdict nobody downstream can see is not a control. `producedByUserId`, `scoredByUserId` and
    `reviewedByUserId` do not: an event is a broadcast, and a broadcast that names people turns an operational
    feed into a surveillance feed. Forecast values do not travel either, for a different reason — a number
    detached from its interval, its assumptions and its uncertainty grade is precisely the artifact this contract
    exists to prevent, and an event is the easiest place for one to escape.

16. **`versionOf` is the one numeric path parameter in the domain, and it parses strictly.** Numeric parameters
    otherwise travel in request bodies platform-wide. A model version is genuinely part of a model's identity, so
    it belongs in the path — and it is parsed by an explicit strict integer check rather than by `Number`, which
    reads `"7abc"` as `7` and would silently serve version 7 to a caller who asked for something else.

## Consequences

- The platform now has **one definition of what a forecast is**, and the four requirements are structural rather
  than procedural: an interval has no absent representation, assumptions are checked before a run exists, the
  uncertainty grade is an output rather than a note, and the reproducibility key is a digest over pinned inputs.
  Twenty-four domains project through this rather than each holding a private answer, so an institution asking
  about next term's enrolment gets one number with one interval and one set of assumptions.
- **A forecast the evidence cannot support says so.** `unusable` is a verdict the domain reaches, `long_horizon`
  degrades a grade even inside the admissible ratio, and the ratio itself cannot be negotiated by anyone at any
  level. The pressure to extend a horizon is real and permanent; the constant is the only thing that outlasts it.
- **A published model earned publication.** Skill against the naive baseline and non-overconfident intervals are
  both required, scored on a real holdout, and frozen at the moment of scoring so the verdict and its evidence
  cannot drift apart. A method nobody backtested cannot be published, which means it cannot be the thing a
  strategic plan is judged against.
- **Every number can be recomputed and the recomputation diagnosed.** `reproduce` answers not just whether a run
  reproduces but which input moved when it does not — the difference between an audit finding and an audit
  question. The absence of a clock and of an unseeded random source is what makes that answer trustworthy.
- **Commitment is separated from projection**, at the permission layer and in the aggregate. Objectives freeze at
  activation, reviews keep what they saw, and abandoned plans stay on the record. An institution can ask what it
  committed to, what happened, and what it was told at the time — three different questions with three different
  answers.
- **P2-D25 is load-bearing.** The series-subject directory resolves twenty-one domains' records through the
  graph, which makes graph population a real operational prerequisite for subject-scoped series in those domains.
  That cost is intended: a forecast about a subject the institution cannot identify is a number attributed to
  nothing.
- **P2-D27's boundary held.** Its metrics engine is descriptive counts and rates by design, and nothing in it
  predicts. This contract is where prediction lives, and the two do not overlap.
- The deferrals are recorded as **TD-48**: the series-key, model-version, scenario-key and plan-key guards are
  check-then-act in the service (all four absolute uniques are DB-backed and reject `23505`, so the window is a
  friendlier error rather than a lost invariant), verification recomputes on the caller's thread rather than
  through a queue, and the six projection methods are the deliberate scope of this contract — richer methods
  (ARIMA, state-space, ML regressors) are a later increment behind the same interval, assumption, uncertainty and
  reproducibility contract, which is exactly what makes adding them safe. None weakens an absolute invariant.

## Alternatives considered

- **Make the horizon ratio a model parameter or a tenant setting.** Rejected — it is the one guard whose whole
  value is that it cannot be negotiated, and the pressure to raise it arrives exactly when raising it is least
  justified. A configurable ratio is a ratio that will be raised under deadline pressure by whoever has the admin
  console.
- **Let a forecast point omit its interval when the method does not produce one.** Rejected — that makes a point
  estimate representable, which means it will exist, be listed, be charted and eventually be planned against. A
  method that cannot produce an interval does not belong in a package whose contract requires one.
- **Open the confidence levels to any value.** Rejected — an arbitrary level invites the level to be chosen after
  the interval is seen. Three closed levels with an exact multiplier table cost nothing and remove the move.
- **Assumptions as an optional field, validated at publication.** Rejected — the same failure as D27's evidence:
  an unstated-assumption run would exist, be listed, be counted, and occasionally be used by a path that forgot
  to check. Refusing at production is the only version of "always declares its assumptions" that is true.
- **A reproducibility flag set by the producer.** Rejected — it records a claim rather than a property. A digest
  over canonicalized pinned inputs is checkable by anyone, later, without trusting whoever produced the run.
- **Store the projected values in the domain events.** Rejected — a number detached from its interval, its
  assumptions and its grade is the exact artifact this contract exists to prevent, and an event is the easiest
  place for one to escape into a dashboard that shows it bare.
- **Let an author publish a model without a backtest.** Rejected — publication would then mean "someone was
  confident" rather than "it beat the baseline on held-out data". The whole point of a published model is that a
  plan may be judged against it.
- **One aggregate for scenario-and-simulation.** Rejected — the case an institution reasons about and the
  execution of that case have different lifetimes, and collapsing them makes "what did we simulate in March"
  unanswerable once the scenario is amended.
- **Allow objectives to change on an active plan.** Rejected — a plan whose targets track its performance always
  meets them, and a review of such a plan measures nothing. Amendment belongs to the draft state, where it means
  what it says.
- **Recompute plan variance on every read instead of freezing it at review.** Rejected — a review is a record of
  what leadership was told at a point in time. Recomputation answers a different and less useful question, and
  loses the only version of the answer an audit can use.
- **Sort progress readings by period.** Rejected — the latest reading is the one recorded last, not the one at
  the highest period. A correction arriving after a later reading is exactly the case a sort silently reorders
  into the wrong answer.
- **Resolve series subjects with a permissive directory that returns `true` for unknown domains.** Rejected — the
  guard would run on every request and check nothing on most of them, which is worse than no guard because it
  reads like one and would be trusted like one.
- **Fold `forecast:plan` into `forecast:operate`.** Rejected — producing a projection and committing the
  institution to a target against it are different acts with different accountability, and one scope would make
  the operator who produced the forecast the person who commits to it.
