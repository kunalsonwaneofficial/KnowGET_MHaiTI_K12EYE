# Engineering Delivery Report — P2-D17

**Residential Life, Hostel & Boarding Platform** · Phase 2 (Enterprise Domain Engineering) · Program: Workforce & Operations

|                |                                                                                                                                                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Contract**   | P2-D17 — Residential Life, Hostel & Boarding Platform                                                                                                                                                                                                                                                              |
| **Status**     | ✅ Complete — CI green; merged to `main` (`49143fc`). In-sandbox: `@knowget/residential` typecheck/lint/format/build clean, **82 tests** (20 files); `apps/api` typecheck clean + residential DI-graph spec (2 tests); RLS verified on live PostgreSQL. Full monorepo typecheck/lint/tests green (TD-12 on build). |
| **Depends on** | P2-D12 (Workforce, ADR-0031 — the Employee base for wardens), P2-D03 (Student Lifecycle — the resident base), P2-D01-M01 (Organization), P2-D16 (Transport, ADR-0035 — the operational-domain precedent), P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`)                                                                    |
| **Date**       | 18 December 2026                                                                                                                                                                                                                                                                                                   |
| **Next**       | P2-D18 — Knowledge Resource, Library & Digital Learning Asset (next Program C contract)                                                                                                                                                                                                                            |

---

## 1. Mission recap

Deliver the **Residential Life, Hostel & Boarding Platform** — the institution's **boarding system of
record**: the hostels it runs and the wardens who supervise them, the rooms and beds within them, the
students allocated beds (residents), the outpasses residents are granted to leave and return, the curfew
roll calls run against the boarders, and the statutory compliance of the residential plant. It is the
residential counterpart to the transport system (P2-D16): transport manages how students travel, this
domain manages where they live. Two decisions shape it: two quantities are **derived, not stored** — a
hostel's bed occupancy and a roll call's presence reconciliation — so the design begins with the two pure
engines; and **this domain carries no money** — hostel/mess fees belong to Finance (P2-D14) and facility
valuation/maintenance to the Asset register (P2-D15), so the fee/valuation boundary is held structurally.
Two boundaries define it: **descriptive, not predictive** (occupancy forecasting and demand planning are
deferred to the intelligence core, P2-D28), and identity is referenced not duplicated (a hostel's org is
an Organization, a warden is an Employee, a resident is a Student). Mess/dining menus, disciplinary and
health records (Learner Wellbeing, P2-D05), visitor management and fee collection are out of scope.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engines**          | Two pure, deterministic, clock-free engines built and tested first: `computeRoomOccupancy` / `computeHostelOccupancy` / `summarizeResidenceOccupancy` (active occupants against beds, rolled room → hostel → institution, over-capacity flagged); and `computeRollCall` (reconciles per-resident presence markings against the expected roster into counts and the **safety-critical unaccounted-for** number — the trip-occupancy analog)                                                                                                    |
| **Domain**           | `@knowget/residential` — eight aggregates (Hostel, Warden, Room, BedAllocation, Outpass, RollCall, HostelInspection, HostelOccupancyProfile), each an immutable aggregate + factory + guarded transitions with an application service; value objects (hostel/warden/room/allocation/outpass/roll-call/inspection statuses, types, roles, presence marks, compliance statuses); the Bed / RollCallMark line objects. **No money anywhere**                                                                                                     |
| **Persistence**      | Eight models in `schema.prisma` + one migration (`20261218000000_add_residential`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed, soft-delete + audit columns; bed counts/occupancy/percents/versions **INTEGER**, over-capacity **BOOLEAN**, room beds & roll-call roster/markings non-null **JSONB**, date/ISO stamps **TEXT**; tenant-scoped DB unique indexes (hostel code, one warden per employee, room number per hostel, one inspection per (hostel,type), one profile per hostel) |
| **API**              | Eight permission-gated, tenant-scoped REST controllers — `hostel/*` (hostels, wardens, rooms, inspections) under `hostel:read`/`:write` and `boarding/*` (allocations, outpasses, roll-calls, occupancy) under `boarding:read`/`:write`; zod DTOs; eight Prisma/RLS adapters + three directory adapters (Organization, Employee, Student); `ResidentialModule` importing the Organization, Workforce and Student-Lifecycle modules, registered in `app.module`                                                                                |
| **Events**           | Domain events — hostel registered/warden-assigned/warden-unassigned/maintenance/decommissioned; warden registered/suspended/reinstated/relieved; room drafted/made-available/maintenance/decommissioned; allocation created/ended; outpass requested/approved/rejected/checked-out/returned/cancelled; roll call scheduled/started/completed/cancelled; inspection recorded/reinspected; occupancy refreshed                                                                                                                                  |
| **Docs & decisions** | ADR-0036 (platform + the dual pure engines + the no-money operational boundary decision); this report; platform-state, technical-debt (TD-37) and CHANGELOG updates                                                                                                                                                                                                                                                                                                                                                                           |

## 3. Domain capabilities & invariants

- **Occupancy & presence are derived.** A hostel's bed occupancy is computed by the pure engine from its
  in-service rooms and their active allocations; a roll call's presence is reconciled from its
  append-only marking ledger against the captured roster, and the **unaccounted-for count** (the residents
  neither confirmed present nor on leave) is the safety-critical figure.
- **Residential masters.** A hostel `active ↔ under_maintenance → decommissioned` (code unique, active
  required to take rooms/allocations); a warden — a validated **Employee** — `active ↔ suspended →
relieved` (one per employee) with the org derived from the employee.
- **Rooms.** `draft → available → decommissioned`, **beds & floor frozen once available**, number unique
  per hostel; the bed count is capacity; an available room takes allocations.
- **Allocations.** A student's residency in a specific bed (`active → ended`), **one active per bed and
  one active per student**, validated against an available room and a real bed on it.
- **Outpasses.** A gate pass `requested → approved → checked_out → returned | rejected | cancelled` for a
  **current resident**, approval gated on an **active warden**, **one open per resident**, with a validated
  window and a **derived overdue** (checked out and past the expected return, clock-free).
- **Roll calls.** A curfew check that captures the roster from active allocations and takes one marking
  per resident (off-roster and duplicate marks rejected), the summary derived by the engine.
- **Compliance.** A hostel inspection (one per type per hostel) whose valid/due_soon/overdue status is
  **derived** from the next-due date as of a date — never stored.
- **Occupancy profile.** A descriptive read model, one per hostel, **refreshed** (version-bumped) from the
  occupancy engine; institution rollup via `summarizeResidenceOccupancy`. Descriptive only — **never a
  forecast** (P2-D28).

## 4. Verification

- **Pure-engine-first.** The two engines (room/hostel/institution occupancy; roll-call reconciliation)
  were built and exhaustively tested before any aggregate depended on them, over narrow views the
  aggregates structurally satisfy.
- **Tests.** `@knowget/residential` — **82 tests** (occupancy at every level; roll-call reconciliation
  with the unaccounted-for math; every aggregate lifecycle; the capacity/roster guards; outpass window
  and overdue; licence-free warden lifecycle; compliance-window date math; the one-active-per-bed/student
  and one-open-outpass invariants; and an end-to-end hostel → warden → room → allocation → occupancy →
  outpass → roll call → inspection spine asserting the domain publishes its events). `apps/api` — the
  residential DI-graph integration spec (2 tests) compiles the full module and asserts every service token
  resolves.
- **Gates.** `@knowget/residential` typecheck, ESLint, Prettier and build clean; `apps/api` typecheck
  clean. Full monorepo typecheck, lint and tests pass in-sandbox (residential 82, api 202); the full build
  and DB-integration tests are CI-verified (TD-12: the Prisma engine CDN is unreachable in the build
  sandbox).
- **Live RLS.** The migration was applied on a live PostgreSQL instance as a **non-superuser owner**;
  verified that tenant A sees only its own rows, tenant B sees zero, an unset tenant sees zero
  (fail-closed), a cross-tenant insert is rejected by `WITH CHECK` (SQLSTATE 42501), and the **JSONB (room
  beds / roll-call roster & markings), INTEGER (bed counts) and BOOLEAN (over-capacity) columns round-trip
  exactly**.
- **Independent audits.** Two adversarial audits (domain logic; persistence/API) reviewed the whole
  milestone. The persistence/API audit was **clean across all eight categories** (adapter field fidelity,
  JSONB round-trip, schema/migration/adapter consistency, FORCE RLS + WITH CHECK, uniqueness,
  status-filtered queries, controller scope split + route ordering, DI wiring). The domain audit was
  **clean on all critical/major items** (both engines, every state machine, the capacity/roster/overdue
  guards, the compliance date math, every service invariant); its two minor findings were **fixed before
  merge** — a missing draft-guard on `setRoomFloor` (now frozen once available like the beds), and
  `unassignWarden` now publishing a distinct `warden_unassigned` event.

## 5. Decisions

Recorded in **ADR-0036**: two pure engines (room/hostel/institution occupancy; roll-call reconciliation)
as the computational core built first; **no money — a deliberate operational boundary** (fees → Finance
P2-D14; facility valuation/maintenance → the Asset register P2-D15), held structurally; one package for
all eight aggregates; the hostel and warden residential masters; the room with beds frozen once available;
the allocation gated on an available room and a real bed with one-active-per-bed/student; the outpass for
a current resident with a derived overdue and one-open-per-resident; the roster-gated roll call with a
derived summary; the compliance inspection with a derived status; the descriptive occupancy profile;
**two scope pairs — `hostel:*` and `boarding:*`**; persistence per ADR-0010 with FORCE RLS verified live;
two status-scoped uniqueness invariants service-enforced (**TD-37**).

## 6. Technical debt

- **TD-37 (new, low).** The two **status-scoped uniqueness** invariants — one active bed allocation per
  bed, and one active allocation per student — are enforced in the service (check-then-act via
  `findActiveByBed` / `findActiveByStudent`), with no DB backstop, so concurrent writes have a TOCTOU
  window (the one-open-outpass-per-resident guard is similarly service-enforced). The domain's _absolute_
  uniques (hostel code, warden employee, room number per hostel, inspection-per-type, profile-per-hostel)
  all have DB `@@unique` indexes. A **partial** unique index (required because ended rows retain their
  bed/student values) would backstop each (ADR-0036). A later refinement behind the services (mirrors
  TD-26/TD-36).
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root.
- **TD-01 (standing).** Event delivery is in-process (outbox store in-memory); the residential events ride
  the same bus.

## 7. Outcome — merged to `main`, proceed to P2-D18

The Residential Life, Hostel & Boarding Platform is complete behind its gates: occupancy and presence are
derived consistently by pure engines, a bed and a student each hold one active allocation, a resident
holds one open outpass, the fee/valuation boundary is held structurally (no money in the domain), and all
eight tables are FORCE-RLS tenant-isolated (verified live, JSONB/INTEGER/BOOLEAN round-tripping exactly);
both independent audits were resolved clean. CI is green and the milestone is **merged to `main`
(`49143fc`)**; next is **P2-D18 — Knowledge Resource, Library & Digital Learning Asset**. **Reminder:
rotate the GitHub PAT** used for pushes at this milestone boundary.
