# Engineering Delivery Report — P2-D08

**Attendance & Presence Intelligence Platform (APIP)** · Phase 2 (Enterprise Domain Engineering) · Program: Academic Excellence Platform

|                |                                                                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D08 — Attendance & Presence Intelligence Platform                                                                                                                                           |
| **Status**     | 🟡 Awaiting CI — PR open. Gates green in-sandbox (full monorepo typecheck 95/95, build 51/51, `@knowget/attendance-presence` 39 tests, `apps/api` 184 tests); RLS verified on live PostgreSQL. |
| **Depends on** | P2-D07 (Academic Scheduling, ADR-0026), P2-D06 (Academic Structure, ADR-0025), P2-D01 (Identity & Organization, `v0.2.0`), P2-D02…D05, Phase 1 baseline (`v0.1.0`)                             |
| **Date**       | 1 September 2026                                                                                                                                                                               |
| **Next**       | P2-D09 — Teaching, Learning & Instruction Intelligence Platform (TLIIP)                                                                                                                        |

---

## 1. Mission recap

Deliver the **Attendance & Presence Intelligence Platform** — the authoritative record of who
was present, when, and how engaged. It captures attendance sessions and records, leave,
attendance policies, presence profiles and co-curricular participation. Its defining
properties are **immutable, auditable attendance** (every correction is a versioned, reasoned
append), **configurable policies** that turn raw records and excused leave into an eligibility
verdict, and an **AI-ready presence profile** of descriptive risk signals. It remains
independent of grading, behaviour judgement, timetabling, fees and messaging; every subsequent
academic and financial domain consumes this platform rather than reimplementing attendance.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain**           | `@knowget/attendance-presence` — six aggregates (Attendance Session, Attendance Record, Leave, Attendance Policy, Presence Profile, Participation), each an immutable aggregate + factory + guarded transitions with an application service; value objects (attendance status & method with a `classifyStatus` weighting, session type, leave type & supporting document, policy rule type & revision, participation activity & engagement); and **two pure engines** — policy evaluation and presence intelligence — over shared view interfaces |
| **Policy engine**    | Pure, deterministic `summarizeAttendance` (approved leave excuses `absent` records; percentage = summed present-weight over counted sessions, 2-dp, division-safe) + `evaluatePolicies` (the three percentage rules — `minimum_attendance_percentage`, `examination_eligibility`, `promotion_eligibility` — against each policy's `minimumPercentage`) and `breachedPolicies`                                                                                                                                                                     |
| **Presence engine**  | Pure `computePresenceIndicators` → attendance %, punctuality, **leave-aware** longest-absent streak, chronic-absenteeism (<75% or streak ≥ 5), participation count/diversity, engagement score (0.7·attendance + 0.3·capped participation) and risk band (low/medium/high) with anomalies. A shared internal `leave-ranges` helper excuses the same days here as in the policy engine                                                                                                                                                             |
| **Persistence**      | Six models in `schema.prisma` + one migration (`20260901000000_add_attendance_presence`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK), tenant-indexed, soft-delete + audit columns; a DB unique index for every uniqueness rule; structured data (corrections, documents, parameters, revisions, anomalies) as non-null JSONB; presence rates as `DOUBLE PRECISION`                                                                                                                                                        |
| **API**              | Seven permission-gated (`attendance:read`/`:write`), tenant-scoped REST controllers under `attendance-presence/*` (sessions; records incl. bulk + audited correction; leave incl. approve/reject/documents; policies; presence profiles; participation; analytics — evaluate + recompute-presence); zod DTOs; six Prisma/RLS adapters + five directory adapters; `AttendancePresenceModule` importing the Organization, Person, Academic-Scheduling and Academic-Structure modules, registered in the root module                                 |
| **Events**           | Nine domain events: `attendance.session.created`, `attendance.recorded`, `attendance.corrected`, `attendance.leave.requested`, `attendance.leave.approved`, `attendance.leave.rejected`, `attendance.policy.evaluated`, `attendance.threshold.reached`, `attendance.participation.recorded` (the presence profile emits none, as a read model)                                                                                                                                                                                                    |
| **Docs & decisions** | ADR-0027 (platform + engine architecture); this report; platform-state, technical-debt (TD-28) and CHANGELOG updates                                                                                                                                                                                                                                                                                                                                                                                                                              |

## 3. Domain capabilities & invariants

- **Attendance sessions.** A session is a marking context (academic period, examination,
  event, activity, meeting, club) for an organization on a date, optionally linked to a
  P2-D07 schedule slot and a P2-D06 section/subject, across scheduled → open → closed |
  cancelled; recording is accepted only while the session is open.
- **Immutable, audited records.** A record captures a participant's status (present, absent,
  late, excused, medical leave, official duty, remote, partial) and capture method for a
  session. It is never mutated: a correction requires a real status change and a reason, and
  is stored as a versioned, append-only `AttendanceCorrection` — the full amendment history
  is reconstructable.
- **Leave.** A leave request (student/staff/medical/emergency/approved-absence) over a date
  range for a validated participant and organization, with supporting documents, across
  requested → approved | rejected | cancelled. **Approved leave excuses absences** in the
  policy and presence engines, neither helping nor hurting the percentage.
- **Attendance policies.** Configurable, version-controlled institutional constraints with
  open JSON parameters, across draft → active → archived; only active policies are evaluated.
- **Policy evaluation.** Summarised attendance (approved leave excusing absences) is checked
  against active percentage policies; `attendance.policy.evaluated` is published, and
  `attendance.threshold.reached` for each breached threshold — the engine reports compliance,
  downstream domains decide business outcomes.
- **Presence intelligence.** A per-participant AI-ready profile — attendance %, punctuality,
  leave-aware chronic-absence streak, engagement score, participation diversity and a
  low/medium/high risk band with anomalies — recomputed from records, approved leave and
  participation and materialised as a versioned snapshot.
- **Participation.** Co-curricular involvement (club, sport, cultural, competition,
  institutional event, community service) with an engagement level, optionally linked to a
  session, broadening attendance into institutional engagement.
- **Cross-cutting invariants.** Every record is organization-scoped (validated) or derives
  its organization from a validated parent; every uniqueness rule is DB-enforced; all data is
  FORCE-RLS tenant-isolated and fail-closed.

## 4. Verification

- **Gates (in-sandbox).** Full monorepo **typecheck 95/95** and **build 51/51** (turbo).
  `@knowget/attendance-presence` typecheck, lint, build and **39 unit/integration tests**
  green (across the policy engine, presence intelligence, all six services and an end-to-end
  integration suite). `apps/api` **184 tests** green (9 integration specs skipped, as in CI),
  including the attendance-presence **DI compilation spec** — all seven controllers and seven
  services resolve through the module, including the imported Organization, Person,
  Academic-Scheduling and Academic-Structure modules. Prettier-clean.
- **Engine coverage.** Tests exercise the status weighting (`classifyStatus`), approved-leave
  excusal of absences, the percentage and punctuality maths (2-dp, division-safe), each of the
  three enforced percentage rules, threshold breaches, the **leave-aware** chronic-absence
  streak (a fully-leave-covered absent block yields no chronic signal), engagement scoring, and
  the immutable correction audit.
- **Live RLS (real PostgreSQL 16).** Migration applied as a `NOSUPERUSER` table owner so
  `FORCE ROW LEVEL SECURITY` applies. For all six tables: tenant A sees only its own rows;
  tenant B sees zero (isolation); an unset tenant sees zero (fail-closed); a cross-tenant
  `INSERT` is rejected by the `WITH CHECK` clause.
- **Independent audit.** A separate reviewer audited the domain, adapters, schema, migration
  and controllers against the P2-D07 reference across seven areas (controller↔service
  signatures, DTO↔domain enums, module DI wiring, permission gating & tenancy,
  exactOptionalPropertyTypes, route-collision/REST shape, and domain-logic correctness) and
  found six of seven dimensions clean with no High/security issues. One minor consistency
  finding — the presence chronic-absence streak counted raw `absent` records while the
  attendance percentage already excused approved leave, so a participant on legitimate
  multi-day leave could show a healthy percentage yet be flagged high-risk — was fixed
  in-milestone by sharing one leave-excusal helper between both engines, with a regression test.

## 5. Decisions

Recorded in **ADR-0027**. In brief: one package for all six aggregates plus two pure engines;
decoupled policy-evaluation and presence-intelligence engines over narrow view interfaces,
built and tested first; attendance immutable with versioned, reasoned, append-only
corrections; approved leave excusing absences through one shared leave-range helper so the
policy percentage and the presence streak always agree; Participation promoted to a persisted
aggregate for engagement signals; the Presence Profile an AI-ready read model (descriptive
only); version control by counter + revision log for policies; a single `attendance:*` scope;
FORCE-RLS persistence per ADR-0010 with JSONB for structured data and DOUBLE PRECISION for
rates; nine events (the presence profile emits none); three percentage rule types enforced and
three deferred behind a stable dispatch (TD-28); grading/behaviour/timetabling/penalties/
prediction/messaging excluded.

## 6. Technical debt

- **TD-21 (carried).** Domain Prisma adapters live at the `apps/api` composition root rather
  than in a dedicated persistence package — unchanged from ADR-0010.
- **TD-28 (new).** Three attendance-policy rule types — `late_arrival`, `early_departure`,
  `grace_period` — are stored and version-controlled but not yet evaluated by the policy engine
  (they need intra-session timing beyond the day-grained record model). The engine dispatches
  on rule type, so each can be implemented behind the existing seam without a model change.

## 7. Recommendation — proceed to P2-D09

P2-D08 delivers the presence system of record: an institution captures attendance, leave and
participation through reusable capabilities; attendance is immutable and every correction is
audited; policies turn records and excused leave into an eligibility verdict without code
changes; and an AI-ready presence profile of descriptive risk signals is recomputed on demand.
Every downstream academic and financial domain can now consume this platform rather than
reimplementing attendance. The certified core and all frozen packages are untouched.
**Recommend proceeding to P2-D09 — Teaching, Learning & Instruction Intelligence Platform.**
