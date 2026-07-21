# Engineering Delivery Report — P2-D04

**Family & Guardian Intelligence Platform (FGIP)** · Phase 2 (Enterprise Domain Engineering) · Program: Student Lifecycle

|                |                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D04 — Family & Guardian Intelligence Platform                                                                                   |
| **Status**     | ✅ Complete — gates green (build, lint, typecheck, full test suites); RLS verified on live PostgreSQL. CI green; merged to `main`. |
| **Depends on** | P2-D01 (Identity & Organization, `v0.2.0`), P2-D02 (Governance), P2-D03 (Student Lifecycle), Phase 1 baseline (`v0.1.0`)           |
| **Date**       | 21 July 2026                                                                                                                       |
| **Next**       | P2-D05 — Learner Wellbeing, Safety & Success Platform (LWSSP)                                                                      |

---

## 1. Mission recap

Deliver the **Family & Guardian Intelligence Platform** — the authoritative domain for
family structures, guardianship, parental engagement, legal responsibility, consent,
emergency contacts and family relationships. Families are treated as **dynamic
institutional stakeholders, not attributes of a student record**: a family is
independent of Student, a guardian supports many students and a student many guardians,
custody and legal authority are validated, consent history is immutable, and emergency
contacts are prioritized. Every other domain consumes this platform rather than
maintaining its own parent or guardian records.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain**           | `@knowget/family-guardian` — seven aggregates (Family, Guardian, Student–Guardian Relationship, Consent, Emergency Contact, Communication Profile, Family Intelligence Profile), each an immutable aggregate + factory + guarded transitions with an application service; value objects (household member/role, address, family status, communication channel, guardian contact, legal authority, verification status, relationship type, responsibility, consent type, emergency authorization/outcome, schedule, notification level, intelligence indicators, interaction); a shared spine (errors, ports + in-memory impls, `family.*` events, barrel) |
| **Persistence**      | Seven models in `schema.prisma` + one migration, each table **FORCE RLS** + `tenant_isolation`, tenant-indexed, soft-delete + audit columns (the consent ledger excepted — immutable append-only); unique constraints on family number, guardian (person+org), consent version, and one profile per family                                                                                                                                                                                                                                                                                                                                                |
| **API**              | Seven permission-gated, tenant-scoped REST controllers under `family-guardian/*`; zod DTOs; seven Prisma/RLS adapters + Person / Organization / Student / Policy directory adapters; `FamilyGuardianModule` wiring all repositories, directories and services, importing the Organization, Person, Student-Lifecycle and Governance modules, registered in the root module                                                                                                                                                                                                                                                                                |
| **Events**           | Eight domain events: `family.registered`, `family.guardian.registered`, `family.guardian.assigned`, `family.guardian.removed`, `family.consent.granted`, `family.consent.withdrawn`, `family.emergency_contact.updated`, `family.pickup_authorization.changed`                                                                                                                                                                                                                                                                                                                                                                                            |
| **Docs & decisions** | ADR-0023 (platform architecture); this report; platform-state, technical-debt and CHANGELOG updates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## 3. Domain capabilities & invariants

- **Family management.** Register a household with a unique family number, members
  (each a Person) with roles, addresses (single primary), a primary contact and
  communication defaults; **merge** two households into one and **split** a household
  into new ones; archive. The family holds **no student reference** — it is genuinely
  independent of Student.
- **Guardian management.** Register a guardian (a Person, at most one per person per
  organization) with a basis of legal authority; drive an **independent
  identity-verification** track (`unverified → pending → verified | rejected`, verifying
  activates a pending guardian) and the lifecycle (`pending → active → suspended →
archived`); manage contacts and availability.
- **Relationship management.** Link a guardian to a learner — many guardians per student
  and many students per guardian — recording relationship type, independently-managed
  legal / educational / financial responsibilities and pickup / medical authorizations,
  an emergency priority and effective dates. **Custody validation:** granting legal
  responsibility requires the guardian to hold legal authority. The relationship's
  organization is derived from the guardian.
- **Consent management.** An **immutable, versioned, append-only** ledger across the six
  consent types; grant, withdraw, verify current standing (granted, in effect,
  unexpired), and policy-link to a P2-D02 governance policy. History is never mutated.
- **Emergency management.** A learner's prioritized emergency contacts with a **unique
  priority per student** (the calling hierarchy), pickup / medical authorization, and an
  append-only contact-attempt history; listed in priority order.
- **Communication profile.** One per family — preferred language and ordered channels,
  contact-window schedules, per-category notification levels, accessibility
  requirements.
- **Family intelligence.** One per family — AI-ready engagement indicators (engagement
  level, communication responsiveness, participation rate, consent compliance) and an
  append-only institutional interaction timeline; **model and integration points only**;
  prediction deferred to the Institutional Intelligence program.

Guardians and household members are Persons; learners are P2-D03 Students; consents may
link to P2-D02 Policies — all validated through injected directory ports, never
duplicated. Relationships and consents derive their organization from the guardian;
communication and intelligence profiles from the family.

## 4. Verification

- **Build / lint / typecheck:** `@knowget/family-guardian` builds and lints clean;
  `apps/api` type-checks against the offline-generated Prisma client and lints clean;
  formatting clean.
- **Tests:** the package has **64** unit tests (aggregates + services across 14 files);
  `apps/api` includes a family-guardian module DI-compilation test that stands up the
  full provider graph (with the imported Person, Organization, Student-Lifecycle and
  Governance modules). All green.
- **Live RLS:** all seven tables verified on a real PostgreSQL as a non-superuser role —
  `ENABLE` + `FORCE` confirmed, tenant A sees only its rows, a no-tenant session sees
  zero (fail-closed), and a cross-tenant insert is rejected by the `WITH CHECK` policy.
- **Architecture consistency pass:** one pass across all seven aggregates
  (schema↔adapter mapping, RLS, guards, DTO↔domain enums, controllers, events, routes,
  wiring) plus an **independent audit** — no High or Medium correctness bugs; the domain
  was certified internally consistent. Three deliberate decisions were recorded as
  technical debt (TD-25, TD-26) rather than changed.
- **CI:** the database-package Prisma generate/build and DB integration tests are
  CI-only in this sandbox (TD-12, environmental); the PR runs them with network access.

## 5. Decisions

- **One package for seven aggregates** (ADR-0023 §1), mirroring governance and
  student-lifecycle.
- **Families independent of Student** (§2): a family holds no student reference; learners
  enter only through the Student–Guardian Relationship.
- **Many-to-many, custody-validated** (§3): guardians ↔ students; legal responsibility
  requires legal authority; org derived from the guardian.
- **Immutable consent** (§4) and **prioritized emergency contacts** (§5).
- **Consume, don't re-model** (§9): all seven service tokens exported for downstream
  domains.

## 6. Technical debt

- **No new blocking debt.** Domain Prisma adapters remain at the composition root
  (**TD-21**). Family-guardian events ride the same in-process bus/outbox as every domain
  (**TD-01**).
- **TD-25 (new, low):** consent granting is deliberately **decoupled** from the
  guardian's legal authority and the student relationship — the ledger records who
  decided; authority lives on the relationship. Tightening to require an active guardian↔
  student link is a later refinement behind the service (mirrors TD-23).
- **TD-26 (new, low):** the two **status-scoped** uniqueness invariants — a single active
  guardian↔student relationship, and a unique active emergency priority per student — are
  service-enforced (check-then-act), with a DB **partial unique index** backstop deferred
  (a partial index is required because archived/ended rows retain their values). The
  domain's absolute invariants already have DB unique indexes.

## 7. Recommendation — proceed to P2-D05

P2-D04 meets its quality gates and definition of done: the platform accurately models
real-world family and guardianship structures; legal, educational, financial and
emergency responsibilities are independently managed; family interactions are reusable
across all institutional domains; and the seven service tokens are exported so downstream
domains consume FGIP rather than maintaining their own parent or guardian records. CI
validated the Prisma build, migration and DB integration tests with network access, and
the platform is now **merged and live on `main`**. It is ready to underpin **P2-D05 —
Learner Wellbeing, Safety & Success Platform (LWSSP)**.
