# Engineering Delivery Report — P2-D09

**Teaching, Learning & Instruction Intelligence Platform (TLIIP)** · Phase 2 (Enterprise Domain Engineering) · Program: Academic Excellence Platform

|                |                                                                                                                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D09 — Teaching, Learning & Instruction Intelligence Platform                                                                                                                                                        |
| **Status**     | ✅ Complete — CI green; merged to main (`f1ef77c`). Gates green in-sandbox (full monorepo typecheck 97/97, build 52/52, `@knowget/teaching-learning` 32 tests, `apps/api` 186 tests); RLS verified on live PostgreSQL. |
| **Depends on** | P2-D08 (Attendance & Presence, ADR-0027), P2-D07 (Scheduling, ADR-0026), P2-D06 (Academic Structure, ADR-0025), P2-D03 (Student Lifecycle), P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`)                                      |
| **Date**       | 1 October 2026                                                                                                                                                                                                         |
| **Next**       | P2-D10 — Assessment, Evaluation & Competency Intelligence Platform (AECIP)                                                                                                                                             |

---

## 1. Mission recap

Deliver the **Teaching, Learning & Instruction Intelligence Platform** — the authoritative
domain for planning, delivering, monitoring and continuously improving instruction. It spans the
instructional lifecycle from academic and unit planning through lesson planning, learning-resource
preparation, classroom delivery, assignments and learning evidence. Its defining property is that
**every instructional activity is traceable to curriculum outcomes**, and it exposes an AI-ready
surface of instructional indicators for future coaching. It stays independent of grading,
examinations, attendance and prediction; the Assessment and Institutional Intelligence domains
consume this platform rather than reimplementing instruction.

## 2. What was engineered

| Layer                   | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain**              | `@knowget/teaching-learning` — seven aggregates (Academic Plan, Unit Plan, Lesson Plan, Learning Resource, Classroom Session, Assignment, Learning Evidence), each an immutable aggregate + factory + guarded transitions with an application service; value objects (plan/unit/lesson/resource/session/assignment/evidence types, statuses, revisions, participation summary); and **one pure engine** — instructional intelligence                                                                                                                                |
| **Intelligence engine** | Pure, deterministic `computeInstructionalIndicators` over narrow views the aggregates structurally satisfy: curriculum coverage (unit-targeted outcomes covered by approved lessons), lesson completion, teaching consistency (planned vs actual), student engagement, learning pace, resource utilisation, submission rate and instructional workload — all division-safe, two-decimal and clamped to 0–100 (descriptive only)                                                                                                                                     |
| **Persistence**         | Seven models in `schema.prisma` + one migration (`20261001000000_add_teaching_learning`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK), tenant/scope-indexed, soft-delete + audit columns; a DB unique index for the academic-plan (org, code) rule; structured data (objectives, id lists, strategies, activities, revisions, submissions, participation) as non-null JSONB (participation nullable), estimated hours DOUBLE PRECISION                                                                                                       |
| **API**                 | Eight permission-gated (`teaching:read`/`:write`), tenant-scoped REST controllers under `teaching-learning/*` (academic plans, unit plans, lesson plans incl. review/approval, learning resources, classroom sessions incl. planned-vs-actual delivery, assignments incl. submission tracking, learning evidence, instructional analytics); zod DTOs; seven Prisma/RLS adapters + six directory adapters; `TeachingLearningModule` importing the Organization, Academic-Structure, Academic-Scheduling and Student-Lifecycle modules, registered in the root module |
| **Events**              | Nine domain events: `teaching.academic_plan.published`, `teaching.unit_plan.created`, `teaching.lesson.planned`, `teaching.learning_resource.added`, `teaching.lesson.delivered`, `teaching.classroom_session.completed`, `teaching.assignment.published`, `teaching.assignment.submitted`, `teaching.learning_evidence.captured`                                                                                                                                                                                                                                   |
| **Docs & decisions**    | ADR-0028 (platform + engine architecture); this report; platform-state, technical-debt (TD-29) and CHANGELOG updates                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## 3. Domain capabilities & invariants

- **Academic planning.** Institutional plans at a level (annual / term / department / subject),
  one per (organization, code), with objectives and an optional period and subject, across
  draft → published → archived; publishing makes the plan authoritative for delivery.
- **Unit planning.** A subject-scoped sequence of learning experiences with curriculum alignment
  (an optional framework), the outcomes and competencies it develops, estimated instructional
  time and an assessment strategy, across draft → active → archived; lessons are planned against
  active units.
- **Lesson planning.** Objectives, targeted outcomes, teaching strategies, activities, assessment
  checkpoints, required resources, differentiation and reflection — **version-controlled** with a
  review-and-approval workflow (draft → in_review → approved), content editable only while a
  draft or in review, and an approved plan revised to a new version.
- **Learning resources.** A typed, tagged, curriculum-mapped library item (document /
  presentation / video / interactive / external reference / AI-generated), **version-controlled**
  across draft → published → archived for reuse across lessons.
- **Classroom delivery.** The delivery of a scheduled session capturing planned topics then the
  actual topics/activities/resources and a descriptive participation summary and reflections,
  across scheduled → delivered → completed | cancelled — **not attendance** (a P2-D08 concern).
- **Assignments.** Homework / project / practice / reading / collaborative work with a submission
  window and per-learner completion tracking (upserted per student), across draft → published →
  closed — **completion only, never a grade** (evaluation is P2-D10's).
- **Learning evidence.** A captured record that learning happened (submission / observation /
  activity completion / portfolio artifact / practical work) about a validated Student and
  **linked to the validated instructional activity** that produced it.
- **Instructional intelligence.** Read-only AI-ready indicators — curriculum coverage, lesson
  completion, teaching consistency, engagement, pace, resource utilisation, submission rate and
  workload — computed over a subject, section or organization.
- **Cross-cutting invariants.** Every record is organization-scoped (validated); single
  cross-domain references are validated on write; every uniqueness rule is DB-enforced; all data
  is FORCE-RLS tenant-isolated and fail-closed.

## 4. Verification

- **Gates (in-sandbox).** Full monorepo **typecheck 97/97** and **build 52/52** (turbo).
  `@knowget/teaching-learning` typecheck, lint, build and **32 unit/integration tests** green
  (across the intelligence engine, all seven services and an end-to-end integration suite).
  `apps/api` **186 tests** green (9 integration specs skipped, as in CI), including the
  teaching-learning **DI compilation spec** — all eight controllers and eight services resolve
  through the module, including the imported Organization, Academic-Structure, Academic-Scheduling
  and Student-Lifecycle modules. Prettier-clean.
- **Engine coverage.** Tests exercise every indicator (coverage, completion, consistency,
  engagement, pace, utilisation, submission rate, workload), the 0–100 range clamps, the
  archived-unit coverage exclusion, the lesson review/revise workflow, assignment submission
  upsert-per-learner, classroom planned-vs-actual delivery, and an end-to-end
  plan → deliver → assign → report indicators-consistent integration.
- **Live RLS (real PostgreSQL 16).** Migration applied as a `NOSUPERUSER` table owner so `FORCE
ROW LEVEL SECURITY` applies. For all seven tables: tenant A sees only its own rows; tenant B
  sees zero (isolation); an unset tenant sees zero (fail-closed); a cross-tenant `INSERT` is
  rejected by the `WITH CHECK` clause.
- **Independent audit.** A separate reviewer audited the domain, adapters, schema, migration and
  controllers against the P2-D08 reference across eight areas (controller↔service signatures,
  DTO↔domain enums, adapter↔schema↔migration alignment, module DI wiring, permission gating &
  tenancy, route shape, domain-logic correctness, and non-goal/grading leakage) and found the
  milestone clean with no High/Medium issues. One minor finding — the presence `learningPace` and
  `studentEngagement` indicators could exceed the documented 0–100 range — was fixed in-milestone
  by clamping both, with a regression test.

## 5. Decisions

Recorded in **ADR-0028**. In brief: one package for all seven aggregates plus a pure
instructional-intelligence engine over narrow views, built and tested first; every activity
traceable to curriculum outcomes (unit → lesson → delivery → assignment → evidence); lesson plans
and learning resources version-controlled (lessons with a review/approval workflow); classroom
sessions capture planned-vs-actual delivery and are **not** attendance; assignments track
completion and are **not** grading; learning evidence linked to a validated instructional
activity; a single `teaching:*` scope; FORCE-RLS persistence per ADR-0010 with JSONB for
structured data and DOUBLE PRECISION for hours; nine events; grading/examinations/attendance/
prediction excluded.

## 6. Technical debt

- **TD-21 (carried).** Domain Prisma adapters live at the `apps/api` composition root rather than
  in a dedicated persistence package — unchanged from ADR-0010.
- **TD-29 (new).** Array cross-references — a unit/lesson/resource's `learningOutcomeIds`, a
  lesson's `requiredResourceIds` and a session's `resourcesUsedIds` — are stored without per-item
  existence validation (single references are validated). Validating each item would add a
  directory call per element per write; the curriculum framework and subject are the validated
  anchors. Tightening to validate list members is a later refinement behind the services.

## 7. Recommendation — proceed to P2-D10

P2-D09 delivers the instruction system of record: an institution plans, delivers and improves
teaching through reusable capabilities; lessons and resources are version-controlled; classroom
delivery captures planned vs actual; assignments track completion without grading; learning
evidence is traceable to instruction; and an AI-ready instructional-intelligence surface reports
coverage, completion, consistency, engagement, pace and workload. Every downstream domain can now
consume this platform rather than reimplementing instruction. The certified core and all frozen
packages are untouched. **Recommend proceeding to P2-D10 — Assessment, Evaluation & Competency
Intelligence Platform.**
