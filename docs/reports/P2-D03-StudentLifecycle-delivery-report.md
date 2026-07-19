# Engineering Delivery Report — P2-D03

**Student Lifecycle Intelligence Platform (SLIP)** · Phase 2 (Enterprise Domain Engineering) · Program: Student Lifecycle

|                |                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Contract**   | P2-D03 — Student Lifecycle Intelligence Platform                                                                                           |
| **Status**     | ✅ Complete — gates green (build, lint, typecheck, full test suites); RLS verified on live PostgreSQL. Awaiting CI on the PR before merge. |
| **Depends on** | P2-D01 (Identity & Organization, `v0.2.0`), P2-D02 (Governance), Phase 1 baseline (`v0.1.0`)                                               |
| **Date**       | 19 July 2026                                                                                                                               |
| **Next**       | P2-D04 — Family & Guardian Intelligence Platform (FGIP)                                                                                    |

---

## 1. Mission recap

Deliver the **Student Lifecycle Intelligence Platform** — the authoritative domain for
every stage of a learner's institutional journey, from first enquiry through to
alumnus. It manages the complete lifecycle (prospect → applicant → admitted → enrolled
→ active → on-leave → transferred/withdrawn/graduated → alumni) without model redesign,
keeps a permanent immutable history, links student identity **through Person and
Membership rather than duplicating it**, and exposes AI-ready learner intelligence.
Every other academic domain consumes this platform rather than modelling students
itself.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain**           | `@knowget/student-lifecycle` — six aggregates (Prospect, Applicant, Student, EducationalJourney, IntelligenceProfile, Timeline), each an immutable aggregate + factory + transitions with an application service; value objects (lead source, document status, enrollment/academic/administrative status, journey event type, risk level, timeline entry type); a shared spine (errors, ports + in-memory impls, `student.*` events, barrel) |
| **Persistence**      | Six models in `schema.prisma` + one migration, each table **FORCE RLS** + `tenant_isolation`, tenant-indexed, soft-delete + audit columns (the timeline excepted — immutable append-only); Student has a unique `(tenant, student_number)` index                                                                                                                                                                                             |
| **API**              | Six permission-gated, tenant-scoped REST controllers under `student-lifecycle/*` (prospects, applications, students, journeys, intelligence, timeline); zod DTOs; six Prisma/RLS adapters + Person/Organization/Membership directory adapters; `StudentLifecycleModule` wiring all repositories, directories and services, registered in the root module                                                                                     |
| **Events**           | Nine domain events: `student.prospect.created`, `student.application.submitted`, `student.applicant.approved`, `student.enrolled`, `.promoted`, `.transferred`, `.withdrawn`, `.graduated`, `.became_alumni`                                                                                                                                                                                                                                 |
| **Docs & decisions** | ADR-0022 (platform architecture); this report; platform-state, technical-debt and CHANGELOG updates                                                                                                                                                                                                                                                                                                                                          |

## 3. Domain capabilities & invariants

- **Prospect management.** The enquiry funnel (`new → contacted → qualified → converted
| lost`) with lead source, campaign, interests and a follow-up history; the
  prospective learner is a validated Person.
- **Application management.** The admissions lifecycle (`draft → submitted →
under_review` → optional interview → `approved | rejected | withdrawn`) with a
  deduped document checklist, interview tracking and the recorded admission decision
  (the decider is a validated Person); publishes application-submitted and
  applicant-approved.
- **Enrollment & student lifecycle.** Enrollment links a Person and (optionally) a
  Membership, assigns program/campus/section/academic-year and the student and roll
  numbers, and drives `enrolled → active → on_leave → transferred | withdrawn |
graduated → alumni` — each transition guarded and event-publishing. Two invariants
  are enforced: a **unique student number** (service + DB) and a **single active
  enrollment per institution**. Academic and administrative standing (e.g. a hold) are
  tracked independently.
- **Student search & profile.** Read by id, by student number, by organization and by
  person.
- **Educational journey.** An append-only progression record (promotions, retentions,
  transfers, withdrawals, graduation), one per student.
- **Student timeline.** A permanent, immutable, append-only institutional event log
  (admissions, class changes, promotions, awards, incidents, interventions,
  graduations) — no historical event is ever edited or lost.
- **Student intelligence.** An AI-ready profile of learner indicators (academic risk,
  academic trajectory, attendance/behaviour trends, engagement, wellbeing) and the
  intervention history — the model and integration points; prediction is deferred to
  the Institutional Intelligence program.

Every learner is a Person and every institutional link a Membership — validated through
injected directory ports, never duplicated. The journey, intelligence and timeline
derive their organization from the student, so the two can never disagree.

## 4. Verification

- **Build / lint / typecheck:** `@knowget/student-lifecycle` builds and lints clean;
  `apps/api` type-checks against the offline-generated Prisma client and lints clean;
  formatting clean.
- **Tests:** the package has **26** unit tests (aggregates + services); `apps/api` is at
  **174** tests including student-lifecycle controller specs and a module DI-compilation
  test that stands up the full provider graph. All green.
- **Live RLS:** all six tables verified on a real PostgreSQL as a non-superuser role —
  `ENABLE` + `FORCE` confirmed, tenant A sees only its rows, a no-tenant session sees
  zero (fail-closed), and a cross-tenant insert is rejected by the `WITH CHECK` policy.
- **Architecture consistency pass:** one pass across all six aggregates (schema↔adapter
  mapping, RLS, guards, DTO↔domain enums, controllers, events, routes, wiring) — an
  independent audit confirmed the domain sound and produced two refinements, both
  landed: the journey/intelligence/timeline services now **derive organization from the
  student** (closing a cross-domain-integrity gap), and the intelligence adapter gained
  a defensive indicators fallback.
- **CI:** the database-package Prisma generate/build and DB integration tests are
  CI-only in this sandbox (TD-12, environmental); the PR runs them with network access.

## 5. Decisions

- **One package for six aggregates** (ADR-0022 §1), mirroring governance.
- **Student-linked identity** (§2): Person + Membership references, never duplicated;
  student-scoped aggregates derive org from the student.
- **Immutable history** (§4): append-only timeline and educational journey; the
  intelligence profile is model-and-integration-points only.
- **Consume, don't re-model** (§7): all six service tokens exported for downstream
  domains.

## 6. Technical debt

- **No new blocking debt.** Domain Prisma adapters remain at the composition root
  (**TD-21**). Student-lifecycle events ride the same in-process bus/outbox as every
  domain (**TD-01**).
- **TD-24 (new, low):** the single-active-enrollment-per-institution invariant is
  enforced in `StudentService` (check-then-act); a DB **partial unique index** as a
  concurrency backstop (mirroring the unique student number) is deferred. The unique
  student number already has a DB backstop.

## 7. Recommendation — proceed to P2-D04

P2-D03 meets its quality gates and definition of done: the platform manages a learner
from first enquiry through alumni status; every lifecycle transition is traceable and
auditable; student records remain independent of academic, financial and operational
domains; identity is linked through Person and Membership, not duplicated; and the six
service tokens are exported so downstream domains consume the platform rather than
re-modelling students. It is ready to underpin **P2-D04 — Family & Guardian Intelligence
Platform (FGIP)**, which will relate guardians to these learners. Recommend opening the
PR, letting CI validate the Prisma build/migration/tests with network access, and
merging on green.
