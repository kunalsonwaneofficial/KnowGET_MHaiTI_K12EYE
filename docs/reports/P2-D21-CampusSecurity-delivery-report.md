# Engineering Delivery Report — P2-D21

**Campus Security, Safety & Visitor Platform** · Phase 2 (Enterprise Domain Engineering) · Program: Campus & Engagement

|                |                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D21 — Campus Security, Safety & Visitor Platform                                                                                                                                                                                                                                                                                                                                                                                     |
| **Status**     | ✅ Complete — CI green; merged to `main` (`c793327`). In-sandbox: `@knowget/campus-security` typecheck/lint/format/build clean, **60 tests** (19 files); `apps/api` typecheck/lint/build clean + campus-security DI-graph spec in the **210-test** api suite; RLS verified on live PostgreSQL. Full monorepo typecheck/lint/tests green (**249** prisma-independent turbo tasks; TD-12 on the Prisma build in-sandbox).                 |
| **Depends on** | P2-D01-M01 (Organization — the campus-node base), P2-D01-M02 (Person — the visit hosts and incident reporters), P2-D12 (Workforce, ADR-0031 — the Employee base for incident assignees, drill conductors and employee credential-holders), P2-D05 (Learner Wellbeing, ADR-0024 — where the standing safeguarding record lives), P2-D19 (Health Centre, ADR-0038 — where clinical incidents live), P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`) |
| **Date**       | 22 December 2026                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Next**       | P2-D22 — Unified Communication, Engagement & Collaboration (next Program D contract)                                                                                                                                                                                                                                                                                                                                                    |

---

## 1. Mission recap

Deliver the **Campus Security, Safety & Visitor Platform** — the institution's **physical-security and safety
system of record** and the **third contract of Program D (Campus & Engagement)**: the security zones the
campus is divided into, the visitors who come to it and their visits, the access credentials that open zones
and the immutable log of every access decision, the security incidents raised across the estate, the
emergency drills that account for who is present, and the descriptive per-zone safety profile. It is named
`@knowget/campus-security` — **not** the platform `@knowget/security` (the P1-M04 crypto/RBAC foundation) — an
entirely different bounded context, on a distinct `campus-security.*` event namespace. Three decisions shape
it: several quantities are **derived, not stored** — a zone's live presence and over-capacity, a drill's
safety-critical unaccounted-for count, and an access decision — so the design begins with two pure engines;
**this domain carries no money** — there is nothing to bill or buy here (security-service procurement is
Procurement & Assets', any charge is Finance's); and, distinctively, one aggregate is **immutable
append-only telemetry** — an access event is a decision recorded once and never edited. Two boundaries define
it: **the standing safeguarding record is not here** (disciplinary history, safeguarding concerns and
protection plans belong to Learner Wellbeing, P2-D05 — a security incident is a time-bounded operational
occurrence, not a standing record about a person); and **the clinical incident is not here** (a medical
emergency or injury is the Health Centre's clinical encounter, P2-D19). Identity is referenced not duplicated
— a zone's/visitor's org is an Organization, a visit host and incident reporter a Person, an incident
assignee / drill conductor / employee credential-holder an Employee. Physical door-controller / reader
firmware, CCTV, security-service billing and prediction (threat scoring, P2-D28) are out of scope.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Engines**          | Two pure, deterministic, clock-free engines built and tested first: the **presence engine** (`computeZonePresence` — a zone's checked-in count against its safe-occupancy capacity, places remaining, over-capacity flag and occupancy percent, capacity 0 = not-tracked; `summarizeSitePresence` — the campus rollup; `computeMusterStatus` — a drill's **safety-critical unaccounted-for count**, all-accounted flag and completion percent, the roll-call analog); and the **access engine** (`evaluateAccess` — a granted/denied decision by strict priority: inactive → expired → zone-unavailable → locked-down → not-granted → ok; `summarizeAccessActivity` — the granted/denied tally over the log) |
| **Domain**           | `@knowget/campus-security` — eight aggregates (AccessZone, Visitor, Visit, AccessCredential, AccessEvent, SecurityIncident, EmergencyDrill, SafetyProfile), each an immutable aggregate + factory + guarded transitions with an application service, plus the `AccessDecisionService` integration spine; value objects (zone/visitor/visit/credential/incident/drill statuses, security levels, holder types, access decisions + reasons, incident categories + severities, drill types). **No money; immutable access log; money-free, free-text-free, PII-free events**                                                                                                                                    |
| **Persistence**      | Eight models in `schema.prisma` + one migration (`20261222000000_add_campus_security`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed, soft-delete + audit columns; capacities/counts/rosters/musters/percents **INTEGER**, a credential's granted zone ids **JSONB**, the profile's over-capacity flag **BOOLEAN**, date/ISO stamps + codes/names/summaries **TEXT**; tenant-scoped DB unique indexes (zone, visitor, credential, incident, drill codes; one profile per zone) — **all uniqueness absolute and DB-backed**                                                                                                                                |
| **API**              | Eight permission-gated, tenant-scoped REST controllers — `security/*` (zones, credentials, the access decision + its log, incidents, drills, the safety profile) under `security:read`/`:write` and `visitor/*` (visitors, visits) under `visitor:read`/`:write`; zod DTOs; eight Prisma/RLS adapters + three directory adapters (Organization, Person, Employee); `CampusSecurityModule` importing the Organization, Person and Workforce modules, registered in `app.module`                                                                                                                                                                                                                               |
| **Events**           | Money-free, free-text-free, PII-free domain events on `campus-security.*` — zone created/renamed/security-level-set/capacity-set/locked-down/lockdown-lifted/decommissioned; visitor registered/type-set/contact-updated/blocked/unblocked/archived; visit requested/zone-set/approved/denied/checked-in/checked-out/cancelled/expired; credential issued/zone-granted/zone-revoked/expiry-set/suspended/reinstated/revoked; access recorded; incident reported/triaged/assigned/severity-set/investigation-started/resolved/closed/cancelled; drill scheduled/expected-set/started/muster-recorded/completed/cancelled; safety profile refreshed                                                            |
| **Docs & decisions** | ADR-0040 (platform + the dual pure engines + the no-money decision + the immutable-access-log choice + the P2-D05 safeguarding and P2-D19 clinical boundaries + the `@knowget/security` naming distinction); this report; platform-state, technical-debt (TD-41) and CHANGELOG updates                                                                                                                                                                                                                                                                                                                                                                                                                       |

## 3. Domain capabilities & invariants

- **Presence, muster & access are derived.** A zone's live occupancy (and the campus rollup) is computed by
  the presence engine from its checked-in visits against capacity; a drill's unaccounted-for count is computed
  from its expected roster against the accounted-for headcount; an access decision is computed by the access
  engine from a credential's status/grants/expiry against a zone's status — never stored. A capacity of zero
  means **not capacity-tracked** (no limit).
- **Masters.** An access zone `active ↔ locked_down → decommissioned` (code unique per tenant, a security
  level + safe-occupancy capacity, terminal state frozen); a visitor `active ↔ blocked → archived` (code
  unique per tenant, a blocked/archived visitor cannot have a visit requested or approved).
- **Visits.** A visit `requested → approved → checked_in → checked_out` (or `denied` / `cancelled` /
  `expired`), linking a visitor to a host **Person** and an optional zone, org derived from the visitor;
  **only a checked-in visit counts toward presence**, and the blocked-visitor guard is re-checked at approval.
- **Credentials.** A credential `active ↔ suspended → revoked` (number unique per tenant), for an **Employee**,
  **Person** or **Visitor** holder (validated by type), with a de-duplicated set of granted zones (each
  validated) and an optional date-only expiry.
- **Immutable access log.** An access event is written once by the decision spine (granted/denied + reason) —
  no edit, no delete — feeding the activity tally and the safety profile. The as-of date defaults to the
  **date** of the moment it occurred, so a credential is honoured through its whole expiry day.
- **Security incidents & drills.** An incident `reported → triaged → investigating → resolved → closed` (or
  `cancelled`) with an **Employee assignee required before investigation**; a drill `scheduled → in_progress
→ completed` (or `cancelled`) whose muster status is derived. Both validate their organization, an optional
  location zone that must belong to it, and their optional Person/Employee references.
- **Safety profile.** A descriptive read model, one per zone, **refreshed** from the presence engine plus the
  open-incident, active-credential and granted/denied-access counts. Descriptive only — **never a forecast**
  (P2-D28).
- **Money-free, free-text-free, PII-free events.** No event payload carries a cost, a visitor's name or
  contact details, or an incident's free-text summary — only ids, codes, types, levels, statuses, severities,
  decisions, reasons and counts.

## 4. Verification

- **Pure-engine-first.** The two engines (presence; access) were built and exhaustively tested before any
  aggregate depended on them, over narrow views the aggregates structurally satisfy.
- **Tests.** `@knowget/campus-security` — **60 tests** (zone presence incl. the not-capacity-tracked and
  over-capacity cases + the site rollup; the muster unaccounted-for count + completion percent; the access
  decision at every priority incl. the **expiry-day boundary regression**; the access-activity tally; every
  aggregate lifecycle incl. the terminal-state freezes and the assignee-before-investigation guard; the
  credential holder + granted-zone + **organization** validation; the money-free/free-text-free/PII-free event
  content; and an end-to-end zone → credential → access-decision → log → profile and visitor → visit →
  presence spine). `apps/api` — the campus-security DI-graph integration spec compiles the full module and
  asserts every service token resolves.
- **Gates.** `@knowget/campus-security` typecheck, ESLint, Prettier and build clean; `apps/api` typecheck,
  ESLint and build clean. Full monorepo typecheck, lint and tests pass in-sandbox (campus-security 60, api
  210; all **249** prisma-independent turbo tasks green); the full Prisma build and DB-integration tests are
  CI-verified (TD-12: the Prisma engine CDN is unreachable in the build sandbox).
- **Live RLS.** The migration was applied on a live PostgreSQL instance as a **non-superuser owner**; verified
  that tenant A and tenant B each see only their own rows, an unset tenant sees zero (fail-closed), a
  cross-tenant insert is rejected by `WITH CHECK` (SQLSTATE 42501), FORCE RLS + the `tenant_isolation` policy
  is present on all eight tables (8/8), and the **JSONB granted-zone-ids, the BOOLEAN over-capacity flag and
  the INTEGER counts round-trip exactly**.
- **Independent audits.** Two adversarial audits (domain logic; persistence/API) reviewed the whole milestone.
  The persistence/API audit was **clean across all categories** (schema/migration column-by-column parity
  incl. the JSONB grants, the BOOLEAN over-capacity flag and the INTEGER/TEXT columns, adapter field fidelity
  incl. the append-only access-event repository with no `remove`, correct delegates + status-filtered queries,
  port conformance, controller scope split + route ordering, DTO/enum parity, DI wiring). The domain audit was
  **clean on all critical/major items** and surfaced **two consistency findings, both fixed before merge** —
  the access-decision spine defaulted its as-of date to the full `occurredAt` timestamp, wrongly denying a
  credential on its own expiry day (now defaults to the date portion, with a regression test); and
  `AccessCredentialService.issue` did not validate the organization while every sibling service does (now
  validated via an injected OrganizationDirectory, with a test).

## 5. Decisions

Recorded in **ADR-0040**: two pure engines (presence; access) as the computational core built first; the
access decision comparing a **date-only expiry against the date of the moment** (no false expiry on the
expiry day); **no money — nothing is billed or bought here** (security procurement → Procurement & Assets
P2-D15; any charge → Finance P2-D14), held structurally; **immutable append-only access log** (an event is
written once, its repository has no `remove`); one package for all eight aggregates; the access-zone and
visitor masters; the visit check-in lifecycle with presence counting only the checked-in; the access
credential with an Employee/Person/Visitor holder and validated granted zones; the operational security
incident (not a standing safeguarding record — Learner Wellbeing P2-D05, not a clinical event — Health Centre
P2-D19); the emergency drill with a derived muster; the descriptive safety profile; **two scope pairs —
`security:*` and `visitor:*`**; persistence per ADR-0010 with FORCE RLS verified live and **all uniqueness
absolute and DB-backed** (no status-scoped TOCTOU debt, unlike D16–D20); the `@knowget/campus-security`
naming distinct from the platform `@knowget/security`; and zone occupancy capacity advisory, a hard cap left
opt-in behind the service (**TD-41**).

## 6. Technical debt

- **TD-41 (new, low).** Zone **occupancy capacity is advisory, not enforced**: `VisitService.checkIn` does
  not reject a check-in when a zone is at or over its `capacity`. The presence engine derives an
  `overCapacity` signal (surfaced on the zone-presence view and the safety profile's `over_capacity` flag)
  for monitoring, but the write path does not block — deliberate, because a physical-safety system must
  record a person who is actually present and must never impede egress. A hard occupancy cap is therefore an
  **opt-in** refinement behind `VisitService`, not a default (ADR-0040). Note: unlike D16–D20, this domain
  carries **no status-scoped uniqueness TOCTOU debt** — all its uniqueness (zone, visitor, credential,
  incident, drill codes; one profile per zone) is **absolute and DB-backed**.
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root.
- **TD-01 (standing).** Event delivery is in-process (outbox store in-memory); the campus-security events ride
  the same bus.

## 7. Outcome — merged to `main`, proceed to P2-D22

The Campus Security, Safety & Visitor Platform is complete behind its gates: zone presence, drill muster and
access decisions are derived consistently by pure engines (only checked-in visits count, a credential is
honoured through its whole expiry day), the access log is immutable, the no-money boundary and the
safeguarding (Learner Wellbeing, P2-D05) and clinical (Health Centre, P2-D19) boundaries are held
structurally, and all eight tables are FORCE-RLS tenant-isolated (verified live, JSONB/BOOLEAN/INTEGER
round-tripping exactly, cross-tenant insert rejected 42501); both independent audits were resolved clean
(two domain consistency findings fixed before merge). CI is green and the milestone is **merged to `main`
(`c793327`)**, the third contract of Program D (Campus & Engagement); next is **P2-D22 — Unified
Communication, Engagement & Collaboration**. **Reminder: rotate the GitHub PAT** used for pushes at this
milestone boundary — it has not yet been rotated across the P2-D18/D19/D20/D21 boundaries.
