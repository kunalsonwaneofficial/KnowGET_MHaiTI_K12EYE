# 33. Fees, Finance & Payroll: one package, eight aggregates, a money core, and money as integer minor units

- **Status:** Accepted
- **Date:** 2026-12-15
- **Contract:** P2-D14 (Fees, Finance & Payroll Platform)

## Context

P2-D14 is the third contract of **Program C** (the operational institution), on the certified
`v0.2.0` baseline, the frozen Phase-1 core, the P2-D03 student base and the P2-D12 workforce base. It
is the authoritative domain for **the institution's money**: the fee schedules it bills, the invoices
it raises against students, the payments it collects, the scholarships and discounts it grants, the
accounting periods those postings belong to, the staff payroll it runs, and the descriptive
receivables position it reports. It owns the compensation boundary the workforce and faculty domains
explicitly deferred — the workforce `EmploymentContract` records a pay **grade/band label only** and
defers the amount to here.

One concern dominates every other: **money must be exact.** A fees-and-payroll system that loses or
invents a penny is not fit to ship. The design therefore begins not with an aggregate but with a
money representation and the pure engine that reconciles it.

Two boundaries shape the rest. First, **prediction is not here** — as with every operational domain,
forecasting (who will default, cash-flow projection) is reserved for the **intelligence core
(P2-D28)**; the receivables account is descriptive and derived, never a forecast. Second, **identity
is not here** — a payer is a **Student (P2-D03)** and a payee is an **Employee (P2-D12)**, referenced
by id and never re-modelled.

## Decision

1. **Money is integer minor units plus an ISO-4217 currency code — never a floating-point major-unit
   value.** This is the defining decision. `Money = { amountMinor: number; currency: string }`;
   `money()` validates the amount is an integer and the currency is a three-letter code, so an invalid
   amount can never be constructed. Arithmetic is exact; rounding is explicit and **half-away-from-zero**
   (sign-stable, unlike `Math.round`); a proportional split uses a **largest-remainder** allocation that
   distributes leftover minor units one at a time so the parts **sum exactly to the whole** — no penny
   is created or lost. `multiplyMoney`/`percentageOf` route their rounded result back through `money()`
   so a non-finite factor is rejected rather than yielding a `NaN`/`Infinity` amount. Amounts embedded
   in structured data (fee components, invoice lines, payslip lines) are integer minor units too.

2. **One domain package, `@knowget/financial`, for all eight aggregates** — the same
   single-bounded-context choice as the twelve prior domains (ADR-0021…0032). A shared spine
   (`errors.ts`, `ports.ts`, `finance-events.ts`, `finance-value.ts`, `index.ts`), the money core
   (`money.ts`), a per-aggregate pair (`<aggregate>.ts` + `<aggregate>-service.ts`), value objects
   (fee/invoice/payment/concession/period/payroll/payslip statuses, payment methods, concession types,
   account standings) and — as with the prior domains — **pure engine functions** over narrow views
   (`finance-view.ts`).

3. **The money core and the account-statement engine are the computational core, built and tested
   first.** `computeAccountStatement` reconciles a student's live charges (issued-and-beyond invoices)
   against their **cleared** payments into a statement — total billed, total paid, outstanding (billed
   − paid, floored at zero) and the **outstanding portion** of overdue invoices (net of payments, so
   overdue never exceeds outstanding), plus a descriptive standing; `summarizeReceivables` rolls a set
   of accounts into a leadership picture. Both are pure, deterministic and single-currency (mixed
   currencies rejected), over views the aggregates structurally satisfy.

4. **The fee structure is the fee-schedule backbone.** A reusable template — a set of fee components
   (name, category, amount) in one currency — running `draft → active → archived`; its components are
   **editable only while draft and frozen once active**, so issued invoices always reference a stable
   schedule (version bumps on each change). The financial period (`open → closed`, reopenable for
   corrections) is the accounting window postings belong to.

5. **The invoice is the billing core; `amountPaidMinor` is kept in step with status.** An invoice is a
   bill to a student (lines in one currency): `draft → issued → partially_paid | paid | overdue |
cancelled`, lines editable only while draft and frozen at issue. Pure `applyPaymentToInvoice` /
   `reversePaymentFromInvoice` raise/lower the paid amount and **recompute the status from the same
   figure**, so no inconsistent `(status, amountPaid)` pair is reachable; **overpayment is rejected**
   (paid never exceeds total) and **reversal below zero is rejected**; a paid invoice cannot be re-paid,
   a cancelled one cannot be paid, and cancel is blocked once any payment is applied.

6. **A payment only ever settles a charge the invoice accepts.** A payment runs `pending → cleared |
failed`, `cleared → refunded`; it **inherits its organization, student and currency from the
   invoice** so the two can never disagree. Clearing and refunding are coordinated by the payment
   service **through the invoice service** — the application is attempted **before** the cleared/refunded
   payment is persisted, so a rejected application (overpayment, not-payable) leaves the payment
   untouched. A fully-settled invoice publishes the paid event.

7. **Concessions are pure discounts.** A concession is a scholarship/discount on a student's fees —
   either a percentage or a fixed amount — running `requested → approved → revoked` / `rejected`. The
   pure `concessionAmount` computes the money it takes off a base (a percentage of the base, or the
   fixed amount **capped at the base** so a discount never exceeds what is owed; same-currency); only an
   approved concession applies.

8. **Payroll is where a workforce grade/band becomes real money.** A payroll run is a compensation
   batch in one currency (`draft → processed → paid | cancelled`); a payslip is an employee's
   compensation within it (earnings and deductions, `draft → approved → paid`, one per (run, employee)),
   with **gross, deductions and net computed purely** (`net = gross − deductions`). The earnings are
   seeded from the employee's **active-contract pay grade/band label** (workforce, P2-D12) resolved
   through the institution's **pay scale** — the crossing where the label the workforce domain stores
   becomes concrete money the Financial domain owns.

9. **The student financial account is a descriptive read model, never a transaction.** One per student,
   it carries the reconciled totals and standing produced by the account-statement engine, **refreshed**
   (version-bumped) whenever the underlying invoices or payments change; the organization receivables
   rollup runs the pure `summarizeReceivables`. It is always derived, never posted to directly.

10. **Two permission scope pairs split the platform along its confidentiality boundary.**
    `finance:read`/`finance:write` gate the student-facing money (periods, fee structures, invoices,
    payments, concessions, receivables accounts), held by the fees/accounts team; `payroll:read`/
    `payroll:write` gate staff compensation (runs, payslips), held by the HR/payroll team. Salary data
    is sensitive and separately administered, so it **never shares a scope with fee data** — unlike the
    single-scope academic and workforce domains, this split is intentional.

11. **Persistence per ADR-0010, money as BIGINT.** Eight tables (`financial_period`, `fee_structure`,
    `invoice`, `payment`, `concession`, `payroll_run`, `payslip`, `student_financial_account`) with
    Prisma/RLS adapters at the `apps/api` composition root (TD-21). Every table has `ENABLE` and
    `FORCE ROW LEVEL SECURITY` and the standard `tenant_isolation` policy (both USING and WITH CHECK,
    fail-closed) — verified on live PostgreSQL. Scalar money is **BIGINT** minor units bridged at the
    adapter with `Number()`/`BigInt()`; amounts inside structured data (fee components, invoice lines,
    payslip earnings/deductions) are non-null JSONB; counts and versions are INTEGER; a concession
    percentage is DOUBLE PRECISION; date-only and ISO-stamp values are TEXT; the uniqueness rules
    (period code, fee-structure code, invoice number, one payslip per (run, employee), one account per
    student) are tenant-scoped DB unique indexes.

12. **Domain events on the platform bus** — period opened/closed/reopened; fee structure created/
    activated/archived; invoice issued/paid/overdue/cancelled; payment recorded/cleared/failed/refunded;
    concession requested/approved/rejected/revoked; payroll run processed/paid/cancelled; payslip
    approved/paid; financial account refreshed.

13. **Cross-domain references enter through directory ports.** Organization (P2-D01-M01), Student
    (P2-D03) and Employee-compensation (P2-D12) existence are validated on write; an invoice/concession
    derives its organization from the student, and a payslip derives its organization and base earnings
    from the employee. The **pay scale (grade/band label → earning lines) is institution configuration**
    supplied at the composition root; a grade with no configured band yields no derivable earnings.

14. **Cross-repository atomicity of payment clearing/refund is a persistence contract (TD-34).**
    Clearing/refunding writes both the payment and the invoice; the apply-before-persist ordering makes
    the _validation-failure_ path safe, but a mid-operation infrastructure failure or a concurrent
    clear can desync the pair without a shared transaction / optimistic lock. The mitigation
    (unit-of-work transaction or an idempotency key on application) is recorded as **TD-34**.

15. **Explicit non-goals.** No double-entry general ledger, bank-statement reconciliation, tax
    computation/filing, or procurement/purchasing (later contracts or out of scope); no prediction or
    cash-flow forecasting (intelligence core, P2-D28). This domain is the money system of record those
    build on.

## Consequences

- **A unified money system of record.** An institution manages its fee schedules, billing, collections,
  concessions, accounting periods, payroll and receivables in one place, on top of the student and
  workforce bases, with a descriptive account and leadership rollup.
- **Money is exact by construction.** Because every amount is an integer number of minor units and every
  operation is exact or explicitly rounded, the system cannot lose or invent a penny; the allocation is
  penny-perfect and the invoice/payment state machine cannot be driven into an inconsistent
  paid-vs-status pair or made to over/under-pay.
- **The compensation boundary is honored.** The workforce domain keeps only the grade/band **label**;
  the Financial domain turns it into money through the configurable pay scale — no compensation amount
  is duplicated across the boundary.
- **A pure, testable core.** The money core and the account-statement/receivables engines are pure
  functions over narrow views — package tests exercise the penny-perfect allocation, half-away rounding,
  currency guards, the account reconciliation (including the overdue-nets-payments read model), every
  aggregate lifecycle, the payment↔invoice coordination (partial → paid, refund reversal, overpayment
  rejection), and an end-to-end fee-schedule → invoice → payment → account → concession → payroll spine.
- **Isolation.** All eight tables are FORCE-RLS tenant-isolated and fail-closed, verified on live
  PostgreSQL with the BIGINT money column round-tripping exactly; the uniqueness rules are tenant-scoped
  at the DB.
- **Deferred, interface-protected.** Domain Prisma adapters remain at the composition root (TD-21); the
  pay scale is configuration; cross-repository payment atomicity is tracked (TD-34). One cohesive
  package, acceptable for a single bounded context (as with the twelve prior domains). This is the third
  contract of **Program C** and the money base the operational and intelligence-core domains build on.
