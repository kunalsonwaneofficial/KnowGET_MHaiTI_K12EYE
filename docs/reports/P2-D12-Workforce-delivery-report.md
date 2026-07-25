# Engineering Delivery Report — P2-D12

**Workforce & Human Capital Platform** · Phase 2 (Enterprise Domain Engineering) · Program: Workforce & Operations

|                |                                                                                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D12 — Workforce & Human Capital Platform                                                                                                                                                                      |
| **Status**     | ✅ Complete — CI green; merged to main (`064538d`). Gates green in-sandbox (full monorepo typecheck 103/103, build 55/55, `@knowget/workforce` 59 tests, `apps/api` 192 tests); RLS verified on live PostgreSQL. |
| **Depends on** | P2-D03 (Student Lifecycle, ADR-0021 — the lifecycle analog), P2-D01-M02 (Person), P2-D01-M01 (Organization), P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`)                                                               |
| **Date**       | 15 November 2026                                                                                                                                                                                                 |
| **Next**       | P2-D13 — Faculty Excellence, Coaching & Professional Growth Platform (Program: Workforce & Operations)                                                                                                           |

---

## 1. Mission recap

Deliver the **Workforce & Human Capital Platform** — the **staff system of record**, the HR analog of
Student Lifecycle (P2-D03), and the first contract of **Program C** (the operational institution
beyond the learner and academic core). It models the complete staff lifecycle: the HR org structure
(departments and positions), the Person-linked employee record and its lifecycle, version-controlled
employment contracts, staff leave (entitlements and requests reconciled into a ledger), performance
reviews, and a descriptive workforce profile with a leadership rollup. Two boundaries define it:
**compensation is out of scope** — a contract or position carries only the pay **grade/band label**,
never an amount (money lives in the Financial platform, P2-D14) — and it is **descriptive, not
predictive** — the workforce profile's attrition-risk band names its factors, with prediction deferred
to the intelligence core (P2-D28). Coaching and professional development are the next contract
(Faculty Excellence, P2-D13) and are excluded here.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain**           | `@knowget/workforce` — eight aggregates (Department, Position, Employee, EmploymentContract, LeaveEntitlement, LeaveRequest, PerformanceReview, WorkforceProfile), each an immutable aggregate + factory + guarded transitions with an application service; value objects (employment types/statuses, leave types/statuses, contract/review/department/position statuses, attrition-risk bands); and **two pure engines** — leave-ledger reconciliation and workforce-intelligence indicators/rollup                                                        |
| **Engines**          | Pure, deterministic `computeLeaveLedger` (reconciles entitlements against requests into a per-type ledger — entitled/taken/pending/remaining, totals and a utilization rate; only **approved** leave draws down, `requested` is pending, rejected/cancelled ignored; division-safe, non-negative, two-decimal, clamped 0–100) and `computeWorkforceIndicators` / `summarizeWorkforce` (tenure months, leave utilization and finalized-review standing → a transparent **worst-of-named-factors** attrition-risk band, and the leadership rollup)            |
| **Persistence**      | Eight models in `schema.prisma` + one migration (`20261115000000_add_workforce`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed, soft-delete + audit columns; tenant-scoped DB unique indexes (department/position code, employee number, one contract per (employee, version), one entitlement per (employee, leave type, period), one profile per employee); DOUBLE PRECISION for day counts/rates/ratings, INTEGER for tenure/headcount/version, date-only values as TEXT. **No compensation column.** |
| **API**              | Seven permission-gated (`workforce:read`/`:write`), tenant-scoped REST controllers under `workforce/*` (departments, positions, employees incl. the full separation lifecycle, contracts incl. version control, leave incl. entitlements/requests/ledger, reviews, profiles incl. refresh and org rollup); zod DTOs; eight Prisma/RLS adapters + two directory adapters (Organization, Person); `WorkforceModule` importing the Organization and Person modules, registered in `app.module`                                                                 |
| **Events**           | Nineteen workforce domain events — department created/archived; position created/opened/closed; employee onboarded/activated/separated/became_alumni; contract issued/activated/ended; leave requested/approved/rejected/cancelled; review submitted/finalized; workforce profile refreshed                                                                                                                                                                                                                                                                 |
| **Docs & decisions** | ADR-0031 (platform + dual-engine architecture, the compensation and prediction boundaries); this report; platform-state, technical-debt (TD-32) and CHANGELOG updates                                                                                                                                                                                                                                                                                                                                                                                       |

## 3. Domain capabilities & invariants

- **Departments & positions.** A department is the HR org unit — hierarchical (parent), with a head
  and cost centre — running `active → archived` (archived, never deleted); reparenting validates the
  new parent exists, shares the organization, and does not form a cycle (an ancestor walk). A position
  is a defined, budgeted post under an active department, carrying the pay **grade/band label only**;
  `draft → open → on_hold → closed`. Both codes are unique per tenant.
- **Employees.** The Person-linked staff record — identity is a **Person (P2-D01-M02)**, never
  duplicated — organised under a department/position, with the lifecycle `onboarding → active`,
  reversible `on_leave` / `suspended` / `notice_period`, then a terminal separation `resigned` /
  `terminated` / `retired` → `alumni` (stamping an exit date). A person holds **at most one active
  employment per institution**, and the employee number is unique per tenant.
- **Employment contracts.** A version-controlled contract — one immutable version per relationship;
  activating a new version **expires and supersedes** the prior active one, guaranteeing at most one
  active contract per employee while preserving the full history. Editable only while `draft`; frozen
  once active. Activation validates the target is a draft **before** any side effect, so a mistaken
  re-activation never disturbs the live contract. Carries the pay grade/band label only.
- **Leave.** A **leave entitlement** is the policy grant of days per leave type per period (one per
  type/period); a **leave request** runs `requested → approved | rejected | cancelled` and only an
  approved request draws down the balance. The service reconciles both through `computeLeaveLedger`,
  period-scoped — the genuine read model of staff leave.
- **Performance reviews.** `draft → submitted → acknowledged → finalized` with a validated 1–5 overall
  rating (required to submit) and narrative notes frozen once submitted. **Only a finalized review**
  counts toward review standing.
- **Workforce profile.** The descriptive, AI-ready indicator snapshot per employee (tenure, leave
  utilization, finalized-review standing, attrition-risk band), one per employee, **refreshed** by the
  workforce-intelligence engine (version-bumped each refresh), plus a leadership organization rollup.
  Descriptive and explainable only — **never a prediction** (P2-D28).

## 4. Verification

- **Pure-engine-first.** The two engines were built and exhaustively tested before any aggregate
  depended on them, over narrow views the aggregates structurally satisfy.
- **Tests.** `@knowget/workforce` — 59 tests (both engines' arithmetic incl. leave-ledger
  reconciliation, over-taken clamping, period scoping and division-safe utilization; tenure and
  worst-of-risk; the org rollup; every aggregate lifecycle; contract version control incl. the
  single-active + supersession invariant and the rejected-re-activation regression; and an end-to-end
  hire → contract → leave → review → profile → org-rollup integration). `apps/api` — 192 tests
  including the workforce DI-graph integration spec.
- **Gates.** Full monorepo typecheck 103/103, build 55/55, ESLint clean, Prettier clean.
- **Live RLS.** The migration was applied on a live PostgreSQL instance as a **non-superuser owner**;
  verified that tenant A sees only its own rows, tenant B sees zero, an unset tenant sees zero
  (fail-closed), a cross-tenant insert is rejected by `WITH CHECK`, and code uniqueness is per-tenant.
- **Independent audits.** Two adversarial audits (domain logic; persistence/API) reviewed the whole
  milestone against the shipped reference domains. The persistence/API layer was clean across all
  checks (schema↔migration↔adapter consistency, FORCE RLS on all eight tables, DI wiring, no
  compensation column). The domain audit found one high finding (the contract service's activation
  ordering — fixed with a draft-state guard up front and a regression test) and one dead-code item
  (an unreachable error removed; its sibling made live via a new `getById`).

## 5. Decisions

Recorded in **ADR-0031**: one package for all eight aggregates; two pure engines as the computational
core built first; **compensation out of scope — grade/band label only** (money is Finance, P2-D14),
enforced structurally and in tests; **descriptive, not predictive** — the attrition-risk band names
its factors, prediction deferred to the intelligence core (P2-D28); an employee is a Person (identity
never duplicated); version-controlled contracts with a single-active invariant; leave as an
entitlement/request pair feeding the pure ledger; only finalized reviews count toward standing; a
cycle-safe department hierarchy; a single `workforce:*` scope; persistence per ADR-0010 with FORCE
RLS verified live; cross-domain references through directory ports with soft head/reviewer references
deferred (**TD-32**).

## 6. Technical debt

- **TD-32 (new, low).** Soft intra-domain references — a department's `headEmployeeId` and a review's
  `reviewerId` — are stored without validating they resolve to a current employee; the Person and
  Organization anchors and the department/position org-consistency are validated. A later refinement
  behind the services.
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root, keeping the
  domain package persistence-agnostic.
- **TD-01 (standing).** Event delivery is in-process (outbox store in-memory); the workforce events
  ride the same bus.

## 7. Recommendation — proceed to P2-D13

The Workforce & Human Capital Platform is complete behind its gates: the staff system of record is in
place, the financial and prediction boundaries are held structurally, and all eight tables are
FORCE-RLS tenant-isolated (verified live). Recommend merging on green and proceeding to **P2-D13 —
Faculty Excellence, Coaching & Professional Growth Platform**, which builds staff development on this
workforce base. **Reminder: rotate the GitHub PAT** used for pushes at this milestone boundary.
