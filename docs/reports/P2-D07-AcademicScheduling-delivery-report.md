# Engineering Delivery Report — P2-D07

**Enterprise Academic Scheduling & Resource Orchestration Platform (EASROP)** · Phase 2 (Enterprise Domain Engineering) · Program: Academic Excellence Platform

|                |                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Contract**   | P2-D07 — Enterprise Academic Scheduling & Resource Orchestration Platform                                                                                                                  |
| **Status**     | ✅ Engineered — gates green in-sandbox (build, lint, typecheck, full test suites); RLS verified on live PostgreSQL. Branch `feat/p2-d07-academic-scheduling` pushed; PR open, awaiting CI. |
| **Depends on** | P2-D06 (Academic Structure, ADR-0025), P2-D01 (Identity & Organization, `v0.2.0`), P2-D02…D05, Phase 1 baseline (`v0.1.0`)                                                                 |
| **Date**       | 1 August 2026                                                                                                                                                                              |
| **Next**       | P2-D08 — Attendance & Presence Intelligence Platform (APIP)                                                                                                                                |

---

## 1. Mission recap

Deliver the **Enterprise Academic Scheduling & Resource Orchestration Platform** — the
authoritative scheduling engine for academic and institutional resource planning. It
allocates time, people, spaces and resources while respecting academic, institutional and
operational constraints: timetables, schedule slots, schedulable resources, resource
allocations, scheduling policies and substitutions. Its defining capability is
**conflict detection that prevents invalid schedules** — a teacher, section, venue or
resource can never be double-booked across the published grid, and active scheduling
policies are enforced. It remains independent of attendance, teaching, homework,
examinations and grading; every subsequent academic domain consumes this platform rather
than reimplementing scheduling.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Domain**           | `@knowget/academic-scheduling` — six aggregates (Timetable, Schedule Slot, Resource, Allocation, Scheduling Policy, Substitution), each an immutable aggregate + factory + guarded transitions with an application service; value objects (weekday, HH:MM time with interval maths, resource kind & availability window, policy rule type & revision); and **three pure engines** — a conflict engine, teacher-workload, and scheduling intelligence   |
| **Conflict engine**  | A pure, deterministic `detectConflicts` over narrow view interfaces the aggregates structurally satisfy: teacher/section/venue double-bookings (same-day overlapping half-open intervals), resource double-allocations, and policy enforcement (`max_teaching_periods`, `consecutive_period_limit`, `break_rule`). Gates timetable publication; `validate()` exposes it read-only                                                                      |
| **Persistence**      | Six models in `schema.prisma` + one migration, each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK), tenant-indexed, soft-delete + audit columns; a DB unique index for every uniqueness rule; structured data as non-null JSONB (no scalar-list columns in this domain)                                                                                                                                                                 |
| **API**              | Six permission-gated (`scheduling:read`/`:write`), tenant-scoped REST controllers under `academic-scheduling/*` (timetables incl. conflict analysis, intelligence and per-teacher workload queries; slots; resources; allocations; policies; substitutions); zod DTOs; six Prisma/RLS adapters + seven directory adapters; `AcademicSchedulingModule` importing the Organization, Academic-Structure and Person modules, registered in the root module |
| **Events**           | Eight domain events: `scheduling.timetable.created`, `.published`, `.revised`, `scheduling.slot.assigned`, `scheduling.resource.allocated`, `.released`, `scheduling.conflict.detected`, `scheduling.substitution.assigned` (resources and policies emit none, per the contract)                                                                                                                                                                       |
| **Docs & decisions** | ADR-0026 (platform + conflict-engine architecture); this report; platform-state and CHANGELOG updates                                                                                                                                                                                                                                                                                                                                                  |

## 3. Domain capabilities & invariants

- **Timetable management.** One timetable per (organization, code) for a grade (optionally a
  class/section) in an academic year and term; version-controlled (counter + append-only
  revision log) across draft → published → archived. Publishing is gated by the conflict
  engine; revising a published timetable returns it to draft at the next version.
- **Schedule slots.** A slot is a scheduled instructional period (day, HH:MM range, subject,
  teacher, section, optional class/venue) validated against subject/teacher/section (and
  optional class/venue), one per (timetable, day, start, section), assignable and editable
  **only while the timetable is a draft**.
- **Resource scheduling.** Classrooms, laboratories, libraries, sports grounds, auditoriums,
  conference rooms and equipment — one per (organization, code) with capacity, location and
  recurring (validated) availability windows, across available → maintenance → retired.
- **Allocation & capacity.** Teacher/classroom/laboratory/equipment assignment to a
  recurring window, validated by kind (teacher via directory; otherwise a live, non-retired
  resource) with capacity enforcement, across allocated → released.
- **Conflict detection.** Teacher, section, venue and resource double-bookings and policy
  violations are detected across the timetable's own slots **and every other published
  timetable in the same period**, plus active allocations and active policies; publication
  is refused on any conflict.
- **Teacher workload.** Per-teacher totals, per-weekday counts and busiest day over the
  publication scope; a descending-load distribution — the foundation for workload balancing.
- **Substitution management.** Tracked, auditable teacher/venue overrides (replacement ≠
  original) recorded against a validated slot, across assigned → cancelled | completed.
- **Scheduling policies.** Configurable, version-controlled institutional constraints with
  open JSON parameters, across draft → active → archived; only active policies are enforced.
- **Scheduling intelligence.** Read-only AI-ready metadata — utilisation, density, workload
  distribution, conflict count and optimisation hints — computed over the same scope;
  optimisation decisions remain the Institutional Intelligence program's.
- **Cross-cutting invariants.** Every record is organization-scoped (validated) or derives
  its organization from a validated parent (slots and substitutions from their timetable /
  slot); every uniqueness rule is DB-enforced; all data is FORCE-RLS tenant-isolated and
  fail-closed.

## 4. Verification

- **Gates (in-sandbox).** `@knowget/academic-scheduling` typecheck, lint, build and **53
  unit/integration tests** green (across the conflict engine, workload, intelligence, all
  six services, and an end-to-end integration suite). `apps/api` typecheck green; the
  academic-scheduling **DI compilation spec** green (all six controllers and services
  resolve through the module, including the imported Organization, Academic-Structure and
  Person modules). Prettier-clean.
- **Conflict engine coverage.** Tests exercise every conflict kind (teacher/section/venue/
  resource), adjacency vs overlap, null venues, each of the three enforced policy rules,
  inactive-policy exclusion, and the end-to-end publish gate — including a teacher
  double-booking detected **across two published timetables**.
- **Live RLS (real PostgreSQL 16).** Migration applied as a `NOSUPERUSER` table owner so
  `FORCE ROW LEVEL SECURITY` applies. For all six tables: tenant A sees only its own rows;
  tenant B sees zero (isolation); an unset tenant sees zero (fail-closed); a cross-tenant
  `INSERT` is rejected by the `WITH CHECK` clause.
- **Independent audit.** A separate reviewer audited the domain, adapters, schema, migration
  and controllers against the P2-D06 reference across ten areas (adapter↔schema,
  domain↔adapter, migration↔schema, conflict-engine correctness, publish gating, events,
  permission scopes, DTOs, cross-reference validation, multi-tenancy) and found the milestone
  internally consistent with no High/security issues. One medium finding — `remove` omitting
  the draft-timetable guard its sibling mutations enforce — and two low findings (publish
  state-check ordering; reschedule placement collision surfacing a raw DB error) were fixed
  in-milestone with regression tests.

## 5. Decisions

Recorded in **ADR-0026**. In brief: one package for all six aggregates plus three pure
engines; a decoupled conflict engine over narrow view interfaces, built and tested first;
publication hard-gated on the full conflict picture (own + peer published slots in the
period + active allocations + active policies); Substitution promoted to a persisted
aggregate for auditability; version control by counter + revision log for timetables and
policies; a single `scheduling:*` scope; FORCE-RLS persistence per ADR-0010 with JSONB for
structured data; eight events (resources and policies emit none); three policy rule types
enforced and three deferred behind a stable dispatch (TD-27); attendance/teaching/assessment
excluded.

## 6. Technical debt

- **TD-21 (carried).** Domain Prisma adapters live at the `apps/api` composition root rather
  than in a dedicated persistence package — unchanged from ADR-0010.
- **TD-27 (new).** Three scheduling-policy rule types — `subject_sequencing`,
  `resource_priority`, `availability_window` — are stored and version-controlled but not yet
  evaluated by the conflict engine (they need data beyond the weekly slot grid). The engine
  dispatches on rule type, so each can be implemented behind the existing seam without a
  model change.

## 7. Recommendation — proceed to P2-D08

P2-D07 delivers the authoritative scheduling engine: an institution can generate and manage
academic schedules through reusable capabilities; resource, teacher, section and venue
conflicts are automatically detected and **prevented** at publication; scheduling policies
are configurable without code changes; and teacher workload and scheduling intelligence are
computed over the published grid. Every downstream academic domain can now consume this
platform rather than reimplementing scheduling. The certified core and all frozen packages
are untouched. **Recommend proceeding to P2-D08 — Attendance & Presence Intelligence
Platform.**
