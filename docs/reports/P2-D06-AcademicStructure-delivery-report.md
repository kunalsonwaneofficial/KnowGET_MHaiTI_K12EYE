# Engineering Delivery Report — P2-D06

**Academic Structure & Curriculum Platform (ASCP)** · Phase 2 (Enterprise Domain Engineering) · Program: Academic Excellence Platform

|                |                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D06 — Academic Structure & Curriculum Platform                                                                                                       |
| **Status**     | ✅ Complete — CI green; merged to main (`14786ec`). Gates green in-sandbox (build, lint, typecheck, full test suites); RLS verified on live PostgreSQL. |
| **Depends on** | P2-D01 (Identity & Organization, `v0.2.0`), P2-D02…D05, Phase 1 baseline (`v0.1.0`)                                                                     |
| **Date**       | 21 July 2026                                                                                                                                            |
| **Next**       | P2-D07 — Enterprise Academic Scheduling & Resource Orchestration Platform (EASROP)                                                                      |

---

## 1. Mission recap

Deliver the **Academic Structure & Curriculum Platform** — the authoritative source for an
institution's academic organization: what is taught, when, to whom, and under which
framework. The platform models academic calendars, programs, curriculum frameworks, grades,
classes, sections, subjects and learning outcomes, supporting diverse educational models
(CBSE, ICSE, state boards, IB, Cambridge, vocational, custom) that **coexist within one
institution without conflict**, while remaining independent of teaching, attendance,
assessment and examinations. Every subsequent academic domain consumes this platform rather
than redefining academic structure. It opens a new program — the **Academic Excellence
Platform**.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain**           | `@knowget/academic-structure` — eight aggregates (Academic Calendar, Academic Program, Curriculum Framework, Grade, Class, Section, Subject, Learning Outcome), each an immutable aggregate + factory + guarded transitions with an application service; value objects (term/semester, holiday, examination period, academic event, weekday, program stage, curriculum status & revision, Bloom's level); a shared spine (errors, ports + in-memory impls, `academic.*` events, barrel) |
| **Persistence**      | Eight models in `schema.prisma` + one migration, each table **FORCE RLS** + `tenant_isolation` (both `USING` and `WITH CHECK`), tenant-indexed, soft-delete + audit columns; a DB unique index for every uniqueness rule; scalar-list columns non-null with an empty-array default                                                                                                                                                                                                      |
| **API**              | Eight permission-gated (`academic:read`/`:write`), tenant-scoped REST controllers under `academic-structure/*`; zod DTOs; eight Prisma/RLS adapters + an Organization directory adapter; `AcademicStructureModule` wiring all repositories, the directory and services (threading the shared repositories for hierarchy validation), importing OrganizationModule, registered in the root module and exporting every service token                                                      |
| **Events**           | Ten domain events: `academic.year.created`, `academic.calendar.published`, `academic.curriculum.created`, `academic.curriculum.revised`, `academic.grade.created`, `academic.class.created`, `academic.section.created`, `academic.subject.registered`, `academic.subject.updated`, `academic.learning_outcome.defined` (programs emit none, per the contract)                                                                                                                          |
| **Docs & decisions** | ADR-0025 (platform architecture); this report; platform-state and CHANGELOG updates                                                                                                                                                                                                                                                                                                                                                                                                     |

## 3. Domain capabilities & invariants

- **Academic calendar management.** One calendar per (organization, academic year): terms,
  semesters, holidays, examination periods, special events and working days, across a
  draft → published → archived lifecycle. Creating a calendar establishes the academic year;
  publishing is a one-way transition. Date ranges are validated.
- **Program & grade management.** Programs (Pre-Primary…Diploma/vocational/custom) group the
  grades taught under them. A grade carries a hierarchy level, a validated promotion target
  and rule, and age guidelines; grades derive their organization from their program.
- **Curriculum management.** Board-affiliated frameworks with learning philosophy, competency
  model, assessment philosophy and subject framework; **version-controlled** via a version
  counter and an append-only revision log. Multiple frameworks coexist per organization; an
  archived framework is immutable.
- **Class & section management.** A class is the running of a grade for an academic year with
  an optional (validated) curriculum assignment; a section is a teachable division of a class
  with a capacity and a planned → active → closed lifecycle. Classes derive org from the
  grade, sections from the class.
- **Subject management.** A mandatory/elective catalog entry with credits, elective group,
  cross-disciplinary flag and prerequisite subjects (validated, self-reference rejected). A
  version counter increments on every real change (idempotent operations are no-ops).
- **Learning outcome management.** A Bloom's-aligned outcome statement attached to a subject
  (org derived from it), mapped to competencies and aligned to a curriculum framework and
  assessment methods, versioned. The semantic foundation teaching and assessment consume.
- **Cross-cutting invariants.** Every record is organization-scoped (validated) or derives
  its organization from a validated parent; every uniqueness rule is DB-enforced; the
  academic hierarchy (program → grade → class → section; subject → outcome) is validated at
  each level; all data is FORCE-RLS tenant-isolated and fail-closed.

## 4. Verification

- **Gates (in-sandbox).** `@knowget/academic-structure` typecheck, lint, build and **54 unit
  tests** green (16 files across all eight aggregates and services). `apps/api` typecheck
  green; the academic-structure **DI compilation spec** green (all eight controllers and
  services resolve through the module, including the imported Organization module).
  Prettier-clean.
- **Live RLS (real PostgreSQL 16).** Migration applied as a `NOSUPERUSER` table owner so
  `FORCE ROW LEVEL SECURITY` applies. For all eight tables: tenant A sees only its own rows;
  tenant B sees zero (isolation); an unset tenant sees zero (fail-closed); a cross-tenant
  `INSERT` is rejected by the `WITH CHECK` clause.
- **Independent audit.** A separate reviewer audited the domain, adapters, schema, migration
  and controllers against the P2-D05 reference: adapter↔schema mapping, domain↔adapter
  completeness, migration↔schema (scalar-list columns non-null with empty-array default;
  unique indexes match), per-table FORCE RLS, permission scopes, DTO/service inputs, all ten
  events, and cross-reference validation & org derivation all verified. One low finding — a
  spurious `subject.updated` event on an idempotent prerequisite no-op — was fixed
  in-milestone (the service now skips the save and event when a transition is a genuine
  no-op), with a regression test added.

## 5. Decisions

Recorded in **ADR-0025**. In brief: one package for all eight aggregates; organization
validated for top-level aggregates and derived from the parent for the hierarchy (grade →
program, class → grade, section → class, outcome → subject); multiple curricula coexist per
organization (identified by code, open board affiliation); version control by counter +
append-only revision log for curricula, subjects and outcomes; a single `academic:*`
permission scope (structure, not sensitive data); ten events (programs emit none); FORCE-RLS
persistence per ADR-0010; structure-only scope with teaching/attendance/assessment excluded.

## 6. Technical debt

- **TD-21 (carried).** Domain Prisma adapters live at the `apps/api` composition root rather
  than in a dedicated persistence package — unchanged from ADR-0010.
- **No new debt.** The one audit finding was fixed in-milestone, not deferred.

## 7. Recommendation — proceed to P2-D07

P2-D06 delivers the authoritative academic structure: an institution can model any supported
academic structure without code changes; curriculum frameworks are reusable and
version-controlled; the academic hierarchy is stable and validated; and learning outcomes
provide the semantic foundation for teaching and assessment. Every downstream academic domain
can now consume this platform rather than redefining academic structure. The certified core
and all frozen packages are untouched. **Recommend proceeding to P2-D07 — Enterprise Academic
Scheduling & Resource Orchestration Platform.**
