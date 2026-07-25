# 31. Workforce & Human Capital: one package, eight aggregates, two pure engines, grade-labels not compensation

- **Status:** Accepted
- **Date:** 2026-11-15
- **Contract:** P2-D12 (Workforce & Human Capital Platform)

## Context

P2-D12 opens **Program C** — the operational institution beyond the learner and academic core — on
the certified `v0.2.0` baseline, the frozen Phase-1 core, and the P2-D02…D11 identity, learner and
academic domains. It is the authoritative domain for **staff as an institutional asset**: who works
at the institution, in what department and position, under what contract, with what leave balance and
what review standing. It is the **HR analog of Student Lifecycle (P2-D03)** — an employee is the
staff system of record exactly as a student is the learner system of record.

The platform's specification is disciplined about _where_ each capability lives, and two boundaries
shape this domain. First, **money is not here.** Compensation, payroll, salary structures and
disbursement belong to the **Financial platform (P2-D14)**; a workforce contract or position must
therefore carry only the pay **grade/band label**, never an amount — this keeps the sensitive
financial surface in one governed place and lets HR operate without holding compensation data.
Second, **prediction is not here.** Genuine predictive modelling (attrition forecasting with
confidence intervals) is reserved for the **intelligence core (P2-D28)**; so the workforce profile is
**descriptive and explainable only** — a transparent, worst-of-named-factors attrition-risk band, not
a forecast. Coaching, professional development and teacher growth are the very next contract
(**Faculty Excellence, P2-D13**) and are excluded here.

Like the domains before it, it has a genuine computational core: a leave-ledger reconciliation engine
and a workforce-intelligence indicator engine. Those engines are the crux of the design.

## Decision

1. **One domain package, `@knowget/workforce`, for all eight aggregates** — the same
   single-bounded-context choice as the ten prior domains (ADR-0021…0030). A shared spine
   (`errors.ts`, `ports.ts`, `workforce-events.ts`, `index.ts`), a per-aggregate pair
   (`<aggregate>.ts` + `<aggregate>-service.ts`), value objects (employment types/statuses, leave
   types/statuses, contract/review/department/position statuses, attrition-risk bands), and — as with
   the prior domains — **pure engine functions** over narrow views (`workforce-view.ts`).

2. **Two pure engines are the computational core, built and tested first.** `computeLeaveLedger`
   reconciles a staff member's entitlements against their requests into a per-type ledger (entitled,
   taken, pending, remaining) plus totals and a utilization rate — only **approved** leave draws down
   the balance, `requested` is pending, rejected/cancelled are ignored, every total division-safe,
   non-negative and (for the rate) two-decimal and clamped 0–100. `computeWorkforceIndicators`
   derives one employee's descriptive indicators (tenure months, leave utilization, finalized-review
   standing) and a transparent attrition-risk band, and `summarizeWorkforce` rolls a set of employees
   into a leadership picture (headcount, status distribution, attrition-risk distribution). All are
   pure, deterministic, over narrow views the aggregates structurally satisfy, so they depend on no
   aggregate.

3. **Compensation is out of scope — grade/band label only.** An employment contract and a position
   carry a `grade` string (e.g. "PGT-III", "TGT-II") and nothing more about pay; there is **no
   salary, amount, wage or compensation field anywhere in the domain, schema or API**. Money lives in
   the **Financial platform (P2-D14)**. This is enforced structurally (and asserted in tests) so the
   boundary cannot erode.

4. **Descriptive, not predictive.** The workforce profile's attrition-risk band is the **worst of a
   few named factors** — short tenure, weak finalized-review standing, very high leave utilization, a
   fragile employment status — each of which names its reason; it is never an opaque score and never
   a forecast. **Attrition prediction is an explicit non-goal deferred to the intelligence core
   (P2-D28)**, exactly as the learner domains defer prediction.

5. **An employee is a Person — identity is never duplicated.** Every employee links to a validated
   **Person (P2-D01-M02)** by `personId`; the workforce record holds employment facts, not identity.
   Person and organization existence enter through injected **directory ports**, the same pattern as
   the learner domains (ADR-0021…0030).

6. **The employee lifecycle mirrors the student's.** `onboarding → active`, with reversible
   `on_leave` / `suspended` / `notice_period`, then a terminal separation `resigned` / `terminated` /
   `retired` → `alumni` (stamping an exit date). A person holds **at most one active employment per
   institution**, and the employee number is unique per tenant — both enforced by the service, as
   enrollment is for students.

7. **Version-controlled employment contracts, one active at a time.** Each contract is one immutable
   version (v1, v2, …); a new version, on activation, **expires and supersedes** the prior active one,
   so at most one contract is active per employee and the full contractual history is preserved. A
   contract is editable only while `draft`; once active it is frozen and a change means a new version.
   Activation validates the target is a draft **before** any side effect, so a mistaken re-activation
   never disturbs the live contract.

8. **Leave is an entitlement/request pair feeding the pure ledger.** A **leave entitlement** is the
   policy grant of days per leave type per period (at most one per type/period); a **leave request**
   runs `requested → approved | rejected | cancelled` and only an approved request draws down the
   balance. The service reconciles the two through `computeLeaveLedger`, period-scoped — the genuine
   read model of staff leave.

9. **Performance reviews; only finalized counts.** A review runs `draft → submitted → acknowledged →
finalized` with a validated 1–5 overall rating (required to submit) and narrative notes frozen
   once submitted. **Only a finalized review** counts toward an employee's review standing in the
   workforce-intelligence engine.

10. **Departments are a cycle-safe hierarchy.** A department is the HR org unit (parent, head, cost
    centre) with an `active → archived` lifecycle (archived, never deleted). Reparenting validates
    the new parent exists, shares the organization, and does not form a cycle (an ancestor walk).
    Positions are defined posts under a department (`draft → open → on_hold → closed`).

11. **A single `workforce:*` permission scope.** HR is one coherent administrative area held by the
    same staff, and its sensitivity is bounded because no compensation amount is ever stored — so, as
    with the academic domains (ADR-0025…0030), one `workforce:read` / `workforce:write` pair gates the
    whole surface.

12. **Persistence per ADR-0010.** Eight tables (`department`, `position`, `employee`,
    `employment_contract`, `leave_entitlement`, `leave_request`, `performance_review`,
    `workforce_profile`) with Prisma/RLS adapters at the `apps/api` composition root (TD-21). Every
    table has `ENABLE` and `FORCE ROW LEVEL SECURITY` and the standard `tenant_isolation` policy
    (both USING and WITH CHECK, fail-closed) — verified on live PostgreSQL. Day counts, rates and
    ratings are `DOUBLE PRECISION`; tenure/headcount/version are `INTEGER`; date-only values are
    `TEXT`; the uniqueness rules (department/position code, employee number, one contract per
    (employee, version), one entitlement per (employee, leave type, period), one profile per
    employee) are tenant-scoped DB unique indexes.

13. **Domain events on the platform bus** — department created/archived; position created/opened/
    closed; employee onboarded/activated/separated/became_alumni; contract issued/activated/ended;
    leave requested/approved/rejected/cancelled; review submitted/finalized; workforce profile
    refreshed.

14. **Cross-domain references enter through directory ports; soft references are deferred.**
    Organization (P2-D01-M01) and Person (P2-D01-M02) existence are validated on write, and a
    department/position assigned to an employee is validated to share the organization. The **soft
    intra-domain references — a department's `headEmployeeId` and a review's `reviewerId` — are stored
    without validating they resolve to a current employee** (**TD-32**), an accepted cost trade-off
    behind the services.

15. **Explicit non-goals.** No compensation, salary or payroll (Financial platform, P2-D14); no
    coaching, professional development or teacher growth (Faculty Excellence, P2-D13); no attrition
    prediction or forecasting (intelligence core, P2-D28); no recruitment/applicant-tracking pipeline.
    This domain is the operational staff system of record those later domains build on.

## Consequences

- **A unified workforce system of record.** An institution manages its complete staff lifecycle —
  org structure, hiring, contracts, leave and reviews — in one place, the HR counterpart to the
  student system of record, with a descriptive workforce profile and leadership rollup on top.
- **The financial boundary is structural.** Because no compensation amount is ever modelled, HR can
  operate without holding pay data and the sensitive financial surface stays in the Financial
  platform (P2-D14). The grade/band label is the seam.
- **Intelligence stays where the spec puts it.** The workforce profile is descriptive and explainable
  only — a worst-of-named-factors band — so attrition **prediction** remains in the intelligence core
  (P2-D28), layered on this base rather than duplicated here.
- **A pure, testable core.** Two engines are pure functions over narrow views — package tests
  exercise the leave-ledger reconciliation (entitled/taken/pending/remaining, over-taken clamping,
  period scoping, division-safe utilization), the tenure and worst-of-risk arithmetic, the workforce
  rollup, every aggregate lifecycle, contract version control (single-active + supersession), and an
  end-to-end hire → contract → leave → review → profile → org-rollup integration.
- **Isolation.** All eight tables are FORCE-RLS tenant-isolated and fail-closed, verified on live
  PostgreSQL; the uniqueness rules are tenant-scoped at the DB.
- **Deferred, interface-protected.** Domain Prisma adapters remain at the composition root (TD-21);
  the soft head/reviewer references are stored against the validated Person/Organization anchors
  (TD-32). One cohesive package, acceptable for a single bounded context (as with the ten prior
  domains). This is the first contract of **Program C** and the operational base the workforce
  intelligence, faculty-excellence and financial domains build on.
