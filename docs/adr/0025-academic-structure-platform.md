# 25. Academic Structure & Curriculum Platform: one package, eight aggregates, a validated academic hierarchy

- **Status:** Accepted
- **Date:** 2026-07-21
- **Contract:** P2-D06 (Academic Structure & Curriculum Platform)

## Context

P2-D06 opens a new program — the **Academic Excellence Platform** — on the certified
`v0.2.0` Identity & Organization baseline and the frozen Phase-1 core, alongside the
completed Student Lifecycle program (P2-D03…D05, ADR-0022…0024). It is the authoritative
source for **what is taught, when it is taught, to whom, and under which academic
framework**: academic calendars, programs, curriculum frameworks, grades, classes,
sections, subjects and learning outcomes. Every subsequent academic domain (scheduling,
teaching, attendance, assessment) is meant to consume this platform rather than define its
own academic structure.

The contract defines a single deliverable with eight aggregate roots, ten domain events,
and hard requirements: multiple curricula (CBSE, ICSE, IB, Cambridge, state boards,
vocational, custom) must **coexist within one institution without conflict**; curriculum
frameworks and learning outcomes must be **version-controlled**; programs, grades, classes
and sections must maintain **valid hierarchies**; subjects must support **prerequisite and
elective** relationships. It follows the domain architecture pattern (ADR-0010) with no
frozen-code change. Timetable generation, attendance, lesson planning, teaching, homework,
examinations, assessment scoring and report cards are explicit non-goals — this platform
is **structure, not activity**.

## Decision

1. **One domain package, `@knowget/academic-structure`, for all eight aggregates** — the
   same single-bounded-context choice as governance (ADR-0021), student-lifecycle
   (ADR-0022), family-guardian (ADR-0023) and learner-wellbeing (ADR-0024). A shared spine
   (`errors.ts`, `ports.ts`, `academic-structure-events.ts`, `index.ts`) plus a
   per-aggregate pair (`<aggregate>.ts` + `<aggregate>-service.ts`), with value objects
   (term/holiday/examination-period/academic-event/weekday, program stage, curriculum
   status & revision, Bloom's level) as small sibling modules.

2. **Organization-scoped, with the hierarchy deriving organization from the parent.** Every
   record is owned by an **Organization** (P2-D01-M01), validated through an injected
   `OrganizationDirectory` port. The top-level aggregates (calendar, program, curriculum,
   subject) take the organization directly; the hierarchical ones **derive** it from their
   parent through the shared repositories — a **grade** from its program, a **class** from
   its grade, a **section** from its class, a **learning outcome** from its subject — so the
   two can never disagree and the academic hierarchy is validated at every level. The pure
   package depends on no other domain.

3. **Multiple curricula coexist without conflict.** A **Curriculum Framework** is
   identified by (organization, code), so an institution can run CBSE and IB side by side.
   Board affiliation is an open string (not a closed enum), and a `custom` program stage and
   free-form subject framework let the platform model any supported academic structure
   **without code changes** — the contract's definition of done.

4. **Version control by counter + append-only revision log.** Curriculum frameworks carry
   a **version counter** and an append-only `revisions` log (each revision records the
   version it produced, a note and a timestamp); revising bumps the version while the
   framework stays active, and an archived framework is immutable. **Subjects** and
   **learning outcomes** likewise carry a version counter that increments on every change —
   their version history is their change count.

5. **The academic ladder is explicit and navigable.** A **Grade** carries a numeric
   `level` for hierarchy ordering, an optional promotion target (`nextGradeId`, validated
   to reference a real grade) and rule, and age guidelines. A **Class** is the running of a
   grade for one academic year with an optional curriculum assignment; a **Section** is a
   teachable division of a class with a capacity and a `planned → active → closed`
   lifecycle. **Subjects** support mandatory/elective kinds, elective groups,
   cross-disciplinary flags, credit allocation and **prerequisite** subjects (validated,
   self-reference rejected).

6. **A single permission scope — this is structure, not sensitive data.** Unlike the
   Learner Wellbeing platform (ADR-0024), academic structure is not personal or sensitive,
   so the whole REST surface is gated by one `academic:read` / `academic:write` scope pair
   rather than per-area scopes. Fine-grained privacy would add cost without benefit here.

7. **Persistence per ADR-0010.** Eight tables (`academic_calendar`, `academic_program`,
   `curriculum_framework`, `grade`, `academic_class`, `section`, `subject`,
   `learning_outcome`) with Prisma/RLS adapters at the `apps/api` composition root (TD-21).
   Every table has `ENABLE` + `FORCE ROW LEVEL SECURITY` and the standard `tenant_isolation`
   policy (both `USING` and `WITH CHECK`, fail-closed on an unset tenant), soft-delete and
   audit columns — verified on live PostgreSQL. Every uniqueness rule is a DB unique index;
   scalar-list columns are non-null with an empty-array default (carrying the P2-D05 audit
   lesson forward from the outset).

8. **Ten domain events on the platform bus** — `academic.year.created`,
   `academic.calendar.published`, `academic.curriculum.created`,
   `academic.curriculum.revised`, `academic.grade.created`, `academic.class.created`,
   `academic.section.created`, `academic.subject.registered`, `academic.subject.updated`,
   `academic.learning_outcome.defined` — published from the owning service transitions
   through the optional `EventBus` seam. Academic programs intentionally publish no event
   (none is defined in the contract).

9. **Explicit non-goals.** No timetable generation, attendance recording, lesson planning,
   teaching activities, homework, examinations, assessment scoring or report cards — those
   belong to subsequent academic domains and integrate _with_ ASCP.

## Consequences

- **A single academic structure, consumed everywhere.** Calendars, programs, curricula,
  grades, classes, sections, subjects and outcomes are modelled once; the scheduling,
  teaching and assessment domains that follow consume this platform's services and events
  instead of redefining academic structure — the contract's definition of done.
- **Any supported model without code changes.** Multiple curricula coexist per institution;
  board affiliation, program stage and subject framework are open, so CBSE, IB, Cambridge,
  vocational and custom curricula are all expressible in data.
- **Version-controlled curricula and outcomes.** Curriculum revisions, subject changes and
  outcome edits are all versioned; curriculum revisions keep an auditable history.
- **A validated hierarchy.** Grades derive organization from programs, classes from grades,
  sections from classes, outcomes from subjects — each validated through the shared
  repositories, so the academic ladder is always internally consistent.
- **Isolation.** All eight tables are FORCE-RLS tenant-isolated and fail-closed, verified on
  live PostgreSQL.
- **The semantic foundation for teaching and assessment.** Learning outcomes carry Bloom's
  levels, competency mappings and curriculum/assessment alignment — the structured
  foundation the Academic Excellence program's later domains build on.
- **Deferred, interface-protected.** Domain Prisma adapters remain at the composition root
  (TD-21). One growing package, acceptable for a cohesive bounded context (as with the four
  prior domains).
