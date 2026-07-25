# 30. Learning Intelligence & Educational Insights: one package, seven aggregates, three pure engines, synthesis not prediction

- **Status:** Accepted
- **Date:** 2026-11-01
- **Contract:** P2-D11 (Learning Intelligence & Educational Insights Platform)

## Context

P2-D11 is the sixth and final contract of the **Academic Excellence Platform** program and the
capstone of Program B (the learner & academic core), on the certified `v0.2.0` baseline, the frozen
Phase-1 core, and the P2-D03…D10 learner and academic domains. Every one of those operational
domains was built to expose **descriptive, explainable "AI-ready indicators"** — student-lifecycle
risk, learner-wellbeing signals, attendance/presence profiles, instructional intelligence,
assessment intelligence and competency mastery — while deferring predictive/autonomous AI. This
contract is where those indicators come together: the authoritative domain for **how a learner's
cross-domain signals are synthesized into unified intelligence and turned into explainable
educational insights, early warnings, recommendations and growth plans**.

The platform's specification is disciplined about _where_ intelligence lives. Genuine predictive
modelling and simulation are reserved for the strictly-ordered **intelligence core** (P2-D28,
Predictive Intelligence, with confidence intervals and reproducibility); knowledge-graph, agents
and autonomous operations are P2-D25…D27. So this domain is deliberately **descriptive,
rule-based and explainable only** — it synthesizes and interprets, it does not forecast. Its
through-line requirements are that every signal, warning, insight and recommendation carries an
**evidence chain**, that recommendations are **human-in-the-loop** (the platform proposes, humans
decide), and that it **consumes** the upstream domains rather than recomputing them.

Like the domains before it, it has a genuine computational core: a synthesis engine, a rule-based
early-warning engine and a cohort-rollup engine. Those engines are the crux of the design.

## Decision

1. **One domain package, `@knowget/learning-intelligence`, for all seven aggregates** — the same
   single-bounded-context choice as the nine prior domains (ADR-0021…0029). A shared spine
   (`errors.ts`, `ports.ts`, `learning-intelligence-events.ts`, `index.ts`), a per-aggregate pair
   (`<aggregate>.ts` + `<aggregate>-service.ts`), value objects (dimensions, risk bands, evidence
   refs, priorities, statuses), and — distinctively — **three pure engine functions** over narrow
   views (`insight-view.ts`).

2. **Three pure engines are the computational core, built and tested first.** `synthesizeLearnerInsight`
   averages each learning dimension's 0–100 health readings, bands each dimension, and equal-weights
   the covered dimensions into an overall learning-health score and band. `evaluateEarlyWarnings`
   fires transparent threshold rules over those dimension scores. `summarizeCohort` rolls a set of
   learner profiles into a leadership-facing cohort picture (average, band distribution, learners
   needing attention). All are pure, deterministic, division-safe, clamped 0–100 and two-decimal,
   over narrow views the aggregates structurally satisfy, so they depend on no aggregate.

3. **Synthesis, not recomputation and not prediction.** The readings come from the upstream
   domains' own descriptive indicators, captured as evidence-bearing **learning signals**; this
   domain never recomputes an attendance percentage or an assessment average, it consumes them.
   And it never predicts: the output is descriptive and explainable (the covered dimensions and the
   fired rule are named), with **ML forecasting an explicit non-goal deferred to the intelligence
   core (P2-D28)**.

4. **An evidence chain on everything.** Every learning signal carries a reference to the upstream
   record that substantiates it; every early warning names the rule that fired and the exact score
   that tripped it; every insight and recommendation carries its supporting evidence. Nothing in
   this domain is an opaque assertion — the human-centred AI constraint (explain, show evidence,
   highlight uncertainty) is enforced by the model.

5. **Rule-based, explainable early warnings.** An early warning is raised when a transparent
   threshold rule trips a dimension's synthesized score; it records the rule id, the observed score,
   a rationale and evidence, and runs raised → acknowledged → resolved | dismissed with an
   append-only history. The service suppresses duplicate open warnings for the same rule, so a
   repeatedly-tripping rule never spams the feed. Absence of data never fires a warning.

6. **Human-in-the-loop recommendations.** A recommendation is only ever _proposed_ by the platform
   (with evidence); a responsible adult _accepts_ or _rejects_ it (recorded with the decider), and
   an accepted recommendation is later marked _actioned_. There is no self-accept or self-execute
   path — _AI recommends with evidence; humans approve_, exactly the platform's stance.

7. **The learner insight profile is synthesized, never hand-edited; the growth plan closes the
   loop.** A profile is one per student and is _refreshed_ by running the synthesis engine over the
   learner's signals (each refresh bumps the version and stamps the synthesis time). A growth plan
   turns accepted recommendations into measurable goals with recorded, audited outcomes and a
   derived progress percentage — draft → active → achieved | abandoned.

8. **Cohort insight is the leadership rollup.** A cohort insight summarizes an organization, grade
   or section (one per scope) by running the cohort-rollup engine over its members' profiles
   (un-synthesized learners excluded), producing the average learning-health, band distribution and
   the count needing attention; draft → published.

9. **A single `insight:*` permission scope.** Its records are derived, evidence-_referencing_
   descriptive intelligence for the academic staff who already hold the source scopes (it stores
   references, not confidential content), so — like academic structure through assessment
   (ADR-0025…0029) — one `insight:read` / `insight:write` pair gates the whole surface.

10. **Persistence per ADR-0010.** Seven tables (`learner_insight_profile`, `learning_signal`,
    `early_warning`, `educational_insight`, `recommendation`, `growth_plan`, `cohort_insight`) with
    Prisma/RLS adapters at the `apps/api` composition root (TD-21). Every table has `ENABLE` +
    `FORCE ROW LEVEL SECURITY` and the standard `tenant_isolation` policy (USING + WITH CHECK,
    fail-closed) — verified on live PostgreSQL. Evidence chains, status histories, dimension scores,
    goals, id lists and the band distribution are non-null JSONB; scores and percentages are
    `DOUBLE PRECISION`; the uniqueness rules (one profile per student, one cohort insight per scope)
    are tenant-scoped DB unique indexes.

11. **Nine domain events on the platform bus** — `insight.signal.captured`,
    `insight.profile.refreshed`, `insight.early_warning.raised`, `insight.early_warning.resolved`,
    `insight.published`, `insight.recommendation.proposed`, `insight.recommendation.accepted`,
    `insight.growth_plan.activated`, `insight.growth_plan.achieved`.

12. **Cross-domain references enter through directory ports.** Organization (P2-D01-M01) and student
    (P2-D03) existence are validated through injected directories; upstream evidence references
    (assessment, attendance, wellbeing, instruction) are stored **without** per-item validation —
    an accepted cost trade-off (**TD-31**), since this domain synthesizes those domains rather than
    re-verifying them.

13. **Explicit non-goals.** No ML prediction or forecasting (P2-D28), no knowledge graph or semantic
    layer (P2-D25), no agents or autonomous operations (P2-D26/D27), and no recomputation of an
    upstream domain's metrics. This domain is the descriptive, explainable base those later
    intelligence domains build on.

## Consequences

- **A unified learner-intelligence system of record.** An institution sees each learner's
  cross-domain learning-health in one place, gets explainable early warnings and insights, and runs
  evidence-grounded recommendations and growth plans — the capstone the academic program was
  building toward.
- **Intelligence stays where the spec puts it.** Because this domain is descriptive and explainable
  only, the AI-native spine's discipline holds: prediction, agents and the knowledge graph remain in
  the intelligence core, layered on top of this base rather than duplicated here.
- **Everything is explainable and auditable.** Evidence chains, named rules, recorded human
  decisions and append-only histories mean every conclusion can be traced to its source.
- **A pure, testable core.** Three engines are pure functions over narrow views — 31 package tests
  exercise the synthesis arithmetic (per-dimension mean, clamping, equal-weight overall, data
  sufficiency), the rule engine (threshold, absence-of-data, ordering), the cohort rollup, every
  aggregate lifecycle, and an end-to-end signal → profile → warning → insight → recommendation →
  growth plan → cohort integration.
- **Isolation.** All seven tables are FORCE-RLS tenant-isolated and fail-closed, verified on live
  PostgreSQL; the uniqueness rules are tenant-scoped at the DB.
- **Deferred, interface-protected.** Domain Prisma adapters remain at the composition root (TD-21);
  upstream evidence references are stored against the validated learner anchor (TD-31). One growing
  package, acceptable for a cohesive bounded context (as with the nine prior domains).
