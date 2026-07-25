# Engineering Delivery Report — P2-D13

**Faculty Excellence, Coaching & Professional Growth Platform** · Phase 2 (Enterprise Domain Engineering) · Program: Workforce & Operations

|                |                                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D13 — Faculty Excellence, Coaching & Professional Growth Platform                                                                                                                                                      |
| **Status**     | ✅ Complete — CI green; merged to main (`9a1054a`). Gates green in-sandbox (full monorepo typecheck 105/105, build 56/56, `@knowget/faculty-excellence` 50 tests, `apps/api` 194 tests); RLS verified on live PostgreSQL. |
| **Depends on** | P2-D12 (Workforce, ADR-0031 — the Employee base), P2-D01-M01 (Organization), P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`)                                                                                                        |
| **Date**       | 1 December 2026                                                                                                                                                                                                           |
| **Next**       | P2-D14 — Financial Operations & Fee Management Platform (Program: Workforce & Operations)                                                                                                                                 |

---

## 1. Mission recap

Deliver the **Faculty Excellence, Coaching & Professional Growth Platform** — the **professional-growth
system of record for staff**, built on the P2-D12 workforce base (the coaching and professional
development that workforce explicitly deferred). It models the practice standards staff are held to,
the classroom/practice observations that evidence their practice, the coaching relationships that
develop them, the CPD they complete, the growth goals they pursue, and a descriptive faculty-growth
profile with a leadership rollup. Two boundaries define it: it is **descriptive, not predictive** — the
growth band is the transparent mapping of observed-practice ratings onto an ascending scale, with
prediction deferred to the intelligence core (P2-D28) — and a staff member is an **Employee (P2-D12)**,
referenced not duplicated. Compensation, LMS course delivery and recruitment are out of scope.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain**           | `@knowget/faculty-excellence` — eight aggregates (CompetencyFramework, Observation, CoachingEngagement, CoachingSession, DevelopmentRequirement, ProfessionalLearningActivity, DevelopmentGoal, FacultyProfile), each an immutable aggregate + factory + guarded transitions with an application service; value objects (framework/observation/engagement/activity/goal statuses, PD categories, growth bands, the 1–4 rating scale); and **two pure engines** — CPD compliance-ledger and faculty-growth indicators/rollup |
| **Engines**          | Pure, deterministic `computeDevelopmentLedger` (reconciles requirements against completed activities into a per-category ledger — required/completed/remaining and a compliance rate that credits completion only **up to each requirement**, so a surplus never masks a deficit; division-safe, clamped 0–100) and `computeFacultyGrowth` / `summarizeFaculty` (acknowledged-observation practice standing, goal progress and PD compliance → a transparent growth band, and the leadership rollup)                        |
| **Persistence**      | Eight models in `schema.prisma` + one migration (`20261201000000_add_faculty_excellence`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed, soft-delete + audit columns; tenant-scoped DB unique indexes (framework code, one requirement per (employee, category, period), one profile per employee); a framework's competencies and an observation's ratings as non-null JSONB; DOUBLE PRECISION for hours/rates/ratings, date-only values as TEXT                        |
| **API**              | Seven permission-gated (`faculty:read`/`:write`), tenant-scoped REST controllers under `faculty/*` (frameworks, observations, coaching engagements/sessions, development [requirements/activities/ledger], goals, profiles incl. refresh and org rollup); zod DTOs; eight Prisma/RLS adapters + two directory adapters (Organization, Workforce Employee); `FacultyExcellenceModule` importing the Organization and Workforce modules, registered in `app.module`                                                           |
| **Events**           | Fifteen faculty domain events — framework created/activated/archived; observation conducted/shared/acknowledged; coaching proposed/accepted/completed and session logged; PD planned/completed; goal activated/achieved; faculty profile refreshed                                                                                                                                                                                                                                                                          |
| **Docs & decisions** | ADR-0032 (platform + dual-engine architecture, the development-not-prediction and Employee-reference boundaries); this report; platform-state, technical-debt (TD-33) and CHANGELOG updates                                                                                                                                                                                                                                                                                                                                 |

## 3. Domain capabilities & invariants

- **Competency framework.** The institution's practice rubric — a named set of competency standards
  (unique keys); `draft → active → archived`, competencies **editable only while draft and frozen once
  active**, so observations always reference a stable set (version bumps on each change).
- **Observation.** Scheduled against an **active** framework, its per-competency 1–4 ratings
  **validated against the framework's competencies**, with an overall rating computed as the mean;
  `scheduled → conducted → shared → acknowledged`, ratings frozen once shared. **Only an acknowledged
  observation** counts toward growth standing.
- **Coaching.** An engagement is a coach↔coachee cycle (`proposed → active → completed | cancelled`),
  coach and coachee must differ, and a coachee holds **at most one active engagement**. Sessions are
  logged against an active engagement as a permanent, amendable record.
- **Professional development.** A requirement is the CPD mandate (hours per category per period, one
  per type/period); an activity runs `planned → enrolled → completed | cancelled` and only a completed
  activity earns hours. The service reconciles both through `computeDevelopmentLedger`, period-scoped.
- **Development goal.** `draft → active → achieved | abandoned`, recording a reasoned outcome; feeds
  the profile.
- **Faculty profile.** The descriptive, AI-ready indicator snapshot per employee, one per employee,
  **refreshed** by the growth engine (version-bumped each refresh), plus a leadership org rollup.
  Descriptive and explainable only — **never a prediction** (P2-D28).

## 4. Verification

- **Pure-engine-first.** Both engines were built and exhaustively tested before any aggregate depended
  on them, over narrow views the aggregates structurally satisfy.
- **Tests.** `@knowget/faculty-excellence` — 50 tests (both engines' arithmetic incl. the CPD-ledger
  credit-up-to-requirement compliance rule, period scoping, and the growth band mapping; every
  aggregate lifecycle; the rating-key validation and one-active-engagement invariants; and an
  end-to-end framework → observation → coaching → PD → goal → profile → org-rollup integration).
  `apps/api` — 194 tests including the faculty DI-graph integration spec.
- **Gates.** Full monorepo typecheck 105/105, build 56/56, ESLint clean, Prettier clean.
- **Live RLS.** The migration was applied on a live PostgreSQL instance as a **non-superuser owner**;
  verified that tenant A sees only its own rows, tenant B sees zero, an unset tenant sees zero
  (fail-closed), a cross-tenant insert is rejected by `WITH CHECK`, and framework-code uniqueness is
  per-tenant.
- **Independent audits.** Two adversarial audits (domain logic; persistence/API) reviewed the whole
  milestone against the shipped workforce reference. **Both were clean** — no correctness, invariant,
  spec-adherence, schema/migration/adapter, RLS or DI-wiring defects. The only change was removing a
  dead, confusingly-named helper (`isEngagementActive`) surfaced by the domain audit.

## 5. Decisions

Recorded in **ADR-0032**: one package for all eight aggregates; two pure engines as the computational
core built first; **descriptive, not predictive** — the growth band is a transparent rating-to-band
mapping, prediction deferred to the intelligence core (P2-D28); a staff member is an Employee
(identity never duplicated), entering through an Employee directory (existence + organization);
competency frameworks with competencies frozen once active; observations scored against the framework
with rating keys validated; one active coaching engagement per coachee; CPD as a requirement/activity
pair feeding the pure ledger (credit up to each requirement); only acknowledged observations count
toward standing; a single `faculty:*` scope; persistence per ADR-0010 with FORCE RLS verified live;
cross-domain references through directory ports with soft framework/engagement/competency references
deferred (**TD-33**).

## 6. Technical debt

- **TD-33 (new, low).** Soft references — a development goal's `frameworkId` / `engagementId` /
  `targetCompetencyKey` and a coaching engagement's optional `frameworkId` — are stored without
  per-item existence validation; the Employee and Organization anchors, and observation rating keys
  against the framework, are validated. A later refinement behind the services.
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root.
- **TD-01 (standing).** Event delivery is in-process (outbox store in-memory); the faculty events ride
  the same bus.

## 7. Recommendation — proceed to P2-D14

The Faculty Excellence, Coaching & Professional Growth Platform is complete behind its gates: the
professional-growth system of record is in place on the workforce base, the development-not-prediction
boundary is held, and all eight tables are FORCE-RLS tenant-isolated (verified live). Recommend merging
on green and proceeding to **P2-D14 — Financial Operations & Fee Management Platform**, which owns the
compensation and money boundary the workforce and faculty domains deferred. **Reminder: rotate the
GitHub PAT** used for pushes at this milestone boundary.
