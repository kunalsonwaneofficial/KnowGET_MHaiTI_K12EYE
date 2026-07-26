# 39. Campus Infrastructure, Facilities & Smart Environment: one package, eight aggregates, two pure engines, immutable telemetry, and no money

- **Status:** Accepted
- **Date:** 2026-12-21
- **Contract:** P2-D20 (Campus Infrastructure, Facilities & Smart Environment Platform)

## Context

P2-D20 is **the second contract of Program D — Campus & Engagement** (D19–D24), on the certified `v0.2.0`
baseline, the frozen Phase-1 core, the P2-D01-M01 organization base and the P2-D12 workforce base. It is
the authoritative domain for **the institution's built environment and its smart-environment telemetry**:
the buildings on the campus and the spaces within them, the fixed infrastructure systems that serve them
(HVAC, electrical, plumbing, elevators, fire-safety, network, water), the smart sensors installed in spaces
and the environment readings they capture, the operational maintenance work raised against the estate, the
comfort policy that judges a space's environment, and the descriptive per-building condition profile. It is
a peer of the operational domains delivered before it (transport P2-D16, residential P2-D17, library
P2-D18, health-centre P2-D19): those manage how students travel, where they live, what they read and the
care they receive; this one manages the physical plant and its environment those services run inside.

Three decisions shape the design. First, several quantities are **derived, not stored** — a building's
**condition** (its live spaces and their capacities, its operational systems, a readiness percent, rolled
building → campus), a fixed system's **service status** (ok / due-soon / overdue against its next-due
date), and a space's **comfort band** (its latest readings measured against the acceptable ranges) — so, as
with every operational domain, the design begins with the pure engines that compute them, not with an
aggregate. Second, **this domain carries no money** — asset value and the cost of maintenance are
Procurement & Assets' (P2-D15) and utility billing is Finance's (P2-D14). Third, and distinctively, one
aggregate is **immutable append-only telemetry**: an environment reading is a single numeric sample that,
once captured, never changes — a correction is a new reading, never an edit — and the latest reading per
(space, metric) is what the comfort engine consumes.

Two boundaries bound it. First, and definingly, **the movable, capitalized asset is not here** — the
Asset register, asset depreciation and _costed_ asset maintenance belong to **Procurement & Assets
(P2-D15)**. This domain owns the **immovable built environment** (the structures, the spaces, the fixed
systems) and its **operational, no-money work queue** (a maintenance order records _what work_ and _who_,
never _what it cost_); where a work order would carry a cost or draw on stock, that remains P2-D15's write.
Second, **prediction is not here** — failure forecasting, energy optimization and predictive maintenance
are reserved for the **intelligence core (P2-D28)**; the facility profile is descriptive and derived, never
a forecast. Identity is referenced, not re-modelled: a building's organization is an **Organization
(P2-D01-M01)**, and a maintenance-order assignee is an **Employee (P2-D12)**.

## Decision

1. **Two pure engines are the computational core, built and tested first.** The **condition engine**
   (`computeBuildingCondition`, `summarizeCampusCondition`, `computeServiceStatus`): the first rolls a
   building's spaces and fixed systems into a condition picture (space and system counts, total and
   available capacity, a readiness percent), the second rolls buildings into the campus picture, and the
   third derives a fixed system's service status as of a date from its last-serviced date and interval
   (due-soon within an inclusive warning window, overdue past the next-due date; a never-serviced system
   has no computable due date). The **comfort engine** (`computeComfortIndex`) measures a space's latest
   readings against the acceptable per-metric ranges, returning a band (comfortable / marginal / poor) and
   the breaching metrics. All are pure, deterministic and **clock-free** — service status is measured in
   **days**, comfort in a **band**, never money.

2. **Decommissioned spaces and systems are terminal and leave the live inventory.** The condition engine
   excludes decommissioned spaces and systems from the counts and total capacity — a retired wing must not
   permanently depress a building's readiness. Draft and out-of-service spaces still count toward the total
   (future / temporarily-down capacity); only `available` capacity counts as ready.

3. **This domain has no money — a deliberate physical-plant boundary.** Asset value and the cost of
   maintenance are Procurement & Assets' (P2-D15) and utility billing is Finance's (P2-D14).
   `@knowget/facilities` imports no money core and defines no monetary field: floors, floor, capacity,
   service intervals, counts, percents and versions are all **integers**; a sensor reading value is a
   **float** (a physical measurement); nothing is a currency amount.

4. **One aggregate is immutable append-only telemetry.** An `EnvironmentReading` is a single numeric sample
   of a metric captured by a sensor in a space at a moment; it has no lifecycle and no edit or delete path
   (its repository deliberately omits `remove`). The latest reading per (space, metric) feeds the comfort
   engine. This is the one high-volume, write-once table in the domain.

5. **One domain package, `@knowget/facilities`, for all eight aggregates** — the same
   single-bounded-context choice as the eighteen prior domains (ADR-0021…0038). A shared spine
   (`errors.ts`, `ports.ts`, `facilities-events.ts`, `facilities-value.ts`, `facilities-view.ts`,
   `index.ts`), the two engines, and a per-aggregate pair (`<aggregate>.ts` + `<aggregate>-service.ts`),
   plus the `comfort-assessment-service.ts` integration spine.

6. **The building and space are the estate masters.** A building carries a code (unique per tenant), a name,
   a type (academic/administrative/laboratory/sports/library/utility/multipurpose) and a floor count; it
   runs `active ↔ under_renovation → decommissioned`, and only an active building takes spaces, systems and
   sensors. A space is a room or area within a building with a code (unique per building), a type, a floor
   and a usable capacity; it runs `draft → available ↔ out_of_service → decommissioned` — **its floor is
   frozen once it enters service** (a structural fact) while its capacity remains reconfigurable. Terminal
   states are frozen: a decommissioned building cannot be renamed or re-floored, a decommissioned space
   cannot have its type or capacity changed.

7. **A facility system is fixed infrastructure feeding the service-status helper.** A system serving a
   building (HVAC/electrical/plumbing/elevator/fire-safety/network/water) with a code (unique per building),
   a commissioned date, a service interval and a last-serviced date; it runs `operational ↔
under_maintenance → decommissioned`. Its service status (ok/due-soon/overdue) is **derived** by the
   engine, never stored. Its capital value and costed maintenance are the Asset register's (P2-D15).

8. **A sensor is a smart-environment device; its readings are immutable.** A sensor installed in a space
   reads one metric (temperature/humidity/CO₂/occupancy/energy/water) with a code (unique per tenant) and an
   optional unit; it runs `active ↔ inactive → retired`, and its organization and building are derived from
   the space. Readings are recorded only against an active sensor. **At most one active sensor per (space,
   metric)** is service-enforced, on both install and reactivation.

9. **A maintenance order is the operational, no-money work queue.** A work order raised against a building
   and, optionally, a specific space and/or fixed system, with a code (unique per tenant), a short summary,
   a category (repair/inspection/cleaning/upgrade/safety) and a priority; it runs `reported → assigned →
in_progress → completed`, with `cancelled` reachable from any open state. An assignee is an **Employee
   (P2-D12)**, validated on assignment. It records _what work_ and _who_ — **never a cost**; costed asset
   maintenance is Procurement & Assets'.

10. **The comfort policy is versioned configuration; the comfort assessment is the integration spine.** A
    comfort policy is a named, versioned set of per-metric acceptable ranges (min/max, validated: known
    metric, finite bounds, min ≤ max, no duplicate) held as **JSONB**; it runs `draft → active → archived`,
    its thresholds and name editable only while draft (an active version is immutable), and **at most one
    policy is active per organization** (service-enforced). The comfort assessment service — the
    smart-environment integration spine — resolves a space's organization, reads its active policy's
    thresholds, pulls the latest reading per metric in the space, and runs the comfort engine over the two;
    with no active policy there are no thresholds to breach, so the space reads comfortable. A pure read: no
    events, no writes.

11. **The facility profile is a descriptive read model, never a transaction.** One per building, it carries
    the building's condition (from the condition engine over its spaces and systems) plus its count of open
    maintenance orders, **refreshed** (overwritten) whenever the estate changes; every field is derived and
    re-derivable, so it holds no truth of its own. The campus rollup runs `summarizeCampusCondition`. It is
    always derived, never posted to directly, and **never a forecast** (P2-D28).

12. **Two permission scope pairs split the platform along its physical boundary.** `facilities:read`/
    `facilities:write` gate the **immovable built environment and its operational work** (buildings, spaces,
    fixed systems, maintenance orders, the per-building condition profile), held by facilities management;
    `environment:read`/`environment:write` gate the **smart environment** (sensors, telemetry readings,
    comfort policies, the live comfort assessment), administered by the building-management-systems / IoT
    function. The two are separately administered, so they do not share a scope. Nothing is billed here
    (asset cost is Procurement & Assets', utility billing is Finance's); neither is gated.

13. **Persistence per ADR-0010, no money.** Eight tables (`building`, `space`, `facility_system`, `sensor`,
    `environment_reading`, `maintenance_order`, `comfort_policy`, `facility_profile`) with Prisma/RLS
    adapters at the `apps/api` composition root (TD-21). Every table has `ENABLE` and `FORCE ROW LEVEL
SECURITY` and the standard `tenant_isolation` policy (both USING and WITH CHECK, fail-closed) — verified
    on live PostgreSQL. Floors, floor, capacity, service intervals, counts, percents and versions are
    **INTEGER**; a sensor reading value is **FLOAT** (`DOUBLE PRECISION`); comfort thresholds are **JSONB**;
    date-only and ISO-stamp values (commissioned/last-serviced/recorded/reported/assigned/completed/
    refreshed stamps) are **TEXT**. Uniqueness is tenant-scoped at the DB: building code, space and
    facility-system code per building, sensor and maintenance-order code, one profile per building.

14. **Domain events on the platform bus carry no money and no free text** — building registered/renamed/
    floors-set/renovation-started/renovation-completed/decommissioned; space created/reconfigured/
    made-available/taken-out-of-service/returned-to-service/decommissioned; system commissioned/serviced/
    interval-set/sent-to-maintenance/returned-to-service/decommissioned; sensor installed/unit-set/
    deactivated/reactivated/retired; reading recorded; maintenance reported/assigned/reassigned/
    reprioritized/started/completed/cancelled; comfort policy drafted/updated/activated/archived; facility
    profile refreshed. Payloads carry ids, codes, types, statuses, versions and counts only — never a
    maintenance summary or a policy name.

15. **Cross-domain references enter through directory ports.** Organization (P2-D01-M01) and Employee
    (P2-D12, the work-order assignees) existence are validated on write; a space/system/maintenance-order
    derives its org from an active building, a sensor and reading derive org/building (and metric) from the
    space/sensor, and a comfort policy attaches to an organization. The facilities domain links to those
    domains and never depends on their packages directly.

16. **Two status-scoped uniqueness invariants are service-enforced (TD-40).** "One active sensor per
    (space, metric)" and "one active comfort policy per organization" are enforced by a check-then-act in
    their services (there is no DB backstop, so a TOCTOU window exists under concurrency); the domain's
    _absolute_ uniques (building/space/system/sensor/maintenance codes, one profile per building) all have
    DB unique indexes. Partial unique indexes would close the window; recorded as **TD-40**.

17. **Explicit non-goals.** No movable/capitalized asset register, asset depreciation or costed asset
    maintenance (Procurement & Assets, P2-D15, owns them), no utility billing or metering charges (Finance,
    P2-D14), no BMS/IoT device-protocol integration or real-time streaming ingest (readings enter through
    the API), no space-booking or room-reservation scheduling, and no prediction — failure forecasting,
    energy optimization and predictive maintenance are the intelligence core (P2-D28). This domain is the
    operational built-environment system of record those build on.

## Consequences

- **A unified built-environment system of record.** An institution runs its buildings, spaces, fixed
  systems, sensors, environment telemetry, maintenance work and comfort policy in one place, on top of the
  organization and workforce bases, with a descriptive per-building condition profile and campus rollup.
- **Condition, service status and comfort are exact and consistent by construction.** A building's
  condition, a system's service status and a space's comfort band are computed by pure engines from primary
  data, so every reader gets the same figure and nothing drifts from a stored copy.
- **The money boundary is held structurally.** With no monetary field anywhere, asset value, maintenance
  cost and utility billing cannot leak in — they stay in Procurement & Assets and Finance. A maintenance
  order is operational, not financial.
- **The immovable/movable boundary is held structurally.** The domain models the built environment and its
  fixed systems, not the movable capitalized asset, so it cannot duplicate or drift from the P2-D15 asset
  register.
- **Telemetry is write-once.** Environment readings are immutable and append-only, so the comfort engine
  always measures against captured facts and a reading can never be silently rewritten.
- **A pure, testable core.** The two engines are pure functions over narrow views — package tests exercise
  building condition and the campus rollup (including the decommissioned-excluded rule), service status
  (due-soon/overdue/never-serviced), the comfort band and breach detection, every aggregate lifecycle
  (including the terminal-state freezes), the one-active-sensor-per-(space,metric) and
  one-active-policy-per-org invariants, the money-free content of every event, and an end-to-end building →
  space → system → sensor → reading → maintenance → policy → assessment → profile spine.
- **Isolation.** All eight tables are FORCE-RLS tenant-isolated and fail-closed, verified on live
  PostgreSQL with the INTEGER, FLOAT, JSONB and TEXT columns round-tripping exactly and a cross-tenant
  INSERT rejected (SQLSTATE 42501); the uniqueness rules are tenant-scoped at the DB. Two independent
  adversarial audits (domain; persistence/API) were run — the persistence/API audit clean across all
  categories, the domain audit with six consistency/semantics findings all fixed before merge (terminal-
  state guards for space type, building rename/floors and sensor unit; the sensor-reactivate self-exclusion;
  the decommissioned-excluded condition rollup; the free-text-free comfort-policy event).
- **Deferred, interface-protected.** Two status-scoped uniqueness invariants are service-enforced
  (**TD-40**); domain Prisma adapters remain at the composition root (TD-21). One cohesive package,
  acceptable for a single bounded context (as with the eighteen prior domains). This is the second contract
  of **Program D** and the operational built-environment base the campus and intelligence-core domains build
  on.
