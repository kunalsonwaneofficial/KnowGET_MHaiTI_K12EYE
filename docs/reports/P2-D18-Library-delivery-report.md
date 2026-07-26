# Engineering Delivery Report — P2-D18

**Knowledge Resource, Library & Digital Learning Asset Platform** · Phase 2 (Enterprise Domain Engineering) · Program: Workforce & Operations

|                |                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D18 — Knowledge Resource, Library & Digital Learning Asset Platform                                                                                                                                                                                                                                                                                                                |
| **Status**     | 🟡 Awaiting CI + merge — feature branch `feat/p2-d18-library` pushed. In-sandbox: `@knowget/library` typecheck/lint/format/build clean, **83 tests** (19 files); `apps/api` typecheck/lint/build clean + library DI-graph spec (2 tests) in the 213-test api suite; RLS verified on live PostgreSQL. Full monorepo typecheck/lint/tests green (TD-12 on the Prisma build in-sandbox). |
| **Depends on** | P2-D01-M02 (Person — the borrower base), P2-D01-M01 (Organization), P2-D14 (Finance, ADR-0033 — where fines live), P2-D15 (Procurement & Assets, ADR-0034 — where acquisition/valuation live), P2-D17 (Residential, ADR-0036 — the operational-domain precedent), P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`)                                                                               |
| **Date**       | 19 December 2026                                                                                                                                                                                                                                                                                                                                                                      |
| **Next**       | P2-D19 — Integrated Health Centre & Clinical Services (next Program C contract)                                                                                                                                                                                                                                                                                                       |

---

## 1. Mission recap

Deliver the **Knowledge Resource, Library & Digital Learning Asset Platform** — the institution's **library
system of record**: the catalog of titles it holds, the physical copies on its shelves, the digital
learning assets it licenses, the members entitled to borrow, the loans and reservations that circulate the
collection, the circulation policy that governs lending, and the descriptive profile of the collection.
Two decisions shape it: two quantities are **derived, not stored** — a title's availability and a loan's
due date / overdue state — so the design begins with the two pure engines; and **this domain carries no
money** — overdue and lost-item fines belong to Finance (P2-D14) and acquisition spend and asset valuation
to Procurement & Assets (P2-D15), so the boundary is held structurally. Two boundaries define it:
**descriptive, not predictive** (demand forecasting, recommendations and reading analytics are deferred to
the intelligence core, P2-D28), and identity is referenced not duplicated (a title's org is an
Organization, a member is a Person). Inter-library loan, digital-rights enforcement/content delivery, and
fine collection are out of scope.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engines**          | Two pure, deterministic, clock-free engines built and tested first: `computeTitleAvailability` / `computeCollectionUtilization` (a title's loanable copies against those on loan/lost → available + reservable, rolled to the collection's on-loan-vs-loanable utilization); and `computeLoanStatus` (due date = issue + period × (1 + renewals used), overdue in **days never money**, renewals remaining)                                                                                                                         |
| **Domain**           | `@knowget/library` — eight aggregates (Title, Copy, DigitalAsset, LibraryMember, Loan, Reservation, CirculationPolicy, CollectionProfile), each an immutable aggregate + factory + guarded transitions with an application service; value objects (title/copy/digital/member/loan/reservation/policy statuses, types, formats, access & member categories); the CategoryRule / DefaultRule policy line objects. **No money anywhere**                                                                                               |
| **Persistence**      | Eight models in `schema.prisma` + one migration (`20261219000000_add_library`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed, soft-delete + audit columns; loan periods/limits/queue positions/counts/percents/versions **INTEGER**, title authors/subjects & policy rules/default-rule **JSONB**, date/ISO stamps & licence expiry **TEXT**; tenant-scoped DB unique indexes (ISBN nullable, barcode, membership number, one membership per (person, org), one profile per org) |
| **API**              | Eight permission-gated, tenant-scoped REST controllers — `library/*` (titles, copies, digital assets, collection profile) under `library:read`/`:write` and `circulation/*` (members, loans, reservations, policy) under `circulation:read`/`:write`; zod DTOs; eight Prisma/RLS adapters + two directory adapters (Organization, Person); `LibraryModule` importing the Organization and Person modules, registered in `app.module`. Loan **issue** resolves terms from the member's org active policy at the composition point    |
| **Events**           | Domain events — title cataloged/renamed/authors/subjects/metadata/withdrawn/restored; copy accessioned/located/condition/lost/withdrawn/issued/returned; digital cataloged/renamed/access/licence-renewed/retired/reactivated; member registered/category/expiry/suspended/reinstated/expired; loan issued/renewed/returned/lost; reservation placed/ready/fulfilled/cancelled/expired; policy drafted/rules/default/activated/archived; collection refreshed                                                                       |
| **Docs & decisions** | ADR-0037 (platform + the dual pure engines + the no-money operational boundary decision); this report; platform-state, technical-debt (TD-38) and CHANGELOG updates                                                                                                                                                                                                                                                                                                                                                                 |

## 3. Domain capabilities & invariants

- **Availability & loan status are derived.** A title's availability (and whether it is reservable — no
  copy free but a loanable copy exists) is computed by the pure engine from its copy statuses; a loan's due
  date and overdue state are computed from the issue date, the captured loan period and the renewals used —
  never stored.
- **Catalog masters.** A title `active ↔ withdrawn` (ISBN unique per tenant, nullable); a copy `available ↔
on_loan → lost | withdrawn` with the org derived from the title and the barcode unique per tenant; an
  on-loan copy can be lost **only through the loan**, which reconciles the loan and the copy together.
- **Digital assets.** A licensed resource `active ↔ retired` with a format, access model, access reference
  and optional licence expiry; no physical copies, access validity a derived clock-free check.
- **Members.** A validated **Person** linked to an org `active ↔ suspended → expired`, membership number
  unique per tenant, **one membership per person per org**.
- **Loans.** A copy issued to a member `active → returned | lost`, terms (period, renewal + borrowing
  limits) **captured at issue** from the org policy, **one active per copy**, the borrowing limit enforced,
  the copy flipped on_loan/available/lost in lock-step.
- **Reservations.** A member's hold on a title `requested → ready → fulfilled | cancelled | expired`, **one
  open per member+title**, queue position one past the highest open hold (collision-free after a cancel).
- **Circulation policy.** Version-controlled lending rules `draft → active → archived`, **rules frozen once
  active**, **one active per org**; `resolveTermsForMember` is the single source of a member category's
  lending terms.
- **Collection profile.** A descriptive read model, one per org, **refreshed** (version-bumped) from both
  engines over the org's catalog, holdings and circulation. Descriptive only — **never a forecast**
  (P2-D28).

## 4. Verification

- **Pure-engine-first.** The two engines (title availability + collection utilization; loan status) were
  built and exhaustively tested before any aggregate depended on them, over narrow views the aggregates
  structurally satisfy.
- **Tests.** `@knowget/library` — **83 tests** (title availability incl. the reservable rule; collection
  utilization with divide-by-zero guard; loan due-date/overdue/renewal math; every aggregate lifecycle; the
  borrowing-limit, edit-while-draft and status guards; the copy-loss reconciliation; the one-active-loan-
  per-copy, one-open-reservation-per-member+title and one-active-policy-per-org invariants; and an
  end-to-end policy → catalog → member → loan → reservation → collection-profile spine asserting the domain
  publishes its events). `apps/api` — the library DI-graph integration spec (2 tests) compiles the full
  module and asserts every service token resolves.
- **Gates.** `@knowget/library` typecheck, ESLint, Prettier and build clean; `apps/api` typecheck, ESLint
  and build clean. Full monorepo typecheck, lint and tests pass in-sandbox (library 83, api 213; all 237
  prisma-independent turbo tasks green); the full Prisma build and DB-integration tests are CI-verified
  (TD-12: the Prisma engine CDN is unreachable in the build sandbox).
- **Live RLS.** The migration was applied on a live PostgreSQL instance as a **non-superuser owner**;
  verified that tenant A sees only its own rows, tenant B sees zero, an unset tenant sees zero
  (fail-closed), a cross-tenant insert is rejected by `WITH CHECK` (SQLSTATE 42501) on title/loan/
  reservation, FORCE RLS + policy is present on all eight tables, and the **JSONB (authors/subjects, policy
  rules), INTEGER (counts/periods) and nullable-ISBN columns round-trip exactly** (two NULL-ISBN titles
  coexist under the tenant-scoped unique).
- **Independent audits.** Two adversarial audits (domain logic; persistence/API) reviewed the whole
  milestone. The persistence/API audit was **clean across all categories** (schema/migration column-by-
  column parity, adapter field fidelity, JSONB round-trip, correct delegates and status-filtered queries,
  port conformance, controller scope split + route ordering, DTO/enum parity, DI wiring, and the loan-issue
  term-resolution composition). The domain audit was **clean on all critical/major items** (both engines,
  every state machine, the borrowing-limit and uniqueness-scope guards, null/undefined setter handling);
  its one actionable finding was **fixed before merge** — `CopyService.markLost` now refuses an on-loan
  copy (it must be lost through the loan, which reconciles both), closing a cross-aggregate double-count;
  a cosmetic queue-position collision after a cancellation was hardened in the same pass.

## 5. Decisions

Recorded in **ADR-0037**: two pure engines (title availability + collection utilization; loan status) as
the computational core built first; **no money — a deliberate operational boundary** (fines → Finance
P2-D14; acquisition/valuation → Procurement & Assets P2-D15), held structurally; one package for all eight
aggregates; the title and its copies as catalog masters with availability derived; the non-circulating
digital asset; the member as a validated Person with one membership per person per org; the loan capturing
its terms at issue with one-active-per-copy and the borrowing limit enforced; the reservation with one
open per member+title; the version-controlled circulation policy with one active per org as the single
source of lending terms; the descriptive collection profile; **two scope pairs — `library:*` and
`circulation:*`**; persistence per ADR-0010 with FORCE RLS verified live; three status-scoped uniqueness
invariants service-enforced (**TD-38**).

## 6. Technical debt

- **TD-38 (new, low).** The three **status-scoped uniqueness** invariants — one active loan per copy
  (`LoanService.issue` via `findActiveByCopy`), one open reservation per member+title
  (`ReservationService.place` via `findOpenByMemberAndTitle`), and one active circulation policy per org
  (`CirculationPolicyService.activate` via `findActiveByOrganization`) — are enforced in the service
  (check-then-act), with no DB backstop, so concurrent writes have a TOCTOU window. The domain's _absolute_
  uniques (ISBN, barcode, membership number, membership per (person, org), profile per org) all have DB
  `@@unique` indexes. A **partial** unique index (required because returned/lost/cancelled/archived rows
  retain their copy/member/title/org values) would backstop each (ADR-0037). Mirrors TD-26/TD-36/TD-37. A
  later refinement behind the services.
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root.
- **TD-01 (standing).** Event delivery is in-process (outbox store in-memory); the library events ride the
  same bus.

## 7. Outcome — feature branch pushed, awaiting CI + merge

The Knowledge Resource, Library & Digital Learning Asset Platform is complete behind its gates: title
availability and loan status are derived consistently by pure engines, a copy holds one active loan and a
member one open reservation per title, an org runs one active circulation policy that is the single source
of lending terms, the fine/valuation boundary is held structurally (no money in the domain), and all eight
tables are FORCE-RLS tenant-isolated (verified live, JSONB/INTEGER/nullable-ISBN round-tripping exactly);
both independent audits were resolved clean. All in-sandbox gates are green on `feat/p2-d18-library`;
**awaiting CI green to merge to `main`**, after which this report flips to ✅ with the merge commit. Next
is **P2-D19 — Integrated Health Centre & Clinical Services**. **Reminder: rotate the GitHub PAT** used for
pushes at this milestone boundary.
