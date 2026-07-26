# 36. Residential Life, Hostel & Boarding: one package, eight aggregates, two pure engines, and no money

- **Status:** Accepted
- **Date:** 2026-12-18
- **Contract:** P2-D17 (Residential Life, Hostel & Boarding Platform)

## Context

P2-D17 is the sixth contract of **Program C** (the operational institution), on the certified `v0.2.0`
baseline, the frozen Phase-1 core, the P2-D01-M01 organization base, the P2-D12 workforce base and the
P2-D03 student base. It is the authoritative domain for **the institution's boarding operations**: the
hostels it runs and the wardens who supervise them, the rooms and beds within them, the students
allocated beds (residents), the outpasses residents are granted to leave and return, the curfew roll
calls run against the boarders, and the statutory compliance of the residential plant. It is the
residential counterpart to the transport system of record (P2-D16, Smart Mobility): transport manages how
students travel, this domain manages where they live.

Two decisions shape the design. First, two quantities are **derived, not stored** — a hostel's **bed
occupancy** (active allocations against beds, rolled room → hostel → institution) and a roll call's
**presence reconciliation** (the markings against the expected roster, yielding the safety-critical
unaccounted-for number) — so, as with every operational domain, the design begins with the pure engines
that compute them, not with an aggregate. Second, and distinctively, **this domain carries no money.**
Hostel and mess fees belong to Finance (P2-D14), and a building's acquisition value and maintenance cost
belong to the Asset register (P2-D15). Keeping money out entirely keeps this bounded context purely
operational and its dependencies minimal (no money core to duplicate, unlike the resource domain,
ADR-0034).

Two boundaries bound it. First, **prediction is not here** — occupancy forecasting and demand planning
are reserved for the **intelligence core (P2-D28)**; the occupancy profile and the roll-call summary are
descriptive and derived, never a forecast. Second, **identity is not here** — a hostel's organization is
an **Organization (P2-D01-M01)**, a warden is an **Employee (P2-D12)**, and a resident is a **Student
(P2-D03)**, each referenced by id and never re-modelled.

## Decision

1. **Two pure engines are the computational core, built and tested first.** `computeRoomOccupancy` values
   a room's bed count against its active occupant count (beds available, occupancy percent, over-capacity);
   `computeHostelOccupancy` rolls a hostel's rooms up; and `summarizeResidenceOccupancy` rolls a tenant's
   hostels into the institution picture. `computeRollCall` reconciles a curfew roll call's ordered
   per-resident markings against the expected roster into presence counts and the **unaccounted-for**
   number (accounted-for = present + late + on_leave; unaccounted-for = expected − accounted-for, floored
   at zero) — the residential analog of the trip-occupancy engine. All are pure, deterministic and
   **clock-free** (the caller passes the as-of values).

2. **This domain has no money — a deliberate operational boundary.** Hostel and mess fees are billed by
   Finance (P2-D14); a building's capital value and maintenance cost are the Asset register's (P2-D15).
   `@knowget/residential` therefore imports no money core and defines no monetary field. This is the
   defining scoping decision: the domain is purely operational, and the fee/valuation boundary is held
   structurally (there is nowhere to put an amount).

3. **One domain package, `@knowget/residential`, for all eight aggregates** — the same
   single-bounded-context choice as the fifteen prior domains (ADR-0021…0035). A shared spine
   (`errors.ts`, `ports.ts`, `residential-events.ts`, `residential-value.ts`, `residential-view.ts`,
   `index.ts`), the two engines, a per-aggregate pair (`<aggregate>.ts` + `<aggregate>-service.ts`), and
   the bed / roll-call-mark line value objects.

4. **The hostel and warden are the residential masters.** A hostel carries a code (unique per tenant), a
   type (boys/girls/mixed) and an optionally assigned supervising warden; it runs `active ↔
under_maintenance → decommissioned`, and only an active hostel takes rooms and allocations. A warden is
   a staff member (**Employee, P2-D12**) with a supervisory role; it runs `active ↔ suspended → relieved`,
   its organization is derived from the employee, and one warden is allowed per employee. Identity lives in
   the workforce domain and is never duplicated.

5. **The room is an ordered set of individually-allocatable beds.** A room carries a number (unique within
   its hostel), a type and an ordered bed list (each bed a stable `key` and a `label`); it runs `draft →
available ↔ under_maintenance → decommissioned`. **Beds and floor are editable only while draft and
   frozen once available** (a bed allocation references its bed by key, so the bed set cannot shift under
   live residents). The bed count is the room's capacity; its occupancy is derived by the pure engine.

6. **A bed allocation is a student's residency in a specific bed.** It runs `active → ended` (on
   vacating); the service validates the student exists, the room is available and the bed is a real bed on
   that room, and enforces **one active allocation per bed** and **one active allocation per student** (a
   resident lives in one bed at a time). The organization and hostel are derived from the room.

7. **An outpass is a resident's authorization to leave and return.** It carries the kind of leave, an
   expected out/return window (validated: return on or after departure) and, once granted, the approver
   and actual out/return stamps; it runs `requested → approved → checked_out → returned`, or ends
   `rejected` / `cancelled`. A checked-out outpass whose expected return has passed is **overdue** — a
   derived, clock-free flag, never stored. The service requires the student be a **current resident** (an
   active allocation), derives the organization and hostel from that allocation, gates approval on an
   **active warden**, and enforces **one open outpass per resident**.

8. **A roll call is a curfew presence check, roster-gated.** A roll call captures the expected residents
   (from the hostel's active allocations) at scheduling and accumulates one marking per resident while in
   progress; it runs `scheduled → in_progress → completed | cancelled`. A marking is **rejected if the
   resident is not on the roster or has already been marked**. The reconciled summary — present/late/
   on_leave/absent counts and the safety-critical unaccounted-for number — is computed by the pure engine
   over the markings, never stored; it rides the completion event. The organization is derived from the
   hostel.

9. **A hostel inspection is a compliance record; its status is derived.** An inspection (fire safety,
   hygiene, electrical, structural, security) carries a conducted date, an outcome and a next-due date,
   **one per type per hostel** (re-inspected in place). Its compliance — `valid`, `due_soon` within a
   warning window (default 30 days, inclusive of the due day), or `overdue` — is computed from the
   next-due date as of a given date, **never stored**. The organization is derived from the hostel.

10. **The hostel occupancy profile is a descriptive read model, never a transaction.** One per hostel, it
    carries the room count, the total beds and occupants, the beds available, the occupancy percent, the
    count of over-capacity rooms and a hostel-level over-capacity flag — all produced by the pure
    occupancy engine over the hostel's **in-service rooms** (available + under_maintenance) and their
    active allocations, and **refreshed** (version-bumped) whenever those change. The institution rollup
    runs `summarizeResidenceOccupancy`. It is always derived, never posted to directly.

11. **Two permission scope pairs split the platform along its operational boundary.** `hostel:read`/
    `hostel:write` gate the physical residential plant and the people and compliance behind it (hostels,
    wardens, rooms, inspections), held by the estates/warden team; `boarding:read`/`boarding:write` gate
    the operations (bed allocations, outpasses, roll calls, occupancy), held by the boarding-operations
    team. The two are separately administered, so they do not share a scope.

12. **Persistence per ADR-0010, no money.** Eight tables (`hostel`, `warden`, `room`, `bed_allocation`,
    `outpass`, `roll_call`, `hostel_inspection`, `hostel_occupancy_profile`) with Prisma/RLS adapters at
    the `apps/api` composition root (TD-21). Every table has `ENABLE` and `FORCE ROW LEVEL SECURITY` and
    the standard `tenant_isolation` policy (both USING and WITH CHECK, fail-closed) — verified on live
    PostgreSQL. Bed counts, occupancy figures, percents and versions are **INTEGER**; over-capacity is
    **BOOLEAN**; a room's beds and a roll call's roster and markings are non-null **JSONB**; date-only and
    ISO-stamp values are **TEXT**; the uniqueness rules (hostel code, one warden per employee, room number
    per hostel, one inspection per (hostel, type), one profile per hostel) are tenant-scoped DB unique
    indexes.

13. **Domain events on the platform bus** — hostel registered/warden-assigned/warden-unassigned/sent-to-
    maintenance/returned/decommissioned; warden registered/suspended/reinstated/relieved; room drafted/
    made-available/sent-to-maintenance/returned/decommissioned; allocation created/ended; outpass
    requested/approved/rejected/checked-out/returned/cancelled; roll call scheduled/started/completed/
    cancelled; inspection recorded/reinspected; occupancy refreshed.

14. **Cross-domain references enter through directory ports.** Organization (P2-D01-M01), Employee
    (P2-D12) and Student (P2-D03) existence are validated on write; a warden derives its org from the
    employee, an allocation from the room, an outpass from the resident's allocation, and a roll call's
    roster from the hostel's active allocations. The residential domain links to those domains and never
    depends on their packages directly.

15. **Two status-scoped uniqueness invariants are service-enforced (TD-37).** "One active allocation per
    bed" and "one active allocation per student" are enforced by a check-then-act in the service (there is
    no DB backstop, so a TOCTOU window exists under concurrency), whereas the domain's _absolute_ uniques
    (hostel code, warden employee, room number, inspection-per-type, profile-per-hostel) all have DB
    unique indexes. Partial unique indexes would close the window; recorded as **TD-37**.

16. **Explicit non-goals.** No hostel/mess fee billing or collection (Finance owns money), no facility
    valuation or maintenance cost (the Asset register owns capital), no mess/dining menu planning or
    inventory (a future dining concern; dietary designation is out of scope for this contract), no
    disciplinary or health records (Learner Wellbeing, P2-D05, owns behaviour and health; roll-call is
    presence/curfew, not conduct), no visitor management, and no prediction — occupancy forecasting and
    demand planning are the intelligence core (P2-D28). This domain is the boarding system of record those
    build on.

## Consequences

- **A unified boarding system of record.** An institution manages its hostels, wardens, rooms and beds,
  student residencies, gate passes, curfew roll calls and facility compliance in one place, on top of the
  organization, workforce and student bases, with a descriptive occupancy profile and institution rollup.
- **Occupancy and roll-call are exact and consistent by construction.** A hostel's bed occupancy and a
  roll call's presence reconciliation are computed by pure engines from primary data (allocations against
  beds; the marking ledger against the roster), so every reader gets the same figure, and the
  safety-critical unaccounted-for count cannot drift from the markings.
- **The money boundary is held structurally.** With no monetary field anywhere in the domain, hostel/mess
  fees cannot leak in — they stay in Finance — and the domain's dependencies stay minimal (no money core
  to duplicate, unlike the resource domain).
- **A pure, testable core.** The two engines are pure functions over narrow views — package tests
  exercise room/hostel/institution occupancy, roll-call reconciliation with the unaccounted-for math,
  every aggregate lifecycle, the capacity/roster/overdue/compliance guards, and an end-to-end hostel →
  warden → room → allocation → occupancy → outpass → roll call → inspection spine.
- **Isolation.** All eight tables are FORCE-RLS tenant-isolated and fail-closed, verified on live
  PostgreSQL with the JSONB, INTEGER and BOOLEAN columns round-tripping exactly; the uniqueness rules are
  tenant-scoped at the DB. Two independent adversarial audits (domain; persistence/API) were clean (the
  persistence/API audit across all categories; the domain audit on all critical/major items, with its two
  minor findings fixed before merge).
- **Deferred, interface-protected.** Two status-scoped uniqueness invariants are service-enforced
  (**TD-37**); domain Prisma adapters remain at the composition root (TD-21). One cohesive package,
  acceptable for a single bounded context (as with the fifteen prior domains). This is the sixth contract
  of **Program C** and the residential base the operational and intelligence-core domains build on.
