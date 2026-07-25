# 26. Academic Scheduling & Resource Orchestration: one package, six aggregates, a pure conflict engine that gates publication

- **Status:** Accepted
- **Date:** 2026-08-01
- **Contract:** P2-D07 (Enterprise Academic Scheduling & Resource Orchestration Platform)

## Context

P2-D07 is the second contract of the **Academic Excellence Platform** program, on the
certified `v0.2.0` Identity & Organization baseline, the frozen Phase-1 core, and the
Academic Structure & Curriculum Platform (P2-D06, ADR-0025). It is the authoritative
scheduling engine: it allocates **time, people, spaces and resources** while respecting
academic, institutional and operational constraints — timetables, schedule slots,
schedulable resources, resource allocations, scheduling policies and substitutions.

The contract names five core aggregate roots (Timetable, Schedule Slot, Resource,
Allocation, Scheduling Policy), eight domain events, and hard requirements: timetable
**versioning**; **resource allocation validated**; **conflict detection that prevents
invalid schedules**; **teacher-workload** calculation; **configurable scheduling policies**;
tracked, auditable **substitutions**; and AI-ready **scheduling intelligence**. It follows
the domain architecture pattern (ADR-0010) with no frozen-code change. Attendance, lesson
delivery, homework, examinations, student grading and learning analytics are explicit
non-goals — this platform is **schedule structure and orchestration, not activity**.

Unlike the mostly CRUD-shaped domains before it, this platform has a genuine computational
core: conflict detection across teachers, sections, venues, resources and policies. That
core is the crux of the design.

## Decision

1. **One domain package, `@knowget/academic-scheduling`, for all six aggregates** — the
   same single-bounded-context choice as the five prior domains (ADR-0021…0025). A shared
   spine (`errors.ts`, `ports.ts`, `academic-scheduling-events.ts`, `index.ts`), a
   per-aggregate pair (`<aggregate>.ts` + `<aggregate>-service.ts`), value objects
   (weekday, HH:MM time with interval maths, resource kind & availability window, policy
   rule type & revision), and — distinctively — three **pure engine modules**
   (`conflict-engine.ts`, `workload.ts`, `intelligence.ts`).

2. **A pure, decoupled conflict engine is the heart of the platform.** `detectConflicts`
   is a pure, deterministic function that finds teacher / section / venue double-bookings
   (same-day, strictly-overlapping half-open intervals), resource double-allocations, and
   policy violations. It consumes **narrow view interfaces** (`ConflictSlot`,
   `ConflictAllocation`, `SchedulingConstraint`) that the aggregates structurally satisfy,
   so the engine depends on no aggregate and is exhaustively unit-testable in isolation.
   This was built and tested **first**, before any aggregate depended on it.

3. **Publication is gated on the full conflict picture.** `TimetableService.publish`
   refuses to publish a schedule the engine rejects: it gathers the timetable's own slots
   **plus the slots of every other published timetable in the same (organization, academic
   year, term)**, plus the organization's active resource allocations and active scheduling
   policies, runs the engine, and — on any conflict — emits `scheduling.conflict.detected`
   and throws `ScheduleConflictError` carrying the offending conflicts. So a teacher,
   section or venue can never be double-booked **across** the published grid, not merely
   within one timetable. `validate()` exposes the same check without publishing (the
   Conflict Analysis surface). The draft-state check runs before detection, so re-publishing
   a published timetable is a clean state error, not a spurious conflict.

4. **Substitution is a first-class, persisted aggregate — the sixth.** The contract lists
   five core roots but also requires that "all substitutions SHALL be tracked and
   auditable" with a `SubstitutionAssigned` event. Auditability demands persistence, so
   Substitution is modelled as a full aggregate (teacher/venue override, replacement ≠
   original, assigned → cancelled | completed), not a transient action.

5. **Version control by counter + append-only revision log**, reusing the P2-D06 pattern.
   Timetables and scheduling policies each carry a version counter and a revision log;
   revising a **published** timetable bumps the version and returns it to draft for editing
   and re-publication, so the published timetable is always the latest validated version
   and is immutable until revised (its slots may only be edited while it is a draft).

6. **A single `scheduling:*` permission scope.** Like academic structure (ADR-0025) and
   unlike learner wellbeing (ADR-0024), scheduling is operational structure, not sensitive
   personal data, so the whole REST surface is gated by one `scheduling:read` /
   `scheduling:write` pair rather than per-area scopes.

7. **Persistence per ADR-0010.** Six tables (`timetable`, `schedule_slot`, `resource`,
   `allocation`, `scheduling_policy`, `substitution`) with Prisma/RLS adapters at the
   `apps/api` composition root (TD-21). Every table has `ENABLE` + `FORCE ROW LEVEL
SECURITY` and the standard `tenant_isolation` policy (USING + WITH CHECK, fail-closed) —
   verified on live PostgreSQL. Structured data (revisions, availability windows, policy
   parameters) is stored as non-null JSONB; HH:MM times and weekdays are TEXT; every
   uniqueness rule is a DB unique index. This domain has no scalar-list columns, so the
   P2-D05 array-column lesson does not recur.

8. **Eight domain events on the platform bus** — `scheduling.timetable.created`,
   `.published`, `.revised`, `scheduling.slot.assigned`, `scheduling.resource.allocated`,
   `.released`, `scheduling.conflict.detected`, `scheduling.substitution.assigned` —
   published from the owning service transitions. Resources and scheduling policies
   intentionally emit no event (none is defined in the contract), as academic programs did
   in P2-D06.

9. **Three policy rule types are enforced; three are recognised and deferred.**
   `max_teaching_periods`, `consecutive_period_limit` and `break_rule` are evaluated
   directly from slot timing. `subject_sequencing`, `resource_priority` and
   `availability_window` need data beyond the weekly slot grid; they are stored and
   version-controlled but not yet evaluated — an extensibility seam (**TD-27**), not a gap
   in the model.

10. **Cross-domain references enter through directory ports.** Organization (P2-D01-M01),
    Grade / Class / Section / Subject (P2-D06) and Teacher (Person, P2-D01-M02) existence
    are validated through injected directories backed by those modules' services, so the
    pure package depends on no other domain. Venues are validated against the in-package
    resource repository.

11. **Explicit non-goals.** No attendance recording, lesson delivery, homework,
    examinations, student grading or learning analytics — those belong to subsequent
    academic domains (P2-D08 onward) and integrate _with_ EASROP.

## Consequences

- **A reusable scheduling capability, consumed everywhere.** Institutions generate and
  manage academic schedules through one platform; downstream domains consume its services
  and events rather than reimplementing scheduling logic — the contract's definition of
  done.
- **Invalid schedules are prevented, not merely detected.** Publication is hard-gated by
  the conflict engine across the whole published grid plus allocations and policies, so
  teacher/section/venue/resource clashes and policy violations cannot reach a published
  timetable.
- **Policies are configurable without code changes.** Rule configuration lives in open
  JSON parameters and is version-controlled; new numeric rules need no schema change, and
  the three deferred rule types can be implemented behind the same seam.
- **A pure, testable core.** The conflict, workload and intelligence engines are pure
  functions over narrow views — 50+ unit/integration tests exercise every conflict kind,
  policy rule, workload total and the end-to-end publish gate.
- **Isolation.** All six tables are FORCE-RLS tenant-isolated and fail-closed, verified on
  live PostgreSQL.
- **AI-ready without owning optimisation.** Scheduling intelligence exposes utilisation,
  density, workload distribution, conflict counts and optimisation hints as descriptive
  analytics; optimisation decisions remain the Institutional Intelligence program's.
- **Deferred, interface-protected.** Domain Prisma adapters remain at the composition root
  (TD-21); three policy evaluators are deferred behind a stable rule-type dispatch (TD-27).
  One growing package, acceptable for a cohesive bounded context (as with the five prior
  domains).
