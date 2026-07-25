# Engineering Delivery Report — P2-D11

**Learning Intelligence & Educational Insights Platform (LIEIP)** · Phase 2 (Enterprise Domain Engineering) · Program: Academic Excellence Platform

|                |                                                                                                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D11 — Learning Intelligence & Educational Insights Platform                                                                                                                                                               |
| **Status**     | ✅ Complete — CI green; merged to main (`6edc0b1`). Gates green in-sandbox (full monorepo typecheck 101/101, build 54/54, `@knowget/learning-intelligence` 31 tests, `apps/api` 190 tests); RLS verified on live PostgreSQL. |
| **Depends on** | P2-D10 (Assessment, ADR-0029), P2-D08/D09 (Attendance, Teaching-Learning), P2-D05 (Wellbeing), P2-D03 (Student Lifecycle), P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`)                                                             |
| **Date**       | 1 November 2026                                                                                                                                                                                                              |
| **Next**       | P2-D12 — Human Capital & Workforce Intelligence Platform (Program: Workforce, Finance & Resources)                                                                                                                           |

---

## 1. Mission recap

Deliver the **Learning Intelligence & Educational Insights Platform** — the capstone of the
academic program and the domain that brings the learner and academic domains together. It
**synthesizes** the descriptive indicators those domains already expose (student-lifecycle,
wellbeing, attendance/presence, teaching-learning and assessment) into a unified per-learner
intelligence profile, and turns it into **explainable** educational insights, rule-based early
warnings, human-in-the-loop recommendations, growth plans and leadership cohort insights. Its
defining constraints are that it is **descriptive and explainable only** — ML prediction/forecasting
is an explicit non-goal deferred to the intelligence core (P2-D28) — that **every conclusion carries
an evidence chain**, and that it **consumes** the upstream domains rather than recomputing them.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain**           | `@knowget/learning-intelligence` — seven aggregates (Learner Insight Profile, Learning Signal, Early Warning, Educational Insight, Recommendation, Growth Plan, Cohort Insight), each an immutable aggregate + factory + guarded transitions with an application service; value objects (dimensions, risk bands, evidence refs, categories, priorities, statuses); and **three pure engines** — learner-insight synthesis, early-warning rule evaluation, and cohort rollup                                       |
| **Engines**          | Pure, deterministic `synthesizeLearnerInsight` (per-dimension mean of 0–100 health readings → bands → equal-weight overall; `dimensionsCovered` is the data-sufficiency signal), `evaluateEarlyWarnings` (transparent threshold rules; names the rule and score that tripped it; absence of data never fires), and `summarizeCohort` (average, band distribution and learners-needing-attention over the members' profiles, excluding un-synthesized learners) — all division-safe, two-decimal and clamped 0–100 |
| **Persistence**      | Seven models in `schema.prisma` + one migration (`20261101000000_add_learning_intelligence`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK), tenant/scope-indexed, soft-delete + audit columns; tenant-scoped DB unique indexes for the profile (student) and cohort insight (scope type, scope id); evidence chains, histories, dimension scores, goals, id lists and band distribution as non-null JSONB, scores/percentages DOUBLE PRECISION                                              |
| **API**              | Seven permission-gated (`insight:read`/`:write`), tenant-scoped REST controllers under `learning-intelligence/*` (signals, profiles incl. refresh, early warnings incl. the acknowledge/resolve workflow, insights, recommendations incl. the human accept/reject/action workflow, growth plans incl. goal outcomes, cohort insights incl. rollup refresh); zod DTOs; seven Prisma/RLS adapters + two directory adapters; `LearningIntelligenceModule` importing the Organization and Student-Lifecycle modules   |
| **Events**           | Nine domain events: `insight.signal.captured`, `insight.profile.refreshed`, `insight.early_warning.raised`, `insight.early_warning.resolved`, `insight.published`, `insight.recommendation.proposed`, `insight.recommendation.accepted`, `insight.growth_plan.activated`, `insight.growth_plan.achieved`                                                                                                                                                                                                          |
| **Docs & decisions** | ADR-0030 (platform + tri-engine architecture); this report; platform-state, technical-debt (TD-31) and CHANGELOG updates                                                                                                                                                                                                                                                                                                                                                                                          |

## 3. Domain capabilities & invariants

- **Learning signals.** An immutable, evidence-bearing descriptive signal about a learner distilled
  from an upstream domain's indicator (dimension, 0–100 health reading, trend, evidence reference),
  captured into the learner's append-only feed. Captured, never edited.
- **Learner insight profile.** The unified per-learner picture, one per student, **refreshed** by
  running the synthesis engine over the learner's signals — per-dimension and overall
  learning-health scores and bands, with `dimensionsCovered` marking data sufficiency; each refresh
  versioned.
- **Early warning.** A rule-based, explainable risk flag (fired rule, tripping score, rationale,
  evidence) across raised → acknowledged → resolved | dismissed; the service suppresses duplicate
  open warnings for the same rule.
- **Educational insight.** A generated, explainable finding (strength / gap / trend / risk /
  opportunity) with a narrative, priority and evidence chain; content editable only while proposed,
  then proposed → published → archived.
- **Recommendation.** An evidence-grounded, **human-in-the-loop** suggestion — proposed by the
  platform, accepted or rejected by a human (recorded with the decider), then actioned; proposed →
  accepted → actioned | rejected.
- **Growth plan.** Turns accepted recommendations into measurable goals with recorded, audited
  outcomes and a derived progress percentage; draft → active → achieved | abandoned.
- **Cohort insight.** A leadership-facing rollup over an organization, grade or section (one per
  scope) — average learning-health, band distribution and learners needing attention — computed over
  the members' profiles; draft → published.
- **Cross-cutting invariants.** Every record is organization-scoped and about a validated Student;
  every conclusion carries evidence; every uniqueness rule is DB-enforced; all data is FORCE-RLS
  tenant-isolated and fail-closed; nothing predicts and nothing recomputes an upstream metric.

## 4. Verification

- **Gates (in-sandbox).** Full monorepo **typecheck 101/101** and **build 54/54** (turbo).
  `@knowget/learning-intelligence` typecheck, lint, build and **31 unit/integration tests** green
  (across all three engines, all seven services and an end-to-end integration suite). `apps/api`
  **190 tests** green (9 integration specs skipped, as in CI), including the learning-intelligence
  **DI compilation spec** — all seven controllers and seven services resolve through the module,
  including the imported Organization and Student-Lifecycle modules. Prettier-clean.
- **Engine coverage.** Tests exercise the synthesis arithmetic (per-dimension mean, per-reading
  clamp, equal-weight overall, canonical dimension order, empty-scope data sufficiency), the
  early-warning rule engine (threshold `<=`, absence-of-data skip, ascending-severity ordering,
  custom rules), the cohort rollup (un-synthesized exclusion, band distribution, needing-attention),
  every aggregate lifecycle, and an end-to-end signal → profile → warning → insight → recommendation
  → growth plan → cohort integration proving the descriptive pipeline is consistent and explainable
  with no prediction anywhere.
- **Live RLS (real PostgreSQL 16).** Migration applied as a `NOSUPERUSER` table owner so `FORCE ROW
LEVEL SECURITY` applies. For all seven tables: tenant A sees only its own rows; tenant B sees zero
  (isolation); an unset tenant sees zero (fail-closed); a cross-tenant `INSERT` is rejected by the
  `WITH CHECK` clause.
- **Independent audit.** A separate reviewer audited the domain, adapters, schema, migration and
  controllers against the P2-D10 reference across engine correctness, aggregate transitions,
  multi-tenancy/RLS, adapter fidelity, service invariants, DTO/controller correctness and — given
  the domain — **non-goal/prediction discipline**, and found the human-in-the-loop lifecycle,
  evidence discipline and RLS clean. One major finding — the cohort-insight service did not
  pre-check its one-per-scope invariant, so a duplicate surfaced as a 500 rather than a 409 — was
  fixed in-milestone (a `DuplicateCohortInsightError` + `findByScope` pre-check, mirroring the
  reference), with a regression test. Four minor findings (a dead error class, an incomplete default
  rule set, un-audited goal outcomes and an unclamped manual score) were also fixed with tests.

## 5. Decisions

Recorded in **ADR-0030**. In brief: one package for all seven aggregates plus **three** pure engines
(synthesis, early-warning evaluation, cohort rollup) over narrow views, built and tested first;
**synthesis, not recomputation and not prediction** — ML forecasting deferred to the intelligence
core (P2-D28); an evidence chain on every signal, warning, insight and recommendation; rule-based
explainable early warnings; **human-in-the-loop** recommendations (the platform proposes, humans
decide); learner insight profiles refreshed from signals and growth plans that close the loop to
measurable outcomes; cohort insights as the leadership rollup; a single `insight:*` scope; FORCE-RLS
persistence per ADR-0010 with JSONB and DOUBLE PRECISION; nine events;
prediction/agents/knowledge-graph/upstream-recomputation excluded.

## 6. Technical debt

- **TD-21 (carried).** Domain Prisma adapters live at the `apps/api` composition root rather than in
  a dedicated persistence package — unchanged from ADR-0010.
- **TD-31 (new).** Upstream evidence references on a learning signal, warning, insight or
  recommendation (and a growth plan's `sourceRecommendationIds`) are stored **without** per-item
  existence validation, though the owning Organization and Student are validated on write. This
  domain synthesizes the upstream domains rather than re-verifying them, so validating each evidence
  reference would add a cross-domain call per element per write for little benefit; the learner is
  the validated anchor. Tightening to validate references is a later refinement behind the services
  (ADR-0030).

## 7. Recommendation — Academic Excellence Platform complete; proceed to P2-D12

P2-D11 delivers the unified learner-intelligence system of record and **completes Program B — the
learner & academic core (P2-D02…D11)**: an institution now governs, enrols, supports, structures,
schedules, tracks attendance, teaches, assesses and — with this contract — **understands** its
learners, with every conclusion descriptive, explainable and evidence-backed, and predictive
intelligence cleanly reserved for the intelligence core. Every downstream domain can consume this
platform's synthesized intelligence rather than reassembling it. The certified core and all frozen
packages are untouched. **Recommend proceeding to P2-D12 — Human Capital & Workforce Intelligence
Platform** (the start of Program: Workforce, Finance & Resources).
