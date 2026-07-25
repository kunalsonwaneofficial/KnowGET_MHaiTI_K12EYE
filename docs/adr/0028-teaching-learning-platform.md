# 28. Teaching, Learning & Instruction Intelligence: one package, seven aggregates, a pure intelligence engine, every activity traceable to curriculum

- **Status:** Accepted
- **Date:** 2026-10-01
- **Contract:** P2-D09 (Teaching, Learning & Instruction Intelligence Platform)

## Context

P2-D09 is the fourth contract of the **Academic Excellence Platform** program, on the certified
`v0.2.0` Identity & Organization baseline, the frozen Phase-1 core, and the academic structure
(P2-D06, ADR-0025), scheduling (P2-D07, ADR-0026) and attendance (P2-D08, ADR-0027) platforms.
It is the operational heart of classroom excellence: the authoritative domain for **planning,
delivering, monitoring and continuously improving instruction** — academic plans, unit plans,
lesson plans, learning resources, classroom sessions, assignments and learning evidence.

The contract names seven aggregate roots, nine domain events, and the through-line requirement
that **every instructional activity be traceable to curriculum objectives and learning
outcomes**, with an AI-ready surface of instructional indicators. It follows the domain
architecture pattern (ADR-0010) with no frozen-code change. Student grading, examination
scheduling, mark calculation, report cards, attendance recording, AI tutoring and predictive
analytics are explicit non-goals — this platform is **instruction, not assessment, attendance
or prediction**; those belong to dedicated domains that consume it.

Like the three platforms before it, this domain has a genuine computational core: an
instructional-intelligence engine that distils plans, delivery and assignments into descriptive
coaching signals. That engine is the crux of the design.

## Decision

1. **One domain package, `@knowget/teaching-learning`, for all seven aggregates** — the same
   single-bounded-context choice as the seven prior domains (ADR-0021…0027). A shared spine
   (`errors.ts`, `ports.ts`, `teaching-learning-events.ts`, `index.ts`), a per-aggregate pair
   (`<aggregate>.ts` + `<aggregate>-service.ts`), value objects (plan/unit/lesson/resource/
   session/assignment/evidence types, statuses and revisions), and — distinctively — one **pure
   engine module** (`instructional-intelligence.ts`) over narrow views (`instructional-view.ts`).

2. **A pure, decoupled instructional-intelligence engine is the heart of the platform.**
   `computeInstructionalIndicators` is a pure, deterministic function that derives curriculum
   coverage, lesson completion, teaching consistency (planned vs actual), student engagement,
   learning pace, resource utilisation, submission rate and instructional workload. It consumes
   **narrow view interfaces** (`UnitPlanView`, `LessonPlanView`, `ClassroomSessionView`,
   `AssignmentView`) that the aggregates structurally satisfy, so the engine depends on no
   aggregate and is exhaustively unit-testable in isolation. It was built and tested **first**.
   Every rate is division-safe and two-decimal and clamped to 0–100; descriptive analytics only
   — prediction is a non-goal.

3. **Every instructional activity is traceable to curriculum.** Unit plans carry the learning
   outcomes and competencies they develop; lesson plans carry the outcomes they target; learning
   resources carry a curriculum mapping; learning evidence is linked to the instructional
   activity (lesson plan, classroom session or assignment) that produced it and to the outcomes
   it demonstrates. The intelligence engine's curriculum-coverage indicator is exactly the share
   of unit-targeted outcomes covered by an approved lesson — the contract's traceability made
   measurable.

4. **Lesson plans are version-controlled with a review-and-approval workflow.** A lesson runs
   draft → in_review → approved (the version teachers deliver); content is editable only while a
   draft or in review, and an approved plan is revised — bumping the version, appending to the
   revision log, and returning to draft — so the approved plan is always a known version. Learning
   resources are version-controlled the same way (counter + revision log), reusing the P2-D06/D07
   pattern.

5. **Classroom Session captures planned vs actual delivery — and is not attendance.** A session
   records planned topics up front, then the actual topics covered, activities completed and
   resources used on delivery (scheduled → delivered → completed | cancelled). Its
   `ParticipationSummary` is a lightweight, descriptive engagement note for the intelligence
   engine; **attendance recording is the Presence platform's (P2-D08) and an explicit non-goal**,
   so the session references neither attendance records nor a roster.

6. **Assignment tracks completion, never marks.** An assignment schedules work with a submission
   window and records per-learner submission completion (submitted / late / missing, upserted per
   student). **Evaluation and grading are the Assessment platform's (P2-D10) and an explicit
   non-goal** — no score, grade, rubric or mark exists anywhere in the aggregate.

7. **A single `teaching:*` permission scope.** Like academic structure, scheduling and attendance
   (ADR-0025…0027), and unlike learner wellbeing (ADR-0024), instruction is operational structure,
   not sensitive personal data, so the whole REST surface is gated by one `teaching:read` /
   `teaching:write` pair rather than per-area scopes.

8. **Persistence per ADR-0010.** Seven tables (`academic_plan`, `unit_plan`, `lesson_plan`,
   `learning_resource`, `classroom_session`, `assignment`, `learning_evidence`) with Prisma/RLS
   adapters at the `apps/api` composition root (TD-21). Every table has `ENABLE` + `FORCE ROW
LEVEL SECURITY` and the standard `tenant_isolation` policy (USING + WITH CHECK, fail-closed) —
   verified on live PostgreSQL. Structured data (objectives, outcome/resource id lists, strategies,
   activities, revisions, submissions, participation) is stored as non-null JSONB (participation
   nullable); estimated instructional time is `DOUBLE PRECISION`; the one uniqueness rule
   (academic plan per organization + code) is a DB unique index.

9. **Nine domain events on the platform bus** — `teaching.academic_plan.published`,
   `teaching.unit_plan.created`, `teaching.lesson.planned`, `teaching.learning_resource.added`,
   `teaching.lesson.delivered`, `teaching.classroom_session.completed`,
   `teaching.assignment.published`, `teaching.assignment.submitted`,
   `teaching.learning_evidence.captured` — published from the owning service transitions.

10. **Cross-domain references enter through directory ports.** Organization (P2-D01-M01), subject
    / section / curriculum framework (P2-D06), schedule slot (P2-D07) and student (P2-D03)
    existence are validated through injected directories backed by those modules' services, so the
    pure package depends on no other domain. Single references are validated on write; arrays of
    outcome and resource references are stored without per-item existence checks — an accepted
    cost trade-off (**TD-29**), the curriculum framework being the validated anchor.

11. **Explicit non-goals.** No student grading, examination scheduling, mark calculation, report
    cards, attendance recording, AI tutoring or predictive analytics — those belong to other
    domains and integrate _with_ TLIIP.

## Consequences

- **A reusable instruction system of record, consumed everywhere.** Institutions plan, deliver
  and improve teaching through one platform; downstream domains (assessment, intelligence)
  consume its services, analytics and events rather than reimplementing instruction — the
  contract's definition of done.
- **Instruction is traceable end to end.** Unit → lesson → delivery → assignment → evidence all
  carry curriculum outcome references, so learning is always traceable to the instruction that
  produced it and coverage is measurable.
- **A pure, testable core.** The intelligence engine is a pure function over narrow views — 32
  package tests exercise every indicator (coverage, completion, consistency, engagement, pace,
  utilisation, submission rate, workload), the range clamps, the lesson review/revise workflow,
  assignment submission upsert, session planned-vs-actual delivery, and an end-to-end
  plan → deliver → assign → report integration.
- **Clean domain boundaries.** Attendance stays in P2-D08 (participation here is a descriptive
  note); grading stays in P2-D10 (submissions are completion-only). The non-goals are enforced by
  the model, not merely documented.
- **Isolation.** All seven tables are FORCE-RLS tenant-isolated and fail-closed, verified on live
  PostgreSQL.
- **AI-ready without owning prediction.** Instructional intelligence exposes curriculum coverage,
  completion, consistency, engagement, pace, utilisation and workload as descriptive analytics;
  predictive coaching remains the Institutional Intelligence program's.
- **Deferred, interface-protected.** Domain Prisma adapters remain at the composition root
  (TD-21); array cross-references are validated only at the anchor (TD-29). One growing package,
  acceptable for a cohesive bounded context (as with the seven prior domains).
