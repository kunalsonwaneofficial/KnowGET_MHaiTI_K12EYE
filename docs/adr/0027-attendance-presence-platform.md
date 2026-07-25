# 27. Attendance & Presence Intelligence: one package, six aggregates, immutable audited attendance and two pure engines

- **Status:** Accepted
- **Date:** 2026-09-01
- **Contract:** P2-D08 (Attendance & Presence Intelligence Platform)

## Context

P2-D08 is the third contract of the **Academic Excellence Platform** program, on the
certified `v0.2.0` Identity & Organization baseline, the frozen Phase-1 core, the Academic
Structure & Curriculum Platform (P2-D06, ADR-0025) and the Academic Scheduling & Resource
Orchestration Platform (P2-D07, ADR-0026). It is the authoritative record of **who was
present, when, and how engaged** — attendance sessions, attendance records, leave, attendance
policies, presence profiles and co-curricular participation.

The contract names five core aggregate roots (Attendance Session, Attendance Record, Leave,
Attendance Policy, Presence Profile), nine domain events, and hard requirements: attendance
that is **immutable and auditable**; **configurable attendance policies**; leave that
**excuses** absences; an **AI-ready presence profile** that downstream domains consume; and
co-curricular **participation** recording. It follows the domain architecture pattern
(ADR-0010) with no frozen-code change. Grading, behaviour evaluation, timetable generation,
financial penalties, predictive AI and parent communication are explicit non-goals — this
platform is the **presence system of record, not activity, judgement or messaging**.

Like scheduling before it, this platform has a genuine computational core: a policy-evaluation
engine that turns raw records and leave into an attendance verdict, and a presence-intelligence
engine that distils records, leave and participation into descriptive risk signals. Those two
engines are the crux of the design.

## Decision

1. **One domain package, `@knowget/attendance-presence`, for all six aggregates** — the same
   single-bounded-context choice as the six prior domains (ADR-0021…0026). A shared spine
   (`errors.ts`, `ports.ts`, `attendance-presence-events.ts`, `index.ts`), a per-aggregate
   pair (`<aggregate>.ts` + `<aggregate>-service.ts`), value objects (attendance status &
   method with a `classifyStatus` weighting, session type, leave type & supporting document,
   policy rule type & revision, participation activity type & engagement level, and the shared
   `evaluation` view interfaces), and — distinctively — two **pure engine modules**
   (`policy-engine.ts`, `presence-intelligence.ts`) plus an internal `leave-ranges.ts` helper.

2. **Two pure, decoupled engines are the heart of the platform.** `summarizeAttendance` and
   `evaluatePolicies` (policy engine) and `computePresenceIndicators` (presence intelligence)
   are pure, deterministic functions over **narrow view interfaces** (`AttendanceRecordView`,
   `LeaveView`, `ParticipationView`, `AttendanceConstraint`) that the aggregates structurally
   satisfy, so the engines depend on no aggregate and are exhaustively unit-testable in
   isolation. They were built and tested **first**, before any aggregate depended on them.

3. **Attendance is immutable and every correction is audited.** An `AttendanceRecord` is never
   mutated in place: `correctAttendanceRecord` requires a real status change and a reason,
   appends an `AttendanceCorrection` (`fromStatus`, `toStatus`, `reason`, `correctedAt`,
   `correctedBy`) to an append-only log and bumps the record's version. The full history of a
   participant's attendance — and every amendment to it — is therefore reconstructable, which
   is the contract's auditability requirement.

4. **Approved leave excuses absences without ever overriding presence.** In
   `summarizeAttendance`, an `absent` record whose date falls in an approved-leave range is
   excluded from the calculation (it neither helps nor hurts); a real presence, lateness or
   partial is untouched. The approved-leave date arithmetic lives in one internal
   `leave-ranges` module shared by **both** engines, so the attendance percentage and the
   presence-intelligence chronic-absence streak excuse exactly the same days and can never
   diverge — legitimate leave never manufactures a chronic-absence signal.

5. **Participation is a first-class, persisted aggregate — the sixth.** The contract lists
   five core roots but its deliverables also require co-curricular participation with a
   `ParticipationRecorded` event. Broadening attendance into institutional engagement demands
   persistence, so Participation is modelled as a full aggregate (activity, optional session
   link, engagement level), not a transient action, and feeds the presence profile's
   engagement and diversity signals.

6. **The Presence Profile is an AI-ready read model — descriptive analytics only.**
   `computePresenceIndicators` derives attendance percentage, punctuality, longest unexcused
   absence streak, chronic-absenteeism and risk bands, participation count/diversity,
   engagement score and anomalies from the records, approved leave and participation.
   `applyIndicators` materialises a versioned snapshot onto the profile. Prediction and
   intervention belong to the Institutional Intelligence program, which consumes these signals.

7. **Version control by counter + append-only revision log**, reusing the P2-D06/D07 pattern.
   Attendance policies carry a version counter and a revision log across draft → active →
   archived; only active policies are evaluated, and an archived policy is immutable.

8. **A single `attendance:*` permission scope.** Like academic structure (ADR-0025) and
   scheduling (ADR-0026), and unlike learner wellbeing (ADR-0024), attendance is operational
   record, not sensitive personal-welfare data, so the whole REST surface is gated by one
   `attendance:read` / `attendance:write` pair rather than per-area scopes.

9. **Persistence per ADR-0010.** Six tables (`attendance_session`, `attendance_record`,
   `leave`, `attendance_policy`, `presence_profile`, `participation`) with Prisma/RLS adapters
   at the `apps/api` composition root (TD-21). Every table has `ENABLE` + `FORCE ROW LEVEL
SECURITY` and the standard `tenant_isolation` policy (USING + WITH CHECK, fail-closed) —
   verified on live PostgreSQL. Structured data (correction log, supporting documents, policy
   parameters & revisions, presence anomalies) is stored as non-null JSONB; presence rates are
   `DOUBLE PRECISION`; every uniqueness rule is a DB unique index. This domain has no
   scalar-list columns, so the P2-D05 array-column lesson does not recur.

10. **Nine domain events on the platform bus** — `attendance.session.created`,
    `attendance.recorded`, `attendance.corrected`, `attendance.leave.requested`,
    `attendance.leave.approved`, `attendance.leave.rejected`, `attendance.policy.evaluated`,
    `attendance.threshold.reached`, `attendance.participation.recorded` — published from the
    owning service transitions. The presence profile intentionally emits no event of its own
    (it is a read model), as resources and policies did in P2-D06/D07.

11. **Three policy rule types are enforced; three are recognised and deferred.** The three
    percentage-based rules (`minimum_attendance_percentage`, `examination_eligibility`,
    `promotion_eligibility`) are evaluated from the summarised attendance against each policy's
    `minimumPercentage` parameter. `late_arrival`, `early_departure` and `grace_period` need
    intra-session timing beyond the day-grained record model; they are stored and
    version-controlled but not yet evaluated — an extensibility seam (**TD-28**), not a gap in
    the model.

12. **Cross-domain references enter through directory ports.** Organization (P2-D01-M01),
    participant (Person, P2-D01-M02), Schedule Slot (P2-D07) and Section / Subject (P2-D06)
    existence are validated through injected directories backed by those modules' services, so
    the pure package depends on no other domain.

13. **Explicit non-goals.** No grading or academic assessment, behaviour evaluation, timetable
    generation, financial penalties for absence, predictive AI, or parent/guardian
    communication — those belong to other domains and integrate _with_ APIP.

## Consequences

- **A reusable presence system of record, consumed everywhere.** Institutions capture
  attendance, leave and participation through one platform; downstream domains (fees,
  examinations eligibility, intelligence) consume its services, evaluations and events rather
  than reimplementing attendance logic — the contract's definition of done.
- **Attendance is tamper-evident.** Records are immutable and every correction is an audited,
  versioned append, so the attendance history and its amendments are always reconstructable.
- **Policies are configurable without code changes.** Rule configuration lives in open JSON
  parameters and is version-controlled; new percentage thresholds need no schema change, and
  the three deferred rule types can be implemented behind the same seam.
- **A single source of truth for "how present".** The percentage that gates eligibility and
  the streak that flags chronic absence are computed from one shared leave-excusal helper, so
  the policy verdict and the presence signal always agree about which days were excused.
- **Isolation.** All six tables are FORCE-RLS tenant-isolated and fail-closed, verified on
  live PostgreSQL.
- **AI-ready without owning prediction.** The presence profile exposes attendance,
  punctuality, streaks, engagement and risk bands as descriptive analytics; predictive
  intervention remains the Institutional Intelligence program's.
- **A pure, testable core.** The policy and presence engines are pure functions over narrow
  views — 39 unit/integration tests exercise the status weighting, leave excusal, percentage
  and punctuality maths, the three enforced policy rules, threshold breaches, the leave-aware
  chronic-absence streak, engagement scoring, correction auditing and an end-to-end
  record → evaluate → recompute integration.
- **Deferred, interface-protected.** Domain Prisma adapters remain at the composition root
  (TD-21); three policy evaluators are deferred behind a stable rule-type dispatch (TD-28).
  One growing package, acceptable for a cohesive bounded context (as with the six prior
  domains).
