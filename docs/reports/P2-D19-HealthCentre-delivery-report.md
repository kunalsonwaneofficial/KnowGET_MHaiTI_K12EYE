# Engineering Delivery Report — P2-D19

**Integrated Health Centre & Clinical Services Platform** · Phase 2 (Enterprise Domain Engineering) · Program: Campus & Engagement

|                |                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**   | P2-D19 — Integrated Health Centre & Clinical Services Platform                                                                                                                                                                                                                                                                                                                    |
| **Status**     | ✅ Complete — CI green; merged to `main` (`b9bf4b8`). In-sandbox: `@knowget/health-centre` typecheck/lint/format/build clean, **70 tests** (18 files); `apps/api` typecheck/lint/build clean + health-centre DI-graph spec (2 tests) in the 215-test api suite; RLS verified on live PostgreSQL. Full monorepo typecheck/lint/tests green (TD-12 on the Prisma build in-sandbox). |
| **Depends on** | P2-D01-M02 (Person — the patient base), P2-D12 (Workforce, ADR-0031 — the Employee base for clinicians), P2-D01-M01 (Organization), P2-D05 (Learner Wellbeing, ADR-0024 — where the standing health record lives), P2-D17 (Residential, ADR-0036 — the facility/staff/occupancy precedent), P2-D01 (`v0.2.0`), Phase 1 (`v0.1.0`)                                                 |
| **Date**       | 20 December 2026                                                                                                                                                                                                                                                                                                                                                                  |
| **Next**       | P2-D20 — Campus Infrastructure, Facilities & Smart Environment (next Program D contract)                                                                                                                                                                                                                                                                                          |

---

## 1. Mission recap

Deliver the **Integrated Health Centre & Clinical Services Platform** — the institution's **operational
clinical system of record** and the **first contract of Program D (Campus & Engagement)**: the health
centres it runs and the clinicians who staff them, the patient appointments, the clinical encounters in
which patients are seen, the medication prescriptions ordered, the sick-bay admissions for observation, and
the onward referrals to external providers. Three decisions shape it: two quantities are **derived, not
stored** — a centre's sick-bay occupancy and a prescription's due/overdue doses — so the design begins with
two pure engines; **this domain carries no money** — clinical services are not billed here (Finance,
P2-D14) and medical supplies are not costed here (Procurement & Assets, P2-D15); and, distinctively,
**clinical information is confidential and never leaves the domain on an event** — every event is
content-free. Two boundaries define it: **the standing health record is not here** (medical history,
allergies, chronic conditions, immunization history, standing medications and alerts belong to Learner
Wellbeing, P2-D05); and **descriptive, not predictive** (triage/diagnosis inference and demand forecasting
are the intelligence core, P2-D28). Identity is referenced not duplicated — an org is an Organization, a
patient a Person, a clinician an Employee. Service billing, medical-supply stock, inter-facility transfer
and external-EHR integration are out of scope.

## 2. What was engineered

| Layer                | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Engines**          | Two pure, deterministic, clock-free engines built and tested first: `computeBayOccupancy` / `summarizeClinicalOccupancy` (active admissions against a centre's sick-bay capacity, rolled centre → institution); and `computeMedicationSchedule` (from a prescription's start date, doses/day, duration and doses administered, derive the total/remaining/due/**overdue** doses and whether the course is complete or active — **days never money**)                                                               |
| **Domain**           | `@knowget/health-centre` — eight aggregates (HealthCentre, Clinician, Appointment, ClinicalEncounter, Prescription, SickBayAdmission, Referral, CentreProfile), each an immutable aggregate + factory + guarded transitions with an application service; value objects (centre/clinician/appointment/encounter/prescription/admission/referral statuses, types, roles, triage acuity, dispositions, urgencies). **No money; no standing health record; content-free events**                                       |
| **Persistence**      | Eight models in `schema.prisma` + one migration (`20261220000000_add_health_centre`), each table **FORCE RLS** + `tenant_isolation` (USING + WITH CHECK, fail-closed), tenant-indexed, soft-delete + audit columns; capacities/dose regimens+counts/occupancy+workload counts/percents/versions **INTEGER**, over-capacity **BOOLEAN**, date/ISO stamps **TEXT**, **no JSONB** (no list fields); tenant-scoped DB unique indexes (centre code, one clinician per employee, one profile per centre)                 |
| **API**              | Eight permission-gated, tenant-scoped REST controllers — `clinic/*` (centres, clinicians, centre profile) under `clinic:read`/`:write` and `clinical/*` (appointments, encounters, prescriptions, admissions, referrals) under `clinical:read`/`:write`; zod DTOs; eight Prisma/RLS adapters + three directory adapters (Organization, Person, Employee); `HealthCentreModule` importing the Organization, Person and Workforce modules, registered in `app.module`                                                |
| **Events**           | Content-free domain events — centre registered/renamed/capacity/lead-assigned/lead-unassigned/maintenance/decommissioned; clinician registered/role/registration/suspended/reinstated/relieved; appointment requested/scheduled/rescheduled/checked-in/completed/cancelled/no-show; encounter opened/clinician-assigned/started/completed/cancelled; prescription issued/dose-recorded/completed/discontinued; admission opened/discharged; referral raised/accepted/completed/cancelled; centre profile refreshed |
| **Docs & decisions** | ADR-0038 (platform + the dual pure engines + the no-money and content-free-events decisions + the P2-D05 boundary); this report; platform-state, technical-debt (TD-39) and CHANGELOG updates                                                                                                                                                                                                                                                                                                                      |

## 3. Domain capabilities & invariants

- **Occupancy & medication schedules are derived.** A centre's sick-bay occupancy is computed by the pure
  engine from active admissions against capacity; a prescription's due/overdue doses are computed from the
  start date, the regimen and the doses administered — never stored.
- **Clinical masters.** A health centre `active ↔ under_maintenance → decommissioned` (code unique, a
  sick-bay capacity, an optional lead clinician, active required for clinical ops); a clinician — a
  validated **Employee** — `active ↔ suspended → relieved` (one per employee) with the org derived from the
  employee.
- **Appointments.** Pure scheduling `requested → scheduled → checked_in → completed | cancelled | no_show`;
  reschedule changes only the time and emits a distinct event.
- **Encounters.** The consultation `draft → in_progress → completed | cancelled`; a clinician must be
  assigned before it starts; the chief complaint and assessment are **clinical content held off events**.
- **Prescriptions.** A medication course `active → completed | discontinued`; doses tallied one at a time,
  never past the total; the medication and dosage are **clinical content held off events**; the schedule is
  derived.
- **Sick-bay admissions.** A patient in a bed `active → discharged`; **one active per bed and one active per
  patient**, and never beyond the centre's sick-bay capacity.
- **Referrals.** Onward coordination `raised → accepted → completed | cancelled`; the target and reason are
  held off events.
- **Centre profile.** A descriptive read model, one per centre, **refreshed** (version-bumped) from both
  engines and the workload counts; institution rollup via `summarizeClinicalOccupancy`. Descriptive only —
  **never a forecast** (P2-D28).
- **Content-free events.** No event payload carries a chief complaint, assessment, disposition, triage
  acuity, medication, dosage, or referral/admission reason — only ids, status, coded metadata and counts.

## 4. Verification

- **Pure-engine-first.** The two engines (sick-bay occupancy; medication schedule) were built and
  exhaustively tested before any aggregate depended on them, over narrow views the aggregates structurally
  satisfy.
- **Tests.** `@knowget/health-centre` — **70 tests** (occupancy at centre + institution level with the
  divide-by-zero and over-capacity boundaries; the medication due/overdue/complete math; every aggregate
  lifecycle; the encounter-clinician-required and dose-limit guards; the admission capacity +
  one-per-bed + one-per-patient invariants; the content-free event boundary; and an end-to-end
  clinician → centre → appointment → encounter → prescription → admission → referral → profile spine).
  `apps/api` — the health-centre DI-graph integration spec (2 tests) compiles the full module and asserts
  every service token resolves.
- **Gates.** `@knowget/health-centre` typecheck, ESLint, Prettier and build clean; `apps/api` typecheck,
  ESLint and build clean. Full monorepo typecheck, lint and tests pass in-sandbox (health-centre 70, api
  215; all 241 prisma-independent turbo tasks green); the full Prisma build and DB-integration tests are
  CI-verified (TD-12: the Prisma engine CDN is unreachable in the build sandbox).
- **Live RLS.** The migration was applied on a live PostgreSQL instance as a **non-superuser owner**;
  verified that tenant A sees only its own rows, tenant B sees zero, an unset tenant sees zero
  (fail-closed), a cross-tenant insert is rejected by `WITH CHECK` (SQLSTATE 42501) on sick_bay_admission/
  centre_profile, FORCE RLS + policy is present on all eight tables, tenant-scoped code uniqueness lets the
  same code exist in two tenants, and the **INTEGER, BOOLEAN and TEXT columns round-trip exactly** (no JSONB
  in this domain).
- **Independent audits.** Two adversarial audits (domain logic; persistence/API) reviewed the whole
  milestone. The persistence/API audit was **clean across all categories** (schema/migration column-by-
  column parity, adapter field fidelity, correct delegates + status-filtered queries, port conformance,
  controller scope split + route ordering, DTO/enum parity, DI wiring). The domain audit was **clean on all
  critical/major items** and confirmed the **content-free event invariant across all eight payload builders**
  (not just the tested paths), both engines, every state machine, the admission capacity/uniqueness guards,
  org derivation from an active centre, and the P2-D05 boundary; its one actionable finding was **fixed
  before merge** — `AppointmentService.reschedule` now publishes a distinct `rescheduled` event rather than
  a `scheduled` event that would misdescribe a still-requested appointment.

## 5. Decisions

Recorded in **ADR-0038**: two pure engines (sick-bay occupancy; medication schedule) as the computational
core built first; **no money — a deliberate operational boundary** (billing → Finance P2-D14; medical
supplies → Procurement & Assets P2-D15), held structurally; **content-free events** (no clinical free-text
or outcome on the bus); one package for all eight aggregates; the health centre and clinician clinical
masters; pure-scheduling appointments; the encounter with clinical content held off events and a
clinician-required start; the prescription feeding the schedule engine with a dose-limit guard; the
capacity-and-uniqueness-guarded sick-bay admission; the referral; the descriptive centre profile; **two
scope pairs — `clinic:*` and `clinical:*`**; persistence per ADR-0010 with FORCE RLS verified live; the
standing health record left to Learner Wellbeing (P2-D05); two status-scoped uniqueness invariants
service-enforced (**TD-39**).

## 6. Technical debt

- **TD-39 (new, low).** The two **status-scoped uniqueness** invariants — one active sick-bay admission per
  (centre, bed), and one active admission per patient — are enforced in the admission service (check-then-act
  via `findActiveByBed` / `findActiveByPatient`), alongside a sick-bay capacity guard, with no DB backstop,
  so concurrent writes have a TOCTOU window. The domain's _absolute_ uniques (centre code, one clinician per
  employee, one profile per centre) all have DB `@@unique` indexes. A **partial** unique index (required
  because discharged rows retain their bed/patient values) would backstop each (ADR-0038). Mirrors
  TD-36/TD-37/TD-38. A later refinement behind the service.
- **TD-21 (standing).** Domain Prisma adapters live at the `apps/api` composition root.
- **TD-01 (standing).** Event delivery is in-process (outbox store in-memory); the health-centre events ride
  the same bus.

## 7. Outcome — merged to `main`, proceed to P2-D20

The Integrated Health Centre & Clinical Services Platform is complete behind its gates: sick-bay occupancy
and medication schedules are derived consistently by pure engines, a bed and a patient each hold one active
admission, the sick bay never exceeds capacity, the no-money and confidential-events boundaries are held
structurally, the standing health record is left to Learner Wellbeing, and all eight tables are FORCE-RLS
tenant-isolated (verified live, INTEGER/BOOLEAN/TEXT round-tripping exactly); both independent audits were
resolved clean. CI is green and the milestone is **merged to `main` (`b9bf4b8`)**, opening Program D
(Campus & Engagement); next is **P2-D20 — Campus Infrastructure, Facilities & Smart Environment**.
**Reminder: rotate the GitHub PAT** used for pushes at this milestone boundary.
