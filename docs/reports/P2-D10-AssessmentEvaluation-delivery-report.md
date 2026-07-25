# Engineering Delivery Report — P2-D10

**Assessment & Evaluation Platform (AEP)** · Phase 2 (Enterprise Domain Engineering) · Program: Academic Excellence Platform

|                |                                                                                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D10 — Assessment & Evaluation Platform                                                                                                                                                                                  |
| **Status**     | ✅ Complete — CI green; merged to main (`5ffb7b5`). Gates green in-sandbox (full monorepo typecheck 99/99, build 53/53, `@knowget/assessment-evaluation` 38 tests, `apps/api` 188 tests); RLS verified on live PostgreSQL. |
| **Depends on** | P2-D09 (Teaching-Learning, ADR-0028), P2-D08 (Attendance, ADR-0027), P2-D07 (Scheduling, ADR-0026), P2-D06 (Academic Structure, ADR-0025), P2-D03 (Student Lifecycle), P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`)               |
| **Date**       | 15 October 2026                                                                                                                                                                                                            |
| **Next**       | P2-D11 — Learning Intelligence & Educational Insights Platform (LIEIP)                                                                                                                                                     |

---

## 1. Mission recap

Deliver the **Assessment & Evaluation Platform** — the authoritative domain for how learning is
assessed, marked, mastered and recorded. It spans the assessment lifecycle from an institution's
assessment framework and plan, through individual assessments and reusable question banks, to the
auditable evaluation of student work, competency mastery tracking, and the academic record with
report cards and transcripts. Its defining properties are that **grading is consistent from a
single computational core**, that **competency mastery is tracked independently of raw marks**,
and that **a published academic record is immutable except through a controlled, reasoned
amendment workflow**. It exposes an AI-ready surface of assessment indicators, and stays
independent of instruction delivery, attendance and prediction; the Institutional Intelligence
program consumes this platform rather than reimplementing assessment.

## 2. What was engineered

| Layer                   | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain**              | `@knowget/assessment-evaluation` — seven aggregates (Assessment Framework, Assessment Plan, Assessment, Question Bank, Evaluation, Competency Profile, Academic Record), each an immutable aggregate + factory + guarded transitions with an application service; value objects (models, statuses, grade bands, planned assessments, rubric, questions, rubric scores, mastery levels, grade entries, amendments); and **two pure engines** — grading and assessment intelligence                                                                                          |
| **Grading engine**      | Pure, deterministic marks → percentage → grade → GPA arithmetic: `computePercentage` (division-safe, clamped 0–100), `gradeFor` (highest-minimum band satisfied), `gradeMarks`, `computeGpa` (credit-weighted, else simple average of graded entries) — the seam that report cards, transcripts and academic records all consume, so every derived grade and GPA agrees by construction                                                                                                                                                                                    |
| **Intelligence engine** | Pure, deterministic `computeAssessmentIndicators` over narrow views the aggregates structurally satisfy: assessment/evaluation throughput, evaluation approval rate, average performance, performance consistency (variance-based), competency mastery (read from mastery levels, **never marks**), mastered competencies, learning gaps and curriculum coverage — all division-safe, two-decimal and clamped 0–100 (descriptive only)                                                                                                                                     |
| **Persistence**         | Seven models in `schema.prisma` + one migration (`20261015000000_add_assessment_evaluation`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK), tenant/scope-indexed, soft-delete + audit columns; tenant-scoped DB unique indexes for framework/bank (org, code), evaluation (assessment, student), competency profile (student) and academic record (student, year, term); structured data (grade bands, rules, rubric, questions, history, masteries, trajectory, grade entries, amendments) as non-null JSONB, marks/percentage/GPA DOUBLE PRECISION |
| **API**                 | Nine permission-gated (`assessment:read`/`:write`), tenant-scoped REST controllers under `assessment-evaluation/*` (frameworks, plans, assessments, question banks, evaluations incl. the moderation workflow, competency profiles, academic records incl. the amendment workflow, reporting, analytics); zod DTOs; seven Prisma/RLS adapters + three directory adapters; `AssessmentEvaluationModule` importing the Organization, Academic-Structure and Student-Lifecycle modules, registered in the root module                                                         |
| **Events**              | Nine domain events: `assessment.published`, `assessment.started`, `assessment.completed`, `assessment.evaluation.submitted`, `assessment.evaluation.approved`, `assessment.competency.updated`, `assessment.academic_record.updated`, `assessment.promotion.recommended` (non-pending only), `assessment.report_card.generated`                                                                                                                                                                                                                                            |
| **Docs & decisions**    | ADR-0029 (platform + dual-engine architecture); this report; platform-state, technical-debt (TD-30) and CHANGELOG updates                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## 3. Domain capabilities & invariants

- **Assessment framework.** An institution's assessment philosophy (traditional / CCE / CBE /
  competency-based / hybrid), the weightage rules, the grade bands consumed by the grading engine,
  the competency model and the promotion criteria — version-controlled, one per (organization,
  code), across draft → active → archived; only an active framework governs assessment, and
  `revise` operates only on an active framework (it is not a shortcut into `active`).
- **Assessment plan.** An annual / term / unit / classroom assessment calendar carrying the planned
  assessments and examination timetable for a scope, across draft → published → archived;
  publishing makes the schedule authoritative.
- **Assessment.** An individual assessment of a subject (twelve types — formative, summative,
  diagnostic, CCE, CBE, project, practical, oral, portfolio, observation, board, institution)
  carrying the outcomes and competencies it measures, maximum marks, an optional rubric, its
  evaluation strategy and delivery mode; draft → published → in_progress → completed | cancelled,
  content finalised at publication.
- **Question bank.** A reusable, version-controlled repository of questions for a subject, each
  mapped to Bloom's taxonomy, competencies and curriculum outcomes; one per (organization, code),
  draft → active → archived; only an active bank is offered for reuse.
- **Evaluation.** The auditable marking of one student's assessment — marks or rubric scores
  recorded while a draft (percentage computed by the grading engine), then draft → submitted →
  moderated → approved with an immutable transition history, **reopenable** for re-evaluation
  (version bumped); one evaluation per (assessment, student).
- **Competency profile.** A learner's mastery of each competency on an ordinal scale (not_assessed
  → emerging → developing → proficient → advanced → mastered) with an append-only growth
  trajectory, **tracked independently of raw marks** (set from evidence and judgement, never a
  percentage); one per student.
- **Academic record.** A learner's per-term record — grade entries, overall GPA and credits
  (computed via the grading engine), and the promotion decision — **immutable after publication**:
  a published record changes only through a reasoned, attributed, versioned, append-only amendment
  workflow; one per (student, academic year, term).
- **Reporting.** Read-only term report cards, cumulative transcripts (cumulative GPA recomputed
  through the grading engine) and competency reports, projected from the persisted records and
  profiles.
- **Assessment intelligence.** Read-only AI-ready indicators — throughput, approval rate, average
  performance, consistency, competency mastery, learning gaps and curriculum coverage — computed
  over a subject, learner or organization.
- **Cross-cutting invariants.** Every record is organization-scoped (validated); single
  cross-domain references are validated on write; every uniqueness rule is DB-enforced; all data is
  FORCE-RLS tenant-isolated and fail-closed.

## 4. Verification

- **Gates (in-sandbox).** Full monorepo **typecheck 99/99** and **build 53/53** (turbo).
  `@knowget/assessment-evaluation` typecheck, lint, build and **38 unit/integration tests** green
  (across both engines, all nine services and an end-to-end integration suite). `apps/api` **188
  tests** green (9 integration specs skipped, as in CI), including the assessment-evaluation **DI
  compilation spec** — all nine controllers and nine services resolve through the module, including
  the imported Organization, Academic-Structure and Student-Lifecycle modules. Prettier-clean.
- **Engine coverage.** Tests exercise the grading arithmetic (percentage division-safety and
  clamping, highest-minimum band selection, credit-weighted vs simple-average GPA), every
  intelligence indicator (throughput, approval rate, average, variance-based consistency,
  mastery-from-levels, gaps, coverage), the empty-scope zeroes, the evaluation
  draft → submitted → moderated → approved → reopen workflow, the immutable-after-publish academic
  record amendment workflow, the guarded revise (a draft cannot be revised into `active`), and an
  end-to-end framework → assess → evaluate → grow-competency → record → report-and-analytics
  integration proving grading is consistent across the report card, transcript and analytics while
  mastery stays independent of marks.
- **Live RLS (real PostgreSQL 16).** Migration applied as a `NOSUPERUSER` table owner so `FORCE ROW
LEVEL SECURITY` applies. For all seven tables: tenant A sees only its own rows; tenant B sees zero
  (isolation); an unset tenant sees zero (fail-closed); a cross-tenant `INSERT` is rejected by the
  `WITH CHECK` clause.
- **Independent audit.** A separate reviewer audited the domain, adapters, schema, migration and
  controllers against the P2-D09 reference across correctness, multi-tenancy/RLS, adapter fidelity,
  service invariants, DTO/controller correctness and consistency, and found the milestone clean
  with no Critical/Major or security/tenancy issues. One minor finding — `revise` on the framework
  and question bank lacked a state guard, so revising a draft could silently force it `active`,
  bypassing the deliberate activate step — was fixed in-milestone by guarding both to require an
  active aggregate, with regression tests; a dead, never-thrown error class was removed.

## 5. Decisions

Recorded in **ADR-0029**. In brief: one package for all seven aggregates plus **two** pure engines
(grading and assessment intelligence) over narrow views, built and tested first; grades flow
through one grading engine so report card, transcript and analytics figures agree by construction;
competency mastery tracked on an ordinal scale independently of raw marks; academic records
immutable after publication with a reasoned, versioned, append-only amendment workflow; evaluation
an auditable draft → submitted → moderated → approved (reopenable) marking workflow; frameworks and
question banks version-controlled with `revise` guarded to active only; a single `assessment:*`
scope; FORCE-RLS persistence per ADR-0010 with JSONB for structured data and DOUBLE PRECISION for
marks/GPA; nine events; instruction/attendance/prediction excluded.

## 6. Technical debt

- **TD-21 (carried).** Domain Prisma adapters live at the `apps/api` composition root rather than
  in a dedicated persistence package — unchanged from ADR-0010.
- **TD-30 (new).** Array cross-references in assessment-evaluation — an assessment's
  `learningOutcomeIds` and `competencies`, and a question's `learningOutcomeIds` and `competencies`
  — are stored without per-item existence validation, though single references (organization,
  subject, framework, plan, assessment, student) are validated on write. Validating each list
  member would add a directory call per element per write; the subject and framework are the
  validated anchors. Tightening to validate list members is a later refinement behind the services
  (ADR-0029).

## 7. Recommendation — proceed to P2-D11

P2-D10 delivers the assessment system of record: an institution frames its assessment philosophy,
plans and runs assessments, reuses question banks, marks student work through an auditable
moderation workflow, tracks competency mastery independently of marks, and produces immutable,
amendable academic records with report cards and transcripts — all grades flowing through one
grading engine so every derived figure agrees, and an AI-ready assessment-intelligence surface
reporting throughput, performance, mastery, gaps and coverage. Every downstream domain can now
consume this platform rather than reimplementing assessment. The certified core and all frozen
packages are untouched. **Recommend proceeding to P2-D11 — Learning Intelligence & Educational
Insights Platform.**
