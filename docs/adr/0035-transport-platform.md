# 35. Smart Mobility, Transport & Fleet: one package, eight aggregates, two pure engines, and no money

- **Status:** Accepted
- **Date:** 2026-12-17
- **Contract:** P2-D16 (Smart Mobility, Transport & Fleet Platform)

## Context

P2-D16 is the fifth contract of **Program C** (the operational institution), on the certified `v0.2.0`
baseline, the frozen Phase-1 core, the P2-D01-M01 organization base, the P2-D12 workforce base and the
P2-D03 student base. It is the authoritative domain for **the institution's transport operations**: the
vehicles it runs and the drivers who operate them, the routes and stops they serve, the vehicle→route
assignments, the students who subscribe to transport, the trips run against those routes, and the
statutory compliance of the fleet. It is the operational counterpart to the resource system of record
(P2-D15, Assets): the Asset register owns a vehicle as a depreciating capital item; this domain owns it
as an operating unit that runs routes and carries students.

Two decisions shape the design. First, two quantities are **derived, not stored** — a route's stop
**arrival schedule** (from a departure time and per-stop offsets) and a trip's **occupancy** (the
reconciliation of its boarding/alighting ledger against the vehicle's seats) — so, as with every
operational domain, the design begins with the pure engines that compute them, not with an aggregate.
Second, and distinctively, **this domain carries no money.** Transport fees belong to Finance (P2-D14),
and a vehicle's acquisition value and maintenance cost belong to the Asset register (P2-D15). Keeping
money out entirely — rather than duplicating a money core as the resource domain had to (ADR-0034) —
keeps this bounded context purely operational and its dependencies minimal.

Two boundaries bound it. First, **prediction is not here** — route optimisation, demand forecasting and
predictive maintenance are reserved for the **intelligence core (P2-D28)**; the utilization profile and
the occupancy figure are descriptive and derived, never a forecast. Second, **identity is not here** — a
vehicle's organization is an **Organization (P2-D01-M01)**, a driver is an **Employee (P2-D12)**, and a
subscriber is a **Student (P2-D03)**, each referenced by id and never re-modelled.

## Decision

1. **Two pure engines are the computational core, built and tested first.** `computeRouteSchedule` turns
   a route's ordered stops (each a 1-based sequence and a whole-minute offset from departure) plus a
   departure minute-of-day into per-stop arrival times, the total run duration and the final arrival,
   **validating that sequences are consecutive from 1 and offsets strictly increase** so a malformed
   stop list can never yield a schedule; `computeSeatUtilization` / `summarizeFleetUtilization` value a
   route's capacity against its subscribers and roll routes up. `computeTripOccupancy` reconciles a
   trip's ordered boarding/alighting events into the running-end and **peak** occupancy and flags
   whether the peak **exceeded capacity** — the transport analog of the stock-balance engine. All are
   pure, deterministic and **clock-free** (the caller passes the departure/as-of values).

2. **This domain has no money — a deliberate operational boundary.** Transport fees are billed by
   Finance (P2-D14); a vehicle's capital value and maintenance cost are the Asset register's (P2-D15).
   `@knowget/transport` therefore imports no money core and defines no monetary field. This is the
   defining scoping decision: the domain is purely operational, and the fee/valuation boundary is held
   structurally (there is nowhere to put an amount).

3. **One domain package, `@knowget/transport`, for all eight aggregates** — the same
   single-bounded-context choice as the fourteen prior domains (ADR-0021…0034). A shared spine
   (`errors.ts`, `ports.ts`, `transport-events.ts`, `transport-value.ts`, `transport-view.ts`,
   `index.ts`), the two engines, a per-aggregate pair (`<aggregate>.ts` + `<aggregate>-service.ts`), and
   the stop / trip-event line value objects.

4. **The vehicle and driver are the fleet masters.** A vehicle carries a registration (unique per
   tenant), a **seating capacity** that bounds trip occupancy and an ownership (owned vs contracted); it
   runs `active ↔ under_maintenance → retired`, and only an active vehicle is assignable. A driver is a
   staff member (**Employee, P2-D12**) with a licence number (unique per tenant), class and **expiry**;
   it runs `active ↔ suspended → deactivated`, its organization is derived from the employee, and one
   driver is allowed per employee. Identity lives in the workforce domain and is never duplicated.

5. **The route is an ordered set of stops served from a scheduled departure.** A route carries a code
   (unique per tenant), a direction (pickup/drop/both) and an ordered stop list (each stop a stable
   `key`, a name and a minute offset); it runs `draft → active → suspended → retired`. **Stops are
   editable only while draft and frozen once active**, and the pure schedule engine validates the offsets
   strictly increase, so an active route always has a coherent schedule. Assignments and subscriptions
   attach to an active route.

6. **A vehicle assignment binds an active vehicle and a licensed, active driver to an active route.** It
   runs `active → ended`; the service validates the route, vehicle and driver all exist and are active
   (and the **driver's licence is valid on the effective date**), and enforces **one active assignment
   per route** (the prior must be ended first). The organization is derived from the route.

7. **A transport subscription is a student's enrollment on a route.** It carries a pickup and a drop
   stop key (validated against the route) and runs `requested → active → suspended → ended`; the service
   derives the organization from the student, requires an active route, and enforces **one open
   subscription per student per route**. The active subscriber count feeds seat utilization.

8. **A trip is a run of a route, and boarding is capacity-enforced.** A trip carries the vehicle's
   **captured seating capacity** and an ordered boarding-event ledger; it runs `scheduled → in_progress
→ completed | cancelled`. While in progress it accumulates events: a `boarded` event is **rejected if
   the trip is already at capacity** (checked via the occupancy engine over prior events), and an
   `alighted` event is **rejected if the student is not currently onboard**. Scheduling validates the
   same route/vehicle/driver-active + licence-valid rules as an assignment; the organization is derived
   from the route.

9. **A vehicle document is a compliance record; its status is derived.** A document (insurance, fitness,
   permit, pollution, road tax) carries a number and issue/expiry dates, **one per type per vehicle**
   (renewed in place). Its compliance — `valid`, `expiring` within a warning window (default 30 days,
   inclusive of the expiry day), or `expired` — is computed from the expiry date as of a given date,
   **never stored**. The organization is derived from the vehicle.

10. **The route utilization profile is a descriptive read model, never a transaction.** One per route,
    it carries the assigned vehicle capacity (0 when unassigned), the active subscriber count, the seats
    available and utilization percent, and whether the route is over capacity — all produced by the pure
    seat-utilization engine and **refreshed** (version-bumped) whenever the route's subscriptions or
    assignment change. The fleet rollup runs `summarizeFleetUtilization`. It is always derived, never
    posted to directly.

11. **Two permission scope pairs split the platform along its operational boundary.** `fleet:read`/
    `fleet:write` gate the physical fleet and the people and compliance behind it (vehicles, drivers,
    documents), held by the transport/workshop team; `transport:read`/`transport:write` gate the
    operations (routes, assignments, subscriptions, trips, utilization), held by the
    transport-operations/routing team. The two are separately administered, so they do not share a scope.

12. **Persistence per ADR-0010, no money.** Eight tables (`vehicle`, `driver`, `route`,
    `vehicle_assignment`, `transport_subscription`, `trip`, `vehicle_document`,
    `route_utilization_profile`) with Prisma/RLS adapters at the `apps/api` composition root (TD-21).
    Every table has `ENABLE` and `FORCE ROW LEVEL SECURITY` and the standard `tenant_isolation` policy
    (both USING and WITH CHECK, fail-closed) — verified on live PostgreSQL. Capacities, offsets, percents
    and versions are **INTEGER**; over-capacity and has-active-assignment are **BOOLEAN**; a route's
    ordered stops and a trip's boarding events are non-null **JSONB**; date-only and ISO-stamp values are
    **TEXT**; the uniqueness rules (vehicle registration, driver licence and employee, route code, one
    document per (vehicle, type), one profile per route) are tenant-scoped DB unique indexes.

13. **Domain events on the platform bus** — vehicle registered/sent-to-maintenance/returned/retired;
    driver registered/suspended/reinstated/deactivated; route activated/suspended/resumed/retired;
    assignment created/ended; subscription requested/activated/suspended/resumed/ended; trip
    scheduled/started/completed/cancelled; document recorded/renewed; utilization refreshed.

14. **Cross-domain references enter through directory ports.** Organization (P2-D01-M01), Employee
    (P2-D12) and Student (P2-D03) existence are validated on write; a driver derives its org from the
    employee, a subscription from the student, and an assignment/trip/document from the route/vehicle.
    The transport domain links to those domains and never depends on their packages directly.

15. **Two status-scoped uniqueness invariants are service-enforced (TD-36).** "One active assignment per
    route" and "one open subscription per student per route" are enforced by a check-then-act in the
    service (there is no DB backstop, so a TOCTOU window exists under concurrency), whereas the domain's
    _absolute_ uniques (registration, licence, employee, code, document-per-type, profile-per-route) all
    have DB unique indexes. Partial unique indexes would close the window; recorded as **TD-36**.

16. **Explicit non-goals.** No real-time GPS/telematics tracking or live ETA streaming (an IoT/edge
    integration, P3), no automated route optimisation or vehicle routing, no fare/ticketing or fee
    collection (Finance owns money), no fuel/odometer/telematics capture, and no prediction — demand
    forecasting, route optimisation and predictive maintenance are the intelligence core (P2-D28). This
    domain is the transport system of record those build on.

## Consequences

- **A unified transport system of record.** An institution manages its fleet, drivers, routes,
  assignments, student subscriptions, trips and vehicle compliance in one place, on top of the
  organization, workforce and student bases, with a descriptive utilization profile and fleet rollup.
- **Schedule and occupancy are exact and consistent by construction.** A route's arrival schedule and a
  trip's occupancy are computed by pure engines from primary data (stop offsets; the boarding ledger),
  so every reader gets the same figure; a trip can never be driven over its captured capacity, and a
  student can never alight a trip they never boarded.
- **The money boundary is held structurally.** With no monetary field anywhere in the domain, transport
  fees cannot leak in — they stay in Finance — and the domain's dependencies stay minimal (no money core
  to duplicate, unlike the resource domain).
- **A pure, testable core.** The two engines are pure functions over narrow views — package tests
  exercise schedule validation and ETAs, seat utilization, occupancy reconciliation with peak-capacity
  detection, every aggregate lifecycle, the capacity/onboard guards, the licence-validity and
  compliance-window date math, and an end-to-end vehicle → driver → route → assignment → subscription →
  trip → document → utilization spine.
- **Isolation.** All eight tables are FORCE-RLS tenant-isolated and fail-closed, verified on live
  PostgreSQL with the JSONB, INTEGER and BOOLEAN columns round-tripping exactly; the uniqueness rules are
  tenant-scoped at the DB. Two independent adversarial audits (domain; persistence/API) were clean.
- **Deferred, interface-protected.** Two status-scoped uniqueness invariants are service-enforced
  (**TD-36**); domain Prisma adapters remain at the composition root (TD-21). One cohesive package,
  acceptable for a single bounded context (as with the fourteen prior domains). This is the fifth
  contract of **Program C** and the transport base the operational and intelligence-core domains build on.
