# 34. Procurement, Inventory & Assets: one package, eight aggregates, two pure engines, and a self-contained money core

- **Status:** Accepted
- **Date:** 2026-12-16
- **Contract:** P2-D15 (Procurement, Inventory & Assets Platform)

## Context

P2-D15 is the fourth contract of **Program C** (the operational institution), on the certified
`v0.2.0` baseline, the frozen Phase-1 core, the P2-D01-M01 organization base and the P2-D12 workforce
base. It is the authoritative domain for **the institution's physical resources and spend**: the
suppliers it buys from, the stockable goods it holds and the stock ledger that tracks them, the
internal requests and purchase orders through which it procures, the fixed assets it owns and
depreciates, and the maintenance those assets receive. It is the operational counterpart to the money
system of record (P2-D14, Finance): Finance owns the ledger of value; this domain owns the goods and
the assets that value buys.

Two concerns shape the design. First, like Finance, **money must be exact** — asset valuation, stock
value and procurement spend are integer minor units, never floats. Second, two quantities are
**derived, not stored**: an item's **on-hand stock** is the reconciliation of its movement ledger, and
an asset's **net book value** is a function of its cost, salvage, life and age. Both are the output of
a pure engine, computed the same way everywhere they are read — so the design begins, as Finance did,
with the computational core, not with an aggregate.

Two boundaries bound it. First, **prediction is not here** — demand forecasting, reorder-point
optimisation and depreciation-driven replacement planning are reserved for the **intelligence core
(P2-D28)**; the inventory position and the depreciation figure are descriptive and derived, never a
forecast. Second, **identity is not here** — a vendor's organization is an **Organization
(P2-D01-M01)** and a requester/custodian is an **Employee (P2-D12)**, referenced by id and never
re-modelled.

## Decision

1. **Money is integer minor units plus an ISO-4217 currency code — in a self-contained module the
   resource domain owns.** As in Finance (ADR-0033), `Money = { amountMinor: number; currency: string }`;
   `money()` validates the amount is an integer and the currency well-formed, arithmetic is exact, and
   rounding is explicit **half-away-from-zero**. `prorataMinor(base, num, den)` is the exact primitive
   the depreciation engine uses to apportion the depreciable base across the useful life so it lands
   **exactly on salvage at end of life**. Crucially, this money core is a **deliberate, self-contained
   copy inside `@knowget/resource` — it does NOT import `@knowget/financial`.** The domain architecture
   (ADR-0010) forbids a domain package depending on another domain package; a shared money kernel would
   be a third, neutral package both depend on. Duplicating the small, stable money core here (rather
   than coupling two bounded contexts) is the correct trade-off now; **extracting a shared
   `@knowget/money` package is recorded as technical debt (TD-35).**

2. **One domain package, `@knowget/resource`, for all eight aggregates** — the same
   single-bounded-context choice as the thirteen prior domains (ADR-0021…0033). A shared spine
   (`errors.ts`, `ports.ts`, `resource-events.ts`, `resource-value.ts`, `resource-view.ts`,
   `index.ts`), the money core (`money.ts`), a per-aggregate pair (`<aggregate>.ts` +
   `<aggregate>-service.ts`), the line value objects (requisition line, order line), and — as with the
   prior domains — **pure engine functions** over narrow views.

3. **Two pure engines are the computational core, built and tested first.** `computeStockPosition`
   reconciles an item's movement ledger into its on-hand quantity (receipts add, issues subtract,
   adjustments apply a signed correction) with its components and a **below-reorder** flag
   (`onHand <= reorderLevel`); `summarizeStock` rolls positions into an organization stock summary.
   `computeDepreciation` computes straight-line depreciation as of an age in months: accumulated
   depreciation is `prorataMinor(cost − salvage, min(months, life), life)` so net book value **never
   falls below salvage, never exceeds cost, and lands exactly on salvage at end of life**. Both are
   pure, deterministic and **clock-free** — the caller passes the as-of date — over views the
   aggregates structurally satisfy.

4. **The supplier is the vendor master.** A supplier runs `active ↔ suspended` (relationship paused)
   and `active | suspended → blacklisted` (a terminal bar); its `code` is unique per tenant. A purchase
   order can only be **issued** to an active supplier.

5. **The inventory item is the stockable-goods master.** An item carries a unit of measure, a reorder
   level and an **optional standard cost** (integer minor units + currency, both or neither) used to
   **value** stock on hand; it runs `active ↔ discontinued`; its `sku` is unique per tenant. Stock
   movements and order lines reference it.

6. **The stock movement is an append-only ledger; on-hand is never stored.** Each movement is one
   immutable entry — a `receipt` (goods in), an `issue` (goods out) or a signed `adjustment`. A receipt
   or issue carries a **positive** quantity (the engine applies the sign by type); an adjustment
   carries a **non-zero signed** quantity. A movement is never edited or deleted — a mistake is
   corrected with a further adjustment — so the ledger is auditable, and the on-hand quantity is always
   the engine's reconciliation of it.

7. **The purchase requisition is the internal request to buy.** Raised by a staff member, it carries
   requested lines (item, quantity, estimated unit cost) in one currency and runs `draft → submitted →
approved | rejected`. Lines are **editable only while draft and frozen once submitted**; an approved
   requisition authorises raising a purchase order.

8. **The purchase order orders from a supplier, and receiving posts stock.** An order carries lines
   (quantity, unit price, running received quantity) in one currency and runs `draft → issued`, then
   `partially_received | received` as goods arrive, `closed` when settled, or `cancelled`. Lines are
   frozen at issue; **issuing requires an active supplier**; receiving raises a line's received
   quantity (**never past what was ordered** — over-receipt rejected) and recomputes the status.
   **Receiving an item-linked line posts a stock receipt through the stock service _before_ the order
   is persisted**, so the ledger and the order never disagree; a stock-posting failure aborts the
   receipt. A `partially_received` order has receipts and must be **closed**, not cancelled
   (`OrderHasReceiptsError`).

9. **The fixed asset is depreciated by the pure engine.** An asset carries an acquisition cost, a
   salvage value and a useful life in months (the depreciation inputs, validated so salvage ≤ cost and
   life > 0), an optional employee custodian and location; it runs `in_service ↔ under_maintenance`,
   then `→ retired → disposed`, stamping the retire/dispose time. Its `assetTag` is unique per tenant.
   Net book value as of a date runs `computeDepreciation` over the whole months since acquisition.

10. **Asset maintenance is a log against an asset.** A maintenance record runs `scheduled → completed |
cancelled`; completing it records the performed date and the **actual cost** (optional money).
    Maintenance is a log — the asset's own `under_maintenance` status is managed separately on the
    asset — and **every terminal transition (complete and cancel) publishes an event.**

11. **The inventory position is a descriptive read model, never a transaction.** One per item, it
    carries the on-hand quantity and its components, the below-reorder flag, and (when the item has a
    standard cost) the **stock value** on hand — all produced by the stock-balance engine and
    **refreshed** (version-bumped) whenever the item's movements change. The organization stock rollup
    runs `summarizeStock`. It is always derived, never posted to directly.

12. **Two permission scope pairs split the platform along its operational boundary.**
    `procurement:read`/`procurement:write` gate the buy-and-hold flow (suppliers, inventory items, the
    stock ledger, requisitions, purchase orders, inventory positions), held by the stores/purchasing
    team; `asset:read`/`asset:write` gate the fixed-asset register and its maintenance, held by the
    asset/facilities team. The two are separately administered, so they do not share a scope.

13. **Persistence per ADR-0010, money as BIGINT.** Eight tables (`supplier`, `inventory_item`,
    `stock_movement`, `purchase_requisition`, `purchase_order`, `asset`, `asset_maintenance`,
    `inventory_position`) with Prisma/RLS adapters at the `apps/api` composition root (TD-21). Every
    table has `ENABLE` and `FORCE ROW LEVEL SECURITY` and the standard `tenant_isolation` policy (both
    USING and WITH CHECK, fail-closed) — verified on live PostgreSQL. Scalar money is **BIGINT** minor
    units bridged at the adapter with `Number()`/`BigInt()` (null-guarded for the nullable item
    standard cost, maintenance cost and stock value); amounts inside structured data (requisition and
    order lines) are non-null JSONB; quantities, reorder levels and versions are INTEGER; the
    below-reorder flag is BOOLEAN; date-only and ISO-stamp values are TEXT; the uniqueness rules
    (supplier code, item sku, order number, asset tag, one position per item) are tenant-scoped DB
    unique indexes.

14. **Domain events on the platform bus** — supplier registered/suspended/reinstated/blacklisted; item
    created/discontinued/reactivated; stock movement recorded; requisition submitted/approved/rejected;
    purchase order issued/received/closed/cancelled; asset registered/retired/disposed; maintenance
    scheduled/completed/cancelled; inventory position refreshed.

15. **Cross-domain references enter through directory ports.** Organization (P2-D01-M01) and Employee
    (P2-D12) existence are validated on write; a requisition derives its organization from the
    requester employee, a purchase order from the supplier, a stock movement and maintenance from the
    item/asset, and a custodian is validated against the employee directory. The resource domain links
    to those domains and never depends on their packages directly.

16. **Explicit non-goals.** No double-entry posting of procurement to the general ledger (Finance owns
    money; an AP/GL bridge is a later contract), no goods-received-note/invoice three-way match, no
    supplier bidding/RFQ, no barcode/RFID capture, and no prediction — demand forecasting, reorder
    optimisation and replacement planning are the intelligence core (P2-D28). This domain is the
    resource system of record those build on.

## Consequences

- **A unified resource system of record.** An institution manages its suppliers, stock, procurement,
  fixed assets and maintenance in one place, on top of the organization and workforce bases, with a
  descriptive stock position and organization rollup.
- **On-hand and net book value are exact and consistent by construction.** Both are computed by a pure
  engine from primary data (the movement ledger; the asset's cost/salvage/life/age), so every reader —
  the position read model, the API, a future analytic — gets the same number; the stock value and asset
  valuation are integer minor units and cannot drift.
- **The ledger is auditable and the order↔stock link is atomic-by-ordering.** Stock is an append-only
  ledger corrected only by further adjustments; a purchase-order receipt posts stock before it persists
  the order, so the two never disagree on a received line.
- **A pure, testable core.** The two engines and the money core are pure functions over narrow views —
  package tests exercise stock reconciliation (receipts/issues/adjustments, below-reorder), the
  straight-line depreciation invariants (monotonic, never below salvage, exact at end of life,
  clock-free), the non-integer-multiplier guard, every aggregate lifecycle, the insufficient-stock and
  over-receipt guards, the receiving-posts-stock coupling, and an end-to-end supplier → item →
  requisition → order → receipt → stock → position → issue → asset → depreciation → maintenance → rollup
  spine.
- **Isolation.** All eight tables are FORCE-RLS tenant-isolated and fail-closed, verified on live
  PostgreSQL with the BIGINT money columns round-tripping exactly (for values beyond int4 range); the
  uniqueness rules are tenant-scoped at the DB.
- **Deferred, interface-protected.** The money core is duplicated to keep the two bounded contexts
  decoupled; a shared `@knowget/money` package is tracked (**TD-35**). Domain Prisma adapters remain at
  the composition root (TD-21). One cohesive package, acceptable for a single bounded context (as with
  the thirteen prior domains). This is the fourth contract of **Program C** and the resource base the
  operational and intelligence-core domains build on.
