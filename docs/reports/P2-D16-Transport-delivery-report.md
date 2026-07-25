# Engineering Delivery Report — P2-D16

**Smart Mobility, Transport & Fleet Platform** · Phase 2 (Enterprise Domain Engineering) · Program: Workforce & Operations

|                |                                                                                                                                                                                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D16 — Smart Mobility, Transport & Fleet Platform                                                                                                                                                                                                                                                            |
| **Status**     | ✅ Complete — CI green; merged to `main` (`a0a5047`). In-sandbox: `@knowget/transport` typecheck/lint/format/build clean, **42 tests** (15 files); `apps/api` typecheck clean + transport DI-graph spec (2 tests); RLS verified on live PostgreSQL. Full monorepo typecheck/lint/tests green (TD-12 on build). |
| **Depends on** | P2-D12 (Workforce, ADR-0031 — the Employee base), P2-D03 (Student Lifecycle — the subscriber base), P2-D01-M01 (Organization), P2-D15 (Assets, ADR-0034 — the vehicle-as-capital counterpart), P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`)                                                                           |
| **Date**       | 17 December 2026                                                                                                                                                                                                                                                                                               |
| **Next**       | P2-D17 — Residential Life, Hostel & Boarding (next Program C contract)                                                                                                                                                                                                                                         |

---

## 1. Mission recap

Deliver the **Smart Mobility, Transport & Fleet Platform** — the institution's **transport system of
record**: the vehicles it runs and the drivers who operate them, the routes and stops they serve, the
vehicle→route assignments, the students who subscribe to transport, the trips run against those routes,
and the statutory compliance of the fleet. It is the operational counterpart to the Asset register
(P2-D15): the Asset register owns a vehicle as a depreciating capital item; this domain owns it as an
operating unit that runs routes and carries students. Two decisions shape it: two quantities are
**derived, not stored** — a route's arrival schedule and a trip's occupancy — so the design begins with
the two pure engines; and **this domain carries no money** — transport fees belong to Finance (P2-D14)
and vehicle valuation/maintenance to the Asset register (P2-D15), so the fee/valuation boundary is held
structurally. Two boundaries define it: **descriptive, not predictive** (route optimisation, demand
forecasting and predictive maintenance are deferred to the intelligence core, P2-D28), and identity is
referenced not duplicated (a vehicle's org is an Organization, a driver is an Employee, a subscriber is
a Student). Real-time GPS/telematics, route optimisation, fare/ticketing and prediction are out of scope.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engines**          | Two pure, deterministic, clock-free engines built and tested first: `computeRouteSchedule` (per-stop arrival ETAs, duration and final arrival from a departure and ordered stop offsets, validating consecutive sequences and strictly-increasing offsets) + `computeSeatUtilization` / `summarizeFleetUtilization`; and `computeTripOccupancy` (reconciles a boarding/alighting ledger into running-end and **peak** occupancy, flagging capacity-exceeded at the peak)                                                   |
| **Domain**           | `@knowget/transport` — eight aggregates (Vehicle, Driver, Route, VehicleAssignment, TransportSubscription, Trip, VehicleDocument, RouteUtilizationProfile), each an immutable aggregate + factory + guarded transitions with an application service; value objects (vehicle/driver/route/assignment/subscription/trip/document statuses, directions, ownerships, document/compliance/trip-event types); the RouteStop / TripEvent line objects. **No money anywhere**                                                      |
| **Persistence**      | Eight models in `schema.prisma` + one migration (`20261217000000_add_transport`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed, soft-delete + audit columns; capacities/offsets/percents/versions **INTEGER**, over-capacity/has-active-assignment **BOOLEAN**, route stops & trip events non-null **JSONB**, date/ISO stamps **TEXT**; tenant-scoped DB unique indexes (registration, licence, employee, code, one document per (vehicle,type), one profile per route) |
| **API**              | Eight permission-gated, tenant-scoped REST controllers — `fleet/*` (vehicles, drivers, documents) under `fleet:read`/`:write` and `transport/*` (routes, assignments, subscriptions, trips, utilization) under `transport:read`/`:write`; zod DTOs; eight Prisma/RLS adapters + three directory adapters (Organization, Employee, Student); `TransportModule` importing the Organization, Workforce and Student-Lifecycle modules, registered in `app.module`                                                              |
| **Events**           | Domain events — vehicle registered/maintenance/retired; driver registered/suspended/reinstated/deactivated; route activated/suspended/resumed/retired; assignment created/ended; subscription requested/activated/suspended/resumed/ended; trip scheduled/started/completed/cancelled; document recorded/renewed; utilization refreshed                                                                                                                                                                                    |
| **Docs & decisions** | ADR-0035 (platform + the dual pure engines + the no-money operational boundary decision); this report; platform-state, technical-debt (TD-36) and CHANGELOG updates                                                                                                                                                                                                                                                                                                                                                        |

## 3. Domain capabilities & invariants

- **Schedule & occupancy are derived.** A route's arrival schedule is computed by the pure engine from
  its stop offsets (validated strictly increasing); a trip's occupancy is reconciled from its
  append-only boarding ledger, and **a board that would exceed the captured seating capacity is
  rejected**, as is an alight of a student not currently onboard.
- **Fleet masters.** A vehicle `active ↔ under_maintenance → retired` (registration unique, capacity
  bounds occupancy); a driver — a validated **Employee** — `active ↔ suspended → deactivated` (licence
  unique + one per employee) with a clock-free licence-validity check.
- **Routes.** `draft → active → suspended → retired`, **stops frozen once active**, code unique per
  tenant; an active route takes assignments and subscriptions.
- **Assignments & subscriptions.** An assignment binds an **active** vehicle + a licensed **active**
  driver to an **active** route with the licence valid on the effective date, **one active per route**;
  a subscription is a student's enrollment (pickup/drop validated on the route), **one open per student
  per route**.
- **Compliance.** A vehicle document (one per type per vehicle) whose valid/expiring/expired status is
  **derived** from the expiry date as of a date — never stored.
- **Utilization.** A descriptive read model, one per route, **refreshed** (version-bumped) from the
  seat-utilization engine; fleet rollup via `summarizeFleetUtilization`. Descriptive only — **never a
  forecast** (P2-D28).

## 4. Verification

- **Pure-engine-first.** The two engines (route schedule + seat utilization; trip occupancy) were built
  and exhaustively tested before any aggregate depended on them, over narrow views the aggregates
  structurally satisfy.
- **Tests.** `@knowget/transport` — **42 tests** (schedule validation and ETAs; seat utilization and
  fleet rollup; occupancy reconciliation with peak-capacity detection; every aggregate lifecycle; the
  capacity and onboard guards; licence-validity and compliance-window date math; cross-aggregate
  assignment/trip validation; and an end-to-end vehicle → driver → route → assignment → subscription →
  trip → document → utilization spine). `apps/api` — the transport DI-graph integration spec (2 tests)
  compiles the full module and asserts every service token resolves.
- **Gates.** `@knowget/transport` typecheck, ESLint, Prettier and build clean; `apps/api` typecheck
  clean. Full monorepo typecheck, lint and tests pass in-sandbox (transport 42, api 200); the full
  build and DB-integration tests are CI-verified (TD-12: the Prisma engine CDN is unreachable in the
  build sandbox).
- **Live RLS.** The migration was applied on a live PostgreSQL instance as a **non-superuser owner**;
  verified that tenant A sees only its own rows, tenant B sees zero, an unset tenant sees zero
  (fail-closed), a cross-tenant insert is rejected by `WITH CHECK` (SQLSTATE 42501), and the **JSONB
  (route stops / trip events), INTEGER (capacity) and BOOLEAN (over-capacity) columns round-trip
  exactly**.
- **Independent audits.** Two adversarial audits (domain logic; persistence/API) reviewed the whole
  milestone and were **both clean**. The persistence/API audit verified adapter field fidelity across
  all eight aggregates, the JSONB round-trip, FORCE RLS + WITH CHECK on all eight tables, the
  uniqueness rules, the fleet/transport scope split, route non-collision, and DI wiring. The domain
  audit verified both engines, every state machine, the capacity/onboard guards and the licence /
  compliance date-boundary math (expiry-day inclusive), and every service invariant (one-active-per-
  route, one-open-per-student-route, active-and-licensed-on-date, stop-on-route, org-derived).

## 5. Decisions

Recorded in **ADR-0035**: two pure engines (route schedule + seat utilization; trip occupancy) as the
computational core built first; **no money — a deliberate operational boundary** (fees → Finance
P2-D14; vehicle valuation/maintenance → the Asset register P2-D15), held structurally; one package for
all eight aggregates; the vehicle and driver fleet masters; the route with stops frozen once active and
the schedule validated by the engine; the assignment/subscription/trip flow gated on active
route/vehicle/driver and a licence valid on the effective/service date, with the boarding ledger
capacity-enforced; the compliance document with a derived status; the descriptive utilization profile;
**two scope pairs — `fleet:*` and `transport:*`**; persistence per ADR-0010 with FORCE RLS verified
live; two status-scoped uniqueness invariants service-enforced (**TD-36**).

## 6. Technical debt

- **TD-36 (new, low).** The two **status-scoped uniqueness** invariants — one active vehicle assignment
  per route, and one open subscription per student per route — are enforced in the service (check-then-
  act via `findActiveByRoute` / `findOpenByStudentAndRoute`), with no DB backstop, so concurrent writes
  have a TOCTOU window. The domain's _absolute_ uniques (vehicle registration, driver licence and
  employee, route code, document-per-type, profile-per-route) all have DB `@@unique` indexes. A
  **partial** unique index (required because ended/retired rows retain their values) would backstop each
  (ADR-0035). A later refinement behind the services (mirrors TD-24/TD-26).
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root.
- **TD-01 (standing).** Event delivery is in-process (outbox store in-memory); the transport events ride
  the same bus.

## 7. Outcome — merged to `main`, proceed to P2-D17

The Smart Mobility, Transport & Fleet Platform is complete behind its gates: schedule and occupancy are
derived consistently by pure engines, a trip cannot be driven over its captured capacity, the fee/
valuation boundary is held structurally (no money in the domain), and all eight tables are FORCE-RLS
tenant-isolated (verified live, JSONB/INTEGER/BOOLEAN round-tripping exactly); both independent audits
were clean. CI is green and the milestone is **merged to `main` (`a0a5047`)**; next is **P2-D17 —
Residential Life, Hostel & Boarding**. **Reminder: rotate the GitHub PAT** used for pushes at this
milestone boundary.
