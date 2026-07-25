# 32. Faculty Excellence, Coaching & Professional Growth: one package, eight aggregates, two pure engines, development not prediction

- **Status:** Accepted
- **Date:** 2026-12-01
- **Contract:** P2-D13 (Faculty Excellence, Coaching & Professional Growth Platform)

## Context

P2-D13 is the second contract of **Program C** (the operational institution), on the certified
`v0.2.0` baseline, the frozen Phase-1 core, and the P2-D12 workforce base. It is the authoritative
domain for **how staff grow professionally**: the professional-practice standards they are held to,
the classroom/practice observations that evidence their practice, the coaching relationships that
develop them, the continuing professional development (CPD) they complete, the growth goals they
pursue, and the descriptive faculty-growth profile that summarizes it all. It is the deliberate
continuation of the workforce domain, which explicitly deferred coaching and professional
development to this contract.

Two boundaries shape it. First, **prediction is not here.** As with every operational domain, genuine
predictive modelling (who will leave, who will plateau) is reserved for the **intelligence core
(P2-D28)**; so the faculty profile's growth band is **descriptive and explainable only** — the
transparent mapping of observed-practice ratings onto an ascending scale, not a forecast. Second,
**staff identity and employment are not here.** A staff member is an **Employee (P2-D12)**; this
domain references the employee and never re-models the person or the employment relationship, and it
holds no compensation data (that is the workforce/finance boundary). Course delivery (an LMS) and
recruitment/applicant-tracking are out of scope.

Like the domains before it, it has a genuine computational core: a CPD compliance-ledger engine and a
faculty-growth indicator engine. Those engines are the crux of the design.

## Decision

1. **One domain package, `@knowget/faculty-excellence`, for all eight aggregates** — the same
   single-bounded-context choice as the eleven prior domains (ADR-0021…0031). A shared spine
   (`errors.ts`, `ports.ts`, `faculty-events.ts`, `index.ts`), a per-aggregate pair
   (`<aggregate>.ts` + `<aggregate>-service.ts`), value objects (framework/observation/engagement/
   activity/goal statuses, PD categories, growth bands, the 1–4 rating scale), and — as with the
   prior domains — **pure engine functions** over narrow views (`faculty-view.ts`).

2. **Two pure engines are the computational core, built and tested first.** `computeDevelopmentLedger`
   reconciles a staff member's PD **requirements** (required hours per category) against their PD
   **activities** into a per-category ledger (required, completed, remaining) plus a compliance rate —
   only **completed** activities earn hours, and compliance credits completion only **up to each
   category's requirement**, so a surplus in one category never masks a deficit in another;
   division-safe, clamped 0–100, a no-requirement category vacuously compliant. `computeFacultyGrowth`
   derives one staff member's descriptive indicators (observed-practice standing from acknowledged
   observations, development-goal progress, PD compliance) and a transparent growth band, and
   `summarizeFaculty` rolls a set of staff into a leadership picture. All are pure, deterministic, over
   narrow views the aggregates structurally satisfy.

3. **Descriptive, not predictive.** The faculty profile's growth band is the transparent
   `bandForRating` mapping of the mean acknowledged-observation rating onto the ascending scale
   (`emerging < developing < proficient < distinguished`); with no acknowledged observation it is the
   honest base `emerging` (insufficient evidence). **Predictive modelling is an explicit non-goal
   deferred to the intelligence core (P2-D28)**, exactly as the learner and workforce domains defer
   prediction.

4. **Built on the workforce Employee — identity is never duplicated.** Every staff member observed,
   coached or developed is an **Employee (P2-D12)**, referenced by id. Employee existence — and, for
   records that attach directly to an employee, the employee's **organization** — enters through an
   injected `EmployeeDirectory` port (`exists` + `organizationOf`), backed at the composition root by
   the workforce employee service. Organization existence enters through an organization directory.

5. **The competency framework is the standards backbone.** A framework is the institution's
   professional-practice rubric — a named set of competency standards (unique keys) — running
   `draft → active → archived`. Its competencies are **editable only while draft and frozen once
   active**, so observations always reference a stable competency set; version bumps on each
   competency change.

6. **Observations are scored against the framework; only acknowledged counts.** An observation is
   scheduled against an **active** framework, its per-competency 1–4 ratings **validated against the
   framework's competencies**, and it runs `scheduled → conducted → shared → acknowledged` (ratings
   frozen once shared, an overall rating computed as the mean). **Only an acknowledged observation**
   counts toward faculty-growth standing — the human-in-the-loop discipline (the observed staff member
   has seen and acknowledged it).

7. **Coaching is an engagement with sessions.** A coaching engagement is a coach↔coachee cycle
   (`proposed → active → completed | cancelled`); the coach and coachee must differ, and a coachee
   holds **at most one active engagement** at a time. Sessions are logged against an active engagement
   as a permanent, amendable record.

8. **CPD is a requirement/activity pair feeding the pure ledger.** A **development requirement** is the
   CPD mandate (required hours per category per period, one per type/period); a **professional-learning
   activity** runs `planned → enrolled → completed | cancelled` and only a completed activity earns
   hours. The service reconciles the two through `computeDevelopmentLedger`, period-scoped — the
   genuine read model of CPD compliance.

9. **Development goals close the loop.** A goal (`draft → active → achieved | abandoned`) records a
   reasoned outcome on the terminal transition and optionally targets a competency / arises from a
   coaching engagement; its progress feeds the profile.

10. **The faculty profile is refreshed, never hand-edited.** One per employee, refreshed by running
    the growth engine over the member's acknowledged observations, goal progress and PD compliance —
    each refresh bumping the version and stamping the refresh time; plus a leadership organization
    rollup via the pure `summarizeFaculty`.

11. **A single `faculty:*` permission scope.** Professional growth is one coherent area held by the
    same academic leaders and coaches, so — as with the academic and workforce domains
    (ADR-0025…0031) — one `faculty:read` / `faculty:write` pair gates the whole surface.

12. **Persistence per ADR-0010.** Eight tables (`competency_framework`, `observation`,
    `coaching_engagement`, `coaching_session`, `development_requirement`,
    `professional_learning_activity`, `development_goal`, `faculty_profile`) with Prisma/RLS adapters
    at the `apps/api` composition root (TD-21). Every table has `ENABLE` and `FORCE ROW LEVEL
SECURITY` and the standard `tenant_isolation` policy (both USING and WITH CHECK, fail-closed) —
    verified on live PostgreSQL. A framework's competencies and an observation's ratings are non-null
    JSONB; hours, rates and ratings are `DOUBLE PRECISION`; counts and versions are `INTEGER`;
    date-only values are `TEXT`; the uniqueness rules (framework code, one requirement per (employee,
    category, period), one profile per employee) are tenant-scoped DB unique indexes.

13. **Domain events on the platform bus** — framework created/activated/archived; observation
    conducted/shared/acknowledged; coaching proposed/accepted/completed and session logged; PD
    planned/completed; goal activated/achieved; faculty profile refreshed.

14. **Cross-domain references enter through directory ports; soft references are deferred.** Employee
    (observed, observer, coach, coachee) and Organization existence are validated on write, and
    observation rating keys are validated against the framework. The **soft references — a development
    goal's `frameworkId` / `engagementId` / `targetCompetencyKey` and a coaching engagement's optional
    `frameworkId` — are stored without per-item existence validation** (**TD-33**), an accepted cost
    trade-off behind the services.

15. **Explicit non-goals.** No prediction or forecasting (intelligence core, P2-D28); no compensation
    or payroll (workforce/finance boundary); no course delivery or LMS; no recruitment/applicant
    tracking. This domain is the professional-growth system of record those and the intelligence
    domains build on.

## Consequences

- **A unified professional-growth system of record.** An institution manages its practice standards,
  observations, coaching, CPD compliance and growth goals in one place, on top of the workforce base,
  with a descriptive faculty-growth profile and leadership rollup.
- **Intelligence stays where the spec puts it.** The faculty profile is descriptive and explainable
  only — a transparent rating-to-band mapping — so **prediction** remains in the intelligence core
  (P2-D28), layered on this base rather than duplicated here.
- **A pure, testable core.** Two engines are pure functions over narrow views — package tests exercise
  the CPD-ledger reconciliation (required/completed/remaining, the credit-up-to-requirement compliance
  rule, period scoping), the growth synthesis (acknowledged-only, band mapping, goal progress), the
  rollup, every aggregate lifecycle, and an end-to-end framework → observation → coaching → PD → goal →
  profile → org-rollup integration.
- **Isolation.** All eight tables are FORCE-RLS tenant-isolated and fail-closed, verified on live
  PostgreSQL; the uniqueness rules are tenant-scoped at the DB.
- **Deferred, interface-protected.** Domain Prisma adapters remain at the composition root (TD-21); the
  soft framework/engagement/competency references are stored against the validated Employee/Organization
  anchors (TD-33). One cohesive package, acceptable for a single bounded context (as with the eleven
  prior domains). This is the second contract of **Program C** and the professional-growth base the
  workforce-intelligence and intelligence-core domains build on.
