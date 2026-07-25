# Engineering Delivery Report — P2-D15

**Procurement, Inventory & Assets Platform** · Phase 2 (Enterprise Domain Engineering) · Program: Workforce & Operations

|                |                                                                                                                                                                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D15 — Procurement, Inventory & Assets Platform                                                                                                                                                                                                                                   |
| **Status**     | 🟡 Awaiting CI green + merge. In-sandbox: `@knowget/resource` typecheck/lint/format/build clean, **52 tests** (20 files); `apps/api` typecheck clean + resource DI-graph spec (2 tests); RLS verified on live PostgreSQL. Full monorepo build / DB-integration CI-verified (TD-12). |
| **Depends on** | P2-D12 (Workforce, ADR-0031 — the Employee base), P2-D01-M01 (Organization), P2-D14 (Financial, ADR-0033 — the money-engineering precedent), P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`)                                                                                                  |
| **Date**       | 16 December 2026                                                                                                                                                                                                                                                                    |
| **Next**       | P2-D16 (next Program C contract)                                                                                                                                                                                                                                                    |

---

## 1. Mission recap

Deliver the **Procurement, Inventory & Assets Platform** — the institution's **resource system of
record**: the suppliers it buys from, the stockable goods it holds and the stock ledger that tracks
them, the requisitions and purchase orders through which it procures, the fixed assets it owns and
depreciates, and the maintenance those assets receive. It is the operational counterpart to the money
system of record (P2-D14): Finance owns the ledger of value; this domain owns the goods and assets that
value buys. Two concerns shape it: **money must be exact** (asset value, stock value, procurement spend
are integer minor units, never floats), and two quantities are **derived, not stored** — an item's
on-hand stock (the reconciliation of its movement ledger) and an asset's net book value (a function of
cost, salvage, life and age) — so the design begins with the two pure engines, not with an aggregate.
Two boundaries define it: **descriptive, not predictive** (demand forecasting, reorder optimisation and
replacement planning are deferred to the intelligence core, P2-D28), and identity is referenced not
duplicated (a vendor's org is an Organization, a requester/custodian is an Employee). Double-entry
posting to the GL, three-way match, RFQ/bidding, barcode capture and prediction are out of scope.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Money core**       | `money.ts` — a **self-contained** `Money` = integer minor units + ISO-4217 currency, never float, that **does not import `@knowget/financial`** (ADR-0010 forbids domain→domain coupling; a shared kernel is TD-35). Validated construction, exact add/subtract, integer-guarded multiply, half-away-from-zero `prorataMinor` (the depreciation primitive), compare and currency guards                                                                                                                                           |
| **Engines**          | Two pure, deterministic, clock-free engines built and tested first: `computeStockPosition`/`summarizeStock` (reconciles a movement ledger into on-hand + below-reorder, and rolls positions up) and `computeDepreciation` (straight-line net book value — monotonic, never below salvage, never above cost, exact on salvage at end of life)                                                                                                                                                                                      |
| **Domain**           | `@knowget/resource` — eight aggregates (Supplier, InventoryItem, StockMovement, PurchaseRequisition, PurchaseOrder, Asset, AssetMaintenance, InventoryPosition), each an immutable aggregate + factory + guarded transitions with an application service; value objects (supplier/item/requisition/order/movement/asset/maintenance statuses); the RequisitionLine / OrderLine line objects                                                                                                                                       |
| **Persistence**      | Eight models in `schema.prisma` + one migration (`20261216000000_add_resource`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed, soft-delete + audit columns; scalar money as **BIGINT** minor units (adapter `Number()`/`BigInt()` bridge, null-guarded for the nullable item cost / maintenance cost / stock value); requisition & order lines as non-null JSONB; tenant-scoped DB unique indexes (supplier code, item sku, order number, asset tag, one position per item)    |
| **API**              | Eight permission-gated, tenant-scoped REST controllers — `procurement/*` (suppliers, items, stock-movements, requisitions, orders, inventory-positions) under `procurement:read`/`:write` and `assets` + `asset-maintenance` under `asset:read`/`:write`; zod DTOs (money validated as non-negative integers, quantities positive, currency ISO-4217); eight Prisma/RLS adapters + two directory adapters (Organization, Employee); `ResourceModule` importing the Organization and Workforce modules, registered in `app.module` |
| **Events**           | Domain events — supplier registered/suspended/reinstated/blacklisted; item created/discontinued/reactivated; stock movement recorded; requisition submitted/approved/rejected; purchase order issued/received/closed/cancelled; asset registered/retired/disposed; maintenance scheduled/completed/**cancelled**; inventory position refreshed                                                                                                                                                                                    |
| **Docs & decisions** | ADR-0034 (platform + the dual pure engines + money as integer minor units in a self-contained module, and the money-reuse decision, TD-35); this report; platform-state, technical-debt (TD-35) and CHANGELOG updates                                                                                                                                                                                                                                                                                                             |

## 3. Domain capabilities & invariants

- **Money.** Integer minor units + currency; construction validated, arithmetic exact, multiply
  integer-guarded (no fractional minor units), `prorataMinor` half-away-from-zero. Self-contained — not
  coupled to Finance (TD-35).
- **Stock is a ledger; on-hand is derived.** Movements are append-only (receipt/issue/adjustment,
  corrections by further adjustment); `computeStockPosition` reconciles them into on-hand +
  below-reorder (`onHand <= reorderLevel`); an **issue that would draw more than is on hand is
  rejected** by the engine over prior movements.
- **Supplier & item masters.** A supplier `active ↔ suspended → blacklisted` (code unique per tenant);
  an item `active ↔ discontinued` with an optional standard cost valuing stock (sku unique per tenant).
- **Requisition → order → receipt.** A requisition `draft → submitted → approved | rejected` (lines
  frozen at submit); a purchase order `draft → issued → partially_received | received → closed |
cancelled`, **issuing requires an active supplier**, **over-receipt rejected**, and **receiving an
  item-linked line posts a stock receipt _before_ the order is persisted** so the ledger and order never
  disagree; a `partially_received` order must be closed, not cancelled.
- **Fixed asset.** Acquisition/salvage/life validated (salvage ≤ cost, life > 0); `in_service ↔
under_maintenance → retired → disposed` (tag unique per tenant); **net book value** via the pure
  straight-line engine, landing exactly on salvage at end of life.
- **Maintenance.** A log against an asset, `scheduled → completed | cancelled`; completion records the
  performed date and actual cost; every terminal transition emits an event.
- **Inventory position.** A descriptive read model, one per item, **refreshed** (version-bumped) from
  the stock-balance engine and valued at standard cost; organization rollup via `summarizeStock`.
  Descriptive only — **never a forecast** (P2-D28).

## 4. Verification

- **Pure-engine-first.** The two engines (stock balance, straight-line depreciation) and the money core
  were built and exhaustively tested before any aggregate depended on them, over narrow views the
  aggregates structurally satisfy.
- **Tests.** `@knowget/resource` — **52 tests** (stock reconciliation across receipts/issues/
  adjustments and below-reorder; the depreciation invariants — monotonic, floored at salvage, exact at
  end of life, clock-free; money construction, currency guards and the non-integer-multiplier guard;
  every aggregate lifecycle; the insufficient-stock and over-receipt guards; the receiving-posts-stock
  coupling; the maintenance-cancelled event; and an end-to-end supplier → item → requisition → order →
  receipt → stock → position → issue → asset → depreciation → maintenance → rollup spine). `apps/api` —
  the resource DI-graph integration spec (2 tests) compiles the full module and asserts every service
  token resolves.
- **Gates.** `@knowget/resource` typecheck, ESLint, Prettier and build clean; `apps/api` typecheck
  clean. Full monorepo typecheck, lint and tests pass in-sandbox; the full build and DB-integration
  tests are CI-verified (TD-12: the Prisma engine CDN is unreachable in the build sandbox).
- **Live RLS.** The migration was applied on a live PostgreSQL instance as a **non-superuser owner**;
  verified that tenant A sees only its own rows, tenant B sees zero, an unset tenant sees zero
  (fail-closed), a cross-tenant insert is rejected by `WITH CHECK` (SQLSTATE 42501), and the **BIGINT
  money columns round-trip exactly** for values beyond int4 range (asset cost/salvage, item standard
  cost, inventory stock value).
- **Independent audits.** Two adversarial audits (domain logic; persistence/API) reviewed the whole
  milestone. The **persistence/API audit was clean** (adapter field fidelity, the BIGINT bridge incl.
  the three nullable money columns, RLS on all eight tables, the JSON line round-trip, the scope split,
  route non-collision and DI dependency kinds all verified). The **domain audit** confirmed the money
  math, both engines, the state machines and the core service invariants correct, and surfaced two
  fixable low items, both addressed with regression tests: the `multiplyMoney` non-integer-quantity
  guard, and the missing `maintenance.cancelled` event.

## 5. Decisions

Recorded in **ADR-0034**: two pure engines (stock balance, straight-line depreciation) as the
computational core built first; **money as integer minor units, never float**, in a **self-contained
module that does not import `@knowget/financial`** (ADR-0010 forbids domain→domain coupling; a shared
`@knowget/money` package is deferred as TD-35); one package for all eight aggregates; the supplier and
item masters; the append-only stock ledger with on-hand always derived; the requisition→order→receipt
flow with issuing gated on an active supplier, over-receipt rejected, and **receiving posting stock
before persisting the order**; the fixed asset depreciated by the pure engine; maintenance as a log
with every terminal transition emitting an event; the descriptive inventory position refreshed from the
engine; **two scope pairs — `procurement:*` and `asset:*`**; persistence per ADR-0010 with FORCE RLS
and BIGINT money verified live.

## 6. Technical debt

- **TD-35 (new, low).** The `@knowget/resource` money core is a deliberate self-contained copy of the
  Finance money engineering (ADR-0033), because the domain architecture (ADR-0010) forbids one domain
  package depending on another. Extracting a shared, neutral `@knowget/money` package both domains
  depend on is the clean resolution; duplicating the small, stable core now (rather than coupling two
  bounded contexts) is the right trade-off. Interface-protected: both copies are pure and independently
  tested.
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root.
- **TD-01 (standing).** Event delivery is in-process (outbox store in-memory); the resource events ride
  the same bus.

## 7. Recommendation — merge on green, proceed to P2-D16

The Procurement, Inventory & Assets Platform is complete behind its gates: money is exact by
construction, on-hand stock and net book value are derived consistently by pure engines, the stock
ledger is append-only and the purchase-order receipt posts stock before it persists, and all eight
tables are FORCE-RLS tenant-isolated (verified live, BIGINT money round-tripping exactly). Recommend
merging on CI green and proceeding to **P2-D16**. **Reminder: rotate the GitHub PAT** used for pushes
at this milestone boundary.
