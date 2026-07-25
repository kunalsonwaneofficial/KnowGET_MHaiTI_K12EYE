# 29. Assessment & Evaluation: one package, seven aggregates, two pure engines, one grading core, marks and mastery kept apart

- **Status:** Accepted
- **Date:** 2026-10-15
- **Contract:** P2-D10 (Assessment & Evaluation Platform)

## Context

P2-D10 is the fifth contract of the **Academic Excellence Platform** program, on the certified
`v0.2.0` Identity & Organization baseline, the frozen Phase-1 core, and the academic structure
(P2-D06, ADR-0025), scheduling (P2-D07, ADR-0026), attendance (P2-D08, ADR-0027) and
teaching-learning (P2-D09, ADR-0028) platforms. It is the authoritative domain for **how learning
is assessed, marked, mastered and recorded**: assessment frameworks, assessment plans,
assessments, question banks, evaluations, competency profiles and academic records — with an
AI-ready surface of assessment indicators.

The contract names seven aggregate roots and the through-line requirements that **grading be
consistent from a single computational core**, that **competency mastery be tracked independently
of raw marks**, and that **a published academic record be immutable except through a controlled,
reasoned amendment workflow**. It follows the domain architecture pattern (ADR-0010) with no
frozen-code change. Instruction delivery, attendance, timetabling, AI tutoring and predictive
analytics are explicit non-goals — this platform is **assessment, not instruction, attendance or
prediction**; it consumes the instruction platform (P2-D09) and is consumed by the intelligence
program.

Like the four platforms before it, this domain has a genuine computational core — in fact two:
a **grading engine** that turns marks into percentages, grades and GPA, and an
**assessment-intelligence engine** that distils assessments, evaluations and masteries into
descriptive indicators. Those engines are the crux of the design.

## Decision

1. **One domain package, `@knowget/assessment-evaluation`, for all seven aggregates** — the same
   single-bounded-context choice as the eight prior domains (ADR-0021…0028). A shared spine
   (`errors.ts`, `ports.ts`, `assessment-evaluation-events.ts`, `index.ts`), a per-aggregate pair
   (`<aggregate>.ts` + `<aggregate>-service.ts`), value objects (framework/plan/assessment/
   question/evaluation/competency/academic-record types, statuses, revisions), and — distinctively
   — **two pure engine modules** (`grading.ts`, `assessment-intelligence.ts`) over narrow views
   (`assessment-view.ts`).

2. **A pure grading engine is the computational core, built and tested first.** `computePercentage`,
   `gradeFor` (the highest-minimum band a percentage satisfies), `gradeMarks` and `computeGpa`
   (credit-weighted, else a simple average of graded entries) are pure, deterministic and
   division-safe, two-decimal, clamped 0–100. Grade bands live on the assessment framework and are
   consumed by the engine, so the same arithmetic produces every grade and GPA in the system.

3. **Grades flow through one grading engine, so every derived figure agrees.** A report card's
   GPA, a transcript's cumulative GPA and the analytics' average performance are all produced from
   the same `computeGpa`/`computePercentage`, so they are consistent by construction rather than by
   coincidence — the contract's grading-consistency requirement made structural, and proven by an
   end-to-end integration test.

4. **A pure assessment-intelligence engine over narrow views.** `computeAssessmentIndicators`
   derives assessment/evaluation throughput, evaluation approval rate, average performance and
   performance consistency (variance-based), competency mastery, mastered competencies, learning
   gaps and curriculum coverage. It consumes narrow view interfaces (`AssessmentView`,
   `EvaluationView`, `CompetencyMasteryView`) that the aggregates structurally satisfy, so it
   depends on no aggregate and is exhaustively unit-testable. Descriptive only — prediction is a
   non-goal.

5. **Competency mastery is tracked independently of raw marks.** The competency profile records an
   ordinal mastery level (`not_assessed` → `emerging` → `developing` → `proficient` → `advanced` →
   `mastered`) per competency, set from evidence and evaluation judgement — never derived from a
   percentage — with an append-only growth trajectory. The intelligence engine's mastery indicator
   reads mastery levels (`masteryScore`), never marks: competence and scores are kept deliberately
   apart, as the contract requires.

6. **Academic records are immutable after publication.** A record runs draft → published; while a
   draft its grade entries and promotion decision are editable, and publishing freezes it.
   Thereafter it changes **only** through a controlled, append-only amendment workflow — every
   correction a reasoned, attributed `RecordAmendment` that bumps the version — so a published
   transcript is always a known, audited version. GPA and credits are recomputed through the
   grading engine on every change.

7. **Evaluation is an auditable marking workflow.** An evaluation records marks (or rubric scores,
   which derive the marks) while a draft, then runs draft → submitted → moderated → approved, every
   transition appended to an immutable history; an approved evaluation may be **reopened** for
   re-evaluation (version bumped, recorded), so results are always traceable. One evaluation per
   (assessment, student).

8. **Assessment frameworks and question banks are version-controlled, and `revise` is not a
   shortcut into `active`.** Both run draft → active → archived with a counter + revision log
   (reusing the P2-D06…D09 pattern); only an **active** aggregate may be revised, so a draft must
   be deliberately activated first — `revise` bumps the version and appends a revision note, it
   never promotes a half-configured framework or bank into effect. Assessment content is finalised
   at publication (editable only while a draft).

9. **A single `assessment:*` permission scope.** Like academic structure, scheduling, attendance
   and teaching (ADR-0025…0028), marks and records are academic operational data governed by the
   same academic staff, so the whole REST surface is gated by one `assessment:read` /
   `assessment:write` pair rather than per-area scopes.

10. **Persistence per ADR-0010.** Seven tables (`assessment_framework`, `assessment_plan`,
    `assessment`, `question_bank`, `evaluation`, `competency_profile`, `academic_record`) with
    Prisma/RLS adapters at the `apps/api` composition root (TD-21). Every table has `ENABLE` +
    `FORCE ROW LEVEL SECURITY` and the standard `tenant_isolation` policy (USING + WITH CHECK,
    fail-closed) — verified on live PostgreSQL. Structured data (grade bands, weightage/promotion
    rules, planned assessments, outcome/competency id lists, rubric, questions, rubric scores,
    evaluation history, competency masteries, growth trajectory, grade entries, amendment log) is
    stored as non-null JSONB; marks, percentage and GPA are `DOUBLE PRECISION`; every uniqueness
    rule (framework/bank per organization + code, one evaluation per assessment + student, one
    competency profile per student, one academic record per student + year + term) is a
    tenant-scoped DB unique index.

11. **Nine domain events on the platform bus** — `assessment.published`, `assessment.started`,
    `assessment.completed`, `assessment.evaluation.submitted`, `assessment.evaluation.approved`,
    `assessment.competency.updated`, `assessment.academic_record.updated`,
    `assessment.promotion.recommended` (only when the decision is non-pending) and
    `assessment.report_card.generated` — published from the owning service transitions.

12. **Cross-domain references enter through directory ports.** Organization (P2-D01-M01), subject
    (P2-D06) and student (P2-D03) existence are validated through injected directories backed by
    those modules' services, so the pure package depends on no other domain. Single references are
    validated on write; arrays of outcome and competency references are stored without per-item
    existence checks — an accepted cost trade-off (**TD-30**), the subject and framework being the
    validated anchors.

13. **Explicit non-goals.** No instruction delivery, attendance, timetabling, AI tutoring or
    predictive analytics — those belong to other domains. This platform assesses learning that the
    teaching platform (P2-D09) delivered and feeds the Institutional Intelligence program.

## Consequences

- **A reusable assessment system of record, consumed everywhere.** Institutions design
  assessments, mark them, track competency mastery, and produce report cards and transcripts
  through one platform; downstream domains (intelligence) consume its services, analytics and
  events rather than reimplementing assessment — the contract's definition of done.
- **Grading is consistent by construction.** Because every grade and GPA flows through the one pure
  grading engine, the report card, the transcript and the analytics never disagree; the end-to-end
  integration test asserts exactly this.
- **Marks and mastery stay apart.** Competency mastery is an evidence-set ordinal level, never a
  percentage — so "scored 80%" and "proficient" are independent facts, as the contract demands.
- **Records are trustworthy.** A published academic record cannot be edited in place; every
  correction is a reasoned, attributed, versioned amendment, so a transcript is auditable end to
  end.
- **A pure, testable core.** Two engines are pure functions over narrow views — 38 package tests
  exercise the grading arithmetic (percentage, band selection, GPA weighting), every indicator
  (throughput, approval rate, average, consistency, mastery, gaps, coverage), the evaluation
  marking workflow, the immutable-after-publish amendment workflow, the guarded revise, and an
  end-to-end framework → assess → evaluate → record → report-and-analytics integration.
- **Isolation.** All seven tables are FORCE-RLS tenant-isolated and fail-closed, verified on live
  PostgreSQL; every uniqueness rule is tenant-scoped at the DB.
- **AI-ready without owning prediction.** Assessment intelligence exposes throughput, performance,
  mastery, gaps and coverage as descriptive analytics; predictive models remain the Institutional
  Intelligence program's.
- **Deferred, interface-protected.** Domain Prisma adapters remain at the composition root
  (TD-21); array cross-references are validated only at the anchor (TD-30). One growing package,
  acceptable for a cohesive bounded context (as with the eight prior domains).
