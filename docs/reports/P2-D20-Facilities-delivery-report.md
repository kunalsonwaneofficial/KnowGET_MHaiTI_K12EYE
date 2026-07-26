# Engineering Delivery Report — P2-D20

**Campus Infrastructure, Facilities & Smart Environment Platform** · Phase 2 (Enterprise Domain Engineering) · Program: Campus & Engagement

|                |                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D20 — Campus Infrastructure, Facilities & Smart Environment Platform                                                                                                                                                                                                                                                                                                                                             |
| **Status**     | ✅ Complete — CI green; merged to `main` (`7436798`). In-sandbox: `@knowget/facilities` typecheck/lint/format/build clean, **72 tests** (19 files); `apps/api` typecheck/lint/build clean + facilities DI-graph spec (2 tests) in the 208-test api suite; RLS verified on live PostgreSQL. Full monorepo typecheck/lint/tests green (**245** prisma-independent turbo tasks; TD-12 on the Prisma build in-sandbox). |
| **Depends on** | P2-D01-M01 (Organization — the campus-node base), P2-D12 (Workforce, ADR-0031 — the Employee base for maintenance assignees), P2-D15 (Procurement & Assets, ADR-0034 — where the movable capitalized asset + costed maintenance live), P2-D19 (Health Centre, ADR-0038 — the Program D operational-domain precedent), P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`)                                                         |
| **Date**       | 21 December 2026                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Next**       | P2-D21 — Campus Security, Safety & Visitor (next Program D contract)                                                                                                                                                                                                                                                                                                                                                |

---

## 1. Mission recap

Deliver the **Campus Infrastructure, Facilities & Smart Environment Platform** — the institution's
**built-environment system of record** and the **second contract of Program D (Campus & Engagement)**: the
buildings on the campus and the spaces within them, the fixed infrastructure systems that serve them, the
smart sensors installed in spaces and the environment readings they capture, the operational maintenance
work raised against the estate, the comfort policy that judges a space's environment, and the descriptive
per-building condition profile. Three decisions shape it: several quantities are **derived, not stored** — a
building's condition (rolled building → campus), a system's service status and a space's comfort band — so
the design begins with two pure engines; **this domain carries no money** — asset value and costed
maintenance are Procurement & Assets' (P2-D15) and utility billing is Finance's (P2-D14); and,
distinctively, one aggregate is **immutable append-only telemetry** — an environment reading is captured
once and never edited. Two boundaries define it: **the movable, capitalized asset is not here** (the asset
register, depreciation and _costed_ maintenance belong to Procurement & Assets, P2-D15; this domain owns the
immovable built environment and its operational, no-money work queue); and **descriptive, not predictive**
(failure forecasting, energy optimization and predictive maintenance are the intelligence core, P2-D28).
Identity is referenced not duplicated — a building's org is an Organization, a work-order assignee an
Employee. BMS/IoT device-protocol integration, real-time streaming ingest, space booking and utility
metering are out of scope.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engines**          | Two pure, deterministic, clock-free engines built and tested first: the **condition engine** (`computeBuildingCondition` / `summarizeCampusCondition` — a building's live spaces and systems, capacities and a readiness percent, rolled building → campus, **decommissioned excluded**; plus `computeServiceStatus` — a system's ok/due-soon/overdue against its next-due date, **days never money**); and the **comfort engine** (`computeComfortIndex` — a space's latest readings measured against per-metric ranges into a comfortable/marginal/poor band)                               |
| **Domain**           | `@knowget/facilities` — eight aggregates (Building, Space, FacilitySystem, Sensor, EnvironmentReading, MaintenanceOrder, ComfortPolicy, FacilityProfile), each an immutable aggregate + factory + guarded transitions with an application service, plus the `ComfortAssessmentService` integration spine; value objects (building/space/system/sensor/maintenance/policy statuses, types, metrics, categories, priorities, bands). **No money; immutable telemetry; money-free, free-text-free events**                                                                                       |
| **Persistence**      | Eight models in `schema.prisma` + one migration (`20261221000000_add_facilities`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed, soft-delete + audit columns; counts/capacities/floors/intervals/percents/versions **INTEGER**, the sensor reading value **FLOAT** (`DOUBLE PRECISION`), comfort thresholds **JSONB**, date/ISO stamps **TEXT**; tenant-scoped DB unique indexes (building code, space + facility-system code per building, sensor + maintenance code, one profile per building)                                           |
| **API**              | Nine permission-gated, tenant-scoped REST controllers — `facilities/*` (buildings, spaces, systems, maintenance orders, the condition profile) under `facilities:read`/`:write` and `environment/*` (sensors, readings, comfort policies, the live comfort assessment) under `environment:read`/`:write`; zod DTOs; eight Prisma/RLS adapters + two directory adapters (Organization, Employee); `FacilitiesModule` importing the Organization and Workforce modules, registered in `app.module`                                                                                              |
| **Events**           | Money-free, free-text-free domain events — building registered/renamed/floors-set/renovation-started/renovation-completed/decommissioned; space created/reconfigured/made-available/taken-out-of-service/returned-to-service/decommissioned; system commissioned/serviced/interval-set/sent-to-maintenance/returned-to-service/decommissioned; sensor installed/unit-set/deactivated/reactivated/retired; reading recorded; maintenance reported/assigned/reassigned/reprioritized/started/completed/cancelled; comfort policy drafted/updated/activated/archived; facility profile refreshed |
| **Docs & decisions** | ADR-0039 (platform + the dual pure engines + the no-money decision + the immutable-telemetry choice + the P2-D15 immovable/movable boundary); this report; platform-state, technical-debt (TD-40) and CHANGELOG updates                                                                                                                                                                                                                                                                                                                                                                       |

## 3. Domain capabilities & invariants

- **Condition, service status & comfort are derived.** A building's condition (and the campus rollup) is
  computed by the pure engine from its live spaces and systems; a system's service status is computed from
  its last-serviced date and interval; a space's comfort band is computed from its latest readings against
  the active policy — never stored. **Decommissioned spaces and systems are excluded** from the condition
  counts and total capacity, so a retired wing never permanently depresses readiness.
- **Estate masters.** A building `active ↔ under_renovation → decommissioned` (code unique per tenant, a
  floor count, active required to take spaces/systems/sensors, terminal state frozen against edits); a space
  `draft → available ↔ out_of_service → decommissioned` (code unique per building, **floor frozen once in
  service**, capacity reconfigurable, terminal state frozen).
- **Fixed systems.** A facility system `operational ↔ under_maintenance → decommissioned` (code unique per
  building, a service interval + last-serviced date); its ok/due-soon/overdue **service status is derived**,
  never stored. Its capital value and costed maintenance are Procurement & Assets' (P2-D15).
- **Smart environment.** A sensor `active ↔ inactive → retired` (code unique per tenant, one metric, org/
  building derived from the space); **at most one active sensor per (space, metric)**, on install and
  reactivation. An environment reading is an **immutable append-only** float sample — no edit, no delete —
  feeding the comfort engine.
- **Operational maintenance, no money.** A maintenance order `reported → assigned → in_progress → completed`
  (or `cancelled` from any open state) against a building/space/system, with an **Employee** assignee
  validated on assignment; it records _what work_ and _who_, **never a cost**.
- **Comfort policy & assessment.** A comfort policy `draft → active → archived` (versioned per-metric
  thresholds in **JSONB**, validated; thresholds/name frozen once active; **one active per org**). The
  comfort-assessment service — the smart-environment spine — measures a space's latest readings against its
  org's active policy via the comfort engine (comfortable when no policy is active).
- **Facility profile.** A descriptive read model, one per building, **refreshed** from the condition engine
  plus the open-maintenance count; campus rollup via `summarizeCampusCondition`. Descriptive only — **never a
  forecast** (P2-D28).
- **Money-free, free-text-free events.** No event payload carries a cost, a maintenance summary or a policy
  name — only ids, codes, types, statuses, versions and counts.

## 4. Verification

- **Pure-engine-first.** The two engines (condition; comfort) were built and exhaustively tested before any
  aggregate depended on them, over narrow views the aggregates structurally satisfy.
- **Tests.** `@knowget/facilities` — **72 tests** (building condition + campus rollup incl. the
  divide-by-zero and the decommissioned-excluded rule; service status due-soon/overdue/never-serviced; the
  comfort band + breach detection; every aggregate lifecycle incl. the terminal-state freezes and the
  floor-frozen-in-service rule; the one-active-sensor-per-(space,metric) and one-active-policy-per-org
  invariants; the money-free/free-text-free event content; and an end-to-end building → space → system →
  sensor → reading → maintenance → policy → assessment → profile spine). `apps/api` — the facilities DI-graph
  integration spec (2 tests) compiles the full module and asserts every service token resolves.
- **Gates.** `@knowget/facilities` typecheck, ESLint, Prettier and build clean; `apps/api` typecheck, ESLint
  and build clean. Full monorepo typecheck, lint and tests pass in-sandbox (facilities 72, api 208; all
  **245** prisma-independent turbo tasks green); the full Prisma build and DB-integration tests are
  CI-verified (TD-12: the Prisma engine CDN is unreachable in the build sandbox).
- **Live RLS.** The migration was applied on a live PostgreSQL instance as a **non-superuser owner**;
  verified that tenant A and tenant B each see only their own rows, an unset tenant sees zero (fail-closed),
  a cross-tenant insert is rejected by `WITH CHECK` (SQLSTATE 42501), FORCE RLS + the `tenant_isolation`
  policy is present on all eight tables (8/8), and the **FLOAT sensor value, the JSONB comfort thresholds and
  the INTEGER values round-trip exactly**.
- **Independent audits.** Two adversarial audits (domain logic; persistence/API) reviewed the whole
  milestone. The persistence/API audit was **clean across all categories** (schema/migration column-by-column
  parity incl. the FLOAT/JSONB columns, adapter field fidelity incl. the append-only reading repository,
  correct delegates + status-filtered queries, port conformance, controller scope split + route ordering,
  DTO/enum parity, DI wiring). The domain audit was **clean on all critical/major items** and surfaced **six
  consistency/semantics findings, all fixed before merge** — terminal-state guards on `setSpaceType`,
  `renameBuilding`/`setBuildingFloors` and `setSensorUnit`; the `SensorService.reactivate` self-exclusion
  (an already-active sensor now yields a transition error, not a false duplicate); the decommissioned-excluded
  condition rollup; and the free-text-free comfort-policy event.

## 5. Decisions

Recorded in **ADR-0039**: two pure engines (condition; comfort) as the computational core built first;
**decommissioned spaces/systems excluded** from the live condition; **no money — a deliberate physical-plant
boundary** (asset cost → Procurement & Assets P2-D15; utility billing → Finance P2-D14), held structurally;
**immutable append-only telemetry** (a reading is written once, its repository has no `remove`); one package
for all eight aggregates; the building and space estate masters with terminal-state freezes; the fixed
system with a derived service status; the smart sensor with one-active-per-(space,metric); the operational,
no-money maintenance order; the versioned comfort policy with one-active-per-org and the comfort-assessment
spine; the descriptive facility profile; **two scope pairs — `facilities:*` and `environment:*`**;
persistence per ADR-0010 with FORCE RLS verified live; the movable capitalized asset left to Procurement &
Assets (P2-D15); two status-scoped uniqueness invariants service-enforced (**TD-40**).

## 6. Technical debt

- **TD-40 (new, low).** The two **status-scoped uniqueness** invariants — one active sensor per (space,
  metric), and one active comfort policy per organization — are enforced in their services (check-then-act
  via `findActiveBySpaceAndMetric` / `findActiveByOrganization`), with no DB backstop, so concurrent writes
  have a TOCTOU window. The domain's _absolute_ uniques (building code, space + facility-system code per
  building, sensor + maintenance-order code, one profile per building) all have DB `@@unique` indexes. A
  **partial** unique index (required because inactive/retired sensors and archived policies retain their
  space/metric/org values) would backstop each (ADR-0039). Mirrors TD-37/TD-38/TD-39. A later refinement
  behind the service.
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root.
- **TD-01 (standing).** Event delivery is in-process (outbox store in-memory); the facilities events ride the
  same bus.

## 7. Outcome — merged to `main`, proceed to P2-D21

The Campus Infrastructure, Facilities & Smart Environment Platform is complete behind its gates: building
condition, service status and comfort are derived consistently by pure engines (retired spaces/systems out
of the live inventory), a (space, metric) and an organization each hold one active sensor / policy,
environment telemetry is immutable, the no-money and immovable/movable boundaries are held structurally, the
movable capitalized asset is left to Procurement & Assets, and all eight tables are FORCE-RLS tenant-isolated
(verified live, FLOAT/JSONB/INTEGER round-tripping exactly, cross-tenant insert rejected 42501); both
independent audits were resolved clean. CI is green and the milestone is **merged to `main` (`7436798`)**,
the second contract of Program D (Campus & Engagement); next is **P2-D21 — Campus Security, Safety &
Visitor**. **Reminder: rotate the GitHub PAT** used for pushes at this milestone boundary — it has not yet
been rotated across the P2-D18/D19/D20 boundaries.
