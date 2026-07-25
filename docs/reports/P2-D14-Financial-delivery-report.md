# Engineering Delivery Report — P2-D14

**Fees, Finance & Payroll Platform** · Phase 2 (Enterprise Domain Engineering) · Program: Workforce & Operations

|                |                                                                                                                                                                                                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D14 — Fees, Finance & Payroll Platform                                                                                                                                                                                                                                                                   |
| **Status**     | ✅ Complete — CI green; merged to main (`00071c0`). In-sandbox: `@knowget/financial` typecheck/lint/format/build clean, **63 tests** (20 files); `apps/api` typecheck clean + financial DI-graph spec (2 tests); RLS verified on live PostgreSQL. Full monorepo build / DB-integration CI-verified (TD-12). |
| **Depends on** | P2-D12 (Workforce, ADR-0031 — the Employee/grade base), P2-D03 (Student Lifecycle), P2-D01-M01 (Organization), P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`)                                                                                                                                                        |
| **Date**       | 15 December 2026                                                                                                                                                                                                                                                                                            |
| **Next**       | P2-D15 (next Program C contract)                                                                                                                                                                                                                                                                            |

---

## 1. Mission recap

Deliver the **Fees, Finance & Payroll Platform** — the institution's **money system of record**: the
fee schedules it bills, the invoices it raises against students, the payments it collects, the
scholarships/discounts it grants, the accounting periods those postings belong to, the staff payroll
it runs, and the descriptive receivables position it reports. It owns the compensation boundary the
workforce and faculty domains deferred (the workforce contract stores the pay **grade/band label
only**). One concern dominates: **money must be exact** — so the design begins with a money
representation and the pure engine that reconciles it, not with an aggregate. Two boundaries define
it: **descriptive, not predictive** (the receivables account is derived, with forecasting deferred to
the intelligence core, P2-D28), and identity is referenced not duplicated (a payer is a Student, a
payee is an Employee). Double-entry general ledger, bank reconciliation, tax filing and procurement
are out of scope.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Money core**       | `money.ts` — `Money` = **integer minor units + ISO-4217 currency**, never float. Validated construction, exact add/subtract/negate, half-away-from-zero multiply/percentage (routed through `money()` so a non-finite factor is rejected), **penny-perfect largest-remainder `allocateMoney`**, compare, and currency guards                                                                                                                                                                                                 |
| **Domain**           | `@knowget/financial` — eight aggregates (FinancialPeriod, FeeStructure, Invoice, Payment, Concession, PayrollRun, Payslip, StudentFinancialAccount), each an immutable aggregate + factory + guarded transitions with an application service; value objects (period/fee/invoice/payment/concession/payroll/payslip statuses, payment methods, concession types, account standings); the FeeComponent / InvoiceLine / PayComponent line objects                                                                               |
| **Engines**          | Pure, deterministic `computeAccountStatement` (reconciles a student's billable invoices against **cleared** payments → billed/paid/outstanding and the **outstanding portion** of overdue invoices, so overdue never exceeds outstanding; single-currency) and `summarizeReceivables` (organization receivables rollup)                                                                                                                                                                                                      |
| **Persistence**      | Eight models in `schema.prisma` + one migration (`20261215000000_add_financial`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed, soft-delete + audit columns; scalar money as **BIGINT** minor units (adapter `Number()`/`BigInt()` bridge); component/line/earning lists as non-null JSONB; tenant-scoped DB unique indexes (period code, fee-structure code, invoice number, one payslip per (run, employee), one account per student)                                   |
| **API**              | Eight permission-gated, tenant-scoped REST controllers — `finance/*` (periods, fee-structures, invoices, payments, concessions, accounts) under `finance:read`/`:write` and `payroll/*` (runs, payslips) under `payroll:read`/`:write`; zod DTOs (money validated as non-negative/positive integers); eight Prisma/RLS adapters + three directory adapters (Organization, Student, Employee-compensation); `FinancialModule` importing the Organization, Student-Lifecycle and Workforce modules, registered in `app.module` |
| **Events**           | Domain events — period opened/closed/reopened; fee structure created/activated/archived; invoice issued/paid/overdue/cancelled; payment recorded/cleared/failed/refunded; concession requested/approved/rejected/revoked; payroll run processed/paid/cancelled; payslip approved/paid; account refreshed                                                                                                                                                                                                                     |
| **Docs & decisions** | ADR-0033 (platform + money-as-integer-minor-units, the finance/payroll scope split, the compensation boundary, the payment↔invoice coordination); this report; platform-state, technical-debt (TD-34) and CHANGELOG updates                                                                                                                                                                                                                                                                                                  |

## 3. Domain capabilities & invariants

- **Money.** Integer minor units + currency; construction validated, arithmetic exact, allocation
  penny-perfect (parts sum to the whole for any weights), rounding half-away-from-zero and explicit.
- **Fee structure & period.** A reusable fee schedule (components in one currency) `draft → active →
archived`, **components frozen once active**; a financial period `open → closed`, reopenable for
  corrections, code unique per tenant.
- **Invoice.** A bill to a student, `draft → issued → partially_paid | paid | overdue | cancelled`;
  lines frozen at issue; `amountPaidMinor` **recomputed together with status** by pure apply/reverse;
  **overpayment and below-zero reversal rejected**; a paid invoice cannot be re-paid; cancel blocked
  once any payment is applied.
- **Payment.** `pending → cleared | failed`, `cleared → refunded`; **inherits org/student/currency from
  the invoice**; clearing/refunding is applied to the invoice **before** the payment is persisted, so a
  rejected application leaves the payment untouched.
- **Concession.** A percentage or fixed discount, `requested → approved → revoked | rejected`; pure
  `concessionAmount` (percentage of base, or fixed **capped at base**, same-currency); only approved
  applies.
- **Payroll.** A run `draft → processed → paid | cancelled`; a payslip `draft → approved → paid`, one
  per (run, employee), **net = gross − deductions** (pure); earnings seeded from the employee's
  active-contract **grade/band label** resolved through the institution's pay scale.
- **Student financial account.** A descriptive read model, one per student, **refreshed** from the
  account-statement engine (version-bumped), never posted to directly; org receivables rollup via
  `summarizeReceivables`. Descriptive only — **never a forecast** (P2-D28).

## 4. Verification

- **Pure-engine-first.** The money core and the account-statement/receivables engines were built and
  exhaustively tested before any aggregate depended on them, over narrow views the aggregates
  structurally satisfy.
- **Tests.** `@knowget/financial` — **63 tests** (the penny-perfect allocation invariant across many
  amounts, half-away rounding, non-finite-factor rejection, currency guards; the account reconciliation
  including the overdue-nets-payments read model; every aggregate lifecycle; the payment↔invoice
  billing-core flow — record → clear → partial → paid, refund reversal, overpayment rejection; the
  band→payslip compensation boundary; and an end-to-end fee-schedule → invoice → payment → account →
  concession → payroll spine). `apps/api` — the financial DI-graph integration spec (2 tests) compiles
  the full module and asserts every service token resolves.
- **Gates.** `@knowget/financial` typecheck, ESLint, Prettier and build clean; `apps/api` typecheck
  clean. Full monorepo build and DB-integration tests are CI-verified (TD-12: the Prisma engine CDN is
  unreachable in the build sandbox).
- **Live RLS.** The migration was applied on a live PostgreSQL instance as a **non-superuser owner**;
  verified that tenant A sees only its own rows (periods and invoices), tenant B sees zero, an unset
  tenant sees zero (fail-closed), a cross-tenant insert is rejected by `WITH CHECK` (SQLSTATE 42501),
  and the **BIGINT money column round-trips exactly**.
- **Independent audits.** Two adversarial audits (domain logic; persistence/API) reviewed the whole
  milestone. The **persistence/API audit was clean** (adapter field fidelity, the BIGINT bridge incl.
  the nullable concession amount, RLS on all eight tables, DI dependency kinds, and the finance/payroll
  scope split all verified). The **domain audit** confirmed the money math and the invoice/payment state
  machine correct and surfaced four fixable items, all addressed with regression tests: the
  overdue-read-model netting, the non-finite money-factor guard, a defensive non-positive-amount guard,
  and empty-period-date validation.

## 5. Decisions

Recorded in **ADR-0033**: **money as integer minor units, never float** (validated construction, exact
arithmetic, penny-perfect allocation, half-away rounding, BIGINT persistence with a `Number()`/
`BigInt()` bridge); one package for all eight aggregates; the money core and account-statement engine
built first; the fee structure as the schedule backbone (components frozen once active); the invoice
billing core with `amountPaidMinor` kept in step with status and overpayment/reversal rejected; a
payment that only settles a charge the invoice accepts (apply-before-persist, currency/org/student
inherited from the invoice); pure concession amounts (fixed capped at base); the **payroll compensation
boundary** where the workforce grade/band label becomes real money through the institution's pay scale;
a descriptive student account refreshed from the engine; **two scope pairs — `finance:*` and
`payroll:*`** splitting fee data from salary data; persistence per ADR-0010 with FORCE RLS verified
live; cross-repository payment atomicity deferred (**TD-34**).

## 6. Technical debt

- **TD-34 (new, medium).** Cross-repository atomicity of payment clearing/refund: the operation writes
  both the payment and its invoice without a shared transaction, so a mid-operation infrastructure
  failure or a concurrent clear can desync the pair. The apply-before-persist ordering makes the
  validation-failure path safe; the fix (a unit-of-work transaction or an idempotency key on
  application) is a persistence-layer refinement behind the service.
- **Pay-scale configuration (design).** The grade/band → money pay scale is institution configuration
  (empty by default at the composition root); an unconfigured grade returns 404 from the
  payslip-from-employee endpoint until the band is configured. A managed salary-structure aggregate is
  a natural later refinement.
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root.
- **TD-01 (standing).** Event delivery is in-process (outbox store in-memory); the finance events ride
  the same bus.

## 7. Recommendation — merge on green, proceed to P2-D15

The Fees, Finance & Payroll Platform is complete behind its gates: money is exact by construction, the
invoice/payment state machine cannot be driven into an inconsistent state, the workforce→finance
compensation boundary is honored, and all eight tables are FORCE-RLS tenant-isolated (verified live,
BIGINT money round-tripping exactly). Recommend merging on CI green and proceeding to **P2-D15**.
**Reminder: rotate the GitHub PAT** used for pushes at this milestone boundary.
