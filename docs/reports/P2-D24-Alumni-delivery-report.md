# Engineering Delivery Report — P2-D24

**Alumni, Community & Relationship Platform** · Phase 2 (Enterprise Domain Engineering) · Program: Campus & Engagement

|                |                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D24 — Alumni, Community & Relationship Platform                                                                                                                                                                                                                                                                                                                                                               |
| **Status**     | ✅ Merged to `main` (`968030d`, no-ff) after CI green. In-sandbox: `@knowget/alumni` typecheck/lint/format/build clean, **49 tests** (18 files); `apps/api` typecheck/lint/build clean + alumni DI-graph spec (2 tests) in the **216-test** api suite; RLS verified on live PostgreSQL. Full monorepo typecheck/lint/tests green (**261** prisma-independent turbo tasks; TD-12 on the Prisma build in-sandbox). |
| **Depends on** | P2-D01-M01 (Organization — the alumni-record owner), P2-D01-M02 (Person — the alumnus), P2-D03 (Student Lifecycle, ADR-0012 — the alumnus lifecycle stage the network profile is built on), P2-D14 (Finance — where gift **amounts** live), P1-M05 (`@knowget/notifications`) + P2-D22 (Engagement — where community message **delivery** lives), P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`)                          |
| **Date**       | 25 December 2026                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Next**       | P2-D25 — Institutional Knowledge Graph (first Program E / intelligence-core contract)                                                                                                                                                                                                                                                                                                                            |

---

## 1. Mission recap

Deliver the **Alumni, Community & Relationship Platform** — the institution's **alumni-network system of
record** and the **sixth and final contract of Program D (Campus & Engagement)**: the alumni-network profiles
built on the alumnus lifecycle stage, the regional/interest chapters and their memberships, the reunions and
networking events and their registrations, the mentorship connections between alumni, and the immutable giving
record, with a descriptive per-alumnus engagement profile. The defining boundary is **Student Lifecycle
(P2-D03)**, exactly as for admissions: P2-D03 owns the prospect → applicant → student → **alumnus** lifecycle
_record_; this domain models the alumnus's **network membership** on top of it, referencing the alumnus as a
**Person** and never re-modelling the lifecycle. Where admissions (P2-D23) runs the funnel that brings students
in, this domain keeps the relationship after they leave — both attach to the same Person. Three decisions shape
it: several quantities are **derived, not stored** — an alumnus's engagement and an event's participation — so
the design begins with **two pure engines**; **this domain carries no money** — gift **amounts are Finance's
(P2-D14)**; and **one of the eight aggregates is an immutable append-only record** (contribution). Community
message _delivery_ is the notifications (P1-M05) / engagement (P2-D22) concern; giving-propensity and
engagement forecasting (P2-D28) are out of scope.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engines**          | Two pure, deterministic, clock-free engines built and tested first: the **engagement engine** (`computeAlumniEngagement` — a weighted, capped 0–100 score over attended events / active chapters / active mentorships / contributions + the level it falls in; `summarizeAlumniEngagement` — count / average / per-level rollup) and the **participation engine** (`computeEventParticipation` — fill / remaining / over-subscribed / attendance rate vs capacity, 0 = untracked; `summarizeParticipation` — the rollup, fill over capacity-tracked events only)     |
| **Domain**           | `@knowget/alumni` — eight aggregates (AlumniProfile, AlumniChapter, ChapterMembership, AlumniEvent, EventRegistration, MentorshipConnection, Contribution — **immutable** — and AlumniEngagementProfile), each an aggregate + factory + guarded transitions with an application service, plus the `AlumniEngagementProfileService` integration spine; value objects (alumni/chapter/membership/event/registration/mentorship statuses, chapter+event+contribution types, recognition tiers, engagement levels). **No money; one write-once record; PII-free events** |
| **Persistence**      | Eight models in `schema.prisma` + one migration (`20261225000000_add_alumni`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed, soft-delete + audit columns; capacity + engagement counts + score **INTEGER**, dates/codes/tiers **TEXT**; **all uniqueness DB-backed** (one profile per (tenant, alumnus person); chapter/event code per tenant; one membership per (chapter, profile); one registration per (event, profile); one engagement profile per profile)                                                  |
| **API**              | Eight permission-gated, tenant-scoped REST controllers — `alumni/*` (profiles, mentorships, contributions, the engagement profile) under `alumni:read`/`:write` and `community/*` (chapters, memberships, events, registrations) under `community:read`/`:write`; zod DTOs; eight Prisma/RLS adapters (the two immutable ones omit `remove`) + two directory adapters (Organization, Person); `AlumniModule` importing the Organization and Person modules, registered in `app.module`                                                                               |
| **Events**           | Money-free, free-text-free, PII-free domain events on `alumni.*` — profile created/updated/lapsed/reactivated/opted_out; chapter created/renamed/type_set/region_set/activated/deactivated/archived; membership joined/role_set/left/reactivated; event created/renamed/type_set/capacity_set/window_set/scheduled/opened/closed/completed/cancelled; registration registered/attended/no_show/cancelled/reinstated; mentorship proposed/activated/completed/ended; contribution recorded; engagement profile refreshed                                              |
| **Docs & decisions** | ADR-0043 (platform + the dual pure engines + the no-money decision + the immutable contribution + the Student-Lifecycle P2-D03 boundary and the Finance P2-D14 amount boundary + the advisory event capacity); this report; platform-state, technical-debt (TD-44) and CHANGELOG updates                                                                                                                                                                                                                                                                             |

## 3. Domain capabilities & invariants

- **Engagement & participation are derived.** An alumnus's engagement (score + level) is computed by the
  engagement engine from their activity; an event's fill and attendance are computed by the participation
  engine from its registrations against capacity — never stored. The score caps at 100; the rollup fill counts
  **only capacity-tracked events**.
- **Profile anchor.** An `AlumniProfile` `active ↔ lapsed → opted_out` (one per person per tenant), referencing
  the alumnus as a **Person**; the alumnus lifecycle record stays in **Student Lifecycle (P2-D03)**.
- **Chapter & membership.** A chapter `forming → active ↔ inactive → archived` (code unique, joinable while
  forming/active); a membership `active → left` with `left → active` reactivation, **one row per (chapter,
  alumnus)** — rejoin reactivates, never duplicates.
- **Event & registration.** An event `draft → scheduled → open → closed → completed | cancelled` (capacity 0 =
  untracked, registrations only while open); a registration `registered → attended | no_show | cancelled` with
  `cancelled → registered` reinstatement, **one row per (event, alumnus)**.
- **Mentorship.** `proposed → active → completed | ended` between two **distinct** alumni; an active mentorship
  counts toward both alumni's engagement.
- **Contribution (immutable).** A giving act — type + **non-monetary recognition tier** + optional campaign ref
  — write-once, no edit/delete. **No money**: the amount is Finance's (P2-D14).
- **Engagement profile.** A descriptive read model, one per alumnus, **refreshed** from the engagement engine.
  Descriptive only — **never a forecast** (P2-D28).
- **Money-free, free-text-free, PII-free events.** No event payload carries a gift amount, a person name, a
  graduation year, a chapter/event name, a mentorship focus or a campaign reference — only ids, codes, types,
  roles, tiers, statuses, scores and counts.

## 4. Verification

- **Pure-engine-first.** The two engines (engagement; participation) were built and exhaustively tested before
  any aggregate depended on them, over narrow views the aggregates structurally satisfy.
- **Tests.** `@knowget/alumni` — **49 tests** (the engagement score incl. weights, cap, level bands,
  empty/negative, and its rollup; the event participation incl. untracked/over-subscribed/attendance and the
  tracked-only rollup; every aggregate lifecycle incl. the terminal-state and reactivation guards; the
  immutable contribution; the service validations incl. open-event / joinable-chapter / distinct-mentor gates,
  the one-row-per-pair reactivation, org derivation and existence checks; the money-free/free-text-free/PII-free
  event content; and an end-to-end profile → chapters/events/mentorships/contributions → engagement-profile
  spine). `apps/api` — the alumni DI-graph integration spec compiles the full module and asserts every service
  token resolves.
- **Gates.** `@knowget/alumni` typecheck, ESLint, Prettier and build clean; `apps/api` typecheck, ESLint and
  build clean. Full monorepo typecheck, lint and tests pass in-sandbox (all **261** prisma-independent turbo
  tasks green); the full Prisma build and DB-integration tests are CI-verified (TD-12: the Prisma engine CDN is
  unreachable in the build sandbox).
- **Live RLS.** The migration was applied on a live PostgreSQL instance as a **non-superuser owner**; verified
  that tenant A and tenant B each see only their own rows, an unset tenant sees zero (fail-closed), a
  cross-tenant insert is rejected by `WITH CHECK`, FORCE RLS + the `tenant_isolation` policy is present on all
  eight tables (8/8), the **INTEGER capacity/counts/score round-trip exactly**, and every business unique (one
  profile per person, chapter/event code, one membership per (chapter, profile), one registration per (event,
  profile), one engagement profile per profile) rejects a duplicate (SQLSTATE 23505).
- **Independent audits.** Two adversarial audits (domain logic; persistence/API) reviewed the whole milestone.
  Both were **clean of functional defects** — the persistence/API audit clean across all categories
  (schema/migration column-by-column parity incl. the INTEGER columns, adapter field fidelity incl. the two
  append-only repositories with no `remove`, the mentorship OR-query and registration count semantics, the
  DB-backed uniques, correct delegates + status-filtered queries, controller scope split + route ordering,
  DTO/enum parity, all eight DI inject arrays token-by-token); the domain audit clean on every correctness /
  invariant / engine-math / immutability / event-payload / dead-code / type-safety check. **Two low-severity
  design notes were polished before merge with regression tests** — the chapter-membership rejoin dropped a
  requested role (now `reactivateMembership` accepts an optional role and the service passes it through), and
  the participation rollup blended tracked and untracked capacity in the overall fill (now the fill counts
  capacity-tracked events only, mirroring the per-event engine).

## 5. Decisions

Recorded in **ADR-0043**: two pure engines (engagement; participation) as the computational core built first;
**no money** (gift amounts → Finance P2-D14); **one immutable append-only record** (contribution — its
repository has no `remove`); one package for all eight aggregates; the alumni-profile network anchor built on
Student Lifecycle's (P2-D03) alumnus stage; the chapter/membership and event/registration community aggregates
(one row per pair, reactivation on return); the distinct-alumni mentorship; the descriptive engagement profile
and the refresh spine; **two scope pairs — `alumni:*` and `community:*`**; persistence per ADR-0010 with FORCE
RLS verified live and **all uniqueness absolute and DB-backed** (no status-scoped TOCTOU debt, like P2-D21/D22/
D23 and unlike D16–D20); and the advisory event capacity (TD-44).

## 6. Technical debt

- **TD-44 (new, low).** **Event capacity is advisory, not enforced** — `EventRegistrationService.register`
  does not reject a registration when a tracked event's confirmed registrations reach or exceed its `capacity`.
  The participation engine _derives_ an `overSubscribed` / `remaining` signal (surfaced on the event
  participation view) for monitoring, but the write path does not block — **deliberate**, because alumni events
  routinely over-register against expected melt and maintain waitlists, and a capacity of 0 means untracked/no
  limit. A hard cap is offered as an **opt-in** refinement behind the service, not a default (ADR-0043).
  Mirrors TD-41 (campus-security occupancy) and TD-43 (admissions seat cap), the advisory-capacity family.
  Note: like P2-D21/D22/D23 and unlike D16–D20, this domain carries **no status-scoped uniqueness TOCTOU
  debt** — every uniqueness rule (one profile per person; chapter/event code; one membership per (chapter,
  profile); one registration per (event, profile); one engagement profile per profile) is **absolute and
  DB-backed**, the two one-row-per-pair aggregates reactivating rather than duplicating on return.
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root.
- **TD-01 (standing).** Event delivery is in-process (outbox store in-memory); the alumni events ride the same
  bus.

## 7. Outcome — pending CI green + merge to `main`, Program D complete

The Alumni, Community & Relationship Platform is complete behind its gates: engagement and event participation
are derived consistently by pure engines (the score capped, the rollup fill over tracked events only), one of
the eight aggregates is an immutable append-only record, the no-money boundary (amounts → Finance P2-D14) and
the Student-Lifecycle (P2-D03) boundary are held structurally (the profile is built on the alumnus stage, never
re-modelling the lifecycle), and all eight tables are FORCE-RLS tenant-isolated (verified live, INTEGER
round-tripping exactly, cross-tenant insert rejected, every business unique rejecting duplicates 23505); both
independent audits were clean of functional defects (two low design notes polished before merge). The branch
merged to `main` at **`968030d`** (no-ff) after CI green as the **sixth and final contract of Program D
(Campus & Engagement)** — completing the operational base **D01–D24** — and next is **P2-D25 — Institutional
Knowledge Graph**, the first contract of Program E (the intelligence core, D25–D30). **Reminder: rotate the
GitHub PAT** used for pushes at this milestone boundary — it has not yet been rotated across the
P2-D18…D24 boundaries.
